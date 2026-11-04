/**
 * @vitest-environment node
 *
 * T3 cobro-gastos-comunes-parametrico (S2/S3) — backfill de la migración
 * `add_version_reglamento`.
 *
 * La migración materializa el comportamiento vigente en la versión 1 de cada
 * comunidad con configuración (fuente `migracion_automatica`, que NO habilita
 * emitir), sin tocar emisiones ni cobros, y se puede correr dos veces.
 *
 * El test ejecuta la sentencia REAL del archivo de migración dentro de una
 * transacción que se revierte al final: mide el efecto sobre la base
 * descartable sin dejar filas creadas.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { prisma } from "@/lib/prisma"

const ARCHIVO_MIGRACION = path.resolve(
  __dirname,
  "..",
  "prisma/migrations/20261105000000_add_version_reglamento/migration.sql"
)
const INICIO_BACKFILL = 'INSERT INTO "versiones_reglamento"'

class RollbackIntencional extends Error {}

function sentenciaBackfill(): string {
  const sql = readFileSync(ARCHIVO_MIGRACION, "utf8")
  const inicio = sql.indexOf(INICIO_BACKFILL)
  expect(inicio).toBeGreaterThan(-1)
  const fin = sql.indexOf(";", inicio)
  expect(fin).toBeGreaterThan(inicio)
  return sql.slice(inicio, fin + 1)
}

const COMUNIDAD_FIJA = "rmb-com-fija"
const COMUNIDAD_VARIABLE = "rmb-com-variable"
const COMUNIDAD_SIN_CONFIG = "rmb-com-sin-config"

function configuracion(comunidadId: string, modoCalculoGC: string, limiteMesesAvisoCorte: number) {
  return {
    id: `rmb-cfg-${comunidadId}`,
    comunidadId,
    nombreComunidad: `Comunidad ${comunidadId}`,
    rutComunidad: "11.111.111-1",
    direccionOficial: "Calle TEST 123",
    administradorResponsable: "Admin TEST",
    rutAdministrador: "12.345.678-5",
    telefonoAdmin: "+56900000001",
    modoCalculoGC,
    diaCortePago: 5,
    limiteMesesAvisoCorte,
    smtpHost: "localhost",
    smtpPort: 25,
    smtpUser: "test",
    smtpSecurity: "none",
    smtpFrom: "test@test.cl",
    smtpFromName: "TEST",
    notificarEmisionGC: false,
    notificarRegistroVisitas: false,
    notificarEncomiendas: false,
    notificarReservas: false,
    notificarAvisosSistema: false,
    notificarSugerenciasReclamos: false,
    diasMesComercial: 30,
    diasVacacionesMes: 1.25,
    jornadaSemanalEstandar: 45,
  }
}

const EMISION_FIJA = {
  id: "rmb-emision-fija",
  comunidadId: COMUNIDAD_FIJA,
  periodo: "2026-03",
  modo: "fijo",
  gastoTotal: 100000,
  lineas: [],
  fechaEmision: "2026-03-05",
}

const EMISION_ANTERIOR = {
  ...EMISION_FIJA,
  id: "rmb-emision-anterior",
  periodo: "2026-02",
}

const COBRO_FIJO = {
  id: "rmb-cobro-fijo",
  comunidadId: COMUNIDAD_FIJA,
  unidadId: "rmb-u-1",
  periodo: "2026-03",
  concepto: "gasto_comun",
  origenModulo: "FI",
  origenRef: EMISION_FIJA.id,
  fondoId: "rmb-fondo-gc",
  descripcion: "Gasto Común 2026-03",
  montoBase: 100000,
  fechaCargo: "2026-03-05",
  fechaVencimiento: "2026-04-04",
  moras: [],
  pagos: [],
  diferencias: [],
}

describe("migración add_version_reglamento — backfill idempotente", () => {
  it("crea la versión 1 con los parámetros de hoy sin tocar emisiones ni cobros", async () => {
    const sql = sentenciaBackfill()
    const observado: {
      parametrosFija?: Record<string, unknown>
      parametrosVariable?: Record<string, unknown>
      versionesPorComunidad: Record<string, number>
      emisionesAntes?: string
      emisionesDespues?: string
      cobrosAntes?: string
      cobrosDespues?: string
    } = { versionesPorComunidad: {} }

    await expect(
      prisma.$transaction(
        async (tx) => {
          for (const c of [
            { id: COMUNIDAD_FIJA, nombre: "Comunidad Backfill Fija", slug: "rmb-fija" },
            { id: COMUNIDAD_VARIABLE, nombre: "Comunidad Backfill Variable", slug: "rmb-variable" },
            { id: COMUNIDAD_SIN_CONFIG, nombre: "Comunidad Backfill Sin Config", slug: "rmb-sin-config" },
          ]) {
            await tx.comunidad.create({ data: c })
          }
          await tx.configuracionGlobal.create({
            data: configuracion(COMUNIDAD_FIJA, "fijo", 4) as never,
          })
          await tx.configuracionGlobal.create({
            data: configuracion(COMUNIDAD_VARIABLE, "variable", 3) as never,
          })
          await tx.fondoFI.create({
            data: {
              id: "rmb-fondo-reserva",
              comunidadId: COMUNIDAD_FIJA,
              nombre: "Fondo Reserva Backfill",
              tipo: "reserva",
              activo: true,
              porcentajeAporte: 8,
            },
          })
          await tx.fondoFI.create({
            data: {
              id: "rmb-fondo-reserva-inactivo",
              comunidadId: COMUNIDAD_FIJA,
              nombre: "Fondo Reserva Inactivo",
              tipo: "reserva",
              activo: false,
              porcentajeAporte: 99,
            },
          })
          await tx.emisionGC.create({ data: EMISION_FIJA })
          await tx.emisionGC.create({ data: EMISION_ANTERIOR })
          await tx.cobroFI.create({ data: COBRO_FIJO })

          const emisionesAntes = await tx.emisionGC.findMany({ orderBy: { id: "asc" } })
          const cobrosAntes = await tx.cobroFI.findMany({ orderBy: { id: "asc" } })

          await tx.$executeRawUnsafe(sql)

          const versiones = await tx.versionReglamento.findMany({
            where: {
              comunidadId: { in: [COMUNIDAD_FIJA, COMUNIDAD_VARIABLE, COMUNIDAD_SIN_CONFIG] },
            },
            orderBy: [{ comunidadId: "asc" }, { version: "asc" }],
          })
          for (const v of versiones) {
            observado.versionesPorComunidad[v.comunidadId] =
              (observado.versionesPorComunidad[v.comunidadId] ?? 0) + 1
          }
          const fija = versiones.find((v) => v.comunidadId === COMUNIDAD_FIJA)
          const variable = versiones.find((v) => v.comunidadId === COMUNIDAD_VARIABLE)
          observado.parametrosFija = (fija?.parametros ?? undefined) as Record<string, unknown> | undefined
          observado.parametrosVariable = (variable?.parametros ?? undefined) as
            | Record<string, unknown>
            | undefined

          // S3: la versión 1 queda con el instrumento, la forma y el período.
          expect(fija?.version).toBe(1)
          expect(fija?.vigenteDesde).toBe("2026-02")
          expect(fija?.fuenteInstrumento).toBe("migracion_automatica")
          expect(fija?.actaRef).toBeNull()
          expect(fija?.formaContribucion).toBe("monto_por_tipo")
          expect(variable?.version).toBe(1)
          expect(variable?.vigenteDesde).toBe("2026-01")
          expect(variable?.formaContribucion).toBe("coeficiente")
          // S2: ningún número nuevo se inventa; se materializa el de hoy.
          expect(observado.parametrosFija).toEqual({
            porcentajeReserva: 8,
            diasPagoGc: 30,
            tasaMoraMensualPct: 1,
            topeMoraPct: 50,
            cuotasCorte: 4,
            diasPreavisoCorte: 5,
            ipcActivo: false,
          })
          expect(observado.parametrosVariable).toEqual({
            porcentajeReserva: 0,
            diasPagoGc: 30,
            tasaMoraMensualPct: 1,
            topeMoraPct: 50,
            cuotasCorte: 3,
            diasPreavisoCorte: 5,
            ipcActivo: false,
          })

          // Idempotencia: la segunda corrida no duplica la versión.
          await tx.$executeRawUnsafe(sql)
          const versionesTrasSegunda = await tx.versionReglamento.findMany({
            where: { comunidadId: COMUNIDAD_FIJA },
          })
          expect(versionesTrasSegunda).toHaveLength(1)

          // Nada más se movió: emisiones y cobros quedan byte a byte iguales.
          const emisionesDespues = await tx.emisionGC.findMany({ orderBy: { id: "asc" } })
          const cobrosDespues = await tx.cobroFI.findMany({ orderBy: { id: "asc" } })
          expect(emisionesDespues).toEqual(emisionesAntes)
          expect(cobrosDespues).toEqual(cobrosAntes)
          observado.emisionesAntes = JSON.stringify(emisionesAntes)
          observado.emisionesDespues = JSON.stringify(emisionesDespues)
          observado.cobrosAntes = JSON.stringify(cobrosAntes)
          observado.cobrosDespues = JSON.stringify(cobrosDespues)

          throw new RollbackIntencional("rollback intencional del test")
        },
        { timeout: 30_000 }
      )
    ).rejects.toThrow("rollback intencional del test")

    expect(observado.parametrosFija?.porcentajeReserva).toBe(8)
    expect(observado.versionesPorComunidad[COMUNIDAD_FIJA]).toBe(1)
    expect(observado.versionesPorComunidad[COMUNIDAD_VARIABLE]).toBe(1)
    expect(observado.versionesPorComunidad[COMUNIDAD_SIN_CONFIG]).toBeUndefined()
    expect(observado.emisionesAntes).toBe(observado.emisionesDespues)
    expect(observado.cobrosAntes).toBe(observado.cobrosDespues)

    // El rollback dejó la base como estaba: ni versiones ni comunidades del test.
    expect(
      await prisma.versionReglamento.count({
        where: { comunidadId: { in: [COMUNIDAD_FIJA, COMUNIDAD_VARIABLE, COMUNIDAD_SIN_CONFIG] } },
      })
    ).toBe(0)
    expect(
      await prisma.comunidad.count({
        where: { id: { in: [COMUNIDAD_FIJA, COMUNIDAD_VARIABLE, COMUNIDAD_SIN_CONFIG] } },
      })
    ).toBe(0)
  })
})
