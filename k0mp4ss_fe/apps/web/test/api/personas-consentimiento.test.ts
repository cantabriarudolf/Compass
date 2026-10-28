/**
 * @vitest-environment node
 *
 * F18 — la FICHA MÉDICA de la ficha laboral sólo con consentimiento expreso.
 *
 * La asesoría normativa del 2026-10-26 marca como sensibles los datos
 * previsionales y de salud. Decisión del owner (2026-10-27): el consentimiento
 * cubre **sólo la ficha médica** (medicamentos, alergias, condiciones). Todo lo
 * demás —previsión de salud incluida, sin la cual no se generan liquidaciones—
 * se guarda siempre. El consentimiento es **opcional**: sin él la ficha se
 * guarda igual y sólo se descarta la ficha médica. Revocar es borrar.
 *
 * Se prueba `validarYLimpiarPersona`, que es el único camino de escritura de
 * personas (lo usan el POST de la colección y el PUT del detalle), así que fijar
 * acá la regla la fija en los dos.
 */
import { describe, expect, it } from "vitest"
import { validarYLimpiarPersona } from "@/app/api/personas/route"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"

const COMUNIDAD = "f18-comunidad"

// SAFETY: la función sólo lee `comunidadId` del scope; el resto de los campos
// del scope real (usuario y rol) no participan de esta regla.
const SCOPE = { comunidadId: COMUNIDAD, usuarioId: "f18-user", rol: "administrador" } as unknown as ComunidadScope

/** Persona mínima válida, con la ficha laboral que arma cada caso. */
function personaCon(datosLaborales: Record<string, unknown>, id = "f18-p-1") {
  return {
    id,
    rut: "15.123.456-9",
    nombreCompleto: "María Rojas Soto",
    nombres: "María",
    apellidos: "Rojas Soto",
    email: "maria.f18@test.cl",
    telefonoMovil: "+56911111111",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["residente"],
    datosLaborales: {
      id: "f18-dl-1",
      cargo: "Conserje",
      afp: "Habitat",
      prevision: "Fonasa",
      fechaIngreso: "2024-03-01",
      ...datosLaborales,
    },
  }
}

const FICHA_MEDICA = { medicamentos: "Losartán", alergias: "Penicilina", condiciones: "Hipertensión" }

describe("F18 — datos sensibles sin consentimiento", () => {
  it("sin consentimiento la ficha se guarda igual y los datos sensibles no se persisten", async () => {
    const r = await validarYLimpiarPersona(
      personaCon({
        numeroCuenta: "12345678",
        apv: true,
        cargas: "2",
        fichaMedica: FICHA_MEDICA,
      }),
      SCOPE
    )

    expect(r.ok, r.ok ? "" : JSON.stringify(r)).toBe(true)
    if (!r.ok) return
    const dl = r.datos.datosLaborales as Record<string, unknown>
    // Sólo se descarta la ficha médica (decisión del owner 2026-10-27).
    expect(dl.fichaMedica).toBeUndefined()
    // Lo previsional/bancario/familiar es imprescindible para liquidar: se guarda.
    expect(dl.numeroCuenta).toBe("12345678")
    expect(dl.apv).toBe(true)
    expect(dl.cargas).toBe("2")
    expect(dl.cargo).toBe("Conserje")
  })

  it("sin consentimiento la previsión de salud ya NO se descarta: su FK se valida", async () => {
    // Prueba de contrato: si el campo se descartara (como antes), la FK
    // inexistente pasaría sin ruido y el guardado daría ok. Ahora se valida.
    const r = await validarYLimpiarPersona(
      personaCon({ saludId: "salud-que-no-existe", fichaMedica: FICHA_MEDICA }),
      SCOPE
    )
    expect(r.ok).toBe(false)
  })

  it("con consentimiento otorgado los datos sensibles se conservan", async () => {
    const r = await validarYLimpiarPersona(
      personaCon({
        consentimientoDatosSensibles: {
          otorgado: true,
          fecha: "2026-10-26",
          version: "1.0",
        },
        fichaMedica: FICHA_MEDICA,
      }),
      SCOPE
    )

    expect(r.ok, r.ok ? "" : JSON.stringify(r)).toBe(true)
    if (!r.ok) return
    const dl = r.datos.datosLaborales as Record<string, unknown>
    expect(dl.fichaMedica).toEqual(FICHA_MEDICA)
    expect(dl.consentimientoDatosSensibles).toMatchObject({ otorgado: true, version: "1.0" })
  })

  it("revocar (otorgado: false) borra los datos sensibles al guardar", async () => {
    const r = await validarYLimpiarPersona(
      personaCon({
        consentimientoDatosSensibles: {
          otorgado: false,
          fecha: "2026-10-27",
          version: "1.0",
        },
        fichaMedica: FICHA_MEDICA,
        numeroCuenta: "12345678",
      }),
      SCOPE
    )

    expect(r.ok, r.ok ? "" : JSON.stringify(r)).toBe(true)
    if (!r.ok) return
    const dl = r.datos.datosLaborales as Record<string, unknown>
    expect(dl.fichaMedica).toBeUndefined()
    // Revocar borra lo de salud, no los datos de liquidación.
    expect(dl.numeroCuenta).toBe("12345678")
    expect(dl.consentimientoDatosSensibles).toMatchObject({ otorgado: false })
  })
})
