/**
 * @vitest-environment node
 *
 * Importador CSV del bloque vínculos (ODD carga-inicial-csv U2):
 * `POST /api/importar/vinculos` y `GET /api/importar/vinculos/plantilla`.
 *
 * Usa Prisma real contra la base descartable y cookies de sesión Auth.js
 * mintadas, mismo patrón que importar-estructura.test.ts (U1). Toda la data
 * creada lleva el prefijo `imp-u2-vin-`. La estructura (sectores + unidades)
 * se siembra con el propio importador de U1, porque el vínculo necesita la
 * unidad ya existente.
 *
 * Contratos cubiertos:
 *   - import válido crea vínculos (reusando las reglas de /api/vinculos)
 *   - segunda corrida idéntica no duplica y reporta "sin-cambios"
 *   - fila con persona/unidad inexistentes: error con línea, columna y el
 *     dato que falta (RUT o Rol SII); esa fila no se escribe
 *   - reglas de rol del módulo: exclusividad de propietario reporta error de fila
 *   - `?dryRun=1` no escribe nada
 *   - residente → 403, sin sesión → 401
 *   - la plantilla trae los encabezados canónicos y exige la misma authz
 *   - subir la plantilla tal cual: las filas de ejemplo se rechazan con su
 *     error legible y nada se escribe
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { parsearCsv } from "@/lib/importar/csv"

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

const COMUNIDAD = "imp-u2-vin-comunidad"

const CUENTAS = {
  residente: { id: "imp-u2-vin-user-residente", email: "imp-u2-vin-residente@test.cl", rol: "residente" },
  administrador: { id: "imp-u2-vin-user-admin", email: "imp-u2-vin-admin@test.cl", rol: "administrador" },
} as const

const cookies: Record<keyof typeof CUENTAS, string> = {
  residente: "",
  administrador: "",
}

// Unidades de la comunidad, sembradas con el importador de estructura (U1).
const ROL_SII_A = "imp-u2-vin-1101"
const ROL_SII_B = "imp-u2-vin-1102"

const CSV_ESTRUCTURA = [
  "macro_sector,micro_sector,rol_sii,numero,etiqueta,tipo_unidad,metraje,prorrateo,estado_ocupacion",
  `Torre A,Piso 1,${ROL_SII_A},1101,Depto,Depto Tipo A,55.5,0.0125,Vacante`,
  `Torre A,Piso 1,${ROL_SII_B},1102,Depto,Depto Tipo A,55.5,0.0125,En Uso`,
].join("\n")

// Personas del padrón, sembradas directo con Prisma (el import de personas
// es otro endpoint y acá el universo bajo prueba es el de los vínculos).
const RUT_MARIA = "12.345.678-5"
const RUT_JUAN = "13.987.123-5"

const CSV_VALIDO = [
  "rut_persona,rol_sii_unidad,rol,fecha_inicio,permite_ver_finanzas",
  `${RUT_MARIA},${ROL_SII_A},propietario,2024-01-01,true`,
  `${RUT_JUAN},${ROL_SII_A},ocupante,2024-01-15,false`,
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
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.persona.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.unidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.microSector.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.macroSector.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.tipoUnidad.deleteMany({ where: { id: "imp-u2-vin-tipo-a" } })
    await prisma.estadoOcupacion.deleteMany({
      where: { comunidadId: COMUNIDAD, id: { startsWith: "imp-u2-vin-estado-" } },
    })
    const ids = Object.values(CUENTAS).map((c) => c.id)
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } })
    await prisma.comunidad.deleteMany({ where: { id: COMUNIDAD } })
  } catch {
    // intencional: limpieza best-effort
  }
})

describe("POST /api/importar/vinculos — vínculos persona↔unidad (U2)", () => {
  let POST: (req: Request) => Promise<Response>
  let plantillaGET: () => Promise<Response>

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "Comunidad Import U2 Vínculos", slug: COMUNIDAD },
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

    // Maestros que el importador de estructura resuelve por nombre (no los inventa).
    await prisma.tipoUnidad.create({
      data: {
        id: "imp-u2-vin-tipo-a",
        comunidadId: COMUNIDAD,
        nombre: "Depto Tipo A",
        categoria: "Depto",
        metraje: 55.5,
        montoBaseGc: 45000,
        activo: true,
        historialTarifas: [],
      },
    })
    await prisma.estadoOcupacion.create({
      data: {
        id: "imp-u2-vin-estado-vacante",
        comunidadId: COMUNIDAD,
        nombre: "Vacante",
        color: "bg-emerald-500 text-white",
      },
    })
    await prisma.estadoOcupacion.create({
      data: {
        id: "imp-u2-vin-estado-en-uso",
        comunidadId: COMUNIDAD,
        nombre: "En Uso",
        color: "bg-sky-500 text-white",
      },
    })

    // Estructura sembrada con el propio importador de U1 (función, no HTTP).
    const { importarEstructura } = await import("@/lib/importar/estructura")
    const reporte = await importarEstructura({
      prisma,
      comunidadId: COMUNIDAD,
      filas: parsearCsv(CSV_ESTRUCTURA).filas,
      dryRun: false,
    })
    expect(reporte.resumen.conError).toBe(0)

    // Padrón mínimo: dos personas activas.
    await prisma.persona.create({
      data: {
        id: "imp-u2-vin-per-maria",
        comunidadId: COMUNIDAD,
        rut: RUT_MARIA,
        nombreCompleto: "María Rojas Soto",
        nombres: "María",
        apellidos: "Rojas Soto",
        email: "maria.rojas@test.cl",
        telefonoMovil: "+56 9 6123 4567",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["residente"],
      },
    })
    await prisma.persona.create({
      data: {
        id: "imp-u2-vin-per-juan",
        comunidadId: COMUNIDAD,
        rut: RUT_JUAN,
        nombreCompleto: "Juan Pérez Díaz",
        nombres: "Juan",
        apellidos: "Pérez Díaz",
        email: "juan.perez@test.cl",
        telefonoMovil: "+56 9 8765 4321",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["propietario", "directiva"],
      },
    })

    const ruta = await import("@/app/api/importar/vinculos/route")
    POST = ruta.POST
    const plantilla = await import("@/app/api/importar/vinculos/plantilla/route")
    plantillaGET = plantilla.GET
  }, 30_000)

  function pedir(
    rol: keyof typeof CUENTAS | "sin-sesion",
    cuerpo: string,
    query = ""
  ): Promise<Response> {
    state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
    return POST(
      new NextRequest(`http://localhost/api/importar/vinculos${query}`, {
        method: "POST",
        body: cuerpo,
        headers: state.cookie
          ? { "content-type": "text/csv", cookie: state.cookie }
          : { "content-type": "text/csv" },
      })
    )
  }

  async function contar(): Promise<number> {
    return prisma.vinculoUnidad.count({ where: { comunidadId: COMUNIDAD } })
  }

  it("import válido crea vínculos con las reglas de negocio del módulo", async () => {
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

    const propietaria = await prisma.vinculoUnidad.findFirst({
      where: { comunidadId: COMUNIDAD, rol: "propietario" },
    })
    const maria = await prisma.persona.findFirst({
      where: { comunidadId: COMUNIDAD, rut: RUT_MARIA },
      select: { id: true },
    })
    const unidadA = await prisma.unidad.findFirst({
      where: { comunidadId: COMUNIDAD, rolSii: ROL_SII_A },
      select: { id: true },
    })
    expect(propietaria!.personaId).toBe(maria!.id)
    expect(propietaria!.unidadId).toBe(unidadA!.id)
    expect(propietaria!.fechaInicio).toBe("2024-01-01")
    expect(propietaria!.fechaFin).toBeNull()
    expect(propietaria!.permiteVerFinanzas).toBe(true)
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

  it("fila con unidad inexistente: error de esa línea y nombra el Rol SII que falta", async () => {
    const antes = await contar()
    const csv = [
      "rut_persona,rol_sii_unidad,rol,fecha_inicio,permite_ver_finanzas",
      `${RUT_MARIA},imp-u2-vin-999,propietario,2024-02-01,true`,
    ].join("\n")

    const res = await pedir("administrador", csv)
    const j = (await res.json()) as Reporte

    expect(j.resumen.conError).toBe(1)
    expect(j.filas[0]!.errores[0]).toMatch(/imp-u2-vin-999/)
    expect(j.filas[0]!.errores[0]).toMatch(/línea 2/)
    expect(await contar()).toBe(antes)
  })

  it("fila con RUT inexistente en el padrón: error de esa línea y nombra el RUT que falta", async () => {
    const antes = await contar()
    const csv = [
      "rut_persona,rol_sii_unidad,rol,fecha_inicio,permite_ver_finanzas",
      // 11.111.111-1 es un RUT válido (DV 1) pero no está en el padrón:
      // el error debe nombrar el RUT que falta, no invalidar el formato.
      `11.111.111-1,${ROL_SII_B},arrendatario,2024-02-01,true`,
    ].join("\n")

    const res = await pedir("administrador", csv)
    const j = (await res.json()) as Reporte

    expect(j.resumen.conError).toBe(1)
    expect(j.filas[0]!.errores[0]).toMatch(/11\.111\.111-1/)
    expect(await contar()).toBe(antes)
  })

  it("fila con rol inexistente es error de esa línea", async () => {
    const csv = [
      "rut_persona,rol_sii_unidad,rol,fecha_inicio,permite_ver_finanzas",
      `${RUT_MARIA},${ROL_SII_B},dueño,2024-02-01,true`,
    ].join("\n")

    const res = await pedir("administrador", csv)
    const j = (await res.json()) as Reporte

    expect(j.resumen.conError).toBe(1)
    expect(j.filas[0]!.errores[0]).toMatch(/rol/)
    expect(await prisma.vinculoUnidad.count({ where: { rol: "dueño" } })).toBe(0)
  })

  it("exclusividad de rol (regla de /api/vinculos): un propietario que solapa un tramo cerrado es error de fila", async () => {
    // Regla real del módulo: el helper cierra primero el tramo abierto del
    // mismo rol (cerrarAnterior), así que el 409 de exclusividad sólo aparece
    // contra un tramo YA CERRADO cuyas fechas conviven con la fila nueva.
    // Se siembra ese tramo cerrado en la unidad B (de Juan, que sigue activo).
    const unidadB = await prisma.unidad.findFirst({
      where: { comunidadId: COMUNIDAD, rolSii: ROL_SII_B },
      select: { id: true },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: "imp-u2-vin-viejo-prop",
        comunidadId: COMUNIDAD,
        personaId: "imp-u2-vin-per-juan",
        unidadId: unidadB!.id,
        rol: "propietario",
        fechaInicio: "2024-05-01",
        fechaFin: "2024-06-30",
        permiteVerFinanzas: false,
      },
    })

    // Tercera persona: el solape cruza personas.
    await prisma.persona.create({
      data: {
        id: "imp-u2-vin-per-luis",
        comunidadId: COMUNIDAD,
        rut: "14.222.333-3",
        nombreCompleto: "Luis Torres",
        nombres: "Luis",
        apellidos: "Torres",
        email: "luis.torres@test.cl",
        telefonoMovil: "+56 9 1111 1111",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["residente"],
      },
    })
    const antes = await contar()
    const csv = [
      "rut_persona,rol_sii_unidad,rol,fecha_inicio,permite_ver_finanzas",
      // Empieza dentro del tramo cerrado (2024-06-01 ≤ 2024-06-30): 409.
      `14.222.333-3,${ROL_SII_B},propietario,2024-06-01,true`,
    ].join("\n")

    const res = await pedir("administrador", csv)
    const j = (await res.json()) as Reporte

    expect(j.resumen.conError).toBe(1)
    expect(j.filas[0]!.errores[0]).toMatch(/tramo de propietario|solapa/i)
    expect(j.filas[0]!.errores[0]).toMatch(/línea 2/)
    expect(await contar()).toBe(antes)
  })

  it("dryRun devuelve la vista previa y no escribe nada", async () => {
    const antes = await contar()
    const csv = [
      "rut_persona,rol_sii_unidad,rol,fecha_inicio,permite_ver_finanzas",
      `${RUT_MARIA},${ROL_SII_B},arrendatario,2024-05-01,true`,
    ].join("\n")
    const res = await pedir("administrador", csv, "?dryRun=1")
    const j = (await res.json()) as Reporte

    expect(j.resumen.crear).toBe(1)
    expect(j.filas.every((f) => f.accion === "crear")).toBe(true)
    expect(await contar()).toBe(antes)
  })

  it("un archivo con encabezados equivocados responde 400 con el mensaje del parser", async () => {
    const res = await pedir("administrador", "nombre,telefono\nx,1")
    expect(res.status).toBe(400)
    const j = (await res.json()) as { error: string }
    expect(j.error).toMatch(/rut_persona/)
  })

  it("residente recibe 403 y sin sesión 401", async () => {
    expect((await pedir("residente", CSV_VALIDO)).status).toBe(403)
    expect((await pedir("sin-sesion", CSV_VALIDO)).status).toBe(401)
  })

  it("acepta un archivo separado con punto y coma (Excel español)", async () => {
    const csv = [
      "rut_persona;rol_sii_unidad;rol;fecha_inicio;permite_ver_finanzas",
      `${RUT_MARIA};${ROL_SII_B};ocupante;2024-06-01;true`,
    ].join("\n")
    const res = await pedir("administrador", csv)
    expect(res.status).toBe(200)
    const j = (await res.json()) as Reporte
    expect(j.resumen.crear).toBe(1)
    expect(
      await prisma.vinculoUnidad.count({
        where: { rol: "ocupante", unidadId: { not: undefined }, fechaInicio: "2024-06-01" },
      })
    ).toBe(1)
  })

  it("acepta multipart/form-data con el campo «archivo»", async () => {
    const antes = await contar()
    const form = new FormData()
    form.append("archivo", new Blob([CSV_VALIDO], { type: "text/csv" }), "vinculos.csv")
    state.cookie = cookies.administrador!
    const res = await POST(
      new NextRequest("http://localhost/api/importar/vinculos", {
        method: "POST",
        body: form,
        headers: { cookie: state.cookie },
      })
    )
    expect(res.status).toBe(200)
    const j = (await res.json()) as Reporte
    expect(j.resumen.sinCambios).toBe(2)
    expect(await contar()).toBe(antes)
  })

  it("la plantilla tal cual se rechaza fila por fila y no escribe nada", async () => {
    const antes = await contar()
    // La plantilla completa, tal como la devuelve la ruta de plantilla.
    state.cookie = cookies.administrador!
    const plantillaRes = await plantillaGET()
    const plantillaCsv = await plantillaRes.text()

    state.cookie = ""
    const res = await pedir("administrador", plantillaCsv)
    expect(res.status).toBe(200)
    const j = (await res.json()) as Reporte

    expect(j.resumen).toEqual({
      total: 3,
      validas: 0,
      conError: 3,
      crear: 0,
      actualizar: 0,
      sinCambios: 0,
    })
    for (const fila of j.filas) {
      expect(fila.accion).toBe("sin-cambios")
      expect(fila.errores).toHaveLength(1)
      expect(fila.errores[0]).toMatch(/rut_persona/)
      expect(fila.errores[0]).toContain(
        "Esta fila es del ejemplo de la plantilla: reemplazala por tus datos o borrala"
      )
    }
    expect(await contar()).toBe(antes)
  })

  it("la plantilla con las filas de ejemplo borradas y datos propios funciona", async () => {
    state.cookie = cookies.administrador!
    const plantillaRes = await plantillaGET()
    const lineas = (await plantillaRes.text()).replace(/\r/g, "").split("\n").filter(Boolean)

    state.cookie = ""
    // Luis: sin vínculo activo en la unidad B (su tramo de propietario quedó
    // cerrado); la regla del módulo no admite dos vínculos activos de la
    // misma persona en la misma unidad.
    const csv = [
      lineas[0],
      `14.222.333-3,${ROL_SII_B},copropietario,2024-09-01,false`,
    ].join("\n")
    const res = await pedir("administrador", csv)
    expect(res.status).toBe(200)
    const j = (await res.json()) as Reporte

    expect(j.resumen.conError).toBe(0)
    expect(j.resumen.crear).toBe(1)
    const vinculo = await prisma.vinculoUnidad.findFirst({
      where: { comunidadId: COMUNIDAD, rol: "copropietario", fechaInicio: "2024-09-01" },
    })
    expect(vinculo).not.toBeNull()
    expect(vinculo!.permiteVerFinanzas).toBe(false)
  })
})

describe("GET /api/importar/vinculos/plantilla — plantilla descargable (S1)", () => {
  let GET: (req: Request) => Promise<Response>

  function pedir(rol: keyof typeof CUENTAS | "sin-sesion"): Promise<Response> {
    state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
    return GET(
      new NextRequest("http://localhost/api/importar/vinculos/plantilla", {
        headers: state.cookie ? { cookie: state.cookie } : {},
      })
    )
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    const plantilla = await import("@/app/api/importar/vinculos/plantilla/route")
    GET = plantilla.GET
  })

  it("devuelve text/csv con los encabezados canónicos y tres filas de ejemplo", async () => {
    const res = await pedir("administrador")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/csv")
    expect(res.headers.get("content-disposition")).toContain("plantilla-vinculos.csv")

    const cuerpo = await res.text()
    const lineas = cuerpo.replace(/\r/g, "").split("\n").filter((l) => l !== "")
    expect(lineas).toHaveLength(4)
    expect(lineas[0]).toBe(
      "rut_persona,rol_sii_unidad,rol,fecha_inicio,permite_ver_finanzas"
    )
    // Las filas de ejemplo trae valores en todas las columnas (nada vacío).
    expect(lineas[1]!.split(",").every((c) => c.length > 0)).toBe(true)
    expect(lineas).toContain(
      "EJEMPLO-12.345.678-5,EJEMPLO-12345-1101,propietario,2024-03-01,true"
    )
    expect(lineas).toContain(
      "EJEMPLO-18.345.678-4,EJEMPLO-12345-1101,arrendatario,2024-05-01,false"
    )
    expect(lineas).toContain(
      "EJEMPLO-13.987.123-5,EJEMPLO-999-101,copropietario,2024-08-01,true"
    )
  })

  it("quitando la marca EJEMPLO-, cada fila de ejemplo pasa el validador", async () => {
    const { ENCABEZADOS_VINCULOS, FILAS_EJEMPLO_VINCULOS, validarFilasVinculos } =
      await import("@/lib/importar/personas")

    // Misma garantía que en personas: con la marca EJEMPLO- puesta nada
    // escribe, pero el formato de cada fila (fechas ISO, rol, booleano y el
    // RUT tras quitar la marca en rut_persona y rol_sii_unidad) es formato
    // que el import acepta.
    const filas = FILAS_EJEMPLO_VINCULOS.map((fila) => {
      const valores: Record<string, string> = { ...fila }
      for (const clave of ["rut_persona", "rol_sii_unidad"]) {
        if (valores[clave]?.startsWith("EJEMPLO-")) {
          valores[clave] = valores[clave]!.replace("EJEMPLO-", "")
        }
      }
      return { linea: 0, valores }
    })

    const validadas = validarFilasVinculos(filas)
    for (const fila of validadas) {
      expect(fila.errores).toEqual([])
      expect(fila.datos).not.toBeNull()
    }
  })

  it("la misma authz que el import: residente 403, sin sesión 401", async () => {
    expect((await pedir("residente")).status).toBe(403)
    expect((await pedir("sin-sesion")).status).toBe(401)
  })
})
