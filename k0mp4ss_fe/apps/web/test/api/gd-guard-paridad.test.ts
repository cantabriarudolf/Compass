/**
 * gd-guard — paridad con el motor RBAC (H5).
 *
 * Tras mover `gd` y `ad` a la MATRIZ de lib/authz.ts, las funciones del guard
 * son lectores de `puede()`. Este test fija el contrato: para cada rol
 * estándar/alias y cada acción, `puedeGestionarActas`/`puedeGestionarControles`
 * devuelven EXACTAMENTE lo que el motor dice. Puro, sin IO.
 */
import { describe, it, expect } from "vitest"
import { puede, ROLES, normalizaRol } from "@/lib/authz"
import type { Accion } from "@/lib/authz"
import { puedeGestionarActas, puedeGestionarControles } from "@/lib/api/gd-guard"

const ACCIONES = ["ver", "crear", "editar", "eliminar", "ejecutar"] as const satisfies readonly Accion[]
const ROL_ALIAS: Record<string, string[]> = {
  administrador: ["administrador", "admin"],
  comite: ["comite", "comité", "directiva"],
  conserjeria: ["conserjeria", "conserjería", "seguridad", "personal"],
  residente: ["residente", "propietario"],
  mantencion: ["mantencion", "mantención"],
}

describe("gd-guard — paridad exacta con puede() (H5)", () => {
  it("puedeGestionarActas == puede(rol, accion, 'gd') para 5 roles y 5 acciones", () => {
    for (const [rol, alias] of Object.entries(ROL_ALIAS)) {
      expect(normalizaRol(rol)).toBeDefined()
      for (const a of alias) {
        for (const accion of ACCIONES) {
          expect(puedeGestionarActas(a, accion)).toBe(puede(rol, accion, "gd"))
        }
      }
    }
  })

  it("puedeGestionarControles == puede(rol, accion, 'ad') para 5 roles y 5 acciones", () => {
    for (const [rol, alias] of Object.entries(ROL_ALIAS)) {
      for (const a of alias) {
        for (const accion of ACCIONES) {
          expect(puedeGestionarControles(a, accion)).toBe(puede(rol, accion, "ad"))
        }
      }
    }
  })

  it("comportamiento decidido: comité gestiona, residente solo ve, resto denegado", () => {
    for (const accion of ACCIONES) {
      expect(puedeGestionarActas("comite", accion)).toBe(true)
      expect(puedeGestionarControles("comite", accion)).toBe(true)
      expect(puedeGestionarActas("residente", accion)).toBe(accion === "ver")
      expect(puedeGestionarControles("residente", accion)).toBe(accion === "ver")
      expect(puedeGestionarActas("conserjeria", accion)).toBe(false)
      expect(puedeGestionarControles("conserjeria", accion)).toBe(false)
      expect(puedeGestionarActas("mantencion", accion)).toBe(false)
      expect(puedeGestionarControles("mantencion", accion)).toBe(false)
      expect(puedeGestionarActas("administrador", accion)).toBe(true)
      expect(puedeGestionarControles("administrador", accion)).toBe(true)
    }
  })

  it("ROL_ALIAS cubre exactamente los 5 roles estándar", () => {
    expect(Object.keys(ROL_ALIAS).sort()).toEqual([...ROLES].sort())
  })
})
