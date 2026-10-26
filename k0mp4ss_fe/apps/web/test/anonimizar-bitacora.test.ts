/**
 * @vitest-environment node
 *
 * Anonimización del visitante de la bitácora PE (F15): criterio del owner de que la
 * bitácora es un registro y no se purga, pero la identidad del tercero no queda
 * indefinida — a los 5 años (precedente interno de retención de logs de auditoría)
 * se anonimiza al visitante conservando el hecho operativo.
 *
 * Prisma real contra la base descartable de la suite; limpieza acotada a los ids
 * que este archivo crea. El `hoy` se pasa explícito a `anonimizarBitacora` para que
 * los bordes no dependan del reloj.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { anonimizarBitacora, estaVencida, NOMBRE_ANONIMO, TIPO_ACCION } from "../scripts/anonimizar-bitacora.mjs"

const COMUNIDAD = "anon-bitacora-comunidad"
const HOY = "2026-10-25"

/** Vencida holgado: 6 años y medio antes del HOY fijado. */
const VENCIDA = {
  id: "anon-bitacora-vis-vencida",
  fecha: "2020-04-01",
  nombre: "Ignacia Visitante",
  dni: "17.222.333-4",
  patente: "ABCD12",
  unidadId: "anon-bitacora-unidad",
  jornadaId: "anon-bitacora-jornada",
  origenAgenda: "sin_aviso",
  estado: "ingresada",
  horaIngreso: "09:15",
  notas: "visita al residente 1301",
}

/** Reciente: 1 año antes del HOY fijado, sigue dentro de la retención. */
const RECIENTE = {
  id: "anon-bitacora-vis-reciente",
  fecha: "2025-10-01",
  nombre: "Tomás Visitante",
  dni: "18.555.666-7",
  patente: "XYZW34",
  jornadaId: "anon-bitacora-jornada",
  origenAgenda: "pre_agendada",
  estado: "agendada",
}

const IDS = [VENCIDA.id, RECIENTE.id]

async function contarEventosAnonimizacion() {
  return prisma.eventoAuditoria.count({
    where: { comunidadId: COMUNIDAD, tipoAccion: TIPO_ACCION },
  })
}

describe("anonimizarBitacora — retención del visitante de la bitácora (F15)", () => {
  beforeAll(async () => {
    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "Comunidad anonimización bitácora", slug: COMUNIDAD },
    })
    await prisma.bitacoraVisitaPE.deleteMany({ where: { id: { in: IDS } } })
    await prisma.bitacoraVisitaPE.createMany({
      data: [VENCIDA, RECIENTE].map((v) => ({ ...v, comunidadId: COMUNIDAD })),
    })
  }, 30_000)

  afterAll(async () => {
    try {
      await prisma.bitacoraVisitaPE.deleteMany({ where: { id: { in: IDS } } })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: COMUNIDAD, tipoAccion: TIPO_ACCION },
      })
      await prisma.comunidad.deleteMany({ where: { id: COMUNIDAD } })
    } catch {
      // intencional: limpieza best-effort
    }
  })

  it("una visita de hace 6 años queda anonimizada y conserva fecha, unidad, estado y hora", async () => {
    const resumen = await anonimizarBitacora({ prisma, hoy: HOY, anios: 5 })

    expect(resumen.afectadas).toBe(1)
    const fila = await prisma.bitacoraVisitaPE.findUnique({ where: { id: VENCIDA.id } })
    expect(fila).not.toBeNull()
    expect(fila?.nombre).toBe(NOMBRE_ANONIMO)
    expect(fila?.dni).toBe("")
    expect(fila?.patente).toBeNull()
    expect(fila?.notas).toBeNull()
    // trazabilidad conservada: el hecho operativo sigue en el registro
    expect(fila?.fecha).toBe(VENCIDA.fecha)
    expect(fila?.estado).toBe(VENCIDA.estado)
    expect(fila?.horaIngreso).toBe(VENCIDA.horaIngreso)
    expect(fila?.jornadaId).toBe(VENCIDA.jornadaId)
    expect(fila?.unidadId).toBe(VENCIDA.unidadId)
    expect(fila?.origenAgenda).toBe(VENCIDA.origenAgenda)

    // un evento por la corrida, con la cantidad y el corte en la descripción
    expect(await contarEventosAnonimizacion()).toBe(1)
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { comunidadId: COMUNIDAD, tipoAccion: TIPO_ACCION },
    })
    expect(evento).not.toBeNull()
    expect(evento?.categoria).toBe("PE")
    expect(evento?.descripcion).toContain("1")
    expect(evento?.descripcion).toContain("2021-10-25")
  })

  it("una visita de hace 1 año queda intacta", async () => {
    const fila = await prisma.bitacoraVisitaPE.findUnique({ where: { id: RECIENTE.id } })
    expect(fila).not.toBeNull()
    expect(fila?.nombre).toBe(RECIENTE.nombre)
    expect(fila?.dni).toBe(RECIENTE.dni)
    expect(fila?.patente).toBe(RECIENTE.patente)
    expect(fila?.estado).toBe(RECIENTE.estado)
  })

  it("correr dos veces no cambia el resultado (idempotencia)", async () => {
    const antes = await prisma.bitacoraVisitaPE.findUnique({ where: { id: VENCIDA.id } })
    const eventosAntes = await contarEventosAnonimizacion()

    const resumen = await anonimizarBitacora({ prisma, hoy: HOY, anios: 5 })

    expect(resumen.afectadas).toBe(0)
    const despues = await prisma.bitacoraVisitaPE.findUnique({ where: { id: VENCIDA.id } })
    expect(despues).toEqual(antes)
    expect(await contarEventosAnonimizacion()).toBe(eventosAntes)
  })

  it("dryRun no escribe filas ni evento", async () => {
    const prueba = {
      ...VENCIDA,
      id: "anon-bitacora-vis-dry",
      fecha: "2019-01-01",
      nombre: "Otra Visitante",
      dni: "12.345.678-9",
      comunidadId: COMUNIDAD,
    }
    await prisma.bitacoraVisitaPE.deleteMany({ where: { id: prueba.id } })
    await prisma.bitacoraVisitaPE.create({ data: prueba })

    try {
      const eventosAntes = await contarEventosAnonimizacion()
      const resumen = await anonimizarBitacora({ prisma, hoy: HOY, anios: 5, dryRun: true })
      expect(resumen.dryRun).toBe(true)
      expect(resumen.vencidas).toBe(1)
      expect(resumen.afectadas).toBe(0)

      const fila = await prisma.bitacoraVisitaPE.findUnique({ where: { id: prueba.id } })
      expect(fila).not.toBeNull()
      expect(fila?.nombre).toBe(prueba.nombre)
      expect(fila?.dni).toBe(prueba.dni)
      expect(await contarEventosAnonimizacion()).toBe(eventosAntes)
    } finally {
      await prisma.bitacoraVisitaPE.deleteMany({ where: { id: prueba.id } })
    }
  })
})

describe("estaVencida — función pura, borde exacto de los 5 años", () => {
  it("5 años recién cumplidos está vencida; un día antes todavía no", () => {
    expect(estaVencida("2021-10-25", "2026-10-25", 5)).toBe(true)
    expect(estaVencida("2021-10-26", "2026-10-25", 5)).toBe(false)
  })

  it("compara por día calendario, no por timestamp", () => {
    expect(estaVencida("2026-10-25", "2026-10-25", 5)).toBe(false)
    expect(estaVencida("2026-01-01", "2031-01-01", 5)).toBe(true)
  })
})
