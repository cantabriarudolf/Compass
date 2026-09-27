// P1 SERIE-E2E-FULL-VERDE (change e2e-higiene-determinismo): contrato
// anti-regresión del orden canónico de membresías del seed authz.
// El scope es la ÚLTIMA membresía por createdAt (withComunidadScope, take:1);
// admin-a DEBE ir última en ambos seeds (script .mjs + espejo lib) o el
// reseed pierde scope A. Test estático sin BD: verifica el orden declarado
// y la pasada determinista de createdAt en ambos archivos.
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const mjs = readFileSync(join(webRoot, "scripts/seed-authz.mjs"), "utf8")
const lib = readFileSync(join(webRoot, "lib/seed-authz.ts"), "utf8")

function extraerOrdenMembresias(src: string): { usuarioId: string; comunidadId: string }[] {
  const bloque = src.match(/const membresiasData = \[(.*?)\]/s)?.[1] ?? ""
  return [...bloque.matchAll(/\{\s*usuarioId:\s*"([^"]+)",\s*comunidadId:\s*"([^"]+)"[^}]*\}/g)].map(
    (m) => ({ usuarioId: m[1] ?? "", comunidadId: m[2] ?? "" }),
  )
}

describe.each([
  ["scripts/seed-authz.mjs", mjs],
  ["lib/seed-authz.ts", lib],
])("orden canónico en %s", (_nombre, src) => {
  it("admin-b primero, admin-a última (scope comunidad-a)", () => {
    const orden = extraerOrdenMembresias(src)
    expect(orden.length).toBeGreaterThanOrEqual(7)
    expect(orden[0]).toEqual({ usuarioId: "usuario-admin", comunidadId: "comunidad-b" })
    expect(orden[orden.length - 1]).toEqual({
      usuarioId: "usuario-admin",
      comunidadId: "comunidad-a",
    })
  })

  it("incluye al arrendatario en comunidad-a", () => {
    const orden = extraerOrdenMembresias(src)
    expect(orden).toContainEqual({ usuarioId: "usuario-arrendatario", comunidadId: "comunidad-a" })
  })

  it("reescribe createdAt en orden canónico (pasada determinista)", () => {
    expect(src).toMatch(/createdAt:\s*new Date\(baseTs \+ i \* 1000\)/)
  })
})
