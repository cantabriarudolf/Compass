import { prisma } from "@/lib/prisma"
import { cifrar, descifrar, estaCifrado } from "@/lib/crypto"

/**
 * SERIE-PRODUCCION-FASE2 P4 — cifrado transparente a nivel de Prisma.
 *
 * Extensión opt-in (`prismaCifrado`): cifra campos sensibles en create/update/
 * upsert y los descifra al leer. El resto de la app sigue usando `prisma`
 * (texto plano) hasta el rollout por módulo — ver decisiones abajo.
 *
 * Reglas:
 * - Solo se tocan strings en campos del mapa. null/undefined/operadores
 *   Prisma ({ increment }, etc.) se dejan intactos.
 * - Campos Json (datosLaborales): se cifran como string del JSON serializado;
 *   al leer se descifra y se hace JSON.parse. Objetos legacy (texto plano)
 *   pasan intactos.
 * - Lectura de texto plano legacy (sin prefijo) pasa intacta → permite
 *   migración gradual fila por fila sin caída.
 * - createMany/updateMany/deleteMany en modelos mapeados LANZAN (fail-closed):
 *   el where iría contra cifrado y el write masivo no pasa por el hook de
 *   fila. Usar operaciones por fila o el script de migración.
 *
 * Decisiones documentadas (pendientes post-P4):
 * - `Usuario.email` queda en TEXTO PLANO a propósito: login y challenge hacen
 *   findUnique({ where: { email } }) y el cifrado no determinista rompería la
 *   búsqueda. Solo twoFactorSecret/twoFactorBackupCodes se cifran (P4 activa).
 * - Montos financieros (monto/Decimal) NO se cifran: romperían agregaciones
 *   SQL (SUM/ORDER BY) y comparaciones. Pendiente: cifrado que preserva
 *   formato u HSM dedicado.
 * - Búsqueda por campo cifrado (rut/email Persona): el where contra texto
 *   plano no matchea cifrado. Pendiente: blind index HMAC-SHA256 con clave
 *   separada en columna dedicada. El rollout por módulo debe resolverlo
 *   antes de activar cada modelo.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- filas Prisma genéricas
type Fila = Record<string, any>

const CAMPOS_JSON = new Set(["datosLaborales"])

/**
 * Mapa modelo → campos cifrados. Solo Usuario está ACTIVO en P4 (rutas 2FA
 * usan prismaCifrado); el resto está mapeado para el script de migración y el
 * rollout por módulo, pero ningún código productivo lo usa todavía.
 */
export const CAMPOS_CIFRADOS: Record<string, string[]> = {
  Usuario: ["twoFactorSecret", "twoFactorBackupCodes"],
  Persona: ["rut", "email", "telefonoMovil", "telefonoFijo", "datosLaborales"],
  ProveedorPE: ["rut", "telefono", "email"],
  ConfiguracionGlobal: [
    "rutComunidad",
    "rutAdministrador",
    "direccionOficial",
    "telefonoAdmin",
    "smtpUser",
    "smtpPassword",
  ],
}

function cifrarValor(campo: string, valor: unknown): unknown {
  if (typeof valor !== "string" || valor.length === 0 || estaCifrado(valor)) {
    return valor
  }
  if (CAMPOS_JSON.has(campo)) return valor // Json se maneja aparte (objeto → string)
  return cifrar(valor)
}

function descifrarValor(campo: string, valor: unknown): unknown {
  if (CAMPOS_JSON.has(campo)) {
    if (typeof valor === "string" && estaCifrado(valor)) {
      return JSON.parse(descifrar(valor)) as unknown
    }
    return valor // objeto legacy en texto plano
  }
  if (typeof valor === "string" && estaCifrado(valor)) {
    return descifrar(valor)
  }
  return valor
}

/** Cifra los campos sensibles de un `data` de create/update (top-level; no anidados). */
export function cifrarFila(modelo: string, data: Fila | undefined): Fila | undefined {
  const campos = CAMPOS_CIFRADOS[modelo]
  if (!data || !campos) return data
  const copia: Fila = { ...data }
  for (const campo of campos) {
    const valor = copia[campo]
    if (valor === null || valor === undefined) continue
    if (CAMPOS_JSON.has(campo) && typeof valor === "object") {
      copia[campo] = cifrar(JSON.stringify(valor))
    } else {
      copia[campo] = cifrarValor(campo, valor)
    }
  }
  return copia
}

/** Descifra los campos sensibles de una fila leída (objeto o null). */
export function descifrarFila(modelo: string, fila: Fila | null): Fila | null {
  const campos = CAMPOS_CIFRADOS[modelo]
  if (!fila || !campos) return fila
  const copia: Fila = { ...fila }
  for (const campo of campos) {
    if (!(campo in copia)) continue
    copia[campo] = descifrarValor(campo, copia[campo])
  }
  return copia
}

function descifrarResultado(modelo: string, resultado: unknown): unknown {
  if (Array.isArray(resultado)) {
    return resultado.map((f) => descifrarFila(modelo, f as Fila))
  }
  return descifrarFila(modelo, resultado as Fila | null)
}

function lanzarBulk(modelo: string, operacion: string): never {
  throw new Error(
    `prismaCifrado: ${operacion} no soportado en ${modelo} (bypass de cifrado). ` +
      `Usar operaciones por fila o scripts/cifrar-datos-existentes.mjs.`
  )
}

/**
 * Cliente Prisma con cifrado transparente. API idéntica a `prisma`;
 * solo intercepta modelos del mapa. Importar donde se manejen secretos
 * (P4: rutas 2FA para Usuario.twoFactor*).
 */
export const prismaCifrado = prisma.$extends({
  query: {
    $allModels: {
      async create({ model, args, query }: { model: string; args: Fila; query: (a: Fila) => Promise<unknown> }) {
        if (CAMPOS_CIFRADOS[model]) args.data = cifrarFila(model, args.data)
        return descifrarResultado(model, await query(args))
      },
      async update({ model, args, query }: { model: string; args: Fila; query: (a: Fila) => Promise<unknown> }) {
        if (CAMPOS_CIFRADOS[model]) args.data = cifrarFila(model, args.data)
        return descifrarResultado(model, await query(args))
      },
      async upsert({ model, args, query }: { model: string; args: Fila; query: (a: Fila) => Promise<unknown> }) {
        if (CAMPOS_CIFRADOS[model]) {
          args.create = cifrarFila(model, args.create)
          args.update = cifrarFila(model, args.update)
        }
        return descifrarResultado(model, await query(args))
      },
      async findUnique({ model, args, query }: { model: string; args: Fila; query: (a: Fila) => Promise<unknown> }) {
        return descifrarResultado(model, await query(args))
      },
      async findFirst({ model, args, query }: { model: string; args: Fila; query: (a: Fila) => Promise<unknown> }) {
        return descifrarResultado(model, await query(args))
      },
      async findMany({ model, args, query }: { model: string; args: Fila; query: (a: Fila) => Promise<unknown> }) {
        return descifrarResultado(model, await query(args))
      },
      async createMany({ model }: { model: string }) {
        if (CAMPOS_CIFRADOS[model]) lanzarBulk(model, "createMany")
      },
      async updateMany({ model }: { model: string }) {
        if (CAMPOS_CIFRADOS[model]) lanzarBulk(model, "updateMany")
      },
    },
  },
})

export type PrismaCifrado = typeof prismaCifrado
