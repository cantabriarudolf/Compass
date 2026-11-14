#!/usr/bin/env -S npx tsx
/**
 * scripts/fixture-integridad-titularidad — datos ROTOS a propósito, para probar
 * el chequeo de integridad (`scripts/check-unidades-sin-propietario.ts`).
 *
 * Vive fuera de la semilla de demo a propósito: la comunidad de demo tiene que
 * quedar con TODAS sus unidades con dueño, y el chequeo tiene que poder
 * demostrarse rojo sin ensuciar la semilla que se usa para probar a mano la
 * morosidad, el convenio o la emisión.
 *
 * Qué aplica (`--aplicar`), siempre sobre la comunidad indicada:
 *   1. TRES unidades sin ningún vínculo (`u-INT-01`…`u-INT-03`): nunca
 *      declaradas. Se crean con el primer micro-sector y tipo de unidad de la
 *      comunidad, así no se inventan referencias que no existan.
 *   2. UN vínculo de propietario vigente que se cierra sin reemplazo: el tramo
 *      queda con `fechaFin = 2026-01-31` y la unidad se ve vendida sin comprador.
 *      La fecha es la marca que permite deshacerlo.
 *
 * Qué quita (`--quitar`): borra las tres unidades del fixture y reabre los
 * vínculos de propietario que quedaron cerrados con la fecha marca. Es
 * idempotente en los dos sentidos: aplicar dos veces no cierra un segundo tramo
 * (si ya hay uno con la marca, no se toca otro) y quitar dos veces no falla.
 *
 * Los dos comandos imprimen qué hicieron. NO imprimen datos de personas.
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npm run fixture:integridad -- --comunidad-id=comunidad-a --aplicar
 *   npm run check:titularidad -- --comunidad-id=comunidad-a --strict   # falla
 *   npm run fixture:integridad -- --comunidad-id=comunidad-a --quitar
 *   npm run check:titularidad -- --comunidad-id=comunidad-a --strict   # pasa
 */
/* global process, console */
import { PrismaClient } from "@prisma/client"
import { cargarUrlBase } from "../lib/database-url"

/** Fecha marca del cierre: identifica el cierre del fixture y es reversible. */
const FECHA_CIERRE = "2099-12-31"

/** Unidades que el fixture crea sin ningún vínculo (nunca declaradas). */
const UNIDADES_SIN_TITULAR = [
  { id: "u-INT-01", numero: "INT-01" },
  { id: "u-INT-02", numero: "INT-02" },
  { id: "u-INT-03", numero: "INT-03" },
] as const

function comunidadDeclarada(): string | null {
  const flag = process.argv
    .find((a) => a.startsWith("--comunidad-id="))
    ?.slice("--comunidad-id=".length)
    ?.trim()
  if (flag) return flag
  const env = process.env.COMUNIDAD_ID?.trim()
  return env ? env : null
}

function accionPedida(): "aplicar" | "quitar" | null {
  if (process.argv.includes("--aplicar")) return "aplicar"
  if (process.argv.includes("--quitar")) return "quitar"
  return null
}

async function aplicar(prisma: PrismaClient, comunidadId: string): Promise<void> {
  let cerradosEnEstaCorrida = 0
  const [microSector, tipoUnidad] = await Promise.all([
    prisma.microSector.findFirst({
      where: { comunidadId },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
    prisma.tipoUnidad.findFirst({
      where: { comunidadId },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
  ])
  if (!microSector || !tipoUnidad) {
    throw new Error(
      "La comunidad no tiene micro-sectores ni tipos de unidad: el fixture necesita una comunidad sembrada (npm run seed:datos)."
    )
  }

  for (const unidad of UNIDADES_SIN_TITULAR) {
    await prisma.unidad.upsert({
      where: { id: unidad.id },
      update: { comunidadId },
      create: {
        id: unidad.id,
        comunidadId,
        microSectorId: microSector.id,
        numero: unidad.numero,
        etiqueta: "Depto",
        tipoUnidadId: tipoUnidad.id,
        metraje: 42,
        prorrateo: 0.0125,
        rolSii: "",
        estadoId: "vacante",
        servicios: {},
      },
    })
  }

  // Idempotencia: si ya hay un cierre con la marca, no se cierra un segundo.
  const yaCerrado = await prisma.vinculoUnidad.findFirst({
    where: { comunidadId, rol: "propietario", fechaFin: FECHA_CIERRE },
    select: { id: true, unidadId: true },
  })
  if (yaCerrado) {
    console.log(
      `[fixture-integridad] ya había un vínculo cerrado con la marca (${yaCerrado.id}): no se cierra otro`
    )
    cerradosEnEstaCorrida = 0
  } else {
    // El tramo más alto por id suele ser una plaza: cerrar una plaza rompe menos
    // relatos de la demo que cerrar el vínculo del presidente.
    const victima = await prisma.vinculoUnidad.findFirst({
      where: { comunidadId, rol: "propietario", fechaFin: null },
      select: { id: true, unidadId: true },
      orderBy: { id: "desc" },
    })
    if (!victima) {
      throw new Error(
        "La comunidad no tiene un propietario vigente que cerrar: el fixture necesita una comunidad sembrada y completa."
      )
    }
    await prisma.vinculoUnidad.update({
      where: { id: victima.id },
      data: { fechaFin: FECHA_CIERRE },
    })
    cerradosEnEstaCorrida = 1
    console.log(
      `[fixture-integridad] vínculo cerrado sin reemplazo: ${victima.id} (unidad ${victima.unidadId}, fechaFin ${FECHA_CIERRE})`
    )
  }

  console.log(
    `[fixture-integridad] aplicado en ${comunidadId}: ${UNIDADES_SIN_TITULAR.length} unidades sin ningún vínculo + ` +
      (cerradosEnEstaCorrida === 1
        ? "1 vínculo cerrado sin reemplazo (esta corrida)"
        : "0 vínculos cerrados en esta corrida (la marca ya existía)")
  )
}

async function quitar(prisma: PrismaClient, comunidadId: string): Promise<void> {
  const ids = UNIDADES_SIN_TITULAR.map((u) => u.id)
  await prisma.vinculoUnidad.deleteMany({
    where: { comunidadId, unidadId: { in: ids } },
  })
  const unidades = await prisma.unidad.deleteMany({
    where: { comunidadId, id: { in: ids } },
  })
  const reabiertos = await prisma.vinculoUnidad.updateMany({
    // Sólo el centinela: `FECHA_CIERRE` es una fecha que ninguna venta real puede
    // tener. Antes la marca era 2026-01-31, una fecha plausible: si una unidad se
    // vendió de verdad ese día, `--quitar` reabría ese tramo y la unidad volvía a
    // aparecer con dueño. Lo encontró la revisión nativa del 2026-11-14.
    where: { comunidadId, rol: "propietario", fechaFin: FECHA_CIERRE },
    data: { fechaFin: null },
  })
  console.log(
    `[fixture-integridad] quitado de ${comunidadId}: ${unidades.count} unidades del fixture eliminadas y ` +
      `${reabiertos.count} vínculo(s) de propietario reabiertos (fechaFin ${FECHA_CIERRE})`
  )
}

async function main(): Promise<void> {
  const accion = accionPedida()
  if (!accion) {
    console.error(
      "[fixture-integridad] falta la acción: usá --aplicar o --quitar (y --comunidad-id=<id>)"
    )
    process.exitCode = 2
    return
  }

  const prisma = new PrismaClient({ datasourceUrl: cargarUrlBase() })
  try {
    const declarada = comunidadDeclarada()
    const comunidad = declarada
      ? await prisma.comunidad.findUnique({ where: { id: declarada } })
      : await prisma.comunidad.findFirst({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
    if (!comunidad) {
      console.error(
        declarada
          ? `[fixture-integridad] la comunidad ${declarada} no existe en esta base`
          : "[fixture-integridad] la base no tiene comunidades: corré la semilla primero"
      )
      process.exitCode = 2
      return
    }

    if (accion === "aplicar") await aplicar(prisma, comunidad.id)
    else await quitar(prisma, comunidad.id)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e: unknown) => {
  console.error("[fixture-integridad] error:", e instanceof Error ? e.message : e)
  process.exit(1)
})
