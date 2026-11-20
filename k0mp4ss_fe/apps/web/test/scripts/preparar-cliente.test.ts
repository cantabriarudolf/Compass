import { describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import path from "node:path"

const SCRIPT = path.join(process.cwd(), "scripts/preparar-cliente.mjs")

/** Corre el script con un entorno dado y devuelve salida y código. */
function correr(args: string[], env: Record<string, string> = {}) {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...env },
    })
    return { stdout, status: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return { stdout: `${e.stdout ?? ""}${e.stderr ?? ""}`, status: e.status ?? 1 }
  }
}

describe("preparar-cliente — el cliente acompaña al comando, salvo en CI", () => {
  it("en CI no regenera: el carril del workflow ya eligió el motor", () => {
    const r = correr(["sqlite"], { CI: "true" })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain("CI detectado")
    expect(r.stdout).not.toContain("generado para")
  })

  it("en CI respeta también el destino postgres, sin regenerar", () => {
    const r = correr(["postgres"], { CI: "1" })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain("CI detectado")
  })

  it("un destino inventado es error de uso, no una generación a ciegas", () => {
    const r = correr(["mysql"], { CI: "true" })
    expect(r.status).toBe(2)
    expect(r.stdout).toContain("uso: preprar-cliente".replace("preprar", "preparar"))
  })
})
