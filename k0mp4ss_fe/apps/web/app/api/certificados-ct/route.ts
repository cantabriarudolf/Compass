/**
 * /api/certificados-ct — colección de certificados CT (BD-FUENTE-VERDAD Fase 5A).
 *
 * GET paginado vía factory. POST upsert idempotente con el gate de emisión
 * (deuda/saldo de la unidad) aplicado en servidor, no en el cliente.
 * Authz: recurso "ct" (admin full, comité ver, residente ver/crear propios).
 *
 * Inmutabilidad (design.md Decisión 5): un certificado emitido es un documento
 * inmutable; `DELETE /api/certificados-ct/[id]` rechaza con 409 en la capa API y
 * el residuo TEST lo purga `e2e:higiene` (no `limpiar()`).
 */
import { randomUUID } from "node:crypto"
import { CertificadoCTSchema, type MoraCobroFI, type PagoCobroFI } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { saldoPendiente } from "@/lib/finanzas-utils"
import { createCrudHandlers } from "@/lib/api/crud-factory"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

function delegado(modelo: unknown) {
  return modelo as import("@/lib/api/crud-factory").CrudDelegate
}

export const certificadosHandlers = createCrudHandlers({
  model: delegado(prisma.certificadoCT),
  schema: CertificadoCTSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "ct"),
})

export const GET = certificadosHandlers.GET

/**
 * Gate de emisión del certificado Al Día (paridad server-side con
 * `generarCertificadoCT` del store legacy): exige saldo pendiente <= 0 sobre
 * TODOS los cobros FI de la unidad, no solo el gasto común. Se evalúa en la
 * capa API para que ningún consumidor distinto del QA-Lab pueda saltarlo.
 *
 * Devuelve el `Response` de rechazo, o `null` si la emisión procede / el gate
 * no aplica (otros tipos de certificado y certificados sin unidad).
 */
async function gateSaldoAlDia(cuerpo: string): Promise<Response | null> {
  let body: { tipo?: unknown; unidadId?: unknown }
  try {
    body = JSON.parse(cuerpo) as { tipo?: unknown; unidadId?: unknown }
  } catch {
    return null // JSON inválido: lo reporta la factory con 400.
  }
  if (body.tipo !== "al_dia") return null
  const unidadId = typeof body.unidadId === "string" ? body.unidadId : ""
  if (!unidadId) return null

  const resultado = await withComunidadScope()
  if (!resultado.ok) return null // 401/403 los resuelve la factory.

  try {
    const cobros = await prisma.cobroFI.findMany({
      where: { comunidadId: resultado.scope.comunidadId, unidadId },
    })
    const pendiente = cobros.reduce(
      (acc, c) => {
        // SAFETY: moras/pagos son Json con shape validado por CobroFISchema.
        const moras = (c.moras ?? []) as unknown as MoraCobroFI[]
        // SAFETY: idem moras: Json del cobro, shape PagoCobroFI[].
        const pagos = (c.pagos ?? []) as unknown as PagoCobroFI[]
        return acc + saldoPendiente({ montoBase: c.montoBase, moras, pagos })
      },
      0
    )
    if (pendiente <= 0) return null
    return jsonError(
      409,
      `No se puede emitir: la unidad mantiene $${pendiente.toLocaleString("es-CL")} pendiente(s). El certificado Al Día exige saldo <= 0.`
    )
  } catch (e) {
    logger.error({ err: e }, "[api/certificados-ct] error en gate de saldo")
    return jsonError(500, "Error interno del servidor.")
  }
}

/** Intentos de asignación de folio antes de rendirse ante colisiones reales. */
const MAX_INTENTOS_CORRELATIVO = 3

/** POST upsert idempotente por id, con gate de deuda/saldo previo y folio
 * `CT-####` correlativo por comunidad asignado en el servidor.
 *
 * Folio server-side (auditoría "funciones de palo" 2026-10-23): el cliente lo
 * calculaba con `max+1` sobre la lista que tenía cargada, así que dos clientes
 * emitiendo a la vez producían el MISMO folio y los huecos quedaban a la vista.
 * Ahora el servidor completa `folio`/`codigoVerificacion` cuando el body no los
 * trae (o los trae vacíos) y delega el resto en la factory: mismo authz, mismo
 * scoping, misma validación, mismo upsert idempotente por id.
 */
export async function POST(req: Request): Promise<Response> {
  const cuerpo = await req.text()
  const rechazo = await gateSaldoAlDia(cuerpo)
  if (rechazo) return rechazo

  const datos = leerObjeto(cuerpo)
  // Folio y código explícitos: no hay nada que completar (el folio que manda el
  // QA-Lab o un import masivo se respeta tal cual, ver tests).
  if (!datos || (!vacio(datos.folio) && !vacio(datos.codigoVerificacion))) {
    return certificadosHandlers.POST(conCuerpo(req, cuerpo))
  }

  const scopeResult = await withComunidadScope()
  // 401/403 los resuelve la factory con el mismo shape; acá solo evitamos
  // reservar un número para una sesión que no puede emitir.
  if (!scopeResult.ok) return scopeResult.response
  const { scope } = scopeResult
  const folioVaPorCuentaDelServidor = vacio(datos.folio)

  for (let intento = 1; intento <= MAX_INTENTOS_CORRELATIVO; intento++) {
    let completos: Record<string, unknown>
    let res: Response
    try {
      completos = await asignarCorrelativo(scope.comunidadId, datos)
      res = await certificadosHandlers.POST(conCuerpo(req, JSON.stringify(completos)))
    } catch (e) {
      logger.error({ err: e }, "[api/certificados-ct] error al asignar folio")
      return jsonError(500, "Error interno del servidor.")
    }
    // 409 = índice único `(comunidadId, folio)`: otra emisión tomó el número
    // entre la lectura y el upsert. Se reintenta SOLO si el folio lo puso el
    // servidor (un folio explícito repetido es un conflicto legítimo del caller).
    if (res.status !== 409 || !folioVaPorCuentaDelServidor) return res
  }
  return jsonError(409, "Conflicto: no se pudo reservar un folio libre, reintentá la emisión.")
}

/** Body JSON como objeto plano; `null` si no lo es (lo reporta la factory). */
function leerObjeto(cuerpo: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(cuerpo)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/** Valor ausente, `null`, `""` o solo espacios = hay que completarlo. */
function vacio(valor: unknown): boolean {
  if (valor === undefined || valor === null) return true
  return typeof valor === "string" && valor.trim() === ""
}

/** Siguiente folio `CT-####` correlativo de una lista de folios emitidos. */
function siguienteFolioCT(folios: readonly string[]): string {
  const numeros = folios
    .map((folio) => Number.parseInt(folio.replace(/^CT-/, ""), 10))
    .filter((n) => Number.isFinite(n))
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
  return `CT-${String(siguiente).padStart(4, "0")}`
}

/**
 * Código de verificación único dentro de la comunidad. 32 bits aleatorios dan
 * colisión despreciable; el bucle acotado existe para no repetir jamás un
 * código ya emitido (el legacy lo reintentaba con `while` sin techo).
 */
function nuevoCodigoVerificacion(existentes: ReadonlySet<string>): string {
  for (let intento = 0; intento < 20; intento++) {
    const codigo = `VC-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`
    if (!existentes.has(codigo)) return codigo
  }
  throw new Error("No se pudo generar un código de verificación único.")
}

/**
 * Completa `folio` y `codigoVerificacion` DENTRO de una transacción, leyendo el
 * máximo de la comunidad. La transacción evita que dos emisiones se intercalen
 * entre la lectura y la escritura; el índice único `(comunidadId, folio)` es la
 * garantía final si aun así compiten (el POST reintenta con el siguiente).
 */
async function asignarCorrelativo(
  comunidadId: string,
  datos: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return prisma.$transaction(async (tx) => {
    // Un certificado ya emitido conserva folio y código (documento inmutable):
    // reenviar el mismo registro no debe consumir un número nuevo.
    const id = typeof datos.id === "string" ? datos.id : null
    if (id) {
      const existente = await tx.certificadoCT.findFirst({
        where: { id, comunidadId },
        select: { folio: true, codigoVerificacion: true },
      })
      if (existente) {
        return {
          ...datos,
          folio: vacio(datos.folio) ? existente.folio : datos.folio,
          codigoVerificacion: vacio(datos.codigoVerificacion)
            ? existente.codigoVerificacion
            : datos.codigoVerificacion,
        }
      }
    }

    const emitidos = await tx.certificadoCT.findMany({
      where: { comunidadId },
      select: { folio: true, codigoVerificacion: true },
    })
    return {
      ...datos,
      folio: vacio(datos.folio)
        ? siguienteFolioCT(emitidos.map((e) => e.folio))
        : datos.folio,
      codigoVerificacion: vacio(datos.codigoVerificacion)
        ? nuevoCodigoVerificacion(new Set(emitidos.map((e) => e.codigoVerificacion)))
        : datos.codigoVerificacion,
    }
  })
}

/** Reconstruye la request con un body ya consumido (la factory lee `json()`). */
function conCuerpo(req: Request, cuerpo: string): Request {
  return new Request(req.url, { method: "POST", headers: req.headers, body: cuerpo })
}
