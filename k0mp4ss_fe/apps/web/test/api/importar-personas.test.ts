/**
 * @vitest-environment node
 *
 * Importador CSV del bloque personas (ODD carga-inicial-csv U2):
 * `POST /api/importar/personas` y `GET /api/importar/personas/plantilla`.
 *
 * Usa Prisma real contra la base descartable y cookies de sesión Auth.js
 * mintadas, mismo patrón que importar-estructura.test.ts (U1). Toda la data
 * creada lleva el prefijo `imp-u2-per-` y la limpieza queda acotada a eso.
 *
 * Contratos cubiertos:
 *   - import válido crea personas (nombreCompleto derivado, roles parseados)
 *   - segunda corrida idéntica no duplica y reporta "sin-cambios"
 *   - fila con RUT inválido: error con línea y columna, y esa fila no se escribe
 *   - `?dryRun=1` no escribe nada
 *   - residente → 403, sin sesión → 401
 *   - la plantilla trae los encabezados canónicos y exige la misma authz
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
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

const COMUNIDAD = "imp-u2-per-comunidad"

const CUENTAS = {
  residente: { id: "imp-u2-per-user-residente", email: "imp-u2-per-residente@test.cl", rol: "residente" },
  administrador: { id: "imp-u2-per-user-admin", email: "imp-u2-per-admin@test.cl", rol: "administrador" },
} as const

const cookies: Record<keyof typeof CUENTAS, string> = {
  residente: "",
  administrador: "",
}

const CSV_VALIDO = [
  "rut,nombres,apellidos,email,telefono,roles",
  "12.345.678-5,María,Rojas Soto,maria.rojas@test.cl,+56 9 6123 4567,residente",
  "13.987.123-5,Juan,Pérez Díaz,juan.perez@test.cl,+56 9 8765 4321,propietario|directiva",
].join("\n")

interface ReporteFila {
  linea: number
  accion: "crear" | "actualizar" | "sin-cambios"
  errores: string[]
}
interface Reporte {
  filas: ReporteFila[]
  resumen: {
    total: number
    validas: number
    conError: number
    crear: number
    actualizar: number
    sinCambios: number
  }
}

afterAll(async () => {
  state.cookie = ""
  try {
    await prisma.persona.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
    const ids = Object.values(CUENTAS).map((c) => c.id)
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } })
    await prisma.comunidad.deleteMany({ where: { id: COMUNIDAD } })
  } catch {
    // intencional: limpieza best-effort
  }
})

describe("POST /api/importar/personas — carga inicial del padrón (U2)", () => {
  let POST: (req: Request) => Promise<Response>
  let plantillaGET: () => Promise<Response>

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "Comunidad Import U2 Personas", slug: COMUNIDAD },
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
        data: { usuarioId: cuenta.id, comunidadId: COMUNIDAD, rol: cuenta.rol },
      })
      cookies[clave as keyof typeof CUENTAS] = await cookieSesionAuthjs({
        sub: cuenta.id,
        email: cuenta.email,
      })
    }

    const ruta = await import("@/app/api/importar/personas/route")
    POST = ruta.POST
    const plantilla = await import("@/app/api/importar/personas/plantilla/route")
    plantillaGET = plantilla.GET
  }, 30_000)

  function pedir(
    rol: keyof typeof CUENTAS | "sin-sesion",
    cuerpo: string,
    query = ""
  ): Promise<Response> {
    state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
    return POST(
      new NextRequest(`http://localhost/api/importar/personas${query}`, {
        method: "POST",
        body: cuerpo,
        headers: state.cookie
          ? { "content-type": "text/csv", cookie: state.cookie }
          : { "content-type": "text/csv" },
      })
    )
  }

  async function contar(): Promise<number> {
    return prisma.persona.count({ where: { comunidadId: COMUNIDAD } })
  }

  it("import válido crea personas con nombreCompleto y roles parseados", async () => {
    const res = await pedir("administrador", CSV_VALIDO)
    expect(res.status).toBe(200)
    const j = (await res.json()) as Reporte

    expect(j.resumen).toEqual({
      total: 2,
      validas: 2,
      conError: 0,
      crear: 2,
      actualizar: 0,
      sinCambios: 0,
    })
    expect(j.filas.map((f) => f.accion)).toEqual(["crear", "crear"])

    const maria = await prisma.persona.findFirst({
      where: { comunidadId: COMUNIDAD, email: "maria.rojas@test.cl" },
    })
    expect(maria!.nombres).toBe("María")
    expect(maria!.apellidos).toBe("Rojas Soto")
    expect(maria!.nombreCompleto).toBe("María Rojas Soto")
    expect(maria!.rut).toBe("12.345.678-5")
    expect(maria!.telefonoMovil).toBe("+56 9 6123 4567")
    expect(maria!.estadoCuenta).toBe("activa")
    expect(maria!.roles).toEqual(["residente"])

    const juan = await prisma.persona.findFirst({
      where: { comunidadId: COMUNIDAD, email: "juan.perez@test.cl" },
    })
    expect(juan!.nombreCompleto).toBe("Juan Pérez Díaz")
    expect(juan!.roles).toEqual(["propietario", "directiva"])
  })

  it("segunda corrida idéntica no duplica y reporta sin-cambios", async () => {
    const antes = await contar()
    const res = await pedir("administrador", CSV_VALIDO)
    const j = (await res.json()) as Reporte

    expect(j.resumen.crear).toBe(0)
    expect(j.resumen.sinCambios).toBe(2)
    expect(j.filas.every((f) => f.accion === "sin-cambios" && f.errores.length === 0)).toBe(
      true
    )
    expect(await contar()).toBe(antes)
  })

  it("un cambio de datos sobre el mismo RUT reporta actualizar", async () => {
    const csv = CSV_VALIDO.replace("+56 9 6123 4567", "+56 9 5555 5555")
    const res = await pedir("administrador", csv)
    const j = (await res.json()) as Reporte

    expect(j.filas[0]!.accion).toBe("actualizar")
    const maria = await prisma.persona.findFirst({
      where: { comunidadId: COMUNIDAD, email: "maria.rojas@test.cl" },
    })
    expect(maria!.telefonoMovil).toBe("+56 9 5555 5555")
  })

  it("fila con RUT inválido: error con línea y columna, y esa fila no se escribe", async () => {
    const antes = await contar()
    const csv = [
      "rut,nombres,apellidos,email,telefono,roles",
      // 14.222.333-3 es válido (DV módulo 11 = 3): la fila debe escribirse.
      "14.222.333-3,Luis,Torres,luis.torres@test.cl,+56 9 1111 1111,residente",
      // DV incorrecto: el dígito verificador módulo 11 de 99.999.999 es 9.
      "99.999.999-8,Ana,Falsa,ana.falsa@test.cl,+56 9 2222 2222,residente",
    ].join("\n")

    const res = await pedir("administrador", csv)
    expect(res.status).toBe(200)
    const j = (await res.json()) as Reporte

    expect(j.resumen.conError).toBe(1)
    expect(j.filas[1]!.errores.length).toBeGreaterThan(0)
    expect(j.filas[1]!.errores[0]).toMatch(/rut/)
    expect(j.filas[1]!.errores[0]).toMatch(/línea 3/)

    // La fila válida sí se aplicó; la inválida no escribió nada.
    expect(await prisma.persona.count({ where: { email: "luis.torres@test.cl" } })).toBe(1)
    expect(await prisma.persona.count({ where: { email: "ana.falsa@test.cl" } })).toBe(0)
    expect(await contar()).toBe(antes + 1)
  })

  it("fila con un rol inexistente es error de esa línea", async () => {
    const csv = [
      "rut,nombres,apellidos,email,telefono,roles",
      "15.222.333-1,Sofía,Vera,sofia.vera@test.cl,+56 9 3333 3333,jefa de casa",
    ].join("\n")

    const res = await pedir("administrador", csv)
    const j = (await res.json()) as Reporte

    expect(j.resumen.conError).toBe(1)
    expect(j.filas[0]!.errores[0]).toMatch(/roles/)
    expect(j.filas[0]!.errores[0]).toMatch(/jefa de casa/)

    expect(await prisma.persona.count({ where: { email: "sofia.vera@test.cl" } })).toBe(0)
  })

  it("dryRun devuelve la vista previa y no escribe nada", async () => {
    const antes = await contar()
    const csv = [
      "rut,nombres,apellidos,email,telefono,roles",
      "16.222.333-K,Elena,Guzmán,elena.guzman@test.cl,+56 9 4444 4444,residente",
    ].join("\n")
    const res = await pedir("administrador", csv, "?dryRun=1")

    const j = (await res.json()) as Reporte

    expect(j.resumen.crear).toBe(1)
    expect(j.filas.every((f) => f.accion === "crear")).toBe(true)
    expect(await contar()).toBe(antes)
    expect(await prisma.persona.count({ where: { email: "elena.guzman@test.cl" } })).toBe(0)
  })

  it("un archivo con encabezados equivocados responde 400 con el mensaje del parser", async () => {
    const res = await pedir("administrador", "nombre,telefono\nx,1")
    expect(res.status).toBe(400)
    const j = (await res.json()) as { error: string }
    expect(j.error).toMatch(/rut/)
  })

  it("residente recibe 403 y sin sesión 401", async () => {
    expect((await pedir("residente", CSV_VALIDO)).status).toBe(403)
    expect((await pedir("sin-sesion", CSV_VALIDO)).status).toBe(401)
  })

  it("acepta un archivo separado con punto y coma (Excel español)", async () => {
    const csv = [
      "rut;nombres;apellidos;email;telefono;roles",
      "17.222.333-8;Pedro;Núñez;pedro.nunez@test.cl;+56 9 6666 6666;residente",
    ].join("\n")
    const res = await pedir("administrador", csv)
    expect(res.status).toBe(200)
    const j = (await res.json()) as Reporte
    expect(j.resumen.crear).toBe(1)
    expect(
      await prisma.persona.count({ where: { email: "pedro.nunez@test.cl" } })
    ).toBe(1)
  })

  it("acepta multipart/form-data con el campo «archivo»", async () => {
    const form = new FormData()
    form.append("archivo", new Blob([CSV_VALIDO], { type: "text/csv" }), "personas.csv")
    state.cookie = cookies.administrador!
    const res = await POST(
      new NextRequest("http://localhost/api/importar/personas", {
        method: "POST",
        body: form,
        headers: { cookie: state.cookie },
      })
    )
    expect(res.status).toBe(200)
    const j = (await res.json()) as Reporte
    // María fue actualizada por la prueba anterior (teléfono distinto del
    // CSV válido original): aquí queda actualizar + sin-cambios, sin crear.
    expect(j.resumen.crear).toBe(0)
    expect(j.resumen.conError).toBe(0)
    expect(j.resumen.actualizar).toBe(1)
    expect(j.resumen.sinCambios).toBe(1)
  })
})

describe("GET /api/importar/personas/plantilla — plantilla descargable (S1)", () => {
  let GET: (req: Request) => Promise<Response>

  function pedir(rol: keyof typeof CUENTAS | "sin-sesion"): Promise<Response> {
    state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
    return GET(
      new NextRequest("http://localhost/api/importar/personas/plantilla", {
        headers: state.cookie ? { cookie: state.cookie } : {},
      })
    )
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    const plantilla = await import("@/app/api/importar/personas/plantilla/route")
    GET = plantilla.GET
  })

  it("devuelve text/csv con los encabezados canónicos y una fila de ejemplo", async () => {
    const res = await pedir("administrador")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/csv")
    expect(res.headers.get("content-disposition")).toContain("plantilla-personas.csv")

    const cuerpo = await res.text()
    const lineas = cuerpo.replace(/\r/g, "").split("\n").filter((l) => l !== "")
    expect(lineas).toHaveLength(2)
    expect(lineas[0]).toBe("rut,nombres,apellidos,email,telefono,roles")
    // La fila de ejemplo trae valores en todas las columnas (nada vacío).
    expect(lineas[1]!.split(",").every((c) => c.length > 0)).toBe(true)
  })

  it("la fila de ejemplo pasa el validador de filas del importador", async () => {
    const { ENCABEZADOS_PERSONAS, FILA_EJEMPLO_PERSONAS, validarFilasPersonas } =
      await import("@/lib/importar/personas")

    // La fila de ejemplo, serializada y releída por el parser, valida limpio:
    // así la plantilla nunca enseña una fila que el import no acepta.
    const { parsearCsv } = await import("@/lib/importar/csv")
    const ejemplo = ENCABEZADOS_PERSONAS.map((h) => FILA_EJEMPLO_PERSONAS[h])
    const primera = ENCABEZADOS_PERSONAS.join(",")
    const filas = parsearCsv(`${primera}\n${ejemplo.join(",")}`, {
      encabezadosEsperados: ENCABEZADOS_PERSONAS,
    }).filas
    expect(filas).toHaveLength(1)

    const validadas = validarFilasPersonas(filas)
    expect(validadas[0]!.errores).toEqual([])
    expect(validadas[0]!.datos).not.toBeNull()
  })

  it("la misma authz que el import: residente 403, sin sesión 401", async () => {
    expect((await pedir("residente")).status).toBe(403)
    expect((await pedir("sin-sesion")).status).toBe(401)
  })
})
