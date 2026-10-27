/**
 * @vitest-environment node
 *
 * F18 — datos sensibles de la ficha laboral sólo con consentimiento expreso.
 *
 * La asesoría normativa del 2026-10-26: los datos previsionales y de salud del
 * trabajador son sensibles y exigen consentimiento expreso. El owner pidió que
 * el consentimiento sea **opcional**: sin él la ficha se guarda igual, pero el
 * servidor **no persiste** esos campos. Revocar es borrar.
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
        // La FK inexistente no debe estallar: si el campo se descarta antes de
        // validar, no hay 400. Es la prueba de que el descarte ocurre primero.
        afpId: "afp-que-no-existe",
        bancoId: "banco-que-no-existe",
        fichaMedica: FICHA_MEDICA,
      }),
      SCOPE
    )

    expect(r.ok, r.ok ? "" : JSON.stringify(r)).toBe(true)
    if (!r.ok) return
    const dl = r.datos.datosLaborales as Record<string, unknown>
    expect(dl.afpId).toBeUndefined()
    expect(dl.bancoId).toBeUndefined()
    expect(dl.fichaMedica).toBeUndefined()
    // Lo no sensible sigue intacto.
    expect(dl.cargo).toBe("Conserje")
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
    expect(dl.numeroCuenta).toBeUndefined()
    expect(dl.consentimientoDatosSensibles).toMatchObject({ otorgado: false })
  })
})
