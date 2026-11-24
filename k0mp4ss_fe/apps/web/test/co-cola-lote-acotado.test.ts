// @vitest-environment node
/** S3/R5: el lote del cron está acotado por la librería. */
import { describe, expect, it } from "vitest"
import {
  LOTE_COLA_SALIDA_CO_MAXIMO,
  LOTE_COLA_SALIDA_CO_POR_DEFECTO,
  acotarLoteColaSalidaCO,
} from "@/lib/co-cola"

describe("lote acotado del drenaje (S3/R5)", () => {
  it("25 por omisión y 50 de tope", () => {
    expect(LOTE_COLA_SALIDA_CO_POR_DEFECTO).toBe(25)
    expect(LOTE_COLA_SALIDA_CO_MAXIMO).toBe(50)
  })
  it("sin límite cae al de omisión y por encima del tope se recorta", () => {
    expect(acotarLoteColaSalidaCO(undefined)).toBe(25)
    expect(acotarLoteColaSalidaCO(null)).toBe(25)
    expect(acotarLoteColaSalidaCO(0)).toBe(25)
    expect(acotarLoteColaSalidaCO(-3)).toBe(25)
    expect(acotarLoteColaSalidaCO("abc")).toBe(25)
    expect(acotarLoteColaSalidaCO(2.7)).toBe(2)
    expect(acotarLoteColaSalidaCO(1000)).toBe(50)
    expect(acotarLoteColaSalidaCO("7")).toBe(7)
  })
})
