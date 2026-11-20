/**
 * @vitest-environment node
 *
 * Encabezado global (app-sidebar + community-header) — proyección `GET /api/comunidad-actual`.
 *
 * Los dos componentes que envuelven TODA la app leían `configuracion` del store legacy. Cablearlos
 * a la API real no era posible: `GET /api/configuracion` gatea con `cf: ver` (solo administrador y
 * comité) y ese dato queda en 403 para conserjería, residente y mantención. Esta proyección expone
 * únicamente `{ nombre, logoUrl }` — nada de SMTP, claves ni el resto de CF — a cualquier sesión
 * con comunidad válida: es lo único que la marca de la app necesita y hoy ya se lo muestra a todos
 * los roles desde el seed.
 *
 * Desde S1 (`odd/tasks/identidad-unica.md`) el nombre sale de `Comunidad.nombre` y de ningún otro
 * lado: la fila de CF del fixture guarda a propósito un nombre SEÑUELO en la columna deprecada, y
 * ninguna respuesta puede mostrarlo. `PUT` es el único camino de escritura del nombre (la pestaña
 * «Identidad Legal» lo usa): renombra la comunidad con `cf: editar`.
 *
 * Los códigos HTTP se afirman por rol, no por lectura de la matriz.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { configuracionDefault } from "@/data/admin/configuracion"

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

const COMUNIDAD = "hd-comunidad"
const COMUNIDAD_FALLBACK = "hd-comunidad-fallback"

/** La fuente única: lo que imprime la marca de la app. */
const NOMBRE_COMUNIDAD = "Comunidad Los Robles del Sol"
/** Lo que quedó en la columna deprecada de CF: no debe salir en ninguna respuesta. */
const NOMBRE_DEPRECADO_EN_CF = "Comunidad Plaza Vieja"
const LOGO = "https://cdn.example.cl/los-robles.png"
/** Si no hay fila de configuración, la marca cae al `Comunidad.nombre` en BD. */
const NOMBRE_FALLBACK = "Comunidad Solo Padron"

const CUENTAS = {
  administrador: { id: "hd-user-admin", email: "hd-admin@test.cl", rol: "administrador" },
  comite: { id: "hd-user-comite", email: "hd-comite@test.cl", rol: "comite" },
  conserjeria: { id: "hd-user-conserjeria", email: "hd-conserjeria@test.cl", rol: "conserjeria" },
  residente: { id: "hd-user-residente", email: "hd-residente@test.cl", rol: "residente" },
  mantencion: { id: "hd-user-mantencion", email: "hd-mantencion@test.cl", rol: "mantencion" },
  /** Sin fila de configuración en su comunidad: la marca cae a `Comunidad.nombre`. */
  sinConfig: { id: "hd-user-sin-config", email: "hd-sin-config@test.cl", rol: "conserjeria" },
} as const

interface RespuestaComunidad {
  data: { nombre: string; logoUrl: string | null }
}

describe("GET /api/comunidad-actual — proyección de marca para el encabezado global", () => {
  let GET: (req: Request) => Promise<Response>
  let PUT: (req: Request) => Promise<Response>
  const cookies: Record<keyof typeof CUENTAS, string> = {
    administrador: "",
    comite: "",
    conserjeria: "",
    residente: "",
    mantencion: "",
    sinConfig: "",
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD_FALLBACK },
      update: { nombre: NOMBRE_FALLBACK },
      create: { id: COMUNIDAD_FALLBACK, nombre: NOMBRE_FALLBACK, slug: COMUNIDAD_FALLBACK },
    })
    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: { nombre: NOMBRE_COMUNIDAD },
      create: { id: COMUNIDAD, nombre: NOMBRE_COMUNIDAD, slug: COMUNIDAD },
    })

    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    for (const [clave, cuenta] of Object.entries(CUENTAS)) {
      await prisma.usuario.upsert({
        where: { email: cuenta.email },
        update: {},
        create: { id: cuenta.id, email: cuenta.email, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: cuenta.id } })
      await prisma.membresia.create({
        data: {
          usuarioId: cuenta.id,
          comunidadId: clave === "sinConfig" ? COMUNIDAD_FALLBACK : COMUNIDAD,
          rol: cuenta.rol,
        },
      })
      cookies[clave as keyof typeof CUENTAS] = await cookieSesionAuthjs({
        sub: cuenta.id,
        email: cuenta.email,
      })
    }

    await prisma.configuracionGlobal.deleteMany({ where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_FALLBACK] } } })
    // La comunidad principal tiene CF con su marca; la de fallback no tiene fila de configuración.
    await prisma.configuracionGlobal.create({
      data: {
        ...configuracionDefault,
        smtpPassword: "secreto-smtp-no-exponer",
        claveEliminacionMaestro: "clave-no-exponer",
        id: "hd-cf-principal",
        comunidadId: COMUNIDAD,
        // Señuelo: la columna está deprecada y nadie debe leerla como identidad.
        nombreComunidad: NOMBRE_DEPRECADO_EN_CF,
        logoUrl: LOGO,
      },
    })

    const ruta = await import("@/app/api/comunidad-actual/route")
    GET = ruta.GET
    PUT = ruta.PUT
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    try {
      await prisma.configuracionGlobal.deleteMany({ where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_FALLBACK] } } })
      const ids = Object.values(CUENTAS).map((c) => c.id)
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } })
      await prisma.comunidad.deleteMany({ where: { id: { in: [COMUNIDAD, COMUNIDAD_FALLBACK] } } })
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function pedir(rol: keyof typeof CUENTAS | "sin-sesion"): Promise<Response> {
    state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
    return GET(new NextRequest("http://localhost/api/comunidad-actual"))
  }

  async function renombrar(
    rol: keyof typeof CUENTAS | "sin-sesion",
    cuerpo: unknown
  ): Promise<Response> {
    state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
    return PUT(
      new NextRequest("http://localhost/api/comunidad-actual", {
        method: "PUT",
        body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
        headers: { "content-type": "application/json" },
      })
    )
  }

  it("cada rol que opera la app obtiene la marca de SU comunidad", async () => {
    for (const rol of ["administrador", "comite", "conserjeria", "residente", "mantencion"] as const) {
      const res = await pedir(rol)
      expect(res.status, `rol ${rol}`).toBe(200)
      const j = (await res.json()) as RespuestaComunidad
      expect(j.data.nombre).toBe(NOMBRE_COMUNIDAD)
      expect(j.data.logoUrl).toBe(LOGO)
    }
  })

  it("el nombre sale de Comunidad.nombre: el señuelo de CF no aparece", async () => {
    const res = await pedir("administrador")
    const j = (await res.json()) as RespuestaComunidad
    expect(j.data.nombre).toBe(NOMBRE_COMUNIDAD)
    expect(JSON.stringify(j)).not.toContain(NOMBRE_DEPRECADO_EN_CF)
  })

  it("el administrador renombra la comunidad y TODOS los roles ven el nombre nuevo", async () => {
    const nuevo = "Comunidad Renombrada Desde la API"
    const res = await renombrar("administrador", { nombre: nuevo })
    expect(res.status).toBe(200)
    const cuerpo = (await res.json()) as RespuestaComunidad
    expect(cuerpo.data.nombre).toBe(nuevo)

    const enBd = await prisma.comunidad.findUnique({ where: { id: COMUNIDAD } })
    expect(enBd?.nombre).toBe(nuevo)
    // La columna deprecada no se toca al renombrar.
    const cf = await prisma.configuracionGlobal.findUnique({
      where: { comunidadId: COMUNIDAD },
    })
    expect(cf?.nombreComunidad).toBe(NOMBRE_DEPRECADO_EN_CF)

    for (const rol of ["administrador", "comite", "conserjeria", "residente", "mantencion"] as const) {
      const j = (await (await pedir(rol)).json()) as RespuestaComunidad
      expect(j.data.nombre, `rol ${rol}`).toBe(nuevo)
    }

    // Se restaura: el resto de los casos afirma NOMBRE_COMUNIDAD.
    expect((await renombrar("administrador", { nombre: NOMBRE_COMUNIDAD })).status).toBe(200)
  })

  it("comité y residente no renombran: la identidad la edita la administración", async () => {
    for (const rol of ["comite", "residente"] as const) {
      const res = await renombrar(rol, { nombre: "No debería cambiar" })
      expect(res.status, `rol ${rol}`).toBe(403)
    }
    const enBd = await prisma.comunidad.findUnique({ where: { id: COMUNIDAD } })
    expect(enBd?.nombre).toBe(NOMBRE_COMUNIDAD)
  })

  it("un nombre vacío no se escribe", async () => {
    for (const nombre of ["", "   "]) {
      const res = await renombrar("administrador", { nombre })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "El nombre de la comunidad es obligatorio."
      )
    }
    const enBd = await prisma.comunidad.findUnique({ where: { id: COMUNIDAD } })
    expect(enBd?.nombre).toBe(NOMBRE_COMUNIDAD)
  })

  it("un cuerpo que no es JSON o no trae el nombre no escribe nada", async () => {
    const invalido = await renombrar("administrador", "{no-json")
    expect(invalido.status).toBe(400)
    expect(((await invalido.json()) as { error: string }).error).toBe(
      "Cuerpo JSON inválido."
    )
    const sinNombre = await renombrar("administrador", { otro: "campo" })
    expect(sinNombre.status).toBe(400)
    expect(((await sinNombre.json()) as { error: string }).error).toBe(
      "El nombre de la comunidad es obligatorio."
    )
  })

  it("sin sesión no renombra", async () => {
    expect((await renombrar("sin-sesion", { nombre: "Comunidad Nueva" })).status).toBe(401)
    const enBd = await prisma.comunidad.findUnique({ where: { id: COMUNIDAD } })
    expect(enBd?.nombre).toBe(NOMBRE_COMUNIDAD)
  })

  it("sin sesión responde 401 antes de consultar la base", async () => {
    expect((await pedir("sin-sesion")).status).toBe(401)
  })

  it("el cuerpo no trae más claves que nombre y logoUrl: la proyección no filtra CF", async () => {
    const res = await pedir("residente")
    expect(res.status).toBe(200)
    const j = (await res.json()) as RespuestaComunidad
    expect(Object.keys(j).sort()).toEqual(["data"])
    expect(Object.keys(j.data).sort()).toEqual(["logoUrl", "nombre"])
    // El logo es una URL legítima (puede contener "http"); lo que NO puede filtrarse es CF.
    const plano = JSON.stringify(j).toLowerCase()
    expect(plano).not.toContain("smtp")
    expect(plano).not.toContain("clave")
    expect(plano).not.toContain("administradorresponsable")
    expect(plano).not.toContain("rutcomunidad")
  })

  it("sin fila de configuración la marca es Comunidad.nombre y el logo queda vacío", async () => {
    const res = await pedir("sinConfig")
    expect(res.status).toBe(200)
    const j = (await res.json()) as RespuestaComunidad
    expect(j.data.nombre).toBe(NOMBRE_FALLBACK)
    expect(j.data.logoUrl).toBeNull()
  })
})
