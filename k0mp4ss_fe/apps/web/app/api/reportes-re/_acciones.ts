/**
 * _acciones.ts — utilidades compartidas de las TRANSICIONES RE (Reportería).
 *
 * Módulo co-locado (no es una ruta de Next): resuelve el scope de comunidad, el
 * permiso sobre el recurso que corresponde a cada transición, carga el reporte
 * scoped por comunidad, calcula el snapshot del informe DESDE LA BD y emite
 * eventos de auditoría con el mismo shape que `registrarEvento` del store legacy
 * (categoría "RE", `usuario` = usuario de la sesión).
 *
 * Decisiones del plan SERIE-FASE2 §V3 (no reinterpretar):
 * - **Emitir congela**: el informe se calcula UNA vez, al emitir, desde la BD, y
 *   se persiste en `payloadSnapshot` junto con `fechaGeneracion`, `autor` y
 *   `numero` correlativo. Abrirlo meses después devuelve exactamente lo mismo,
 *   aunque los datos de origen hayan cambiado.
 * - **Distribuir** publica en el visor interno (con permiso `re` ver) y encola
 *   el email opcional. Sin emisor SMTP el email queda en `pendiente`: nunca se
 *   reporta como "enviado".
 * - **No hay tasa de apertura**: la métrica es emitidos / distribuidos / leídos
 *   en la app (una `lectura` por usuario y por informe).
 * - **Authz**: `re` crear/editar es exclusivo del administrador (el comité solo
 *   tiene `re` ver y `re:centro_mando` ver; el residente no tiene `re`). No se
 *   declaran recursos nuevos porque la matriz ya expresa esa regla por
 *   menor privilegio.
 *
 * El snapshot se calcula con las mismas funciones puras que usaba la UI
 * (`saldoPendiente`) y con las mismas etiquetas que congelaba el store legacy,
 * de modo que el histórico migrado y el nuevo se leen igual.
 */
import { createHash } from "node:crypto"
import { puede, type Accion } from "@/lib/authz"
import { generarId } from "@/lib/id-utils"
import { hoyISO } from "@/lib/date-utils"
import { prisma } from "@/lib/prisma"
import { saldoPendiente } from "@/lib/finanzas-utils"
import type { BloqueReporteRE, ReporteRE } from "@/lib/schemas"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
  type ScopeResult,
} from "@/lib/api/with-comunidad-scope"

/** Recurso RBAC de reportería: administrador emite/distribuye, comité solo ver. */
export const RECURSO_RE = "re"
/** Recurso del centro de mando (métricas del tablero), lectura para el comité. */
export const RECURSO_CENTRO_MANDO_RE = "re:centro_mando"

/** Cliente Prisma mínimo de las transiciones RE (admite el `tx` de una transacción). */
export type ClienteRE = Pick<
  typeof prisma,
  "reporteRE" | "notificacion" | "eventoAuditoria"
>

export type ContextoAccionRE =
  | { ok: true; scope: ComunidadScope }
  | { ok: false; response: Response }

/**
 * Contexto server-side de una transición RE: sesión + membresía + permiso sobre
 * el recurso indicado (por defecto `re` con `ver`).
 */
export async function contextoAccionRE(
  recurso: string = RECURSO_RE,
  accion: Accion = "ver"
): Promise<ContextoAccionRE> {
  const resultado: ScopeResult = await withComunidadScope()
  if (!resultado.ok) return resultado
  if (!puede(resultado.scope.rol, accion, recurso)) {
    return { ok: false, response: jsonError(403, "Permiso denegado.") }
  }
  return { ok: true, scope: resultado.scope }
}

/**
 * Carga el reporte por id exigiendo que pertenezca a la comunidad del scope.
 * Devuelve `null` tanto si no existe como si es de otra comunidad: cada ruta
 * responde 404 sin filtrar existencia (mismo contrato que el resto de la API).
 */
export async function cargarReporteRE(
  id: string,
  scope: ComunidadScope,
  client: Pick<typeof prisma, "reporteRE"> = prisma
) {
  const reporte = await client.reporteRE.findUnique({ where: { id } })
  if (!reporte || reporte.comunidadId !== scope.comunidadId) return null
  return reporte
}

/** Emite UN evento de auditoría RE (con `client` se integra a la transacción). */
export function registrarEventoRE(
  scope: ComunidadScope,
  tipoAccion: string,
  referenciaId: string,
  descripcion: string,
  client: Pick<typeof prisma, "eventoAuditoria"> = prisma
): Promise<unknown> {
  return client.eventoAuditoria.create({
    data: {
      id: generarId("ev"),
      comunidadId: scope.comunidadId,
      timestamp: new Date().toISOString(),
      usuario: scope.usuarioId,
      categoria: "RE",
      tipoAccion,
      referenciaId,
      descripcion,
    },
  })
}

/** Periodo del informe (AAAA-MM); por defecto el mes en curso. */
export function periodoActual(): string {
  return hoyISO().slice(0, 7)
}

/**
 * Número correlativo por comunidad. Se calcula dentro de la transacción de
 * emisión y el índice único `(comunidadId, numero)` es el candado final: dos
 * emisiones concurrentes no pueden quedarse con el mismo número.
 */
export async function numeroSiguienteRE(
  client: Pick<typeof prisma, "reporteRE">,
  comunidadId: string
): Promise<number> {
  const ultimo = await client.reporteRE.findFirst({
    where: { comunidadId, numero: { not: null } },
    orderBy: { numero: "desc" },
    select: { numero: true },
  })
  return (ultimo?.numero ?? 0) + 1
}

/**
 * Identificador determinista de emisión (idempotencia).
 *
 * Emitir dos veces el MISMO informe (mismo periodo, título, bloques y segmento)
 * en la MISMA comunidad produce el mismo id: la segunda llamada devuelve el
 * snapshot ya congelado en lugar de duplicarlo. Un mes distinto, un título
 * distinto o un segmento distinto producen otro informe, que es lo correcto.
 */
export function idIdempotenteRE(input: {
  comunidadId: string
  periodo: string
  titulo: string
  bloques: BloqueReporteRE[]
  segmento: ReporteRE["segmento"]
}): string {
  const canonico = JSON.stringify({
    comunidadId: input.comunidadId,
    periodo: input.periodo,
    titulo: input.titulo.trim(),
    bloques: [...input.bloques].sort(),
    macroSectorIds: [...input.segmento.macroSectorIds].sort(),
    microSectorIds: [...input.segmento.microSectorIds].sort(),
    unidadIds: [...input.segmento.unidadIds].sort(),
    perfiles: [...input.segmento.perfiles].sort(),
    tenencias: [...input.segmento.tenencias].sort(),
  })
  const hash = createHash("sha256").update(canonico).digest("hex").slice(0, 16)
  return `re-rep-${hash}`
}

/** Formato CLP usado por el snapshot (idéntico al que congelaba la UI). */
function clp(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`
}

/**
 * Calcula el snapshot del informe DESDE LA BD, con un bloque por cada bloque
 * solicitado y las mismas etiquetas del store legacy.
 *
 * Este cálculo ocurre SOLO al emitir: el resultado se persiste y nunca se
 * recalcula al abrir el informe.
 */
export async function calcularPayloadSnapshot(
  comunidadId: string,
  bloques: BloqueReporteRE[],
  periodo: string
): Promise<ReporteRE["payloadSnapshot"]> {
  const payload: ReporteRE["payloadSnapshot"] = []
  const hoy = hoyISO()

  // Se cargan una vez los catálogos de referencia que usan los bloques.
  const necesitaPersonas = bloques.includes("bitacora_seguridad")
  const necesitaUnidades = bloques.includes("morosidad")
  const [personas, unidades] = await Promise.all([
    necesitaPersonas
      ? prisma.persona.findMany({
          where: { comunidadId },
          select: { id: true, nombres: true, apellidos: true },
        })
      : Promise.resolve([]),
    necesitaUnidades
      ? prisma.unidad.findMany({
          where: { comunidadId },
          select: { id: true, etiqueta: true, numero: true },
        })
      : Promise.resolve([]),
  ])
  const nombrePersona = new Map(
    personas.map((p) => [p.id, `${p.nombres} ${p.apellidos}`])
  )
  const refUnidad = new Map(
    unidades.map((u) => [u.id, `${u.etiqueta} ${u.numero}`])
  )

  for (const bloque of bloques) {
    const lineas: { etiqueta: string; valor: string }[] = []

    if (bloque === "gastos_mes") {
      const delMes = await prisma.egresoFI.findMany({
        where: { comunidadId, fecha: { startsWith: `${periodo}-` } },
        select: { monto: true, esRecurrente: true },
      })
      const total = delMes.reduce((acc, e) => acc + e.monto, 0)
      const recurrentes = delMes
        .filter((e) => e.esRecurrente)
        .reduce((acc, e) => acc + e.monto, 0)
      lineas.push({ etiqueta: "Mes", valor: periodo })
      lineas.push({ etiqueta: "Egresos registrados", valor: String(delMes.length) })
      lineas.push({ etiqueta: "Total egresos", valor: clp(total) })
      lineas.push({ etiqueta: "Gastos fijos recurrentes", valor: clp(recurrentes) })
    } else if (bloque === "bitacora_seguridad") {
      const cierres = await prisma.cierreTurnoPE.findMany({
        where: { comunidadId },
        orderBy: [{ fecha: "desc" }, { hora: "desc" }],
        select: {
          fecha: true,
          trabajadorPersonaId: true,
          novedadesGenerales: true,
          incidencias: true,
        },
      })
      const conNovedades = cierres
        .filter((c) => {
          const incidencias = c.incidencias as { hubo?: boolean; descripcion?: string } | null
          return incidencias?.hubo === true || Boolean(c.novedadesGenerales)
        })
        .slice(0, 10)
      lineas.push({
        etiqueta: "Reportes con novedades (últimos 10)",
        valor: String(conNovedades.length),
      })
      for (const c of conNovedades.slice(0, 5)) {
        const incidencias = c.incidencias as { hubo?: boolean; descripcion?: string } | null
        const trabajador = nombrePersona.get(c.trabajadorPersonaId) ?? c.trabajadorPersonaId
        // El esquema exige `valor` no vacío: una incidencia sin descripción se
        // congela con un texto explícito en vez de reventar la emisión.
        const detalle = (
          incidencias?.hubo
            ? (incidencias.descripcion ?? "")
            : (c.novedadesGenerales ?? "")
        ).slice(0, 80) || "Sin detalle informado"
        lineas.push({
          etiqueta: `${c.fecha} (${trabajador})`,
          valor: detalle,
        })
      }
    } else if (bloque === "morosidad") {
      const cobros = await prisma.cobroFI.findMany({
        where: { comunidadId },
        select: { unidadId: true, montoBase: true, moras: true, pagos: true, fechaVencimiento: true },
      })
      const vencidos = cobros
        .map((c) => ({
          unidadId: c.unidadId,
          saldo: saldoPendiente({
            montoBase: c.montoBase,
            moras: c.moras as never,
            pagos: c.pagos as never,
          }),
          vencimiento: c.fechaVencimiento,
        }))
        .filter((x) => x.saldo > 0 && Boolean(x.vencimiento) && (x.vencimiento as string) < hoy)
        .sort((a, b) => b.saldo - a.saldo)
      const totalVencido = vencidos.reduce((acc, x) => acc + x.saldo, 0)
      lineas.push({
        etiqueta: "Cobros vencidos con deuda",
        valor: String(vencidos.length),
      })
      lineas.push({ etiqueta: "Deuda vencida total", valor: clp(totalVencido) })
      for (const x of vencidos.slice(0, 5)) {
        lineas.push({
          etiqueta: refUnidad.get(x.unidadId) ?? x.unidadId,
          valor: clp(x.saldo),
        })
      }
    } else {
      const entregas = await prisma.solicitudInsumoIR.findMany({
        where: { comunidadId, estado: "entregada" },
        select: { areaDestino: true, cantidad: true },
      })
      lineas.push({
        etiqueta: "Solicitudes entregadas (histórico)",
        valor: String(entregas.length),
      })
      const porArea = new Map<string, number>()
      for (const s of entregas) {
        porArea.set(s.areaDestino, (porArea.get(s.areaDestino) ?? 0) + s.cantidad)
      }
      for (const [area, cantidad] of [...porArea.entries()].slice(0, 5)) {
        lineas.push({ etiqueta: area, valor: `${cantidad} ítem(s)` })
      }
    }

    payload.push({ bloque, lineas })
  }

  return payload
}
