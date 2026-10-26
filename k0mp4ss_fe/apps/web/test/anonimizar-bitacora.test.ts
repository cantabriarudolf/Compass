/**
 * @vitest-environment node
 *
 * Anonimización del visitante de la bitácora PE (F15): asesoría normativa 2026-10-26 —
 * no existe plazo legal verificado para bitácoras de control de acceso, así que la
 * identidad del visitante se retiene 90 días (minimización) y luego se anonimiza. El
 * registro NO se borra (es trazabilidad): fecha, estado, hora, jornada, unidad y
 * destinatario quedan. Los 5 años son para documentación administrativa, no para
 * identificar a un tercero.
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

/** Vencida holgado: 91 días antes del HOY fijado (corte de 90 días: fecha <= 2026-07-27). */
const VENCIDA = {
  id: "anon-bitacora-vis-vencida",
  fecha: "2026-07-26",
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

/** Reciente: 89 días antes del HOY fijado, un día antes del corte, sigue identificada. */
const RECIENTE = {
  id: "anon-bitacora-vis-reciente",
  fecha: "2026-07-28",
  nombre: "Tomás Visitante",
  dni: "18.555.666-7",
  patente: "XYZW34",
  jornadaId: "anon-bitacora-jornada",
  origenAgenda: "pre_agendada",
  estado: "agendada",
}

/** Para el atajo --anios 1 (= 365 días): 366 días antes del HOY fijado. */
const POR_ANIO = {
  id: "anon-bitacora-vis-anio",
  fecha: "2025-10-24",
  nombre: "Camila Visitante",
  dni: "13.444.555-6",
  jornadaId: "anon-bitacora-jornada",
  origenAgenda: "sin_aviso",
  estado: "ingresada",
  horaIngreso: "18:40",
}

const IDS = [VENCIDA.id, RECIENTE.id, POR_ANIO.id]

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
      data: [VENCIDA, RECIENTE, POR_ANIO].map((v) => ({ ...v, comunidadId: COMUNIDAD })),
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

  it("--anios 1 (365 días) anonimiza la visita de hace 366 días", async () => {
    const resumen = await anonimizarBitacora({ prisma, hoy: HOY, dias: 365 })

    expect(resumen.afectadas).toBe(1)
    const fila = await prisma.bitacoraVisitaPE.findUnique({ where: { id: POR_ANIO.id } })
    expect(fila?.nombre).toBe(NOMBRE_ANONIMO)
    expect(fila?.dni).toBe("")
    expect(fila?.fecha).toBe(POR_ANIO.fecha)
    expect(fila?.estado).toBe(POR_ANIO.estado)

    // la de 91 días todavía no cumple 365: queda identificada con este plazo
    const vencida = await prisma.bitacoraVisitaPE.findUnique({ where: { id: VENCIDA.id } })
    expect(vencida?.nombre).toBe(VENCIDA.nombre)
    expect(vencida?.dni).toBe(VENCIDA.dni)
  })

  it("una visita de hace 91 días queda anonimizada y conserva fecha, unidad, estado y hora", async () => {
    const eventosAntes = await contarEventosAnonimizacion()
    const resumen = await anonimizarBitacora({ prisma, hoy: HOY, dias: 90 })

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
    // (la corrida de --anios 1 anterior ya emitió el suyo: se suma, no se parte de 0)
    expect(await contarEventosAnonimizacion()).toBe(eventosAntes + 1)
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { comunidadId: COMUNIDAD, tipoAccion: TIPO_ACCION, descripcion: { contains: "2026-07-27" } },
    })
    expect(evento).not.toBeNull()
    expect(evento?.categoria).toBe("PE")
    expect(evento?.descripcion).toContain("1")
    expect(evento?.descripcion).toContain("2026-07-27")
  })

  it("una visita de hace 89 días queda intacta", async () => {
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

    const resumen = await anonimizarBitacora({ prisma, hoy: HOY, dias: 90 })

    expect(resumen.afectadas).toBe(0)
    const despues = await prisma.bitacoraVisitaPE.findUnique({ where: { id: VENCIDA.id } })
    expect(despues).toEqual(antes)
    expect(await contarEventosAnonimizacion()).toBe(eventosAntes)
  })

  it("dryRun no escribe filas ni evento", async () => {
    const prueba = {
      ...VENCIDA,
      id: "anon-bitacora-vis-dry",
      fecha: "2025-01-01",
      nombre: "Otra Visitante",
      dni: "12.345.678-9",
      comunidadId: COMUNIDAD,
    }
    await prisma.bitacoraVisitaPE.deleteMany({ where: { id: prueba.id } })
    await prisma.bitacoraVisitaPE.create({ data: prueba })

    try {
      const eventosAntes = await contarEventosAnonimizacion()
      const resumen = await anonimizarBitacora({ prisma, hoy: HOY, dias: 90, dryRun: true })
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

describe("estaVencida — función pura, borde exacto de los 90 días", () => {
  it("91 días vence, 90 vence (corte exacto) y 89 todavía no", () => {
    expect(estaVencida("2026-07-26", "2026-10-25")).toBe(true) // 91 días
    expect(estaVencida("2026-07-27", "2026-10-25")).toBe(true) // 90 días exactos
    expect(estaVencida("2026-07-28", "2026-10-25")).toBe(false) // 89 días
  })

  it("compara por día calendario, cruzando meses y años", () => {
    expect(estaVencida("2026-10-25", "2026-10-25")).toBe(false)
    expect(estaVencida("2026-01-01", "2026-04-01")).toBe(true) // 90 días cruzando feb
    expect(estaVencida("2026-01-02", "2026-04-01")).toBe(false)
    expect(estaVencida("2025-12-31", "2026-01-01")).toBe(false) // 1 día
    // atajo --anios 1 = 365 días: 366 vence, 365 exacto vence, 364 no
    expect(estaVencida("2025-10-24", "2026-10-25", 365)).toBe(true)
    expect(estaVencida("2025-10-25", "2026-10-25", 365)).toBe(true)
    expect(estaVencida("2025-10-26", "2026-10-25", 365)).toBe(false)
  })

  it("rechaza plazos que no son enteros >= 1", () => {
    expect(() => estaVencida("2026-07-26", "2026-10-25", 0)).toThrow()
    expect(() => estaVencida("2026-07-26", "2026-10-25", 1.5)).toThrow()
    expect(() => estaVencida("fecha-mala", "2026-10-25")).toThrow()
  })
})
