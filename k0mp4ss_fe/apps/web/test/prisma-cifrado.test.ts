/**
 * @vitest-environment node
 *
 * SERIE-PRODUCCION-FASE2 P4 — integración de lib/prisma-cifrado.
 * Requiere CLAVE_CIFRADO_DATOS de test (worker propio por archivo).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { prismaCifrado, cifrarFila, descifrarFila, CAMPOS_CIFRADOS } from "@/lib/prisma-cifrado"
import { estaCifrado } from "@/lib/crypto"

const CLAVE_TEST = "clave-cifrado-test-p4-32-chars!!!"
const SUFIJO = Date.now()
const EMAIL_CIFRADO = `p4-cifrado-${SUFIJO}@test.cl`
const EMAIL_LEGACY = `p4-legacy-${SUFIJO}@test.cl`
const SECRETO = "JBSWY3DPEHPK3PXP"

async function secretoCrudo(usuarioId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ twoFactorSecret: string | null }>>(
    Prisma.sql`SELECT "twoFactorSecret" FROM "usuarios" WHERE "id" = ${usuarioId}`
  )
  return rows[0]?.twoFactorSecret ?? null
}

describe("P4 — prismaCifrado (extensión transparente)", () => {
  const envPrevio = process.env.CLAVE_CIFRADO_DATOS
  let uidCifrado = ""

  beforeAll(() => {
    process.env.CLAVE_CIFRADO_DATOS = CLAVE_TEST
  })

  afterAll(async () => {
    try {
      await prisma.usuario.deleteMany({ where: { email: { in: [EMAIL_CIFRADO, EMAIL_LEGACY] } } })
    } catch {
      // intencional: vacío por diseño
    }
    if (envPrevio === undefined) delete process.env.CLAVE_CIFRADO_DATOS
    else process.env.CLAVE_CIFRADO_DATOS = envPrevio
  })

  it("create cifra en BD y la lectura descifra transparente", async () => {
    const creado = (await prismaCifrado.usuario.create({
      data: { email: EMAIL_CIFRADO, passwordHash: "x", twoFactorSecret: SECRETO },
    })) as unknown as { id: string; twoFactorSecret: string }
    uidCifrado = creado.id
    // Lectura vía extensión: texto plano
    expect(creado.twoFactorSecret).toBe(SECRETO)
    // En disco: cifrado, sin rastro del secreto
    const crudo = await secretoCrudo(creado.id)
    expect(crudo).toBeTruthy()
    expect(estaCifrado(crudo)).toBe(true)
    expect(crudo).not.toContain(SECRETO)
  })

  it("update cifra y findUnique/findMany descifran", async () => {
    await prismaCifrado.usuario.update({
      where: { id: uidCifrado },
      data: { twoFactorSecret: "NUEVOSECRETO123", twoFactorBackupCodes: JSON.stringify(["h1"]) },
    })
    const uno = (await prismaCifrado.usuario.findUnique({ where: { id: uidCifrado } })) as unknown as {
      twoFactorSecret: string
      twoFactorBackupCodes: string
    }
    expect(uno.twoFactorSecret).toBe("NUEVOSECRETO123")
    expect(uno.twoFactorBackupCodes).toBe(JSON.stringify(["h1"]))
    const muchos = (await prismaCifrado.usuario.findMany({ where: { id: uidCifrado } })) as unknown as Array<{
      twoFactorSecret: string
    }>
    expect(muchos[0]!.twoFactorSecret).toBe("NUEVOSECRETO123")
  })

  it("legacy en texto plano pasa intacto (migración gradual)", async () => {
    const legacy = await prisma.usuario.create({
      data: { email: EMAIL_LEGACY, passwordHash: "x", twoFactorSecret: SECRETO },
    })
    const leido = (await prismaCifrado.usuario.findUnique({ where: { id: legacy.id } })) as unknown as {
      twoFactorSecret: string
    }
    expect(leido.twoFactorSecret).toBe(SECRETO)
    // Update de otro campo NO re-cifra por sorpresa (sin escrituras fantasma)
    await prismaCifrado.usuario.update({ where: { id: legacy.id }, data: { activo: true } })
    expect(await secretoCrudo(legacy.id)).toBe(SECRETO)
    // Re-escritura del propio campo vía extensión sí lo cifra
    await prismaCifrado.usuario.update({ where: { id: legacy.id }, data: { twoFactorSecret: SECRETO } })
    expect(estaCifrado(await secretoCrudo(legacy.id))).toBe(true)
  })

  it("null/ausente pasa intacto; operadores Prisma no se tocan", async () => {
    const u = (await prismaCifrado.usuario.create({
      data: { email: `p4-null-${SUFIJO}@test.cl`, passwordHash: "x" },
    })) as unknown as { id: string; twoFactorSecret: string | null }
    try {
      expect(u.twoFactorSecret).toBeNull()
      const tocado = (await prismaCifrado.usuario.update({
        where: { id: u.id },
        data: { tokenVersion: { increment: 1 } },
      })) as unknown as { tokenVersion: number; twoFactorSecret: string | null }
      expect(tocado.tokenVersion).toBe(1)
      expect(tocado.twoFactorSecret).toBeNull()
    } finally {
      await prisma.usuario.delete({ where: { id: u.id } }).catch(() => {})
    }
  })

  it("bulk en modelo mapeado lanza (fail-closed, sin bypass silencioso)", async () => {
    await expect(
      (prismaCifrado.usuario.createMany as unknown as (a: unknown) => Promise<unknown>)({ data: [] })
    ).rejects.toThrow(/no soportado/)
    await expect(
      (prismaCifrado.usuario.updateMany as unknown as (a: unknown) => Promise<unknown>)({ where: {}, data: {} })
    ).rejects.toThrow(/no soportado/)
  })

  it("limitación documentada: where sobre cifrado no matchea texto plano", async () => {
    // El secreto de uidCifrado está cifrado con IV aleatorio: buscar por
    // plaintext no puede funcionar. Pendiente: blind index HMAC (post-P4).
    const hallado = await prismaCifrado.usuario.findFirst({
      where: { twoFactorSecret: "NUEVOSECRETO123" },
    })
    expect(hallado).toBeNull()
    expect(CAMPOS_CIFRADOS.Usuario).toContain("twoFactorSecret")
  })
})

describe("P4 — cifrarFila/descifrarFila (Json y mapa)", () => {
  it("datosLaborales (Json) se cifra como string y vuelve como objeto", () => {
    const original = { sueldo: 1500000, banco: "Banco Test", fichaMedica: { alergias: ["penicilina"] } }
    const cifrada = cifrarFila("Persona", { rut: "12.345.678-9", datosLaborales: original })
    expect(estaCifrado(cifrada!.rut)).toBe(true)
    expect(estaCifrado(cifrada!.datosLaborales)).toBe(true)
    const descifrada = descifrarFila("Persona", cifrada!)
    expect(descifrada!.rut).toBe("12.345.678-9")
    expect(descifrada!.datosLaborales).toEqual(original)
  })

  it("modelo sin mapa pasa intacto; fila null pasa intacta", () => {
    const data = { monto: 100 }
    expect(cifrarFila("EgresoFI", data)).toBe(data)
    expect(descifrarFila("Usuario", null)).toBeNull()
  })
})
