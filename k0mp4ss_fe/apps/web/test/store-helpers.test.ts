// Cobertura directa de los dos helpers de gobernanza que sobrevivieron al retiro
// del store legacy (F22a). Antes los ejercitaban los tests de las acciones del
// store (el slice de actas); esas acciones ya no existen y los helpers siguen
// alimentando `app/comunidad/directiva` y `app/comunidad/certificados`, así que
// se prueban por su contrato público: la vigencia del período y la nómina que
// acota el quórum.
import { describe, expect, it } from "vitest"
import { esMiembroDirectivaVigente, periodoDirectivaVigente } from "@/lib/store/helpers"
import type { PeriodoDirectiva, Persona } from "@/lib/schemas"

function persona(parcial: Partial<Persona> = {}): Persona {
  return {
    id: "per-1",
    rut: "12.345.678-5",
    nombreCompleto: "Ana Pérez",
    nombres: "Ana",
    apellidos: "Pérez",
    email: "ana@compass.local",
    telefonoMovil: "+56912345678",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["directiva"],
    ...parcial,
  }
}

function ficha(parcial: { periodoId?: string; fechaTermino?: string } = {}) {
  return {
    id: "gob-1",
    cargoDirectiva: "presidente" as const,
    fechaAsuncion: "2026-01-15",
    ...parcial,
  }
}

function periodo(id: string, estado: PeriodoDirectiva["estado"]): PeriodoDirectiva {
  return {
    id,
    fechaInicio: "2026-01-15",
    duracionMeses: 24,
    fechaInscripcion: "2026-01-20",
    referenciaInscripcion: "Acta de asamblea ordinaria 2026",
    estado,
    miembros: [],
  }
}

describe("periodoDirectivaVigente", () => {
  it("devuelve el período marcado como vigente", () => {
    const vigente = periodo("per-vigente", "vigente")
    const cerrado = periodo("per-cerrado", "cerrado")

    expect(periodoDirectivaVigente({ periodosDirectiva: [cerrado, vigente] })).toBe(vigente)
  })

  it("no devuelve nada cuando todos los períodos están cerrados", () => {
    expect(
      periodoDirectivaVigente({ periodosDirectiva: [periodo("per-cerrado", "cerrado")] })
    ).toBeUndefined()
  })

  it("no devuelve nada sin períodos registrados", () => {
    expect(periodoDirectivaVigente({ periodosDirectiva: [] })).toBeUndefined()
  })
})

describe("esMiembroDirectivaVigente", () => {
  it("cuenta a la ficha del período vigente", () => {
    expect(esMiembroDirectivaVigente(persona({ datosGobernanza: ficha({ periodoId: "per-vigente" }) }), "per-vigente")).toBe(true)
  })

  it("no cuenta a la ficha de un período anterior", () => {
    expect(esMiembroDirectivaVigente(persona({ datosGobernanza: ficha({ periodoId: "per-anterior" }) }), "per-vigente")).toBe(false)
  })

  it("cuenta la ficha legada (sin período) solo mientras no haya período registrado", () => {
    const legada = persona({ datosGobernanza: ficha() })

    expect(esMiembroDirectivaVigente(legada, undefined)).toBe(true)
    expect(esMiembroDirectivaVigente(legada, "per-vigente")).toBe(false)
  })

  it("no cuenta a una persona sin ficha de gobernanza", () => {
    expect(esMiembroDirectivaVigente(persona(), "per-vigente")).toBe(false)
  })

  it("no cuenta a una cuenta que no está activa", () => {
    const inactiva = persona({
      estadoCuenta: "inactiva",
      datosGobernanza: ficha({ periodoId: "per-vigente" }),
    })

    expect(esMiembroDirectivaVigente(inactiva, "per-vigente")).toBe(false)
  })

  it("no cuenta a una ficha ya terminada aunque su período siga vigente", () => {
    const cesada = persona({
      datosGobernanza: ficha({ periodoId: "per-vigente", fechaTermino: "2026-06-30" }),
    })

    expect(esMiembroDirectivaVigente(cesada, "per-vigente")).toBe(false)
  })
})
