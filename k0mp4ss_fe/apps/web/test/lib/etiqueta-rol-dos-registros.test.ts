/** @vitest-environment node */
/**
 * R14 · los dos registros de nombre de rol son DOS, a propósito, y eso está escrito.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 14) encontró dos
 * mapas `Record<Rol, …>` con cadenas distintas: `ETIQUETA_ROL` en `lib/authz.ts`
 * (forma de oración: «Tu rol es administrador.») y `ETIQUETAS_ROL` en
 * `app/admin/permisos/page.tsx` («Administrador Maestro», «Miembro del Comité»…).
 * No es una copia: nombran dos cosas distintas —quién sos en una oración y qué
 * oficio administra la matriz de permisos— y los dos rompen la compilación al
 * agregar un rol. El defecto era que el motivo no estaba escrito en ningún lado:
 * renombrar uno dejaba al otro diciendo otra cosa sin que nada lo señalara.
 *
 * Este archivo pina el par declarado (S5: un subconjunto a propósito no se
 * unifica, se deja escrito con su motivo y su test):
 *
 *   1. Los dos cubren exactamente los mismos roles.
 *   2. El registro RP nombra el oficio: no repite el id ni es la forma de oración
 *      capitalizada.
 *   3. Las cadenas del registro RP son las que la pantalla de permisos muestra y
 *      el e2e pina (`e2e/crud/permisos.spec.ts`): renombrarlas es una decisión con
 *      test, no un efecto colateral.
 */

import { describe, expect, it } from "vitest"
import { ETIQUETA_ROL, ETIQUETA_ROL_RP, ROLES, etiquetaRol } from "@/lib/authz"

describe("R14 — dos registros de nombre de rol, declarados", () => {
  it("los dos cubren exactamente los mismos roles", () => {
    expect(Object.keys(ETIQUETA_ROL_RP).sort()).toEqual([...ROLES].sort())
    expect(Object.keys(ETIQUETA_ROL).sort()).toEqual([...ROLES].sort())
  })

  it("el registro RP nombra el oficio: no repite el id ni la forma de oración", () => {
    for (const rol of ROLES) {
      const nombreRp = ETIQUETA_ROL_RP[rol]
      expect(nombreRp).toBeTruthy()
      expect(nombreRp).not.toBe(rol)
      // Si fuera la forma de oración capitalizada, no habría dos registros.
      expect(nombreRp).not.toBe(etiquetaRol(rol))
    }
  })

  it("el registro RP es el que la pantalla de permisos muestra y el e2e pina", () => {
    expect(ETIQUETA_ROL_RP).toEqual({
      administrador: "Administrador Maestro",
      comite: "Miembro del Comité",
      conserjeria: "Conserjería / Seguridad",
      residente: "Propietario / Residente",
      mantencion: "Personal de Mantención",
    })
  })

  it("los dos registros no son el mismo objeto: unificarlos sería otra decisión", () => {
    expect(ETIQUETA_ROL_RP).not.toBe(ETIQUETA_ROL)
  })
})
