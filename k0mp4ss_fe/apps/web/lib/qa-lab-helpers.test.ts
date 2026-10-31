import { describe, it, expect } from "vitest"
import { esCobroTest } from "./qa-lab-helpers"

/**
 * El módulo nació con el QA-Lab; hoy sólo sobrevive `esCobroTest` porque es la
 * regla de producción de `app/api/cobros-fi/[id]`. Este test fija esa conducta:
 * si alguien la relaja, el guard deja de bloquear cobros TEST.
 */
describe("qa-lab-helpers — lo que sobrevive al retiro del QA-Lab (F9)", () => {
  it("esCobroTest clasifica TEST por id, unidad u origenRef", () => {
    expect(esCobroTest({ id: "test-cob-1", unidadId: "u-real" })).toBe(true)
    expect(esCobroTest({ id: "cob-1", unidadId: "test-u-999", origenRef: undefined })).toBe(true)
    expect(esCobroTest({ id: "cob-1", unidadId: "u-real", origenRef: "test-ra-rs-1" })).toBe(true)
    expect(esCobroTest({ id: "cob-1", unidadId: "u-real", origenRef: "infra-real" })).toBe(false)
    expect(esCobroTest({ id: "cob-1", unidadId: "u-real" })).toBe(false)
  })
})
