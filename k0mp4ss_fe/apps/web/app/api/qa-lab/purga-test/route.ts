/**
 * POST /api/qa-lab/purga-test — purga bulk TEST del QA-Lab (qlab-purga-bulk).
 *
 * Una sola request purga el residuo TEST de BD de la comunidad de la sesión,
 * en orden hijos→padres. Antes cada entidad TEST moría con un DELETE propio
 * desde el cliente: cientos de requests que en la lane de CI (>120 s) hacían
 * inviable la limpieza estricta de los specs de poblamiento.
 *
 * Contrato:
 * - 404 con el guard de entorno apagado (isWriteApiEnabled, corta antes que la sesión).
 * - 401 sin sesión; 403 sin membresía (withComunidadScope); 403 sin permiso de
 *   administración de la comunidad (`puede(rol, "eliminar", "qa-lab")`).
 * - 200 `{ borrados: Record<string, number>, bloqueos: string[] }`: solo claves
 *   con count > 0; los conflictos reales (error de Prisma) van a `bloqueos` con
 *   su motivo y no abortan el resto de la purga.
 * - Solo TEST: ids con prefijo `test-` más la procedencia TEST documentada en el
 *   design D3 (cobros FI por unidadId/origenRef, emisiones de periodos TEST
 *   dedicados, notificaciones PI con marca TEST). Nunca datos reales.
 * - Idempotente: segunda corrida = `borrados` y `bloqueos` vacíos.
 * - Inmutables por diseño (liquidaciones confirmadas, certificados CT) no se
 *   tocan ni se reportan como bloqueo: residuo honesto que retira `e2e:higiene`.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { isWriteApiEnabled } from "@/lib/env-guard"
import { puede } from "@/lib/authz"
import { withComunidadScope } from "@/lib/api/with-comunidad-scope"

export const dynamic = "force-dynamic"

const PREFIJO_TEST = "test-"
// Periodos TEST dedicados de la fase FI del lab (fuera de todo calendario real).
const PERIODOS_FI_TEST = ["2019-03", "2019-01"]

function mensajeError(e: unknown): string {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = String((e as { code: unknown }).code)
    const msg = "message" in e ? String((e as { message: unknown }).message).slice(0, 120) : ""
    return msg ? `${code} ${msg}` : code
  }
  return String(e).slice(0, 120)
}

/** ¿Alguna línea JSON de la emisión apunta a una unidad TEST? (semántica del bucle legado). */
function tieneLineaUnidadTest(lineas: unknown): boolean {
  if (!Array.isArray(lineas)) return false
  return lineas.some(
    (linea) =>
      typeof linea === "object" &&
      linea !== null &&
      "unidadId" in linea &&
      typeof linea.unidadId === "string" &&
      linea.unidadId.startsWith(PREFIJO_TEST)
  )
}

export async function POST() {
  if (!isWriteApiEnabled()) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 })
  }
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { comunidadId, rol } = resultado.scope
  if (!puede(rol, "eliminar", "qa-lab")) {
    return NextResponse.json({ error: "Permiso denegado." }, { status: 403 })
  }

  const inicio = Date.now()
  const borrados: Record<string, number> = {}
  const bloqueos: string[] = []

  /** Ejecuta un paso de purga: cuenta lo borrado o registra el bloqueo real. */
  const borrar = async (coleccion: string, ejecutar: () => Promise<number>): Promise<void> => {
    try {
      const n = await ejecutar()
      if (n > 0) borrados[coleccion] = n
    } catch (e) {
      bloqueos.push(`${coleccion}: ${mensajeError(e)}`)
    }
  }

  const porIdTest = { startsWith: PREFIJO_TEST } as const

  // 1) Cobros FI (hijos de emisiones/unidades): id o procedencia TEST.
  await borrar("cobros-fi", async () => {
    const r = await prisma.cobroFI.deleteMany({
      where: {
        comunidadId,
        OR: [{ id: porIdTest }, { unidadId: porIdTest }, { origenRef: porIdTest }],
      },
    })
    return r.count
  })

  // 2) Emisiones GC: id test-* o periodo TEST dedicado con rastro TEST en sus
  //    líneas (misma semántica que el bucle legado: `lineas.some(unidadId test-)`).
  //    `lineas` es JSON y SQLite no lo filtra, así que el filtro por líneas se
  //    evalúa en memoria: una emisión sin unidades test-* nunca se destruye.
  await borrar("emisiones-gc", async () => {
    const candidatas = await prisma.emisionGC.findMany({
      where: {
        comunidadId,
        OR: [{ id: porIdTest }, { periodo: { in: PERIODOS_FI_TEST } }],
      },
      select: { id: true, lineas: true },
    })
    const ids = candidatas
      .filter((e) => e.id.startsWith(PREFIJO_TEST) || tieneLineaUnidadTest(e.lineas))
      .map((e) => e.id)
    if (ids.length === 0) return 0
    const r = await prisma.emisionGC.deleteMany({
      where: { comunidadId, id: { in: ids } },
    })
    return r.count
  })

  // 3) Liquidaciones PL: solo borradores QA (las confirmadas son inmutables);
  //    sus egresos espejo (referencia `egr-*`, id generado por el servidor) se
  //    borran por la referencia colectada, igual que el bucle de cliente.
  const liqsQA = await prisma.liquidacionPL
    .findMany({
      where: {
        comunidadId,
        OR: [{ id: porIdTest }, { trabajadorPersonaId: porIdTest }],
      },
      select: { id: true, estado: true, egresoFIReferencia: true },
    })
    .catch((e: unknown) => {
      bloqueos.push(`liquidaciones: ${mensajeError(e)}`)
      return [] as Array<{ id: string; estado: string; egresoFIReferencia: string | null }>
    })
  const espejos = liqsQA
    .map((l) => l.egresoFIReferencia)
    .filter((id): id is string => typeof id === "string" && id.startsWith("egr-"))
  const borradoresIds = liqsQA.filter((l) => l.estado === "borrador").map((l) => l.id)

  // 4-5) Fondos y egresos FI (incluye los espejos colectados arriba).
  await borrar("egresos-fi", async () => {
    const r = await prisma.egresoFI.deleteMany({
      where: {
        comunidadId,
        OR: [{ id: porIdTest }, { id: { in: espejos } }],
      },
    })
    return r.count
  })
  await borrar("liquidaciones", async () => {
    if (borradoresIds.length === 0) return 0
    const r = await prisma.liquidacionPL.deleteMany({ where: { id: { in: borradoresIds } } })
    return r.count
  })
  await borrar("fondos-fi", async () => {
    const r = await prisma.fondoFI.deleteMany({ where: { comunidadId, id: porIdTest } })
    return r.count
  })

  // 6) RA: reservas antes que elementos.
  await borrar("reservas-ra", async () => {
    const r = await prisma.reservaRA.deleteMany({ where: { comunidadId, id: porIdTest } })
    return r.count
  })
  await borrar("elementos-ra", async () => {
    const r = await prisma.elementoRA.deleteMany({ where: { comunidadId, id: porIdTest } })
    return r.count
  })

  // 7) MT: trabajos antes que proyectos.
  await borrar("trabajos-mt", async () => {
    const r = await prisma.trabajoMT.deleteMany({ where: { comunidadId, id: porIdTest } })
    return r.count
  })
  await borrar("proyectos-mt", async () => {
    const r = await prisma.proyectoMT.deleteMany({ where: { comunidadId, id: porIdTest } })
    return r.count
  })

  // 8) Portal: lead antes que publicación (guard 409 documentado) y las
  //    notificaciones PI generadas por el lead QA (marca TEST en el texto).
  await borrar("leads-portal", async () => {
    const r = await prisma.leadPortal.deleteMany({ where: { comunidadId, id: porIdTest } })
    return r.count
  })
  await borrar("publicaciones-portal", async () => {
    const r = await prisma.publicacionPortal.deleteMany({ where: { comunidadId, id: porIdTest } })
    return r.count
  })
  await borrar("notificaciones", async () => {
    const r = await prisma.notificacion.deleteMany({
      where: {
        comunidadId,
        moduloOrigen: "PI",
        OR: [{ asunto: { contains: "TEST" } }, { cuerpo: { contains: "TEST" } }],
      },
    })
    return r.count
  })

  // 9) Estructura: vínculos → unidades → micro/macro sectores → personas.
  await borrar("vinculos", async () => {
    const r = await prisma.vinculoUnidad.deleteMany({ where: { comunidadId, id: porIdTest } })
    return r.count
  })
  await borrar("unidades", async () => {
    const r = await prisma.unidad.deleteMany({ where: { comunidadId, id: porIdTest } })
    return r.count
  })
  await borrar("micro-sectores", async () => {
    const r = await prisma.microSector.deleteMany({ where: { comunidadId, id: porIdTest } })
    return r.count
  })
  await borrar("macro-sectores", async () => {
    const r = await prisma.macroSector.deleteMany({ where: { comunidadId, id: porIdTest } })
    return r.count
  })
  await borrar("personas", async () => {
    const r = await prisma.persona.deleteMany({ where: { comunidadId, id: porIdTest } })
    return r.count
  })
  await borrar("tipos-unidad", async () => {
    const r = await prisma.tipoUnidad.deleteMany({ where: { comunidadId, id: porIdTest } })
    return r.count
  })

  // 10) Maestros TEST.
  // SAFETY: mismo patrón que `delegado()` en lib/api/crud-factory — los
  // delegates Prisma de modelos distintos exponen deleteMany con firmas
  // estructuralmente compatibles (where comunidadId + id); el cast solo borra
  // los genéricos por modelo y no cambia valores.
  type DelegateMaestro = {
    deleteMany(args: {
      where: { comunidadId: string; id: { startsWith: string } }
    }): Promise<{ count: number }>
  }
  const maestros: Array<[string, DelegateMaestro]> = [
    ["bancos", prisma.banco as unknown as DelegateMaestro],
    ["contactos-emergencia", prisma.contactoEmergencia as unknown as DelegateMaestro],
    ["estados-inmobiliarios", prisma.estadoInmobiliario as unknown as DelegateMaestro],
    ["condiciones-especiales", prisma.condicionEspecial as unknown as DelegateMaestro],
    ["categorias-unidad", prisma.categoriaUnidad as unknown as DelegateMaestro],
    ["categorias-micro", prisma.categoriaMicro as unknown as DelegateMaestro],
    ["categorias-macro", prisma.categoriaMacro as unknown as DelegateMaestro],
    ["estados-ocupacion", prisma.estadoOcupacion as unknown as DelegateMaestro],
  ]
  for (const [coleccion, modelo] of maestros) {
    await borrar(coleccion, async () => {
      const r = await modelo.deleteMany({ where: { comunidadId, id: porIdTest } })
      return r.count
    })
  }

  logger.info(
    { comunidadId, borrados, bloqueos, duracionMs: Date.now() - inicio },
    "[qa-lab] purga bulk TEST"
  )
  return NextResponse.json({ borrados, bloqueos })
}
