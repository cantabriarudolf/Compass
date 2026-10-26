// @vitest-environment node
/**
 * F16 — acuse de la política de privacidad versionada.
 *
 * Helpers puros sobre un storage inyectado (sin navegador): el acuse registra
 * `{ version, fecha }` y sólo es vigente si la versión registrada coincide con
 * la vigente. Un cambio de política (bump de versión) debe obligar a un nuevo
 * acuse: ese es el caso límite que motiva la versión vieja acá.
 */
import { describe, expect, it } from "vitest"
import {
  CLAVE_ACUSE_PRIVACIDAD,
  VERSION_POLITICA_PRIVACIDAD,
  type AcusePrivacidad,
  type Almacenamiento,
  acuseVigente,
  leerAcuse,
  registrarAcuse,
  retirarAcuse,
} from "@/lib/politica-privacidad"

/** Storage falso en memoria: mismo contrato que `window.localStorage`. */
function storageFalso(): Almacenamiento & { dump(): Map<string, string> } {
  const datos = new Map<string, string>()
  return {
    getItem: (clave) => (datos.has(clave) ? (datos.get(clave) as string) : null),
    setItem: (clave, valor) => void datos.set(clave, valor),
    removeItem: (clave) => void datos.delete(clave),
    dump: () => datos,
  }
}

const FECHA = "2026-10-25T12:00:00.000Z"

describe("acuse de política de privacidad", () => {
  it("un acuse ausente no está vigente", () => {
    const storage = storageFalso()
    expect(leerAcuse(storage)).toBeNull()
    expect(acuseVigente(leerAcuse(storage))).toBe(false)
  })

  it("un acuse con la versión vigente sí lo está", () => {
    const storage = storageFalso()
    registrarAcuse(storage, { version: VERSION_POLITICA_PRIVACIDAD, fecha: FECHA })
    expect(acuseVigente(leerAcuse(storage))).toBe(true)
  })

  it("un acuse con versión vieja NO está vigente: fuerza a re-aceptar tras un cambio de política", () => {
    const storage = storageFalso()
    registrarAcuse(storage, { version: "0.9", fecha: FECHA })
    expect(leerAcuse(storage)).toEqual({ version: "0.9", fecha: FECHA })
    expect(acuseVigente(leerAcuse(storage))).toBe(false)
  })

  it("retirarAcuse borra el registro", () => {
    const storage = storageFalso()
    registrarAcuse(storage, { version: VERSION_POLITICA_PRIVACIDAD, fecha: FECHA })
    retirarAcuse(storage)
    expect(storage.getItem(CLAVE_ACUSE_PRIVACIDAD)).toBeNull()
    expect(leerAcuse(storage)).toBeNull()
    expect(acuseVigente(leerAcuse(storage))).toBe(false)
  })

  it("la fecha del acuse se guarda tal cual", () => {
    const storage = storageFalso()
    const acuse: AcusePrivacidad = { version: VERSION_POLITICA_PRIVACIDAD, fecha: FECHA }
    expect(registrarAcuse(storage, acuse)).toEqual(acuse)
    expect(leerAcuse(storage)?.fecha).toBe(FECHA)
  })

  it("un valor legacy (booleano del banner anterior) no es un acuse válido", () => {
    const storage = storageFalso()
    storage.setItem(CLAVE_ACUSE_PRIVACIDAD, "aceptado")
    expect(leerAcuse(storage)).toBeNull()
    expect(acuseVigente(leerAcuse(storage))).toBe(false)
  })

  it("un JSON corrupto o sin versión no es un acuse válido", () => {
    const storage = storageFalso()
    storage.setItem(CLAVE_ACUSE_PRIVACIDAD, "{no-es-json")
    expect(leerAcuse(storage)).toBeNull()
    storage.setItem(CLAVE_ACUSE_PRIVACIDAD, JSON.stringify({ fecha: FECHA }))
    expect(leerAcuse(storage)).toBeNull()
  })
})
