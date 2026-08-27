/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { excedeIntentos, registrarFallo, limpiarIntentos } from "@/lib/rate-limit"

describe("lib/rate-limit — D-v persistente", () => {
  const clave = () => `rate-test-${Date.now()}-${Math.random()}`

  it("permite hasta 10 fallos y bloquea al 11", async () => {
    const k = clave()
    expect(await excedeIntentos(k)).toBe(false)
    for (let i = 0; i < 10; i++) await registrarFallo(k)
    expect(await excedeIntentos(k)).toBe(true)
    expect(await excedeIntentos(k + "-otra")).toBe(false)
    await limpiarIntentos(k)
  })

  it("ventana expira después de 15 min", async () => {
    const k = clave()
    // 10 fallos antiguos (fuera de ventana) no deben bloquear
    const viejo = new Date(Date.now() - 16 * 60 * 1000)
    for (let i = 0; i < 10; i++) {
      await prisma.rateLimitAttempt.create({ data: { clave: k, createdAt: viejo } })
    }
    expect(await excedeIntentos(k)).toBe(false)
    // 10 recientes sí bloquean
    for (let i = 0; i < 10; i++) await registrarFallo(k)
    expect(await excedeIntentos(k)).toBe(true)
    await limpiarIntentos(k)
    // tras limpiar, desbloquear
    expect(await excedeIntentos(k)).toBe(false)
  })

  it("primer fallo no bloquea, registrarFallo + excedeIntentos coherentes", async () => {
    const k = clave()
    await registrarFallo(k)
    expect(await excedeIntentos(k)).toBe(false)
    for (let i = 1; i < 10; i++) await registrarFallo(k)
    expect(await excedeIntentos(k)).toBe(true)
    await limpiarIntentos(k)
  })

  it("limpiarIntentos borra solo la clave indicada", async () => {
    const k1 = clave()
    const k2 = clave()
    await registrarFallo(k1)
    await registrarFallo(k2)
    await limpiarIntentos(k1)
    expect(await excedeIntentos(k1)).toBe(false)
    // k2 sigue con 1 fallo -> no bloqueado pero existe
    const c2 = await prisma.rateLimitAttempt.count({ where: { clave: k2 } })
    expect(c2).toBe(1)
    await limpiarIntentos(k2)
  })

  it("registrarFallo hace cleanup oportunista de filas expiradas", async () => {
    const kVieja = `rate-old-${Date.now()}`
    const kNueva = clave()
    const viejo = new Date(Date.now() - 20 * 60 * 1000)
    await prisma.rateLimitAttempt.create({ data: { clave: kVieja, createdAt: viejo } })
    // al registrar un fallo nuevo, las viejas fuera de ventana se borran
    await registrarFallo(kNueva)
    const viejaCount = await prisma.rateLimitAttempt.count({ where: { clave: kVieja } })
    expect(viejaCount).toBe(0)
    await limpiarIntentos(kNueva)
  })
})
