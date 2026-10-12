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

/** POST upsert idempotente por id, con gate de deuda/saldo previo. */
export async function POST(req: Request): Promise<Response> {
  const cuerpo = await req.text()
  const rechazo = await gateSaldoAlDia(cuerpo)
  if (rechazo) return rechazo
  // El body ya fue consumido por el gate: se reconstruye la request para la factory.
  return certificadosHandlers.POST(
    new Request(req.url, { method: "POST", headers: req.headers, body: cuerpo })
  )
}
