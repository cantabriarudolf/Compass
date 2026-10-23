// @vitest-environment node
/**
 * S1 — la vista de `/comunidad/comunicacion` se deriva del rol de la sesión
 * (change co-lectura-residente, tarea 1.7 · decisión D1 del design).
 *
 * Contrato: no existe ningún valor elegible por el usuario. El rol llega del
 * servidor y esta función pura decide qué se renderiza:
 *   administrador → consola (redacción, plantillas, buzón, biblioteca)
 *   comite        → bandeja de lectura con agregados
 *   residente     → bandeja propia
 *   sin `co` ver  → sin acceso (la matriz es la fuente de verdad, no una lista
 *                   de roles copiada acá)
 */
import { describe, expect, it } from "vitest"
import { rolVistaCO } from "@/components/co/rol-vista"

describe("rolVistaCO — el rol resuelto en el servidor decide la vista", () => {
  it("el administrador recibe la consola", () => {
    expect(rolVistaCO(["administrador"])).toBe("administrador")
    expect(rolVistaCO("admin")).toBe("administrador")
  })

  it("el comité recibe la bandeja con agregados", () => {
    expect(rolVistaCO(["comite"])).toBe("comite")
    // alias de la matriz: la directiva es el comité
    expect(rolVistaCO(["directiva"])).toBe("comite")
  })

  it("el residente recibe su bandeja propia", () => {
    expect(rolVistaCO(["residente"])).toBe("residente")
    expect(rolVistaCO("propietario")).toBe("residente")
  })

  it("sin permiso de ver CO no hay vista: ni consola ni bandeja", () => {
    expect(rolVistaCO(["conserjeria"])).toBe("sin-acceso")
    expect(rolVistaCO(["mantencion"])).toBe("sin-acceso")
    expect(rolVistaCO([])).toBe("sin-acceso")
    expect(rolVistaCO(["rol-inexistente"])).toBe("sin-acceso")
  })

  it("con varios roles gana el de mayor privilegio", () => {
    expect(rolVistaCO(["residente", "administrador"])).toBe("administrador")
    expect(rolVistaCO(["residente", "comite"])).toBe("comite")
  })
})
