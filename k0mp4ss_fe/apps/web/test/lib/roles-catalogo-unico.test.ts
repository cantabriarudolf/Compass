/** @vitest-environment node */
/**
 * R4 · roles de la persona y roles del directorio: una definición de cada uno.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 4) encontró el
 * vocabulario de roles escrito en seis lugares sin relación: `ROLES_PERSONA`
 * (fuente, `lib/schemas.ts`), `ROLES_TAB_CONFIG` con `id: string` (que viaja
 * crudo como `?rol=` y el servidor rechaza si no está en `ROLES_PERSONA`),
 * `ROLE_LABELS`/`ROLE_HEX` como `Record<string, string>` (sin exhaustividad),
 * `ROLES_DIRECTORIO` escrito DOS veces (ruta y pantalla de gestión) y
 * `RolesVinculo` como array tipado, que no exige cubrir el catálogo.
 *
 * Dos de esos conjuntos NO son el mismo y no se unifican (S5):
 *
 * - `ROLES_DIRECTORIO` es un subconjunto a propósito de `ROLES_PERSONA`:
 *   `contratista` no pertenece al Directorio de Gestión Administrativa. Lo que
 *   se unifica es la DEFINICIÓN (una tupla, importada por la ruta y la pantalla),
 *   no los valores.
 * - `RolesVinculo` es otro vocabulario: roles de un vínculo con una unidad
 *   (propietario, arrendatario, copropietario, ocupante), no roles de la persona.
 *
 * Este archivo pina las tres cosas que unificarlos tiene que garantizar.
 */

import { describe, expect, it } from "vitest"
import {
  ROLES_DIRECTORIO,
  ROLES_PERSONA,
  RolesVinculo,
  RolVinculoSchema,
} from "@/lib/schemas"

describe("R4 — roles de la persona y del directorio", () => {
  it("el catálogo de roles de la persona es el de hoy", () => {
    expect([...ROLES_PERSONA]).toEqual([
      "propietario",
      "residente",
      "personal",
      "directiva",
      "contratista",
    ])
  })

  it("el directorio es un subconjunto a propósito: contratista queda afuera", () => {
    // Se declara una sola vez en `lib/schemas.ts` y la importan la ruta
    // (`?rolDirectorio=`) y la pantalla de gestión. El contratoista no pertenece
    // al Directorio de Gestión Administrativa: por eso `ROLES_DIRECTORIO` no
    // deriva de `ROLES_PERSONA` por slice sino que lista su propio subconjunto.
    expect([...ROLES_DIRECTORIO]).toEqual(["propietario", "residente", "directiva", "personal"])
    expect(ROLES_DIRECTORIO).not.toContain("contratista")
    for (const rol of ROLES_DIRECTORIO) {
      expect(ROLES_PERSONA).toContain(rol)
    }
  })

  it("los roles de vínculo son los del schema, y no los de la persona", () => {
    // `RolesVinculo` es el catálogo del vínculo con la unidad; el schema es el
    // que valida la fila. Si divergen, la semilla escribe un rol que el schema
    // rechaza o la pantalla ofrece uno que la base nunca acepta.
    expect([...RolesVinculo]).toEqual([
      "propietario",
      "arrendatario",
      "copropietario",
      "ocupante",
    ])
    for (const rol of RolesVinculo) {
      expect(RolVinculoSchema.safeParse(rol).success).toBe(true)
    }
    // Un rol de persona no es un rol de vínculo: son vocabularios distintos.
    expect(RolVinculoSchema.safeParse("administrador").success).toBe(false)
    expect(RolVinculoSchema.safeParse("contratista").success).toBe(false)
  })
})
