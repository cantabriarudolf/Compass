/**
 * @vitest-environment node
 *
 * `POST /api/backup` como descarga (SERIE-DEUDA, unidad F3).
 *
 * El disco del servidor es efímero en producción: el endpoint ya no escribe
 * `Data/NSGC/backups/` ni devuelve `{ ok, path }`. Devuelve el respaldo como
 * adjunto con nombre fechado generado por el servidor, y el cuerpo es exactamente
 * el `content` enviado (sin re-serializar, sin reordenar claves).
 *
 * Contratos ejercitados:
 * - 200 con `Content-Disposition: attachment; filename="compass-backup-AAAA-MM-DD_HH-mm.json"`.
 * - `Content-Type: application/json; charset=utf-8` y `Cache-Control: no-store`.
 * - Cuerpo byte a byte igual al `content` recibido.
 * - Cero archivos nuevos bajo `Data/NSGC/backups/` (listado antes/después).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { prisma } from "@/lib/prisma"

const state = vi.hoisted(() => ({ cookie: "" }))
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(
      new Headers(
        state.cookie
          ? { cookie: state.cookie, "x-forwarded-proto": "http" }
          : { "x-forwarded-proto": "http" }
      )
    ),
}))

const AUTH_SECRET = "test-secret-12345678"
const COMUNIDAD = "comunidad-backup-descarga"
const EMAIL_ADMIN = "backup-descarga-admin@test.cl"
const REPO_ROOT = path.resolve(process.cwd(), "../../..")
const BACKUPS_DIR = path.join(REPO_ROOT, "Data", "NSGC", "backups")

/** Listado del directorio de respaldos; "ausente" si el directorio no existe. */
function listarBackups(): string[] {
  if (!existsSync(BACKUPS_DIR)) return ["<directorio ausente>"]
  return readdirSync(BACKUPS_DIR).sort()
}

describe("POST /api/backup — el respaldo baja como descarga fechada", () => {
  const originalSecret = process.env.AUTH_SECRET
  const originalAppEnv = process.env.NEXT_PUBLIC_APP_ENV
  let backupsAntes: string[] = []

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    await prisma.comunidad
      .upsert({
        where: { id: COMUNIDAD },
        update: {},
        create: { id: COMUNIDAD, nombre: "Comunidad Backup Descarga", slug: COMUNIDAD },
      })
      .catch(() => {})
    await prisma.usuario.upsert({
      where: { email: EMAIL_ADMIN },
      update: { activo: true },
      create: { id: "backup-descarga-usuario-admin", email: EMAIL_ADMIN, activo: true },
    })
    const admin = await prisma.usuario.findUnique({ where: { email: EMAIL_ADMIN } })
    if (admin) {
      await prisma.membresia.deleteMany({ where: { usuarioId: admin.id } })
      await prisma.membresia.create({
        data: { usuarioId: admin.id, comunidadId: COMUNIDAD, rol: "administrador" },
      })
    }
    backupsAntes = listarBackups()
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      const admin = await prisma.usuario.findUnique({ where: { email: EMAIL_ADMIN } })
      if (admin) {
        await prisma.membresia.deleteMany({ where: { usuarioId: admin.id } })
        await prisma.usuario.delete({ where: { id: admin.id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: COMUNIDAD } }).catch(() => {})
    } catch {
      // intencional: el teardown no debe tapar el resultado de los asserts
    }
    if (originalSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = originalSecret
    if (originalAppEnv === undefined) delete process.env.NEXT_PUBLIC_APP_ENV
    else process.env.NEXT_PUBLIC_APP_ENV = originalAppEnv
  })

  async function postBackup(content: string): Promise<Response> {
    const admin = await prisma.usuario.findUnique({ where: { email: EMAIL_ADMIN } })
    if (!admin) throw new Error("admin de prueba no encontrado")
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: admin.id, email: admin.email })
    const { POST } = await import("@/app/api/backup/route")
    const req = new Request("http://localhost/api/backup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-proto": "http",
        "x-comunidad-id": COMUNIDAD,
        cookie: state.cookie,
      },
      // el cliente todavía manda `fileName`: el servidor debe ignorarlo
      body: JSON.stringify({ content, fileName: "nombre-del-cliente-sin-fecha.json" }),
    })
    const res = await POST(req as never)
    state.cookie = ""
    return res
  }

  it("200 devuelve adjunto con nombre fechado fijado por el servidor", async () => {
    const res = await postBackup('{"state":{},"version":28}')
    expect(res.status).toBe(200)

    const disposicion = res.headers.get("content-disposition") ?? ""
    expect(disposicion).toMatch(
      /^attachment; filename="compass-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json"$/
    )
    // el nombre NO viene del cliente
    expect(disposicion).not.toContain("nombre-del-cliente-sin-fecha")

    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8")
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("el cuerpo es exactamente el content enviado", async () => {
    const content = JSON.stringify(
      { _summary: { exportDate: "2026-10-23T15:11:12.000Z" }, state: { unidades: [] }, version: 28 },
      null,
      2
    )
    const res = await postBackup(content)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(content)
  })

  it("no crea ningún archivo bajo Data/NSGC/backups/", async () => {
    const res = await postBackup('{"state":{},"version":28}')
    expect(res.status).toBe(200)
    expect(listarBackups()).toEqual(backupsAntes)
  })
})
