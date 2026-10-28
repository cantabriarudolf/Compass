/**
 * database-url — de qué base lee y escribe un script de datos, y cómo se decide.
 *
 * Contexto (2026-10-27, conexión de la base a Neon): las cuatro scripts de datos
 * (`seed:mocks`, `db:catalogo-nacional`, `db:punto-cero`, `db:fondos-fi`) hacían
 * `dotenv.config()` y después leían `process.env.DATABASE_URL`. Eso tiene dos agujeros:
 *
 *   1. `dotenv.config()` **no pisa** una variable ya presente. Bajo `vite-node`, Vite carga
 *      `.env.local` y la deja en `process.env`, así que el script terminaba con la URL de
 *      `.env.local` (`file:./dev.db`) mientras el cliente Prisma generado era de Postgres:
 *      «the URL must start with the protocol postgresql://».
 *   2. nada validaba la forma del valor. Una línea `DATABASE_URL` corrupta (dos valores
 *      pegados en la misma línea) llegaba hasta Prisma, que la reporta de forma opaca.
 *
 * Este módulo no adivina: elige entre los candidatos (entorno, `.env`, `.env.local`) el
 * primero que **sirve para el proveedor del cliente Prisma generado**, y si no hay ninguno
 * aborta con un mensaje que dice qué archivo mirar y qué protocolo se espera. Nunca
 * interpola el valor de la URL en un mensaje: esto se lee en consolas y logs de CI.
 *
 * El idioma de precedencia es el mismo de `scripts/datos-reset.mjs`
 * (`resolverDatabaseUrl`: el entorno manda, después los archivos `.env*`).
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { config as cargarDotenv } from "dotenv"

/** Proveedor de la base, tal como lo declara el `datasource` del schema de Prisma. */
export type ProveedorBase = "postgresql" | "sqlite"

/** De dónde salió la URL elegida. */
export type OrigenUrl = "entorno" | "env-file"

/** Un archivo de entorno leído del disco (o su contenido en un test). */
export interface ArchivoEnv {
  nombre: string
  contenido: string
}

/** Entrada de `resolverUrlBase` (pura: no toca `process.env` ni el disco). */
export interface OpcionesResolver {
  entorno: Record<string, string | undefined>
  /** En orden de precedencia: `.env` antes que `.env.local`. */
  archivos: ArchivoEnv[]
  /** Proveedor que espera el cliente Prisma generado; `null` = no se conoce, no se filtra. */
  proveedorEsperado: ProveedorBase | null
}

/** Resultado de la resolución. */
export interface UrlBaseResuelta {
  url: string
  origen: OrigenUrl
  /** Motivos (sin valores) de los candidatos que no se usaron. */
  descartados: string[]
}

/** Nombre estable del error de resolución; sirve para distinguirlo sin una subclase propia. */
export const NOMBRE_ERROR_URL_BASE = "ErrorUrlBase"

/** Error de configuración de la base: el mensaje es para el operador y nunca trae el valor. */
function errorUrlBase(mensaje: string): Error {
  const error = new Error(mensaje)
  error.name = NOMBRE_ERROR_URL_BASE
  return error
}

/** Archivos de entorno que se leen, en orden de precedencia. */
export const ARCHIVOS_ENV = [".env", ".env.local"] as const

/** Marca de una línea corrida: dos `DATABASE_URL=` pegados en la misma línea. */
const MARCA_CONCATENACION = "DATABASE_URL="

/** Cantidad de niveles hacia arriba que se buscan los `node_modules` del monorepo. */
const NIVELES_BUSQUEDA_CLIENTE = 5

/** Quita la comilla que envuelve el valor (la clase de corrupción que dejó Neon pegado a SQLite). */
export function normalizarValorEnv(crudo: string): string {
  const limpio = crudo.trim()
  if (limpio.length < 2) return limpio
  const primera = limpio[0]
  const ultima = limpio[limpio.length - 1]
  if ((primera === '"' || primera === "'") && primera === ultima) {
    return limpio.slice(1, -1).trim()
  }
  return limpio
}

/** Proveedor que sugiere la forma de la URL; `null` si no es una URL de base. */
export function proveedorDeUrl(url: string): ProveedorBase | null {
  if (/^postgres(ql)?:\/\//i.test(url)) return "postgresql"
  if (/^file:/i.test(url)) return "sqlite"
  return null
}

/**
 * Motivo por el que una URL no sirve para el cliente generado; `null` si sirve.
 * El texto es para el operador y **no** incluye el valor.
 */
export function motivoPorElQueNoSirve(
  url: string,
  proveedorEsperado: ProveedorBase | null
): string | null {
  if (!url) return "está vacía"
  if (url.includes(MARCA_CONCATENACION)) {
    return "parece tener dos DATABASE_URL= pegados en la misma línea"
  }
  const propio = proveedorDeUrl(url)
  if (propio === null) {
    return "no empieza con un protocolo de base (postgresql:// o file:)"
  }
  if (proveedorEsperado && propio !== proveedorEsperado) {
    return `es ${propio} y el cliente Prisma generado espera ${proveedorEsperado}`
  }
  return null
}

/** URL declarada por un archivo de entorno, ya normalizada; `null` si no declara ninguna. */
export function urlDeArchivoEnv(archivo: ArchivoEnv): string | null {
  const linea = archivo.contenido.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m)
  if (!linea?.[1]) return null
  const url = normalizarValorEnv(linea[1])
  return url || null
}

/**
 * Aplica la precedencia descrita arriba y devuelve la primera URL que sirve para el
 * proveedor del cliente generado.
 *
 * @throws cuando ningún candidato sirve: el mensaje nombra los archivos leídos y el
 * protocolo esperado (nunca el valor) y su `name` es `ErrorUrlBase`.
 */
export function resolverUrlBase({
  entorno,
  archivos,
  proveedorEsperado,
}: OpcionesResolver): UrlBaseResuelta {
  const delEntorno = normalizarValorEnv(entorno.DATABASE_URL ?? "")
  const declaradasPorArchivo = new Map<string, string>()
  for (const archivo of archivos) {
    const url = urlDeArchivoEnv(archivo)
    if (url) declaradasPorArchivo.set(url, archivo.nombre)
  }

  const descartados: string[] = []
  const candidatos: Array<{ url: string; origen: OrigenUrl }> = []

  if (delEntorno) {
    const motivo = motivoPorElQueNoSirve(delEntorno, proveedorEsperado)
    const archivoQueLoDeclara = declaradasPorArchivo.get(delEntorno)
    if (motivo === null) {
      candidatos.push({ url: delEntorno, origen: "entorno" })
    } else if (archivoQueLoDeclara) {
      descartados.push(`entorno (${motivo}; es el default que declara ${archivoQueLoDeclara})`)
    } else {
      throw errorUrlBase(
        mensajeAborto({
          archivos,
          proveedorEsperado,
          descartados: [`entorno (${motivo})`],
          detalle:
            "La variable vino del arnés (CI, e2e o la suite de tests), no de un archivo .env*: " +
            "no se cambia de base por atrás. Regenerá el cliente para ese proveedor o exportá " +
            "la URL correcta.",
        })
      )
    }
  }

  for (const archivo of archivos) {
    const url = urlDeArchivoEnv(archivo)
    if (!url) continue
    const motivo = motivoPorElQueNoSirve(url, proveedorEsperado)
    if (motivo === null) {
      candidatos.push({ url, origen: "env-file" })
    } else {
      descartados.push(`${archivo.nombre} (${motivo})`)
    }
  }

  const elegido = candidatos[0]
  if (!elegido) {
    throw errorUrlBase(
      mensajeAborto({
        archivos,
        proveedorEsperado,
        descartados,
        detalle: `Definí DATABASE_URL en el entorno o revisá la línea DATABASE_URL= de ${
          archivos[0]?.nombre ?? ".env"
        }.`,
      })
    )
  }

  return { url: elegido.url, origen: elegido.origen, descartados }
}

/** Mensaje para el operador. Nunca interpola valores: sólo nombres de archivo y motivos. */
function mensajeAborto({
  archivos,
  proveedorEsperado,
  descartados,
  detalle,
}: {
  archivos: ArchivoEnv[]
  proveedorEsperado: ProveedorBase | null
  descartados: string[]
  detalle: string
}): string {
  const leidos = archivos.length > 0 ? archivos.map((a) => a.nombre).join(", ") : "(ninguno)"
  let esperado = "postgresql:// o file:"
  if (proveedorEsperado === "postgresql") esperado = "postgresql:// (o postgres://)"
  else if (proveedorEsperado === "sqlite") esperado = "file:"
  const motivo = descartados.length > 0 ? descartados.map((d) => `  · ${d}`).join("\n") : "  · (sin candidatos)"
  return [
    "No hay una DATABASE_URL usable para el cliente Prisma generado.",
    "",
    ` Esperado    : ${esperado}`,
    ` Archivos    : ${leidos}`,
    ` Descartados :`,
    motivo,
    "",
    ` ${detalle}`,
    " El valor de la URL no se imprime a propósito (puede tener credenciales).",
  ].join("\n")
}

/** Proveedor declarado por el texto de un schema de Prisma; `null` si no declara uno de base. */
export function proveedorDelClienteGenerado(schema: string): ProveedorBase | null {
  const bloque = schema.match(/datasource\s+\w+\s*\{([\s\S]*?)\}/)
  if (!bloque?.[1]) return null
  const provider = bloque[1].match(/provider\s*=\s*"([^"]+)"/)
  const valor = provider?.[1]?.trim().toLowerCase()
  if (valor === "postgresql" || valor === "sqlite") return valor
  return null
}

/**
 * Proveedor del cliente Prisma **que está generado ahora** (`node_modules/.prisma/client/schema.prisma`),
 * buscando hacia arriba porque en el monorepo pnpm lo deja en `k0mp4ss_fe/node_modules`.
 * `null` si no se encuentra o no se puede leer: en ese caso la resolución no filtra por proveedor.
 */
export function leerProveedorDelClienteGenerado(dirInicio: string): ProveedorBase | null {
  let dir = dirInicio
  for (let nivel = 0; nivel < NIVELES_BUSQUEDA_CLIENTE; nivel++) {
    const ruta = path.join(dir, "node_modules", ".prisma", "client", "schema.prisma")
    if (existsSync(ruta)) {
      try {
        return proveedorDelClienteGenerado(readFileSync(ruta, "utf8"))
      } catch {
        return null
      }
    }
    const padre = path.dirname(dir)
    if (padre === dir) break
    dir = padre
  }
  return null
}

/** Raíz de la app (`k0mp4ss_fe/apps/web`): este módulo vive en `lib/`. */
const DIR_APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** Opciones del cargador de runtime. */
export interface OpcionesCarga {
  /** Directorio de la app; los tests lo apuntan a uno temporal. */
  dirApp?: string
  /** Proveedor esperado; por defecto, el del cliente generado. */
  proveedorEsperado?: ProveedorBase | null
}

/**
 * Resuelve la URL desde el disco, la deja en `process.env.DATABASE_URL` (para que
 * `new PrismaClient()` sin `datasourceUrl` coincida) y la devuelve. Avisa por stderr, sin
 * imprimir valores, cuando descartó un candidato.
 *
 * @throws con el mensaje de `resolverUrlBase` (`name === "ErrorUrlBase"`).
 */
export function cargarUrlBase(opciones: OpcionesCarga = {}): string {
  const dirApp = opciones.dirApp ?? DIR_APP
  // Los scripts leen otras claves de .env (p. ej. COMUNIDAD_ID); esto no pisa DATABASE_URL.
  cargarDotenv({ path: path.join(dirApp, ".env") })

  const archivos: ArchivoEnv[] = []
  for (const nombre of ARCHIVOS_ENV) {
    const ruta = path.join(dirApp, nombre)
    if (existsSync(ruta)) archivos.push({ nombre, contenido: readFileSync(ruta, "utf8") })
  }

  const proveedorEsperado =
    opciones.proveedorEsperado !== undefined
      ? opciones.proveedorEsperado
      : leerProveedorDelClienteGenerado(dirApp)

  const resuelta = resolverUrlBase({ entorno: process.env, archivos, proveedorEsperado })
  process.env.DATABASE_URL = resuelta.url

  for (const descartado of resuelta.descartados) {
    // Salida de una CLI de datos: avisar qué se descartó es parte del contrato (nunca el valor).
    console.warn(`[db-url] descartado: ${descartado}`)
  }

  return resuelta.url
}
