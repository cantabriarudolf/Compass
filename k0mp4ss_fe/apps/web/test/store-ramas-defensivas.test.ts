import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, esMiembroDirectivaVigente } from "@/lib/store"
import type { PeriodoDirectiva, Persona } from "@/lib/schemas"
import { resetStore } from "./helpers"

/**
 * Ramas defensivas de `lib/store.ts` — ventana **E2** de SERIE-DEUDA-3 (change
 * `store-ramas-defensivas`).
 *
 * Los dos `: []` de los `flatMap` filtrados (`lib/store.ts:4321`, firmantes del
 * certificado CT, y `lib/store.ts:5127`, miembros del período de directiva
 * inicial) son **inalcanzables con el invariante actual**: el filtro aguas
 * arriba ya exige la ficha de gobernanza (`esMiembroDirectivaVigente` para el
 * CT; `personasPrev.filter((p) => p.datosGobernanza)` para el período inicial).
 * Se conservan como **defensa** ante un cambio futuro de ese filtro.
 *
 * Estos tests recorren el camino real por la API pública y afirman que las
 * listas salen **pobladas**: fijan el invariante aguas arriba que deja las dos
 * ramas como defensa documentada. Por eso la cobertura del store **por API
 * pública** tiene techo en **99.95 %** por diseño.
 */
const getState = () => useCompassStore.getState()
const migrate = useCompassStore.persist.getOptions().migrate

const directivo = (partial: Partial<Persona> = {}): Persona => ({
  id: "p-dir-def-1",
  rut: "12.345.678-5",
  nombreCompleto: "Directiva Defensiva Uno",
  nombres: "Directiva",
  apellidos: "Defensiva Uno",
  email: "directiva.defensiva@test.cl",
  telefonoMovil: "+56 9 1111 2222",
  estadoCuenta: "activa",
  condicionesEspecialesIds: [],
  roles: ["directiva"],
  datosGobernanza: {
    id: "gob-def-1",
    cargoDirectiva: "presidente",
    fechaAsuncion: "2025-03-01",
  },
  ...partial,
})

const periodoVigente = (
  id: string,
  miembro: { id: string; nombreCompleto: string }
): PeriodoDirectiva =>
  ({
    id,
    fechaInicio: "2025-03-01",
    duracionMeses: 24,
    fechaInscripcion: "2025-03-05",
    referenciaInscripcion: "Acta de asamblea TEST E2",
    estado: "vigente",
    miembros: [
      {
        personaId: miembro.id,
        nombre: miembro.nombreCompleto,
        cargo: "presidente",
        fechaAsuncion: "2025-03-01",
      },
    ],
  }) as PeriodoDirectiva

// --- lib/store.ts:4321 — firmantes del certificado CT ---

describe("ramas defensivas · CT: snapshot de firmantes (lib/store.ts:4321)", () => {
  beforeEach(resetStore)

  it("con un directivo de período vigente el snapshot de firmantes sale poblado", () => {
    const persona = directivo()
    useCompassStore.setState((s) => ({
      periodosDirectiva: [
        periodoVigente("pd-def-1", {
          id: persona.id,
          nombreCompleto: persona.nombreCompleto,
        }),
      ],
      personas: [
        ...s.personas,
        {
          ...persona,
          datosGobernanza: { ...persona.datosGobernanza!, periodoId: "pd-def-1" },
        },
      ],
    }))

    const unidadId = getState().unidades.find((u) => !u.id.startsWith("u-E-"))!.id
    const r = getState().generarCertificadoCT({
      tipo: "al_dia",
      unidadId,
      solicitanteNombre: "TEST E2",
    })

    expect(r.ok).toBe(true)
    const cert = getState().certificadosCT.at(-1)!
    expect(cert.directivaRef?.periodoId).toBe("pd-def-1")
    // El `: []` del flatMap no aporta ningún elemento: la lista sale poblada.
    expect(cert.directivaRef?.firmantes).toHaveLength(1)
    expect(cert.directivaRef?.firmantes[0]).toEqual({
      personaId: persona.id,
      nombre: persona.nombreCompleto,
      cargo: "presidente",
    })
  })

  it("el filtro aguas arriba descarta a quien no tiene ficha: ninguna entrada sale vacía", () => {
    const conFicha = directivo()
    const sinFicha = directivo({
      id: "p-dir-def-sin-ficha",
      email: "sin.ficha@test.cl",
      datosGobernanza: undefined,
    })
    const vigenteId = "pd-def-2"

    // El invariante que deja inalcanzable el fallback: sin ficha de gobernanza
    // `esMiembroDirectivaVigente` ya devuelve false, así que la persona ni
    // siquiera llega al flatMap.
    expect(
      esMiembroDirectivaVigente(
        {
          ...conFicha,
          datosGobernanza: {
            ...conFicha.datosGobernanza!,
            periodoId: vigenteId,
          },
        },
        vigenteId
      )
    ).toBe(true)
    expect(esMiembroDirectivaVigente(sinFicha, vigenteId)).toBe(false)

    const candidatas = [conFicha, sinFicha]
      .map((p) =>
        p.id === conFicha.id
          ? {
              ...p,
              datosGobernanza: { ...p.datosGobernanza!, periodoId: vigenteId },
            }
          : p
      )
      .filter((p) => esMiembroDirectivaVigente(p, vigenteId))

    expect(candidatas).toHaveLength(1)
    expect(candidatas.every((p) => p.datosGobernanza)).toBe(true)
  })
})

// --- lib/store.ts:5127 — miembros del período de directiva inicial ---

describe("ramas defensivas · período inicial: miembros (lib/store.ts:5127)", () => {
  beforeEach(resetStore)

  it("migrate v27→v28 arma el período inicial con la nómina poblada", () => {
    const persona = directivo()

    const result = migrate!({ personas: [persona] } as never, 27) as unknown as {
      periodosDirectiva: PeriodoDirectiva[]
      personas: Persona[]
    }

    const inicial = result.periodosDirectiva.find((p) => p.id === "periodo-1")
    expect(inicial).toBeDefined()
    expect(inicial!.estado).toBe("vigente")
    expect(inicial!.fechasEstimadas).toBe(true)
    // El `: []` del flatMap no aporta ningún elemento: la nómina sale poblada.
    expect(inicial!.miembros).toHaveLength(1)
    expect(inicial!.miembros[0]).toEqual({
      personaId: persona.id,
      nombre: persona.nombreCompleto,
      cargo: "presidente",
      fechaAsuncion: "2025-03-01",
    })
    // Invariante aguas arriba: `fichasPrev` filtra por ficha de gobernanza, así
    // que un miembro por ficha y ninguna entrada vacía.
    expect(inicial!.miembros).toHaveLength(
      result.personas.filter((p) => p.datosGobernanza).length
    )
    expect(result.personas.every((p) => p.datosGobernanza?.periodoId === "periodo-1")).toBe(
      true
    )
  })

  it("sin fichas de gobernanza el período inicial queda con nómina vacía, no con la rama", () => {
    const sinFicha = directivo({
      id: "p-sin-gobernanza-e2",
      email: "sin.gobernanza.e2@test.cl",
      datosGobernanza: undefined,
    })

    const result = migrate!({ personas: [sinFicha] } as never, 27) as unknown as {
      periodosDirectiva: PeriodoDirectiva[]
      personas: Persona[]
    }

    // Sin fichas no hay iteraciones en el flatMap: la rama defensiva tampoco
    // aquí se ejecuta (el filtro vacío no produce elementos).
    const inicial = result.periodosDirectiva.find((p) => p.id === "periodo-1")
    expect(inicial?.miembros).toEqual([])
    expect(result.personas[0]!.datosGobernanza).toBeUndefined()
  })
})
