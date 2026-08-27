/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest"
import { puede, tienePermiso, ROLES } from "./authz"

describe("lib/authz — matriz RP (pure, sin IO)", () => {
  it("expone 5 roles estándar RP", () => {
    expect(ROLES).toEqual(["administrador", "comite", "conserjeria", "residente", "mantencion"])
  })

  it("administrador wildcard — full access", () => {
    for (const accion of ["ver", "crear", "editar", "eliminar", "ejecutar"] as const) {
      for (const recurso of ["FI", "MP", "PE:bitacora", "admin:usuarios", "backup", "IR:interno", "RE:centro_mando"]) {
        expect(puede("administrador", accion, recurso)).toBe(true)
      }
    }
    // alias admin
    expect(puede("admin", "ver", "FI")).toBe(true)
  })

  it("menor privilegio — recurso desconocido o acción inválida se deniega", () => {
    expect(puede("residente", "ver", "recurso_inexistente")).toBe(false)
    expect(puede("administrador", "ver", "")).toBe(false)
    expect(puede("invalido", "ver", "FI")).toBe(false)
    expect(puede("residente", "invalida" as never, "FI")).toBe(false)
  })

  it("comite — puede ver FI/balance y centro de mando, pero no crear FI ni gestionar usuarios", () => {
    expect(puede("comite", "ver", "FI")).toBe(true)
    expect(puede("comite", "ver", "FI:balance")).toBe(true)
    expect(puede("comite", "ejecutar", "FI:gasto_comun")).toBe(true) // aprobar gasto
    expect(puede("comite", "crear", "FI")).toBe(false)
    expect(puede("comite", "editar", "FI")).toBe(false)
    expect(puede("comite", "ver", "MP:morosidad")).toBe(true)
    expect(puede("comite", "ver", "RE:centro_mando")).toBe(true)
    expect(puede("comite", "crear", "RE:centro_mando")).toBe(false) // sin distribución
    expect(puede("comite", "ver", "CT:historial")).toBe(true)
    expect(puede("comite", "ver", "admin:usuarios")).toBe(false)
    expect(puede("comite", "ejecutar", "backup")).toBe(false)
    expect(puede("comite", "crear", "IR:interno")).toBe(false)
  })

  it("conserjeria — bitácora y cierre turno sí, finanzas no, ficha previsional no", () => {
    expect(puede("conserjeria", "ver", "PE:bitacora")).toBe(true)
    expect(puede("conserjeria", "crear", "PE:bitacora")).toBe(true)
    expect(puede("conserjeria", "editar", "PE:bitacora")).toBe(true)
    expect(puede("conserjeria", "ejecutar", "PE:cierre_turno")).toBe(true)
    expect(puede("conserjeria", "ver", "PE:directorio")).toBe(true)
    expect(puede("conserjeria", "ver", "PE:reporte_diario")).toBe(true)
    expect(puede("conserjeria", "ver", "FI")).toBe(false)
    expect(puede("conserjeria", "ver", "FI:balance")).toBe(false)
    expect(puede("conserjeria", "ver", "PE:ficha")).toBe(false)
    expect(puede("conserjeria", "ver", "PL")).toBe(false)
    expect(puede("conserjeria", "ver", "PL:propia")).toBe(true) // propia sí
    expect(puede("conserjeria", "ver", "admin:usuarios")).toBe(false)
  })

  it("residente — puede editar propios y certificados propios y pedir mantenimiento, pero no FI ni interno ni usuarios", () => {
    expect(puede("residente", "editar", "MP:propios")).toBe(true)
    expect(puede("residente", "ver", "CT:propio")).toBe(true)
    expect(puede("residente", "crear", "CT:propio")).toBe(true)
    expect(puede("residente", "ver", "PE:directorio")).toBe(true)
    expect(puede("residente", "crear", "PE:visita")).toBe(true)
    expect(puede("residente", "ver", "IR:mantenimiento")).toBe(true)
    expect(puede("residente", "crear", "IR:mantenimiento")).toBe(true)
    expect(puede("residente", "crear", "IR:interno")).toBe(false)
    expect(puede("residente", "ver", "FI")).toBe(false)
    expect(puede("residente", "ver", "admin:usuarios")).toBe(false)
    expect(puede("residente", "ejecutar", "backup")).toBe(false)
    expect(puede("residente", "ver", "PE:bitacora")).toBe(false) // sin bitácora global
  })

  it("mantencion — puede ver/ejecutar MT y pedir ambos tipos de insumo, pero no admin usuarios ni FI", () => {
    expect(puede("mantencion", "ver", "MT")).toBe(true)
    expect(puede("mantencion", "ejecutar", "MT:tarea")).toBe(true)
    expect(puede("mantencion", "crear", "MT:incidente")).toBe(true)
    expect(puede("mantencion", "ver", "IR:mantenimiento")).toBe(true)
    expect(puede("mantencion", "ver", "IR:interno")).toBe(true)
    expect(puede("mantencion", "crear", "IR:interno")).toBe(true)
    expect(puede("mantencion", "ver", "admin:usuarios")).toBe(false)
    expect(puede("mantencion", "ver", "FI")).toBe(false)
  })

  it("ABAC IR — interno solo personal servicio (conserjeria/mantencion + admin)", () => {
    expect(puede("residente", "crear", "IR:interno")).toBe(false)
    expect(puede("comite", "crear", "IR:interno")).toBe(false)
    expect(puede("conserjeria", "crear", "IR:interno")).toBe(true)
    expect(puede("mantencion", "crear", "IR:interno")).toBe(true)
    expect(puede("administrador", "crear", "IR:interno")).toBe(true)
    // mantenimiento sí para todos
    expect(puede("residente", "crear", "IR:mantenimiento")).toBe(true)
    expect(puede("comite", "crear", "IR:mantenimiento")).toBe(true)
    expect(puede("conserjeria", "crear", "IR:mantenimiento")).toBe(true)
  })

  it("alias de roles normaliza", () => {
    expect(puede("personal", "ver", "PE:bitacora")).toBe(true) // alias conserjeria
    expect(puede("propietario", "ver", "CT:propio")).toBe(true)
    expect(puede("directiva", "ver", "RE:centro_mando")).toBe(true)
  })

  it("tienePermiso unión de roles", () => {
    expect(tienePermiso(["residente", "conserjeria"], "ver", "PE:bitacora")).toBe(true)
    expect(tienePermiso(["residente"], "ver", "PE:bitacora")).toBe(false)
    expect(tienePermiso(["comite", "residente"], "ver", "RE:centro_mando")).toBe(true)
    expect(tienePermiso([], "ver", "FI")).toBe(false)
    // admin + cualquier otro sigue siendo true
    expect(tienePermiso(["residente", "administrador"], "eliminar", "FI")).toBe(true)
  })

  it("recurso case-insensitive y trim", () => {
    expect(puede("administrador", "ver", "  FI  ")).toBe(true)
    expect(puede("residente", "ver", "IR:MANTENIMIENTO")).toBe(true)
    expect(puede("residente", "crear", "ir:interno")).toBe(false)
  })

  it("admin:usuarios y backup solo administrador", () => {
    expect(puede("administrador", "ver", "admin:usuarios")).toBe(true)
    expect(puede("comite", "ver", "admin:usuarios")).toBe(false)
    expect(puede("conserjeria", "ver", "admin:usuarios")).toBe(false)
    expect(puede("residente", "ver", "admin:usuarios")).toBe(false)
    expect(puede("mantencion", "ver", "admin:usuarios")).toBe(false)
    expect(puede("administrador", "ejecutar", "backup")).toBe(true)
    expect(puede("comite", "ejecutar", "backup")).toBe(false)
    expect(puede("conserjeria", "ejecutar", "backup")).toBe(false)
  })
})
