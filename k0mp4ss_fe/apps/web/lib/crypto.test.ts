/**
 * SERIE-PRODUCCION-FASE2 P4 — unit tests de lib/crypto (AES-256-GCM).
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  cifrar,
  descifrar,
  estaCifrado,
  usandoClaveDummy,
  PREFIJO_CIFRADO,
} from "@/lib/crypto"

const CLAVE_TEST = "clave-de-prueba-exacta-32-chars!!" // 33 chars, deriva SHA-256

/** process.env.NODE_ENV es read-only según tipos Node: mutación vía cast. */
function fijarNodeEnv(valor: string | undefined): void {
  const env = process.env as unknown as Record<string, string | undefined>
  if (valor === undefined) delete env.NODE_ENV
  else env.NODE_ENV = valor
}

describe("P4 — lib/crypto AES-256-GCM", () => {
  const envPrevio = process.env.CLAVE_CIFRADO_DATOS
  const nodeEnvPrevio = process.env.NODE_ENV

  beforeAll(() => {
    process.env.CLAVE_CIFRADO_DATOS = CLAVE_TEST
  })

  afterAll(() => {
    if (envPrevio === undefined) delete process.env.CLAVE_CIFRADO_DATOS
    else process.env.CLAVE_CIFRADO_DATOS = envPrevio
    fijarNodeEnv(nodeEnvPrevio)
  })

  it("roundtrip: descifrar(cifrar(x)) === x (incluye unicode y vacío)", () => {
    for (const texto of ["12.345.678-9", "Jp+ñQügü3n testi-♥@test.cl", "", "a".repeat(5000)]) {
      expect(descifrar(cifrar(texto))).toBe(texto)
    }
  })

  it("IV único: dos cifrados del mismo texto difieren", () => {
    const a = cifrar("mismo-texto")
    const b = cifrar("mismo-texto")
    expect(a).not.toBe(b)
    expect(a.startsWith(PREFIJO_CIFRADO)).toBe(true)
    expect(descifrar(a)).toBe(descifrar(b))
  })

  it("clave incorrecta → descifrar lanza (fail-closed)", () => {
    const sobre = cifrar("secreto")
    process.env.CLAVE_CIFRADO_DATOS = "otra-clave-distinta-de-32-chars!!"
    expect(() => descifrar(sobre)).toThrow(/clave incorrecta o dato corrupto/)
    process.env.CLAVE_CIFRADO_DATOS = CLAVE_TEST
    expect(descifrar(sobre)).toBe("secreto")
  })

  it("dato manipulado → descifrar lanza (tag GCM)", () => {
    const sobre = cifrar("secreto")
    const partes = sobre.split(".") // ["v1", "gcm", iv, tag, ct]
    const ct = partes[4]!
    const manipulado = `${partes[0]}.${partes[1]}.${partes[2]}.${partes[3]}.${ct.slice(0, -2)}${ct.slice(-2) === "AA" ? "BB" : "AA"}`
    expect(() => descifrar(manipulado)).toThrow(/clave incorrecta o dato corrupto/)
  })

  it("formato inválido lanza; estaCifrado discrimina", () => {
    expect(() => descifrar("texto-plano")).toThrow(/no es un sobre/)
    expect(() => descifrar(`${PREFIJO_CIFRADO}incompleto`)).toThrow(/no es un sobre/)
    expect(estaCifrado(cifrar("x"))).toBe(true)
    expect(estaCifrado("12.345.678-9")).toBe(false)
    expect(estaCifrado(null)).toBe(false)
    expect(estaCifrado(123)).toBe(false)
  })

  it("clave de menos de 32 caracteres lanza", () => {
    process.env.CLAVE_CIFRADO_DATOS = "corta"
    expect(() => cifrar("x")).toThrow(/al menos 32/)
    process.env.CLAVE_CIFRADO_DATOS = CLAVE_TEST
  })

  it("sin clave en producción lanza (nunca dummy en prod)", () => {
    delete process.env.CLAVE_CIFRADO_DATOS
    fijarNodeEnv("production")
    expect(() => cifrar("x")).toThrow(/no configurada en producción/)
    expect(usandoClaveDummy()).toBe(true)
    fijarNodeEnv(nodeEnvPrevio)
    process.env.CLAVE_CIFRADO_DATOS = CLAVE_TEST
    expect(usandoClaveDummy()).toBe(false)
  })
})
