// @vitest-environment node
// F9 (pe-paneles-bd N2): aislamiento del módulo QA/dev. Tabla de casos de la
// función pura que decide el acceso (la resolución de sesión real vive en
// app/admin/_qa-dev-guard.tsx; aquí no se toca Next ni la sesión).
import { describe, expect, it } from "vitest"
import { puedeVerModuloQaDev } from "@/lib/qa-dev-acceso"

describe("puedeVerModuloQaDev (F9 — módulo QA/dev sólo administrador, fuera de producción)", () => {
  it("administrador en desarrollo entra", () => {
    expect(
      puedeVerModuloQaDev({ roles: ["administrador"], esProduccion: false, optInE2E: false })
    ).toBe(true)
  })

  it("administrador en producción sin opt-in no entra", () => {
    expect(
      puedeVerModuloQaDev({ roles: ["administrador"], esProduccion: true, optInE2E: false })
    ).toBe(false)
  })

  it("administrador en producción con opt-in e2e entra", () => {
    expect(
      puedeVerModuloQaDev({ roles: ["administrador"], esProduccion: true, optInE2E: true })
    ).toBe(true)
  })

  it("conserjería / residente / comité / mantención nunca entran (ni en desarrollo ni con opt-in)", () => {
    for (const rol of ["conserjeria", "residente", "comite", "mantencion"]) {
      expect(
        puedeVerModuloQaDev({ roles: [rol], esProduccion: false, optInE2E: false })
      ).toBe(false)
      expect(
        puedeVerModuloQaDev({ roles: [rol], esProduccion: true, optInE2E: true })
      ).toBe(false)
    }
  })

  it("lista de roles vacía o ausente no entra", () => {
    expect(puedeVerModuloQaDev({ roles: [], esProduccion: false, optInE2E: false })).toBe(false)
    expect(puedeVerModuloQaDev({ esProduccion: false, optInE2E: false })).toBe(false)
  })

  it("opt-in e2e no salva a un no-administrador (el candado no sustituye el rol)", () => {
    expect(
      puedeVerModuloQaDev({ roles: ["residente"], esProduccion: false, optInE2E: true })
    ).toBe(false)
  })
})
