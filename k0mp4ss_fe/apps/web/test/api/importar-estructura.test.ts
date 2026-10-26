/**
 * @vitest-environment node
 *
 * Importador CSV del bloque estructura (ODD carga-inicial-csv U1):
 * `POST /api/importar/estructura` y `GET /api/importar/estructura/plantilla`.
 *
 * Usa Prisma real contra la base descartable y cookies de sesión Auth.js
 * mintadas (mismo patrón que `pe-unidades-operacion`). Toda la data creada
 * lleva el prefijo `imp-u1-` y la limpieza queda acotada a esos ids.
 *
 * Contratos cubiertos:
 *   - import válido crea macro/micro sectores y unidades
 *   - segunda corrida idéntica no duplica (acción "sin-cambios")
 *   - fila con `tipo_unidad` inexistente: error con línea y columna, y esa fila
 *     no se escribe (las válidas sí)
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

const COMUNIDAD = "imp-u1-comunidad"

const CUENTAS = {
  residente: { id: "imp-u1-user-residente", email: "imp-u1-residente@test.cl", rol: "residente" },
  administrador: { id: "imp-u1-user-admin", email: "imp-u1-admin@test.cl", rol: "administrador" },
} as const

const cookies: Record<keyof typeof CUENTAS, string> = {
  residente: "",
  administrador: "",
}

const ENCABEZADOS =
  "macro_sector,micro_sector,rol_sii,numero,etiqueta,tipo_unidad,metraje,prorrateo,estado_ocupacion"

const CSV_VALIDO = [
  ENCABEZADOS,
  "Torre A,Piso 1,imp-u1-111,1101,Depto,Depto Tipo A,55.5,0.0125,Vacante",
  "Torre A,Piso 1,imp-u1-112,1102,Depto,Depto Tipo A,55.5,0.0125,En Uso",
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

// La limpieza va al cierre del archivo: los tests de la plantilla corren
// después del describe del POST y necesitan los datos sembrados.
afterAll(async () => {
  state.cookie = ""
  try {
    await prisma.unidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.microSector.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.macroSector.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.tipoUnidad.deleteMany({ where: { id: "imp-u1-tipo-a" } })
    await prisma.estadoOcupacion.deleteMany({
      where: { comunidadId: COMUNIDAD, id: { startsWith: "imp-u1-estado-" } },
    })
    const ids = Object.values(CUENTAS).map((c) => c.id)
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } })
    await prisma.comunidad.deleteMany({ where: { id: COMUNIDAD } })
  } catch {
    // intencional: limpieza best-effort
  }
})

describe("POST /api/importar/estructura — carga inicial por CSV (U1)", () => {
  let POST: (req: Request) => Promise<Response>
  let plantillaGET: () => Promise<Response>

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "Comunidad Import U1", slug: COMUNIDAD },
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

    // Maestros de la comunidad: el importador no los inventa, los resuelve por nombre.
    await prisma.tipoUnidad.create({
      data: {
        id: "imp-u1-tipo-a",
        comunidadId: COMUNIDAD,
        nombre: "Depto Tipo A",
        categoria: "Depto",
        metraje: 55.5,
        montoBaseGc: 45000,
        activo: true,
        historialTarifas: [],
      },
    })
    for (const [id, nombre] of [
      ["imp-u1-estado-vacante", "Vacante"],
      ["imp-u1-estado-en-uso", "En Uso"],
    ] as const) {
      await prisma.estadoOcupacion.create({
        data: { id, comunidadId: COMUNIDAD, nombre, color: "bg-emerald-500 text-white" },
      })
    }

    const ruta = await import("@/app/api/importar/estructura/route")
    POST = ruta.POST
    const plantilla = await import("@/app/api/importar/estructura/plantilla/route")
    plantillaGET = plantilla.GET
  }, 30_000)

  function pedir(
    rol: keyof typeof CUENTAS | "sin-sesion",
    cuerpo: string,
    query = ""
  ): Promise<Response> {
    state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
    return POST(
      new NextRequest(`http://localhost/api/importar/estructura${query}`, {
        method: "POST",
        body: cuerpo,
        headers: state.cookie
          ? { "content-type": "text/csv", cookie: state.cookie }
          : { "content-type": "text/csv" },
      })
    )
  }

  async function contar(): Promise<{ unidades: number; macros: number; micros: number }> {
    const [unidades, macros, micros] = await Promise.all([
      prisma.unidad.count({ where: { comunidadId: COMUNIDAD } }),
      prisma.macroSector.count({ where: { comunidadId: COMUNIDAD } }),
      prisma.microSector.count({ where: { comunidadId: COMUNIDAD } }),
    ])
    return { unidades, macros, micros }
  }

  it("import válido crea sectores y unidades, y resuelve los maestros por nombre", async () => {
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

    // Sectores creados y reusados por nombre (1 macro, 1 micro compartido).
    const macro = await prisma.macroSector.findFirst({
      where: { comunidadId: COMUNIDAD, nombre: "Torre A" },
    })
    const micro = await prisma.microSector.findFirst({
      where: { comunidadId: COMUNIDAD, nombre: "Piso 1" },
    })
    expect(macro).not.toBeNull()
    expect(micro!.macroSectorId).toBe(macro!.id)

    const unidad = await prisma.unidad.findFirst({
      where: { comunidadId: COMUNIDAD, rolSii: "imp-u1-111" },
    })
    expect(unidad!.numero).toBe("1101")
    expect(unidad!.etiqueta).toBe("Depto")
    expect(unidad!.microSectorId).toBe(micro!.id)
    expect(unidad!.tipoUnidadId).toBe("imp-u1-tipo-a")
    // La fila 2 del CSV trae «En Uso»: el maestro se resolvió por nombre.
    const unidadEnUso = await prisma.unidad.findFirst({
      where: { comunidadId: COMUNIDAD, rolSii: "imp-u1-112" },
    })
    expect(unidadEnUso!.estadoId).toBe("imp-u1-estado-en-uso")
    expect(unidad!.metraje).toBeCloseTo(55.5)
    expect(unidad!.prorrateo).toBeCloseTo(0.0125)
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
    expect(await contar()).toEqual(antes)
  })

  it("un cambio de datos sobre la misma unidad reporta actualizar", async () => {
    const csv = CSV_VALIDO.replace("imp-u1-111,1101,Depto,Depto Tipo A,55.5", "imp-u1-111,1101,Depto,Depto Tipo A,60")
    const res = await pedir("administrador", csv)
    const j = (await res.json()) as Reporte

    expect(j.filas[0]!.accion).toBe("actualizar")
    expect(j.resumen.actualizar).toBe(1)
    const unidad = await prisma.unidad.findFirst({
      where: { comunidadId: COMUNIDAD, rolSii: "imp-u1-111" },
    })
    expect(unidad!.metraje).toBeCloseTo(60)
  })

  it("fila con tipo_unidad inexistente: error con línea y columna, y esa fila no se escribe", async () => {
    const antes = await contar()
    const csv = [
      ENCABEZADOS,
      "Torre B,Piso 2,imp-u1-201,1201,Depto,Depto Tipo A,50,0.01,Vacante",
      "Torre B,Piso 2,imp-u1-202,1202,Depto,Tipo Fantasma,50,0.01,Vacante",
    ].join("\n")

    const res = await pedir("administrador", csv)
    expect(res.status).toBe(200)
    const j = (await res.json()) as Reporte

    expect(j.resumen.conError).toBe(1)
    expect(j.filas[1]!.errores.length).toBeGreaterThan(0)
    expect(j.filas[1]!.errores[0]).toMatch(/tipo_unidad/)
    expect(j.filas[1]!.errores[0]).toMatch(/línea 3/)
    expect(j.filas[1]!.errores[0]).toMatch(/Tipo Fantasma/)

    // La fila válida sí se aplicó; la inválida no escribió nada.
    expect(await prisma.unidad.count({ where: { rolSii: "imp-u1-201" } })).toBe(1)
    expect(await prisma.unidad.count({ where: { rolSii: "imp-u1-202" } })).toBe(0)
    expect((await contar()).unidades).toBe(antes.unidades + 1)
  })

  it("dryRun devuelve la vista previa y no escribe nada", async () => {
    const antes = await contar()
    // Filas nuevas: el dryRun corre después de los imports ya aplicados, así
    // que usaría unidades existentes y reportaría sin-cambios.
    const csv = [
      ENCABEZADOS,
      "Torre C,Piso 3,imp-u1-301,1301,Depto,Depto Tipo A,55.5,0.0125,Vacante",
      "Torre C,Piso 3,imp-u1-302,1302,Depto,Depto Tipo A,55.5,0.0125,En Uso",
    ].join("\n")
    const res = await pedir("administrador", csv, "?dryRun=1")
    const j = (await res.json()) as Reporte

    expect(j.resumen.crear).toBe(2)
    expect(j.filas.every((f) => f.accion === "crear")).toBe(true)
    expect(await contar()).toEqual(antes)
  })

  it("un archivo con encabezados equivocados responde 400 con el mensaje del parser", async () => {
    const res = await pedir("administrador", "nombre,telefono\nx,1")
    expect(res.status).toBe(400)
    const j = (await res.json()) as { error: string }
    expect(j.error).toMatch(/rol_sii/)
  })

  it("residente recibe 403 y sin sesión 401", async () => {
    expect((await pedir("residente", CSV_VALIDO)).status).toBe(403)
    expect((await pedir("sin-sesion", CSV_VALIDO)).status).toBe(401)
  })

  it("acepta multipart/form-data con el campo «archivo»", async () => {
    const csv = [
      ENCABEZADOS,
      "Torre D,Piso 4,imp-u1-401,1401,Depto,Depto Tipo A,55.5,0.0125,Vacante",
      "Torre D,Piso 4,imp-u1-402,1402,Depto,Depto Tipo A,55.5,0.0125,En Uso",
    ].join("\n")
    const form = new FormData()
    form.append("archivo", new Blob([csv], { type: "text/csv" }), "estructura.csv")
    state.cookie = cookies.administrador!
    const res = await POST(
      new NextRequest("http://localhost/api/importar/estructura", {
        method: "POST",
        body: form,
        headers: { cookie: state.cookie },
      })
    )
    expect(res.status).toBe(200)
    const j = (await res.json()) as Reporte
    expect(j.resumen.crear).toBe(2)
  })
})

describe("GET /api/importar/estructura/plantilla — plantilla descargable (S1)", () => {
  let GET: (req: Request) => Promise<Response>

  function pedir(rol: keyof typeof CUENTAS | "sin-sesion"): Promise<Response> {
    state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
    return GET(
      new NextRequest("http://localhost/api/importar/estructura/plantilla", {
        headers: state.cookie ? { cookie: state.cookie } : {},
      })
    )
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    const plantilla = await import("@/app/api/importar/estructura/plantilla/route")
    GET = plantilla.GET
  })

  it("devuelve text/csv con los encabezados canónicos y una fila de ejemplo", async () => {
    const res = await pedir("administrador")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/csv")
    expect(res.headers.get("content-disposition")).toContain("plantilla-estructura.csv")

    const cuerpo = await res.text()
    const lineas = cuerpo.replace(/\r/g, "").split("\n").filter((l) => l !== "")
    expect(lineas).toHaveLength(2)
    expect(lineas[0]).toBe(
      "macro_sector,micro_sector,rol_sii,numero,etiqueta,tipo_unidad,metraje,prorrateo,estado_ocupacion"
    )
    // La fila de ejemplo trae valores en todas las columnas (nada vacío).
    expect(lineas[1]!.split(",").every((c) => c.length > 0)).toBe(true)
  })

  it("la misma authz que el import: residente 403, sin sesión 401", async () => {
    expect((await pedir("residente")).status).toBe(403)
    expect((await pedir("sin-sesion")).status).toBe(401)
  })
})
