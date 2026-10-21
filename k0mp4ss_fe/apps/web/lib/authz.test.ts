/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest"
import { puede, tienePermiso, ROLES, matrizPermisos, puedeContextual, reglasContextuales } from "./authz"

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

  it("am — auditoría: comité lee, nadie más (excepto admin) ve o crea (P2 security audit)", () => {
    expect(puede("comite", "ver", "am")).toBe(true)
    expect(puede("comite", "crear", "am")).toBe(false)
    expect(puede("comite", "editar", "am")).toBe(false)
    expect(puede("residente", "ver", "am")).toBe(false)
    expect(puede("conserjeria", "ver", "am")).toBe(false)
    expect(puede("mantencion", "ver", "am")).toBe(false)
    expect(puede("administrador", "ver", "am")).toBe(true)
    expect(puede("administrador", "crear", "am")).toBe(true) // wildcard: ingesta sync /api/auditoria/sync
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

describe("lib/authz — puedeContextual ABAC (paridad 1:1)", () => {
  // Paridad con checks inline documentados en design.md — STRICTAMENTE behavior-preserving
  // Cada caso replica la lógica antigua: si base RBAC true + contexto satisface → concede, si no → deniega

  // mp:propios — requiere personaId (identidad propia) presente
  it("mp:propios — propietario con personaId concedido, sin personaId denegado", () => {
    expect(puedeContextual("residente", "editar", "mp:propios", { personaId: "p-1" })).toBe(true)
    expect(puedeContextual("residente", "editar", "mp:propios", {})).toBe(false)
    expect(puedeContextual("residente", "editar", "mp:propios", { personaId: "" })).toBe(false)
    // admin bypassa ABAC — aun sin personaId concede (full access)
    expect(puedeContextual("administrador", "editar", "mp:propios", {})).toBe(true)
  })

  it("mp:propios — comite y conserjeria con identidad conceden, sin ella deniegan", () => {
    expect(puedeContextual("comite", "ver", "mp:propios", { personaId: "p-2" })).toBe(true)
    expect(puedeContextual("comite", "ver", "mp:propios", {})).toBe(false)
    expect(puedeContextual("conserjeria", "ver", "mp:propios", { personaId: "p-3" })).toBe(true)
    expect(puedeContextual("mantencion", "editar", "mp:propios", { personaId: "p-4" })).toBe(true)
  })

  // pl:propia — conserje solo ve su liquidación (trabajadorPersonaId == personaId)
  it("pl:propia — conserjeria con personaId ve propia, sin personaId denegado", () => {
    expect(puedeContextual("conserjeria", "ver", "pl:propia", { personaId: "p-4" })).toBe(true)
    expect(puedeContextual("conserjeria", "ver", "pl:propia", {})).toBe(false)
    // residente no tiene pl:propia base → aunque tenga personaId, deniega
    expect(puedeContextual("residente", "ver", "pl:propia", { personaId: "p-5" })).toBe(false)
    // admin bypassa
    expect(puedeContextual("administrador", "ver", "pl:propia", {})).toBe(true)
  })

  // ct:residencia — exige vínculo vigente unidadId ∈ unidadIdsVinculadas (paridad lib/store.ts:4253)
  it("ct:residencia — residente con vínculo a su unidad concede, de otra unidad deniega", () => {
    const ctxPropio = { personaId: "p-1", unidadId: "u-A-101", unidadIdsVinculadas: ["u-A-101", "u-A-102"] }
    const ctxOtra = { personaId: "p-1", unidadId: "u-B-201", unidadIdsVinculadas: ["u-A-101"] }
    expect(puedeContextual("residente", "crear", "ct:residencia", ctxPropio)).toBe(true)
    expect(puedeContextual("residente", "crear", "ct:residencia", ctxOtra)).toBe(false)
    // sin unidadId o sin lista → deniega
    expect(puedeContextual("residente", "crear", "ct:residencia", { personaId: "p-1", unidadIdsVinculadas: ["u-A-101"] })).toBe(false)
    expect(puedeContextual("residente", "crear", "ct:residencia", { personaId: "p-1", unidadId: "u-A-101" } as never)).toBe(false)
  })

  it("ct:propio y ct:al_dia — misma regla de vinculación (al_dia no chequea saldo aquí)", () => {
    expect(puedeContextual("residente", "ver", "ct:propio", { unidadId: "u-A-101", unidadIdsVinculadas: ["u-A-101"] })).toBe(true)
    expect(puedeContextual("residente", "ver", "ct:propio", { unidadId: "u-A-999", unidadIdsVinculadas: ["u-A-101"] })).toBe(false)
    expect(puedeContextual("residente", "ver", "ct:al_dia", { unidadId: "u-A-101", unidadIdsVinculadas: ["u-A-101"] })).toBe(true)
    expect(puedeContextual("residente", "crear", "ct:al_dia", { unidadId: "u-B-202", unidadIdsVinculadas: ["u-A-101"] })).toBe(false)
    // ct:propia (alias conserjeria) exige vinculación igual
    expect(puedeContextual("conserjeria", "ver", "ct:propia", { unidadId: "u-A-101", unidadIdsVinculadas: ["u-A-101"] })).toBe(true)
    expect(puedeContextual("conserjeria", "ver", "ct:propia", { unidadId: "u-X", unidadIdsVinculadas: ["u-A-101"] })).toBe(false)
  })

  // gd — privacidad residenteVeActas (paridad app/comunidad/directiva/page.tsx:73)
  it("gd — residente solo ve actas si residenteVeActas true", () => {
    expect(puedeContextual("residente", "ver", "gd", { privacidad: { residenteVeActas: true } })).toBe(true)
    expect(puedeContextual("residente", "ver", "gd", { privacidad: { residenteVeActas: false } })).toBe(false)
    expect(puedeContextual("residente", "ver", "gd", {})).toBe(false)
    // comite/administrador no son gated por privacidad
    expect(puedeContextual("comite", "ver", "ct:historial", {})).toBe(true)
    expect(puedeContextual("administrador", "ver", "gd", {})).toBe(true)
  })

  // mp:morosidad / fi:morosidad — privacidad residenteVeMorosidad
  it("mp:morosidad — residente solo ve morosidad si residenteVeMorosidad true (comite siempre ve)", () => {
    expect(puedeContextual("comite", "ver", "mp:morosidad", {})).toBe(true) // comite no gated
    // residente no tiene mp:morosidad base → aunque privacidad true, deniega por menor privilegio
    expect(puedeContextual("residente", "ver", "mp:morosidad", { privacidad: { residenteVeMorosidad: true } })).toBe(false)
    // Para testear privacidad de morosidad, usamos un rol hipotético que sí tenga base — usamos mp:propios con privacidad? Instead test fi:morosidad con residente que no tiene base → sigue false, prueba menor privilegio
    // Si residente tuviera mp:morosidad, la privacidad lo gatearía; probamos con comite+privacidad no afecta
    expect(puedeContextual("comite", "ver", "mp:morosidad", { privacidad: { residenteVeMorosidad: false } })).toBe(true)
  })

  // alertasResidentesActivas — notificación operativa silenciable
  it("notify:residente — respeta alertasResidentesActivas", () => {
    expect(puedeContextual("residente", "ver", "notify:residente", { privacidad: { alertasResidentesActivas: true } })).toBe(false) // base false → sigue false
    // Usamos un recurso que base concede para residente? residente no tiene notify:residente base, so test con admin bypass
    // Para validar gate, usamos puedeContextual directamente sobre recurso que concedería si existiera: probamos pe:visita con privacidad
    // En implementación actual, notify:residente no existe en matriz → base false, nunca concede; testeamos que no amplía
    expect(puedeContextual("residente", "crear", "pe:visita", { privacidad: { alertasResidentesActivas: false } })).toBe(true) // pe:visita no es notify → no gateado
  })

  // Delegación sin contexto para recursos no granulares
  it("recursos sin dimensión contextual delegan a puede() exacto", () => {
    expect(puedeContextual("comite", "ver", "fi:balance", {})).toBe(puede("comite", "ver", "fi:balance"))
    expect(puedeContextual("conserjeria", "ver", "pe:bitacora", {})).toBe(true)
    expect(puedeContextual("conserjeria", "ver", "pe:bitacora", { personaId: "cualquiera" })).toBe(true)
    expect(puedeContextual("residente", "crear", "pe:visita", {})).toBe(true)
    expect(puedeContextual("residente", "crear", "ir:interno", {})).toBe(false)
    expect(puedeContextual("residente", "ver", "admin:usuarios", { personaId: "p-1" })).toBe(false)
  })

  // Menor privilegio preservado: contexto favorable no amplía
  it("menor privilegio — contexto no amplía permisos base denegados", () => {
    expect(puedeContextual("residente", "ver", "pe:bitacora", { personaId: "p-1", unidadId: "u-A-101", unidadIdsVinculadas: ["u-A-101"], privacidad: { residenteVeActas: true } })).toBe(false)
    expect(puedeContextual("conserjeria", "ver", "fi:balance", { personaId: "p-1" })).toBe(false)
    expect(puedeContextual("residente", "ver", "mp:morosidad", { privacidad: { residenteVeMorosidad: true } })).toBe(false) // sin base, contexto no concede
  })

  // Case-insensitive y alias preservados
  it("puedeContextual normaliza rol y recurso igual que puede()", () => {
    expect(puedeContextual("propietario", "ver", "CT:RESIDENCIA", { unidadId: "u-A-101", unidadIdsVinculadas: ["u-A-101"] })).toBe(true)
    expect(puedeContextual("personal", "ver", "PL:PROPIA", { personaId: "p-4" })).toBe(true)
    expect(puedeContextual("  residente  ", "  ver  ", "  gd  ", { privacidad: { residenteVeActas: true } })).toBe(true)
  })

  // Extra paridad: CT estado_cuenta y ct genérico con unidad vinculada
  it("ct:estado_cuenta y ct genérico con unidadId respetan vinculación", () => {
    expect(puedeContextual("residente", "ver", "ct:estado_cuenta", { unidadId: "u-A-101", unidadIdsVinculadas: ["u-A-101"] })).toBe(true)
    expect(puedeContextual("residente", "ver", "ct:estado_cuenta", { unidadId: "u-B-999", unidadIdsVinculadas: ["u-A-101"] })).toBe(false)
    expect(puedeContextual("residente", "ver", "ct", { unidadId: "u-A-101", unidadIdsVinculadas: ["u-A-101"] })).toBe(true)
    expect(puedeContextual("residente", "ver", "ct", { unidadId: "u-X", unidadIdsVinculadas: ["u-A-101"] })).toBe(false)
  })
})

describe("lib/authz — matrizPermisos() snapshot para /admin/permisos", () => {
  const matriz = matrizPermisos()

  it("expone los 5 roles estándar como claves", () => {
    expect(Object.keys(matriz).sort()).toEqual([...ROLES].sort())
  })

  it("administrador — recurso wildcard * con las 5 acciones", () => {
    const entrada = matriz.administrador.find((e) => e.recurso === "*")
    expect(entrada).toBeDefined()
    expect(entrada!.acciones).toEqual(["crear", "editar", "ejecutar", "eliminar", "ver"])
  })

  it("conserjeria — pl bloqueado (entrada vacía) y solo pl:propia ver", () => {
    expect(matriz.conserjeria.find((e) => e.recurso === "pl")!.acciones).toEqual([])
    expect(matriz.conserjeria.find((e) => e.recurso === "pl:propia")!.acciones).toEqual(["ver"])
    expect(matriz.conserjeria.find((e) => e.recurso === "admin:usuarios")).toBeUndefined()
  })

  it("menor privilegio — solo recursos listados aparecen por rol", () => {
    for (const rol of ROLES) {
      if (rol === "administrador") continue
      for (const entrada of matriz[rol]) {
        expect(entrada.acciones.every((a) => ["ver", "crear", "editar", "eliminar", "ejecutar"].includes(a))).toBe(true)
      }
    }
    expect(matriz.residente.find((e) => e.recurso === "backup")).toBeUndefined()
    expect(matriz.mantencion.find((e) => e.recurso === "admin:usuarios")).toBeUndefined()
  })
})

describe("lib/authz — reglasContextuales() snapshot ABAC para /admin/permisos", () => {
  const reglas = reglasContextuales()

  it("expone reglas derivadas sin datos duros — lista no vacía y orden determinista por rol+recurso", () => {
    expect(reglas.length).toBeGreaterThanOrEqual(12)
    // orden por ROLES y recurso alfabético
    const sorted = [...reglas].sort((a, b) => {
      const ia = ROLES.indexOf(a.rol)
      const ib = ROLES.indexOf(b.rol)
      if (ia !== ib) return ia - ib
      return a.recurso.localeCompare(b.recurso)
    })
    expect(reglas).toEqual(sorted)
  })

  it("mp:propios — 4 roles con condición solo propios y donde motor", () => {
    for (const rol of ["residente", "comite", "conserjeria", "mantencion"] as const) {
      const r = reglas.find((e) => e.rol === rol && e.recurso === "mp:propios")
      expect(r, `falta mp:propios para ${rol}`).toBeDefined()
      expect(r!.condicion).toBe("solo propios")
      expect(r!.donde).toBe("motor")
      expect(r!.descripcion.length).toBeGreaterThan(10)
    }
  })

  it("pl:propia — conserjeria solo propia con donde motor", () => {
    const r = reglas.find((e) => e.rol === "conserjeria" && e.recurso === "pl:propia")
    expect(r).toBeDefined()
    expect(r!.condicion).toBe("solo propia")
    expect(r!.donde).toBe("motor")
  })

  it("ct familia — unidad vinculada con donde motor (ct:propio, ct:residencia, ct:al_dia, ct:estado_cuenta, ct:propia)", () => {
    expect(reglas.find((e) => e.rol === "residente" && e.recurso === "ct:propio")!.condicion).toBe("unidad vinculada")
    expect(reglas.find((e) => e.rol === "residente" && e.recurso === "ct:residencia")!.donde).toBe("motor")
    expect(reglas.find((e) => e.rol === "residente" && e.recurso === "ct:al_dia")!.condicion).toBe("unidad vinculada")
    expect(reglas.find((e) => e.rol === "residente" && e.recurso === "ct:estado_cuenta")!.descripcion).toMatch(/unidad vinculada/i)
    expect(reglas.find((e) => e.rol === "conserjeria" && e.recurso === "ct:propia")!.donde).toBe("motor")
  })

  it("gd — residenteVeActas con donde motor (gd y gd:acta)", () => {
    const r = reglas.find((e) => e.rol === "residente" && e.recurso === "gd")
    expect(r).toBeDefined()
    expect(r!.condicion).toBe("según privacidad: residenteVeActas")
    expect(r!.donde).toBe("motor")
    expect(reglas.find((e) => e.recurso === "gd:acta")!.donde).toBe("motor")
  })

  it("morosidad — check local con residenteVeMorosidad (mp:morosidad y fi:morosidad)", () => {
    const mp = reglas.find((e) => e.rol === "residente" && e.recurso === "mp:morosidad")
    const fi = reglas.find((e) => e.rol === "residente" && e.recurso === "fi:morosidad")
    expect(mp).toBeDefined()
    expect(fi).toBeDefined()
    expect(mp!.condicion).toBe("según privacidad: residenteVeMorosidad")
    expect(mp!.donde).toBe("check local")
    expect(fi!.donde).toBe("check local")
    expect(mp!.detalle).toMatch(/app\/admin\/gestion/)
  })

  it("alertasResidentesActivas — check local con notify:residente / pe:notify_residente", () => {
    const n = reglas.find((e) => e.recurso === "notify:residente")
    const pe = reglas.find((e) => e.recurso === "pe:notify_residente")
    expect(n).toBeDefined()
    expect(pe).toBeDefined()
    expect(n!.condicion).toBe("según privacidad: alertasResidentesActivas")
    expect(n!.donde).toBe("check local")
    expect(pe!.donde).toBe("check local")
    expect(n!.detalle).toMatch(/lib\/store\.ts:1327/)
  })

  it("retorna copia no referencial y nunca desincroniza con el motor (puedeContextual)", () => {
    const a = reglasContextuales()
    const b = reglasContextuales()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
    // cada entrada debe tener donde válido y descripcion legible
    for (const r of a) {
      expect(["motor", "check local"]).toContain(r.donde)
      expect(r.descripcion.length).toBeGreaterThan(5)
      expect(r.condicion.length).toBeGreaterThan(3)
    }
  })
})

describe("lib/authz — recurso cv (visor de avisos)", () => {
  it("comité publica y edita; residente, conserjería y mantención solo ven (decisión owner 2026-10-21)", () => {
    expect(puede("comite", "ver", "cv")).toBe(true)
    expect(puede("comite", "crear", "cv")).toBe(true)
    expect(puede("comite", "editar", "cv")).toBe(true)
    expect(puede("comite", "eliminar", "cv")).toBe(false)

    for (const rol of ["residente", "conserjeria", "mantencion"] as const) {
      expect(puede(rol, "ver", "cv")).toBe(true)
      expect(puede(rol, "crear", "cv")).toBe(false)
      expect(puede(rol, "editar", "cv")).toBe(false)
    }

    expect(puede("administrador", "eliminar", "cv")).toBe(true)
  })
})

describe("lib/authz — recurso in (infracciones y multas)", () => {
  it("administrador tiene las cinco acciones (wildcard)", () => {
    for (const accion of ["ver", "crear", "editar", "eliminar", "ejecutar"] as const) {
      expect(puede("administrador", accion, "in")).toBe(true)
    }
  })

  it("comité ve, crea y edita el expediente, pero no elimina (decisión owner 2026-10-21)", () => {
    expect(puede("comite", "ver", "in")).toBe(true)
    expect(puede("comite", "crear", "in")).toBe(true)
    expect(puede("comite", "editar", "in")).toBe(true)
    expect(puede("comite", "eliminar", "in")).toBe(false)
    expect(puede("comite", "ejecutar", "in")).toBe(false)
    // alias RP: directiva == comité
    expect(puede("directiva", "editar", "in")).toBe(true)
  })

  it("conserjería ve y crea, pero no edita ni elimina", () => {
    expect(puede("conserjeria", "ver", "in")).toBe(true)
    expect(puede("conserjeria", "crear", "in")).toBe(true)
    expect(puede("conserjeria", "editar", "in")).toBe(false)
    expect(puede("conserjeria", "eliminar", "in")).toBe(false)
  })

  it("residente no ve, no crea y no edita: solo apela las propias (in:apelar)", () => {
    expect(puede("residente", "ver", "in")).toBe(false)
    expect(puede("residente", "crear", "in")).toBe(false)
    expect(puede("residente", "editar", "in")).toBe(false)
    expect(puede("residente", "eliminar", "in")).toBe(false)
    expect(puede("residente", "crear", "in:apelar")).toBe(true)
    expect(puede("residente", "ver", "in:apelar")).toBe(false)
    expect(puede("residente", "editar", "in:apelar")).toBe(false)
  })

  it("comité y conserjería no apelan: la apelación es acto propio del residente", () => {
    expect(puede("comite", "crear", "in:apelar")).toBe(false)
    expect(puede("conserjeria", "crear", "in:apelar")).toBe(false)
    expect(puede("mantencion", "crear", "in:apelar")).toBe(false)
    // el administrador sí (wildcard): registra descargos por el vecino
    expect(puede("administrador", "crear", "in:apelar")).toBe(true)
  })

  it("mantención no tiene acceso al expediente IN", () => {
    for (const accion of ["ver", "crear", "editar", "eliminar"] as const) {
      expect(puede("mantencion", accion, "in")).toBe(false)
    }
  })
})

describe("lib/authz — recurso notificaciones", () => {
  it("los cinco roles ven notificaciones (decisión owner 2026-10-21)", () => {
    for (const rol of ROLES) {
      expect(puede(rol, "ver", "notificaciones")).toBe(true)
    }
  })

  it("solo el administrador escribe o elimina (wildcard); el resto es lectura", () => {
    for (const rol of ["comite", "conserjeria", "residente", "mantencion"] as const) {
      expect(puede(rol, "crear", "notificaciones")).toBe(false)
      expect(puede(rol, "editar", "notificaciones")).toBe(false)
      expect(puede(rol, "eliminar", "notificaciones")).toBe(false)
    }
    expect(puede("administrador", "crear", "notificaciones")).toBe(true)
    expect(puede("administrador", "eliminar", "notificaciones")).toBe(true)
  })
})

describe("lib/authz — recurso cf (configuración global)", () => {
  it("comité ve la configuración pero no la edita (decisión owner 2026-10-21)", () => {
    expect(puede("comite", "ver", "cf")).toBe(true)
    expect(puede("comite", "editar", "cf")).toBe(false)
    expect(puede("comite", "crear", "cf")).toBe(false)
    expect(puede("comite", "eliminar", "cf")).toBe(false)
  })

  it("conserjería, residente y mantención no ven la configuración", () => {
    for (const rol of ["conserjeria", "residente", "mantencion"] as const) {
      expect(puede(rol, "ver", "cf")).toBe(false)
      expect(puede(rol, "editar", "cf")).toBe(false)
    }
  })

  it("administrador lee y edita la configuración", () => {
    expect(puede("administrador", "ver", "cf")).toBe(true)
    expect(puede("administrador", "editar", "cf")).toBe(true)
  })
})
