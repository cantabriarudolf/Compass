import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, seedData } from "@/lib/store"
import type { InfraccionIN, TipoInfraccionIN, Unidad } from "@/lib/schemas"
import { resetStore } from "./helpers"

/**
 * Fase C de cobertura del store legacy (SERIE-DEUDA-1 P5).
 * Cubre ramas de validación de acciones legacy que no tenían test:
 * `saveUnidad` (FKs de RG escritura), `aplicarInfraccionIN` (ramas de rechazo,
 * daño directo y sanción % GC contra el libro FI) y `generarReporteRE`
 * (bloques bitácora de seguridad, morosidad y consumo de insumos).
 */
const getState = () => useCompassStore.getState()

const unidadSeed = (): Unidad => ({ ...seedData().unidades[0] })

const infraccionBase = (partial: Partial<InfraccionIN>): InfraccionIN =>
  ({
    id: "in-p5-1",
    folio: "",
    tipoInfraccionId: "tipo-in-mascotas",
    unidadId: unidadSeed().id,
    fechaSuceso: "2026-08-24",
    horaSuceso: "21:30",
    fechaRegistro: "2026-08-24",
    antecedentes:
      "Mascota sin correa reiteradamente en el jardín central según testimonios.",
    evidencias: [],
    estado: "en_revision",
    respaldosDirectiva: [],
    ...partial,
  }) as InfraccionIN

const cobroGC = (unidadId: string) => ({
  id: "cob-gc-p5",
  unidadId,
  periodo: "2026-09",
  concepto: "gasto_comun" as const,
  origenModulo: "FI" as const,
  fondoId: "fondo-gc-p5",
  descripcion: "Gasto común septiembre",
  montoBase: 100000,
  fechaCargo: "2026-09-01",
  fechaVencimiento: "2026-09-05",
  moras: [],
  pagos: [],
  diferencias: [],
})

describe("saveUnidad — validaciones de FK (RG escritura)", () => {
  beforeEach(() => resetStore())

  it("rechaza microSectorId inexistente sin mutar la colección", () => {
    const antes = getState().unidades.length
    const r = getState().saveUnidad({
      ...unidadSeed(),
      id: "u-p5-1",
      microSectorId: "micro-fantasma",
    })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("microSectorId no existe")
    expect(getState().unidades).toHaveLength(antes)
  })

  it("rechaza tipoUnidadId inexistente sin mutar la colección", () => {
    const antes = getState().unidades.length
    const r = getState().saveUnidad({
      ...unidadSeed(),
      id: "u-p5-2",
      tipoUnidadId: "tipo-fantasma",
    })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("tipoUnidadId no existe")
    expect(getState().unidades).toHaveLength(antes)
  })

  it("rechaza estadoId fuera del maestro de ocupación sin mutar", () => {
    const antes = getState().unidades.length
    const r = getState().saveUnidad({
      ...unidadSeed(),
      id: "u-p5-3",
      estadoId: "estado-fantasma",
    })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("estadoId no existe")
    expect(getState().unidades).toHaveLength(antes)
  })

  it("acepta una unidad con FKs válidas (camino feliz)", () => {
    const base = unidadSeed()
    const r = getState().saveUnidad({
      ...base,
      id: "u-p5-4",
      numero: "9999",
      etiqueta: "P5",
    })
    expect(r.ok).toBe(true)
    expect(getState().unidades.some((u) => u.id === "u-p5-4")).toBe(true)
  })
})

describe("aplicarInfraccionIN — ramas de rechazo y sanción", () => {
  beforeEach(() => resetStore())

  it("rechaza una infracción inexistente", () => {
    const r = getState().aplicarInfraccionIN("in-no-existe")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("la infracción no existe")
  })

  it("rechaza una infracción ya resuelta (solo En Revisión/Apelada)", () => {
    getState().saveInfraccionIN(infraccionBase({ id: "in-p5-res" }))
    expect(getState().desestimarInfraccionIN("in-p5-res", "Sin mérito tras revisión.").ok).toBe(true)
    const r = getState().aplicarInfraccionIN("in-p5-res")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("Solo una infracción")
  })

  it("rechaza si el tipo fue podado del catálogo", () => {
    getState().saveInfraccionIN(infraccionBase({ id: "in-p5-tipo" }))
    const tipos = getState().tiposInfraccionIN.filter(
      (t) => t.id !== "tipo-in-mascotas"
    )
    useCompassStore.setState({ tiposInfraccionIN: tipos })
    const r = getState().aplicarInfraccionIN("in-p5-tipo")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("ya no existe en el catálogo")
  })

  it("cobra daño directo por el costo de reparación, sin catálogo", () => {
    getState().saveInfraccionIN(
      infraccionBase({
        id: "in-p5-dano",
        tipoInfraccionId: undefined,
        danoDirecto: {
          descripcionDaño: "Rotura de espejo del ascensor",
          costoReparacion: 80000,
        },
        evidencias: [
          {
            nombre: "dano.jpg",
            tipoMime: "image/jpeg",
            tamanoKB: 90,
            url: "https://placeholder.supabase.co/dano.jpg",
          },
        ],
      })
    )
    const r = getState().aplicarInfraccionIN("in-p5-dano")
    expect(r.ok).toBe(true)
    const inf = getState().infraccionesIN.find((i) => i.id === "in-p5-dano")!
    expect(inf.estado).toBe("aplicada")
    expect(inf.montoAplicado).toBe(80000)
  })

  it("resuelve la sanción % GC contra el último gasto común de la unidad", () => {
    const unidadId = unidadSeed().id
    getState().savePersona({
      ...(seedData().personas[0] as never),
      id: "p-p5-directivo",
      roles: ["directiva"],
      datosGobernanza: {
        id: "gob-p5",
        cargoDirectiva: "tesorero",
        fechaAsuncion: "2026-08-01",
      } as never,
    } as never)
    getState().saveInfraccionIN(
      infraccionBase({ id: "in-p5-gc", tipoInfraccionId: "tipo-in-ruidos", unidadId })
    )
    expect(getState().respaldarInfraccionIN("in-p5-gc", "p-p5-directivo").ok).toBe(true)
    useCompassStore.setState({
      cobrosFI: [cobroGC(unidadId) as never],
      fondosFI: [
        {
          id: "fondo-gc-p5",
          nombre: "Fondo GC",
          tipo: "gasto_comun",
          activo: true,
          saldo: 0,
        } as never,
      ],
    })
    const r = getState().aplicarInfraccionIN("in-p5-gc")
    expect(r.ok).toBe(true)
    const inf = getState().infraccionesIN.find((i) => i.id === "in-p5-gc")!
    // tipo-in-ruidos = 50% del GC; 50% de 100.000 = 50.000
    expect(inf.montoAplicado).toBe(50000)
    const cobro = getState().cobrosFI.find((c) => c.id === inf.cargoFIReferencia)!
    expect(cobro.montoBase).toBe(50000)
  })

  it("deja el cargo en 'pendiente' cuando no hay fondo de gasto común activo", () => {
    const unidadId = unidadSeed().id
    useCompassStore.setState({ fondosFI: [] })
    getState().saveInfraccionIN(
      infraccionBase({
        id: "in-p5-sinfondo",
        tipoInfraccionId: undefined,
        danoDirecto: {
          descripcionDaño: "Daño menor en portón",
          costoReparacion: 30000,
        },
        evidencias: [
          {
            nombre: "porton.jpg",
            tipoMime: "image/jpeg",
            tamanoKB: 40,
            url: "https://placeholder.supabase.co/porton.jpg",
          },
        ],
        unidadId,
      })
    )
    const r = getState().aplicarInfraccionIN("in-p5-sinfondo")
    expect(r.ok).toBe(true)
    const inf = getState().infraccionesIN.find((i) => i.id === "in-p5-sinfondo")!
    expect(inf.cargoFIReferencia).toBe("pendiente")
    expect(getState().cobrosFI.some((c) => c.origenRef === "in-p5-sinfondo")).toBe(false)
  })
})

describe("generarReporteRE — bloques de bitácora, morosidad e insumos", () => {
  beforeEach(() => resetStore())

  it("genera un reporte con los 3 bloques operativos y captura el snapshot", () => {
    const seed = seedData()
    const unidadId = seed.unidades[0].id
    useCompassStore.setState({
      cierresTurnoPE: [
        {
          ...(seed.cierresTurnoPE[0] ?? ({} as never)),
          fecha: "2026-10-01",
          trabajadorPersonaId: seed.personas[0]?.id ?? "p-x",
          incidencias: { hubo: true, descripcion: "Portón forzado en torre A" },
          novedadesGenerales: "Ronda nocturna sin otras novedades",
        } as never,
      ],
      cobrosFI: [
        {
          ...cobroGC(unidadId),
          fechaVencimiento: "2026-01-05",
          montoBase: 50000,
        } as never,
      ],
      solicitudesInsumoIR: [
        { id: "sol-p5", areaDestino: "Aseo", cantidad: 4, estado: "entregada" } as never,
      ],
    })

    const r = getState().generarReporteRE({
      titulo: "Cierre operativo de octubre",
      bloques: ["bitacora_seguridad", "morosidad", "consumo_insumos"],
      segmento: {},
    })

    expect(r.ok).toBe(true)
    const reporte = getState().reportesRE[getState().reportesRE.length - 1]
    expect(reporte.titulo).toBe("Cierre operativo de octubre")
    expect(reporte.bloques).toHaveLength(3)
    expect(reporte.payloadSnapshot).toHaveLength(3)

    const bitacora = reporte.payloadSnapshot.find((b) => b.bloque === "bitacora_seguridad")!
    expect(bitacora.lineas.some((l) => l.etiqueta.includes("Reportes con novedades"))).toBe(true)
    expect(bitacora.lineas.length).toBeGreaterThan(1)

    const morosidad = reporte.payloadSnapshot.find((b) => b.bloque === "morosidad")!
    expect(morosidad.lineas.some((l) => l.etiqueta === "Deuda vencida total")).toBe(true)
    expect(morosidad.lineas.length).toBeGreaterThan(2)

    const insumos = reporte.payloadSnapshot.find((b) => b.bloque === "consumo_insumos")!
    expect(insumos.lineas.some((l) => l.etiqueta === "Solicitudes entregadas (histórico)")).toBe(true)
    expect(insumos.lineas.some((l) => l.valor === "4 ítem(s)")).toBe(true)
  })
})
