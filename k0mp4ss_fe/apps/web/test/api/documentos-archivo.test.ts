/**
 * @vitest-environment node
 *
 * F35 serie A / A1 — contrato del ARCHIVO de documentos de la comunidad.
 *
 * Una sola entidad, dos naturalezas:
 *   · legal       ⊂ append-only: 409 en DELETE y PUT, y el POST repetido tampoco
 *                     la sobrescribe. `referenciaAutentica` obligatoria.
 *   · comunitario ⊂ reemplazable: PUT y DELETE funcionan.
 *
 * Además: la versión la asigna el servidor dentro de (comunidad, tipo), el
 * cliente no la manda; el tipo documental es lista cerrada; el archivo es una
 * referencia (D1, jamás data:/blob:); y el alcance por comunidad se respeta.
 *
 * T11 (retiro de la Biblioteca de CO): abrir un documento del archivo resuelve el
 * detalle (`GET /api/documentos/[id]`) y esa lectura deja el evento inmutable
 * `AD_DOC_APERTURA` de categoría AD. El listado no audita (listar no es abrir) y
 * los caminos rojos tampoco.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { invocarApi, cuerpoJson } from "../helpers/api-sesion"

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

const comunidadA = "docarq-com-a"
const comunidadB = "docarq-com-b"
const emailAdmin = "docarq-admin@test.cl"
const emailComite = "docarq-comite@test.cl"
const emailResidente = "docarq-residente@test.cl"
const emailMantencion = "docarq-mantencion@test.cl"

const usuarios = [
  { id: "docarq-user-admin", email: emailAdmin, rol: "administrador" },
  { id: "docarq-user-comite", email: emailComite, rol: "comite" },
  { id: "docarq-user-residente", email: emailResidente, rol: "residente" },
  { id: "docarq-user-mantencion", email: emailMantencion, rol: "mantencion" },
]

type Payload = Record<string, unknown>

function legal(id: string, overrides: Payload = {}): Payload {
  return {
    id,
    naturaleza: "legal",
    tipoDocumental: "actas-asamblea",
    glosa: "Acta de asamblea ordinaria 2026",
    referenciaAutentica: "Notaría 4ª, fojas 12, 2026-03-15",
    archivoNombre: "acta-asamblea-2026.pdf",
    archivoTipoMime: "application/pdf",
    archivoTamanoKB: 640.5,
    archivoUrl: "https://cdn.compass.cl/comunidad/acta-asamblea-2026.pdf",
    vigenteDesde: "2026-03-15",
    ...overrides,
  }
}

function comunitario(id: string, overrides: Payload = {}): Payload {
  return {
    id,
    naturaleza: "comunitario",
    tipoDocumental: "otros",
    glosa: "Circular de trabajos de fachada",
    archivoNombre: "circular-fachada.pdf",
    archivoTipoMime: "application/pdf",
    archivoTamanoKB: 210,
    archivoUrl: "https://cdn.compass.cl/comunidad/circular-fachada.pdf",
    vigenteDesde: "2026-04-01",
    ...overrides,
  }
}

const rutaColeccion = import("@/app/api/documentos/route")
const rutaItem = import("@/app/api/documentos/[id]/route")

async function conUsuario<T>(email: string, fn: () => Promise<T>): Promise<T> {
  const user = await prisma.usuario.findUnique({ where: { email } })
  if (!user) throw new Error(`usuario no encontrado: ${email}`)
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  const previa = state.cookie
  state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
  try {
    return await fn()
  } finally {
    state.cookie = previa
  }
}

function crear(body: Payload): Promise<Response> {
  return invocarApi(rutaColeccion, "POST", "documentos", { body })
}

function editar(id: string, body: Payload): Promise<Response> {
  return invocarApi(rutaItem, "PUT", `documentos/${id}`, { params: { id }, body })
}

function borrar(id: string): Promise<Response> {
  return invocarApi(rutaItem, "DELETE", `documentos/${id}`, { params: { id } })
}

function listar(query = ""): Promise<Response> {
  return invocarApi(rutaColeccion, "GET", `documentos${query}`)
}

function verDetalle(id: string): Promise<Response> {
  return invocarApi(rutaItem, "GET", `documentos/${id}`, { params: { id } })
}

/** Aperturas auditadas de la comunidad A: el evento de lectura del archivo. */
function contarAperturas(): Promise<number> {
  return prisma.eventoAuditoria.count({
    where: { comunidadId: comunidadA, tipoAccion: "AD_DOC_APERTURA" },
  })
}

describe("F35-A1 · archivo de documentos de la comunidad", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    for (const c of [
      { id: comunidadA, nombre: "Comunidad Archivo A", slug: "docarq-a" },
      { id: comunidadB, nombre: "Comunidad Archivo B", slug: "docarq-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of usuarios) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: {},
        create: { id: u.id, email: u.email, activo: true },
      })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: usuarios.map((u) => u.id) } },
    })
    for (const u of usuarios) {
      await prisma.membresia.create({
        data: { usuarioId: u.id, comunidadId: comunidadA, rol: u.rol },
      })
    }
    await limpiar()
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      delete process.env.NEXT_PUBLIC_APP_ENV
      await limpiar()
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: usuarios.map((u) => u.id) } },
      })
      for (const u of usuarios) {
        await prisma.usuario.delete({ where: { id: u.id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function limpiar(): Promise<void> {
    await prisma.documento.deleteMany({
      where: { comunidadId: { in: [comunidadA, comunidadB] } },
    })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [comunidadA, comunidadB] } },
    })
  }

  it("S1 · da de alta un documento legal y el servidor le asigna la versión", async () => {
    await conUsuario(emailAdmin, async () => {
      const res = await crear(legal("docarq-legal-1"))
      expect(res.status).toBe(201)
      const fila = await cuerpoJson<Record<string, unknown>>(res)
      expect(fila.version).toBe(1)
      expect(fila.naturaleza).toBe("legal")
      expect(fila.comunidadId).toBe(comunidadA)

      // Una segunda acta del MISMO tipo sube la versión: append-only, sin pisar.
      const res2 = await crear(
        legal("docarq-legal-2", { glosa: "Acta de asamblea extraordinaria 2026" })
      )
      expect(res2.status).toBe(201)
      expect((await cuerpoJson<Record<string, unknown>>(res2)).version).toBe(2)
    })
  })

  it("S1 · la versión no la manda el cliente", async () => {
    await conUsuario(emailAdmin, async () => {
      const res = await crear(
        legal("docarq-legal-version-cliente", { version: 99, tipoDocumental: "actas-comite" })
      )
      expect(res.status).toBe(201)
      expect((await cuerpoJson<Record<string, unknown>>(res)).version).toBe(1)
    })
  })

  it("S2 · un documento legal no se borra (409) y la fila sigue en la base", async () => {
    await conUsuario(emailAdmin, async () => {
      const res = await borrar("docarq-legal-1")
      expect(res.status).toBe(409)
      const cuerpo = await cuerpoJson<{ error?: string }>(res)
      expect(cuerpo.error).toMatch(/inmutable/)

      const fila = await prisma.documento.findUnique({ where: { id: "docarq-legal-1" } })
      expect(fila).not.toBeNull()
      expect(fila?.glosa).toBe("Acta de asamblea ordinaria 2026")
    })
  })

  it("S2 · un documento legal no se edita (409) ni se sobrescribe por POST", async () => {
    await conUsuario(emailAdmin, async () => {
      const res = await editar("docarq-legal-1", { glosa: "glosa cambiada" })
      expect(res.status).toBe(409)

      const replay = await crear(legal("docarq-legal-1", { glosa: "glosa cambiada" }))
      expect(replay.status).toBe(409)

      const fila = await prisma.documento.findUnique({ where: { id: "docarq-legal-1" } })
      expect(fila?.glosa).toBe("Acta de asamblea ordinaria 2026")
    })
  })

  it("S3 · un documento legal sin referencia auténtica se rechaza (400)", async () => {
    await conUsuario(emailAdmin, async () => {
      const body = legal("docarq-legal-sin-ref")
      delete body.referenciaAutentica
      const res = await crear(body)
      expect(res.status).toBe(400)
      const cuerpo = await cuerpoJson<{ error?: string; campo?: string }>(res)
      expect(cuerpo.error).toMatch(/referencia auténtica/i)
      expect(cuerpo.campo).toBe("referenciaAutentica")

      const fila = await prisma.documento.findUnique({ where: { id: "docarq-legal-sin-ref" } })
      expect(fila).toBeNull()
    })
  })

  it("S4 · un documento comunitario se reemplaza y se borra", async () => {
    await conUsuario(emailAdmin, async () => {
      const alta = await crear(comunitario("docarq-com-1"))
      expect(alta.status).toBe(201)
      expect((await cuerpoJson<Record<string, unknown>>(alta)).version).toBe(1)

      const res = await editar("docarq-com-1", { glosa: "Circular de fachada (corregida)" })
      expect(res.status).toBe(200)
      const fila = await prisma.documento.findUnique({ where: { id: "docarq-com-1" } })
      expect(fila?.glosa).toBe("Circular de fachada (corregida)")
      expect(fila?.version).toBe(1)

      const baja = await borrar("docarq-com-1")
      expect(baja.status).toBe(200)
      expect(await prisma.documento.findUnique({ where: { id: "docarq-com-1" } })).toBeNull()
    })
  })

  it("S5 · el tipo documental es una lista cerrada", async () => {
    await conUsuario(emailAdmin, async () => {
      const res = await crear(legal("docarq-tipo-inventado", { tipoDocumental: "acta-suelta" }))
      expect(res.status).toBe(400)
      expect(await prisma.documento.findUnique({ where: { id: "docarq-tipo-inventado" } })).toBeNull()
    })
  })

  it("S6 · el archivo es una referencia: se rechaza una data-URL (D1)", async () => {
    await conUsuario(emailAdmin, async () => {
      const res = await crear(
        legal("docarq-legal-base64", { archivoUrl: "data:application/pdf;base64,JVBERi0xLjQK" })
      )
      expect(res.status).toBe(400)
      expect(await prisma.documento.findUnique({ where: { id: "docarq-legal-base64" } })).toBeNull()
    })
  })

  it("S1 · el residente lee el archivo pero no lo administra", async () => {
    await conUsuario(emailResidente, async () => {
      const lista = await listar()
      expect(lista.status).toBe(200)
      const { data } = await cuerpoJson<{ data: Array<Record<string, unknown>> }>(lista)
      expect(data.length).toBeGreaterThan(0)
      expect(data.every((fila) => fila.comunidadId === comunidadA)).toBe(true)

      const alta = await crear(comunitario("docarq-com-residente"))
      expect(alta.status).toBe(403)
      const baja = await borrar("docarq-legal-1")
      expect(baja.status).toBe(403)
    })
  })

  it("S1 · mantención no tiene el archivo; el comité sí lo sube", async () => {
    await conUsuario(emailMantencion, async () => {
      expect((await listar()).status).toBe(403)
    })
    await conUsuario(emailComite, async () => {
      const res = await crear(
        comunitario("docarq-com-comite", { tipoDocumental: "actas-comite", glosa: "Acta de comité de abril" })
      )
      expect(res.status).toBe(201)
    })
  })

  it("S1 · el alcance por comunidad corta la lectura y la escritura ajenas", async () => {
    await prisma.documento.create({
      data: { ...comunitario("docarq-ajeno"), comunidadId: comunidadB, version: 1 } as never,
    })
    await conUsuario(emailAdmin, async () => {
      const res = await invocarApi(rutaItem, "GET", "documentos/docarq-ajeno", {
        params: { id: "docarq-ajeno" },
      })
      expect(res.status).toBe(404)

      const resEdit = await editar("docarq-ajeno", { glosa: "no debería" })
      expect(resEdit.status).toBe(404)
    })
  })

  it("T11 · abrir el documento emite AD_DOC_APERTURA (categoría AD) con la referencia", async () => {
    await conUsuario(emailAdmin, async () => {
      const alta = await crear(
        comunitario("docarq-apertura", { glosa: "Circular de fachada para la apertura" })
      )
      expect(alta.status).toBe(201)

      const res = await verDetalle("docarq-apertura")
      expect(res.status).toBe(200)
      // Preservar: auditar la apertura no cambia lo que la ruta devuelve.
      expect((await cuerpoJson<{ glosa: string }>(res)).glosa).toBe(
        "Circular de fachada para la apertura"
      )

      const eventos = await prisma.eventoAuditoria.findMany({
        where: { comunidadId: comunidadA, tipoAccion: "AD_DOC_APERTURA" },
      })
      expect(eventos).toHaveLength(1)
      const evento = eventos[0]!
      expect(evento.categoria).toBe("AD")
      expect(evento.referenciaId).toBe("docarq-apertura")
      expect(evento.usuario).toBe("docarq-user-admin")
      expect(evento.descripcion).toContain("Circular de fachada para la apertura")
      expect(evento.descripcion).toContain("circular-fachada.pdf")

      // La apertura es un evento nuevo de AD: no reescribe el nombre histórico de CO.
      const co = await prisma.eventoAuditoria.count({
        where: { comunidadId: comunidadA, tipoAccion: "CO_DOC_DOWNLOAD" },
      })
      expect(co).toBe(0)
    })
  })

  it("T11 · listar el archivo no audita una apertura", async () => {
    await conUsuario(emailAdmin, async () => {
      expect((await listar()).status).toBe(200)
      expect(await contarAperturas()).toBe(1)
    })
  })

  it("T11 · un 403 y un 404 no dejan evento de apertura", async () => {
    await conUsuario(emailMantencion, async () => {
      expect((await verDetalle("docarq-apertura")).status).toBe(403)
    })
    await conUsuario(emailAdmin, async () => {
      expect((await verDetalle("docarq-no-existe")).status).toBe(404)
      expect(await contarAperturas()).toBe(1)
    })
  })
})
