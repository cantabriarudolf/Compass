import { afterEach, describe, expect, it, vi } from "vitest"
import { generarId } from "@/lib/id-utils"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("generarId", () => {
  it("formato prefijo-stamp-rnd", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000)
    vi.spyOn(Math, "random").mockReturnValue(0.123456)
    // (0.123456).toString(36).slice(2, 8) = "4fzy7m" (determinístico)
    expect(generarId("ev")).toMatch(/^ev-1700000000000-[a-z0-9]{1,6}$/)
  })

  it("formato prefijo-stamp-idx-rnd con idx", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000)
    vi.spyOn(Math, "random").mockReturnValue(0.654321)
    expect(generarId("bono", 3)).toMatch(/^bono-1700000000000-3-[a-z0-9]{1,6}$/)
  })

  it("genera IDs distintos para llamadas consecutivas (unicidad)", () => {
    const ids = new Set(Array.from({ length: 500 }, () => generarId("x")))
    expect(ids.size).toBe(500)
  })
})
