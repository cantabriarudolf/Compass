/**
 * @vitest-environment node
 *
 * F48 · T4/S5 — importar el historial financiero (egresos e ingresos).
 *
 * Contra la base descartable real (nada de mocks de Prisma) y con cookies de
 * sesión Auth.js mintadas, igual que `test/api/importar-estructura.test.ts`.
 * Toda la data creada lleva el prefijo `imp-f48-` y la limpieza queda acotada a
 * esos ids.
 *
 * Contratos cubiertos (odd/tasks/importar-historial-financiero.md):
 *   · S5: un archivo con 3 filas válidas y 2 inválidas devuelve 5 reportes y 0
 *     escrituras en la vista previa; importado en serio escribe 3; reimportado
 *     no duplica y lo cuenta como «actualizado»; la fila con fondo inexistente
 *     falla con el motivo literal del fondo.
 *   · S1: la importación real no corre si la vista previa no está limpia (400,
 *     reporte fila por fila en el cuerpo y nada escrito); la plantilla es
 *     descargable por código y se rechaza a sí misma.
 *   · S2: formato declarado — fechas AAAA-MM-DD no futuras, monto > 0 con punto
 *     decimal, categoría libre acotada (vacío se acepta), fondo existente.
 *   · S3: el importador no crea fondos, categorías, unidades ni personas.
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

const COMUNIDAD = "imp-f48-comunidad"
const OTRA_COMUNIDAD = "imp-f48-otra"
const FONDO_GC = "imp-f48-fondo-gc"
const FONDO_AHORRO = "imp-f48-fondo-ahorro"

const CUENTAS = {
  administrador: {
    id: "imp-f48-user-admin",
    email: "imp-f48-admin@test.cl",
    rol: "administrador",
  },
  residente: {
    id: "imp-f48-user-residente",
    email: "imp-f48-residente@test.cl",
    rol: "residente",
  },
} as const

const cookies: Record<keyof typeof CUENTAS, string> = {
  administrador: "",
  residente: "",
}

/** Encabezado canónico del formato declarado (S2): igual en los dos bloques. */
const ENCABEZADOS = "fecha,monto,descripcion,categoria,fondo"

const FILA_ASCENSOR =
  "2024-03-15,15500.50,Mantenimiento del ascensor,mantencion,Fondo Gastos Comunes"
const FILA_PORTON = "2024-04-02,32000,Reparación del portón,otro,imp-f48-fondo-ahorro"
const FILA_AGUA = "2024-05-10,8900.25,Consumo de agua,servicios,Fondo Gastos Comunes"
const FILA_FONDO_FANTASMA =
  "2024-06-01,1000,Poda trimestral,mantencion,Fondo Inexistente"
const FILA_MONTO_CERO = "2024-07-01,0,Nota de crédito,,Fondo Gastos Comunes"

/** Las 3 filas válidas del archivo de S5 (el fondo va por nombre y por id). */
const FILAS_VALIDAS = [FILA_ASCENSOR, FILA_PORTON, FILA_AGUA]
/** El archivo de S5: 3 válidas + 2 inválidas. */
const FILAS_MIXTAS = [...FILAS_VALIDAS, FILA_FONDO_FANTASMA, FILA_MONTO_CERO]

function csv(...filas: string[]): string {
  return [ENCABEZADOS, ...filas].join("\n")
}

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

/** Cuerpo de la importación bloqueada: mensaje literal + reporte en el extra. */
interface RespuestaBloqueada {
  error: string
  reporte?: Reporte
}

const RESULTADO_MIXTO = {
  total: 5,
  validas: 3,
  conError: 2,
  crear: 3,
  actualizar: 0,
  sinCambios: 0,
}

afterAll(async () => {
  state.cookie = ""
  const comunidades = [COMUNIDAD, OTRA_COMUNIDAD]
  try {
    await prisma.egresoFI.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.ingresoFI.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: comunidades } } })
    const ids = Object.values(CUENTAS).map((c) => c.id)
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } })
    await prisma.comunidad.deleteMany({ where: { id: { in: comunidades } } })
  } catch {
    // intencional: limpieza best-effort (la base descartable se recrea igual)
  }
})

let POST_EGRESOS: (req: Request) => Promise<Response>
let POST_INGRESOS: (req: Request) => Promise<Response>
let PLANTILLA_EGRESOS: () => Promise<Response>
let PLANTILLA_INGRESOS: () => Promise<Response>

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET

  for (const id of [COMUNIDAD, OTRA_COMUNIDAD]) {
    await prisma.comunidad.upsert({
      where: { id },
      update: {},
      create: { id, nombre: `Comunidad ${id}`, slug: id },
    })
  }

  const { cookieSesionAuthjs } = await import("./helpers/sesion-authjs")
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

  // Los fondos existen ANTES de importar: el importador no los crea (S3).
  await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [COMUNIDAD, OTRA_COMUNIDAD] } } })
  await prisma.fondoFI.create({
    data: {
      id: FONDO_GC,
      comunidadId: COMUNIDAD,
      nombre: "Fondo Gastos Comunes",
      tipo: "gasto_comun",
      activo: true,
    },
  })
  await prisma.fondoFI.create({
    data: {
      id: FONDO_AHORRO,
      comunidadId: COMUNIDAD,
      nombre: "Fondo de Ahorro",
      tipo: "ahorro",
      activo: true,
    },
  })

  const egresos = await import("@/app/api/importar/egresos/route")
  POST_EGRESOS = egresos.POST
  const ingresos = await import("@/app/api/importar/ingresos/route")
  POST_INGRESOS = ingresos.POST
  const plantillaEgresos = await import("@/app/api/importar/egresos/plantilla/route")
  PLANTILLA_EGRESOS = plantillaEgresos.GET
  const plantillaIngresos = await import("@/app/api/importar/ingresos/plantilla/route")
  PLANTILLA_INGRESOS = plantillaIngresos.GET
}, 30_000)

type Bloque = "egresos" | "ingresos"

/**
 * POST al importador del bloque: la vista previa es el MISMO handler con
 * `?dryRun=1` (una sola ruta por bloque, no hay camino paralelo).
 */
function pedirImport(
  bloque: Bloque,
  rol: keyof typeof CUENTAS | "sin-sesion",
  cuerpo: string,
  seco = false
): Promise<Response> {
  state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
  const ruta = `/api/importar/${bloque}${seco ? "?dryRun=1" : ""}`
  const post = bloque === "egresos" ? POST_EGRESOS : POST_INGRESOS
  return post(
    new NextRequest(`http://localhost${ruta}`, {
      method: "POST",
      body: cuerpo,
      headers: {
        "content-type": "text/csv",
        ...(state.cookie ? { cookie: state.cookie } : {}),
      },
    })
  )
}

function pedirPlantilla(
  bloque: Bloque,
  rol: keyof typeof CUENTAS | "sin-sesion"
): Promise<Response> {
  state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
  const get = bloque === "egresos" ? PLANTILLA_EGRESOS : PLANTILLA_INGRESOS
  return get()
}

async function contarEgresos(comunidadId = COMUNIDAD): Promise<number> {
  return prisma.egresoFI.count({ where: { comunidadId } })
}

async function contarIngresos(comunidadId = COMUNIDAD): Promise<number> {
  return prisma.ingresoFI.count({ where: { comunidadId } })
}

describe("POST /api/importar/egresos — S5 contra la base real", () => {
  it("la vista previa de 3 válidas y 2 inválidas devuelve 5 reportes y no escribe nada", async () => {
    expect(await contarEgresos()).toBe(0)

    const res = await pedirImport("egresos", "administrador", csv(...FILAS_MIXTAS), true)
    expect(res.status).toBe(200)
    const reporte = (await res.json()) as Reporte

    // Cinco reportes, con la línea real de cada fila (encabezado = línea 1).
    expect(reporte.filas).toHaveLength(5)
    expect(reporte.filas.map((f) => f.linea)).toEqual([2, 3, 4, 5, 6])
    expect(reporte.resumen).toEqual(RESULTADO_MIXTO)
    expect(reporte.filas.slice(0, 3).map((f) => f.accion)).toEqual([
      "crear",
      "crear",
      "crear",
    ])

    // La fila del fondo inexistente: error con el motivo literal del fondo.
    const fantasma = reporte.filas[3]!
    expect(fantasma.accion).toBe("sin-cambios")
    expect(fantasma.errores).toHaveLength(1)
    expect(fantasma.errores[0]).toContain('no existe el fondo "Fondo Inexistente"')
    expect(fantasma.errores[0]).toContain("línea 5")

    // La fila del monto no positivo.
    const cero = reporte.filas[4]!
    expect(cero.accion).toBe("sin-cambios")
    expect(cero.errores[0]).toContain("monto:")
    expect(cero.errores[0]).toContain("mayor a cero")

    // La vista previa no escribió nada (S1).
    expect(await contarEgresos()).toBe(0)
  })

  it("la importación real con filas con error no corre: 400, reporte en el cuerpo y nada escrito", async () => {
    const res = await pedirImport("egresos", "administrador", csv(...FILAS_MIXTAS))
    expect(res.status).toBe(400)
    const cuerpo = (await res.json()) as RespuestaBloqueada

    expect(cuerpo.error).toMatch(/filas con error/i)
    expect(cuerpo.error).toMatch(/no se escribió nada/i)
    // El reporte fila por fila viaja igual, para que se vea qué corregir.
    expect(cuerpo.reporte?.filas).toHaveLength(5)
    expect(cuerpo.reporte?.resumen.conError).toBe(2)
    expect(await contarEgresos()).toBe(0)
  })

  it("importado en serio escribe las 3 filas válidas, con el fondo resuelto por nombre o id", async () => {
    // Una fila con la MISMA clave en otra comunidad no cuenta como existente:
    // la idempotencia es dentro de la comunidad.
    const fondoAjeno = "imp-f48-fondo-ajeno"
    await prisma.fondoFI.create({
      data: {
        id: fondoAjeno,
        comunidadId: OTRA_COMUNIDAD,
        nombre: "Fondo Gastos Comunes",
        tipo: "gasto_comun",
        activo: true,
      },
    })
    await prisma.egresoFI.create({
      data: {
        id: "imp-f48-egreso-ajeno",
        comunidadId: OTRA_COMUNIDAD,
        fecha: "2024-03-15",
        monto: 15500.5,
        descripcion: "Mantenimiento del ascensor",
        categoria: "mantencion",
        fondoId: fondoAjeno,
        esRecurrente: false,
      },
    })

    const res = await pedirImport("egresos", "administrador", csv(...FILAS_VALIDAS))
    expect(res.status).toBe(200)
    const reporte = (await res.json()) as Reporte

    expect(reporte.resumen).toEqual({
      total: 3,
      validas: 3,
      conError: 0,
      crear: 3,
      actualizar: 0,
      sinCambios: 0,
    })
    expect(await contarEgresos()).toBe(3)
    expect(await contarEgresos(OTRA_COMUNIDAD)).toBe(1)

    // El fondo se resolvió por nombre (fila 1 y 3) y por id (fila 2).
    const ascensor = await prisma.egresoFI.findFirst({
      where: { comunidadId: COMUNIDAD, descripcion: "Mantenimiento del ascensor" },
    })
    expect(ascensor?.fondoId).toBe(FONDO_GC)
    expect(ascensor?.monto).toBeCloseTo(15500.5)
    expect(ascensor?.fecha).toBe("2024-03-15")
    expect(ascensor?.categoria).toBe("mantencion")
    // El bloque no es recurrente por declaración: el CSV no lo dice (S2/S3).
    expect(ascensor?.esRecurrente).toBe(false)

    const porton = await prisma.egresoFI.findFirst({
      where: { comunidadId: COMUNIDAD, descripcion: "Reparación del portón" },
    })
    expect(porton?.fondoId).toBe(FONDO_AHORRO)

    // S3: no se creó ningún fondo, categoría, unidad ni persona.
    expect(await prisma.fondoFI.count({ where: { comunidadId: COMUNIDAD } })).toBe(2)
    expect(await prisma.unidad.count({ where: { comunidadId: COMUNIDAD } })).toBe(0)
    expect(await prisma.persona.count({ where: { comunidadId: COMUNIDAD } })).toBe(0)
  })

  it("reimportar el mismo archivo no duplica y lo cuenta como actualizado", async () => {
    const res = await pedirImport("egresos", "administrador", csv(...FILAS_VALIDAS))
    expect(res.status).toBe(200)
    const reporte = (await res.json()) as Reporte

    expect(reporte.resumen).toEqual({
      total: 3,
      validas: 3,
      conError: 0,
      crear: 0,
      actualizar: 3,
      sinCambios: 0,
    })
    expect(reporte.filas.map((f) => f.accion)).toEqual([
      "actualizar",
      "actualizar",
      "actualizar",
    ])
    expect(await contarEgresos()).toBe(3)

    // La categoría (fuera de la clave) sí se actualiza en la misma fila.
    const cambiado = csv(
      FILA_ASCENSOR.replace(",mantencion,", ",servicios,"),
      FILA_PORTON,
      FILA_AGUA
    )
    const segunda = await pedirImport("egresos", "administrador", cambiado)
    const segundoReporte = (await segunda.json()) as Reporte
    expect(segundoReporte.resumen.actualizar).toBe(3)
    expect(await contarEgresos()).toBe(3)
    const ascensor = await prisma.egresoFI.findFirst({
      where: { comunidadId: COMUNIDAD, descripcion: "Mantenimiento del ascensor" },
    })
    expect(ascensor?.categoria).toBe("servicios")
  })
})

describe("formato declarado del archivo (S2)", () => {
  it("valida fecha, monto, descripción, categoría y fondo por columna", async () => {
    const larga = "x".repeat(121)
    const futura = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const archivo = csv(
      "2024-02-30,1000,Fecha imposible,otro,Fondo Gastos Comunes",
      `${futura},1000,Movimiento futuro,otro,Fondo Gastos Comunes`,
      "2024-03-01,abc,Monto no numérico,otro,Fondo Gastos Comunes",
      `2024-03-02,1000,Categoría larga,${larga},Fondo Gastos Comunes`,
      "2024-03-03,1000,,otro,Fondo Gastos Comunes",
      "2024-03-04,1000,Sin fondo,otro,"
    )

    const res = await pedirImport("egresos", "administrador", archivo, true)
    expect(res.status).toBe(200)
    const reporte = (await res.json()) as Reporte

    expect(reporte.resumen.conError).toBe(6)
    expect(reporte.resumen.crear).toBe(0)
    const errores = reporte.filas.map((f) => f.errores[0] ?? "")
    // Cada fila falla por la columna que corresponde, con la línea del archivo.
    expect(errores[0]).toContain("fecha:")
    expect(errores[0]).toContain("fecha real")
    expect(errores[1]).toContain("fecha:")
    expect(errores[1]).toContain("no puede ser futura")
    expect(errores[2]).toContain("monto:")
    expect(errores[2]).toContain("punto decimal")
    expect(errores[3]).toContain("categoria:")
    expect(errores[3]).toContain("120 caracteres")
    expect(errores[4]).toContain("descripcion:")
    expect(errores[5]).toContain("fondo:")
    expect(errores[5]).toContain("es obligatorio")
    for (const [indice, error] of errores.entries()) {
      expect(error).toContain(`línea ${indice + 2}`)
    }

    // Nada de esas filas se escribió.
    expect(await contarEgresos()).toBe(3)
  })
})

describe("POST /api/importar/ingresos — mismo flujo, modelo IngresoFI", () => {
  const FILA_CUOTAS =
    "2024-03-01,120000,Cuotas extraordinarias,Contribuciones,Fondo de Ahorro"
  const FILA_MULTA = "2024-03-05,50000,Multa por ruido,,Fondo Gastos Comunes"
  const FILA_DONACION = "2024-03-06,1000,Donación,Contribuciones,Fondo Fantasma"

  it("la vista previa reporta las 3 filas sin escribir y nombra el fondo que falta", async () => {
    expect(await contarIngresos()).toBe(0)

    const res = await pedirImport(
      "ingresos",
      "administrador",
      csv(FILA_CUOTAS, FILA_MULTA, FILA_DONACION),
      true
    )
    expect(res.status).toBe(200)
    const reporte = (await res.json()) as Reporte

    expect(reporte.resumen).toEqual({
      total: 3,
      validas: 2,
      conError: 1,
      crear: 2,
      actualizar: 0,
      sinCambios: 0,
    })
    expect(reporte.filas[2]!.errores[0]).toContain('no existe el fondo "Fondo Fantasma"')
    expect(await contarIngresos()).toBe(0)
  })

  it("importado en serio escribe la descripción como concepto y la categoría como familia", async () => {
    const res = await pedirImport(
      "ingresos",
      "administrador",
      csv(FILA_CUOTAS, FILA_MULTA)
    )
    expect(res.status).toBe(200)
    const reporte = (await res.json()) as Reporte
    expect(reporte.resumen.crear).toBe(2)
    expect(await contarIngresos()).toBe(2)

    const cuotas = await prisma.ingresoFI.findFirst({
      where: { comunidadId: COMUNIDAD, concepto: "Cuotas extraordinarias" },
    })
    expect(cuotas?.familia).toBe("Contribuciones")
    expect(cuotas?.fondoId).toBe(FONDO_AHORRO)
    expect(cuotas?.monto).toBeCloseTo(120000)
    expect(cuotas?.fecha).toBe("2024-03-01")

    // Categoría vacía: se acepta y el ingreso queda sin familia.
    const multa = await prisma.ingresoFI.findFirst({
      where: { comunidadId: COMUNIDAD, concepto: "Multa por ruido" },
    })
    expect(multa?.familia).toBeNull()
    expect(multa?.fondoId).toBe(FONDO_GC)

    // Reimportado: no duplica y lo cuenta como actualizado.
    const segunda = await pedirImport(
      "ingresos",
      "administrador",
      csv(FILA_CUOTAS, FILA_MULTA)
    )
    const otro = (await segunda.json()) as Reporte
    expect(otro.resumen).toEqual({
      total: 2,
      validas: 2,
      conError: 0,
      crear: 0,
      actualizar: 2,
      sinCambios: 0,
    })
    expect(await contarIngresos()).toBe(2)
  })
})

describe("plantillas descargables (S1/S2)", () => {
  it("egresos: encabezados canónicos, tres filas de ejemplo y nombre de archivo", async () => {
    const res = await pedirPlantilla("egresos", "administrador")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/csv")
    expect(res.headers.get("content-disposition")).toContain("plantilla-egresos.csv")

    const lineas = (await res.text()).replace(/\r/g, "").split("\n").filter((l) => l !== "")
    expect(lineas).toHaveLength(4)
    expect(lineas[0]).toBe("fecha,monto,descripcion,categoria,fondo")
    for (const linea of lineas.slice(1)) {
      expect(linea.split(",").every((c) => c.length > 0)).toBe(true)
      expect(linea).toContain("EJEMPLO-")
    }
  })

  it("ingresos: los mismos encabezados y su propio nombre de archivo", async () => {
    const res = await pedirPlantilla("ingresos", "administrador")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/csv")
    expect(res.headers.get("content-disposition")).toContain("plantilla-ingresos.csv")

    const lineas = (await res.text()).replace(/\r/g, "").split("\n").filter((l) => l !== "")
    expect(lineas[0]).toBe("fecha,monto,descripcion,categoria,fondo")
    expect(lineas).toHaveLength(4)
  })

  it("subir la plantilla tal cual se rechaza fila por fila y no escribe nada", async () => {
    const egresosAntes = await contarEgresos()
    const ingresosAntes = await contarIngresos()

    for (const bloque of ["egresos", "ingresos"] as const) {
      const plantilla = await pedirPlantilla(bloque, "administrador")
      const contenido = await plantilla.text()

      // La vista previa reporta el ejemplo entero como filas con error.
      const vista = await pedirImport(bloque, "administrador", contenido, true)
      expect(vista.status).toBe(200)
      const reporte = (await vista.json()) as Reporte
      expect(reporte.resumen).toEqual({
        total: 3,
        validas: 0,
        conError: 3,
        crear: 0,
        actualizar: 0,
        sinCambios: 0,
      })
      for (const fila of reporte.filas) {
        expect(fila.accion).toBe("sin-cambios")
        expect(fila.errores[0]).toContain(
          "Esta fila es del ejemplo de la plantilla: reemplazala por tus datos o borrala"
        )
      }

      // La importación real ni se ejecuta: la vista previa no está limpia.
      const real = await pedirImport(bloque, "administrador", contenido)
      expect(real.status).toBe(400)
      const cuerpo = (await real.json()) as RespuestaBloqueada
      expect(cuerpo.error).toMatch(/no se escribió nada/i)
      expect(cuerpo.reporte?.resumen.conError).toBe(3)
    }

    expect(await contarEgresos()).toBe(egresosAntes)
    expect(await contarIngresos()).toBe(ingresosAntes)
  })
})

/**
 * F48 · T5/S5 — el folio del egreso importado y el fondo activo.
 *
 * El folio sale de la MISMA secuencia que la pantalla de alta (`FE-####`,
 * `siguienteFolioFE`) y una fila cuyo fondo existe pero está inactivo es error
 * con el motivo literal: el archivo entero queda bloqueado y no escribe nada.
 * Ingresos no cambia (su modelo no tiene folio y S5 no lo alcanza).
 */
describe("folio del egreso importado y fondo activo (S5)", () => {
  /** Filas nuevas del archivo de folio: claves que no chocan con las de arriba. */
  const FILA_JARDIN =
    "2024-08-01,45000,Poda del jardín,mantencion,Fondo Gastos Comunes"
  const FILA_PINTURA =
    "2024-08-05,12000,Pintura del hall,otro,imp-f48-fondo-ahorro"
  const FILA_REJA =
    "2024-08-09,7300.75,Reja del frontis,servicios,Fondo Gastos Comunes"
  const FILAS_FOLIO = [FILA_JARDIN, FILA_PINTURA, FILA_REJA]
  const DESCRIPCIONES_FOLIO = ["Poda del jardín", "Pintura del hall", "Reja del frontis"]

  const FONDO_INACTIVO = "imp-f48-fondo-inactivo"
  const FILA_VALIDA_FONDO =
    "2024-09-05,9900,Hidrolavado del acceso,otro,Fondo Gastos Comunes"
  const FILA_FONDO_INACTIVO =
    "2024-09-01,5000,Reparación de la reja,mantencion,Fondo Cerrado"

  /** `descripcion → folio` de las filas del archivo de folio, leído de la base. */
  async function foliosImportados(): Promise<Map<string, string | null>> {
    const filas = await prisma.egresoFI.findMany({
      where: { comunidadId: COMUNIDAD, descripcion: { in: DESCRIPCIONES_FOLIO } },
      select: { descripcion: true, folio: true },
    })
    return new Map(filas.map((f) => [f.descripcion, f.folio] as const))
  }

  it("cada egreso importado toma el siguiente folio FE-#### de la secuencia del alta", async () => {
    // Dos altas ya existentes, con hueco: la secuencia continúa desde el máximo
    // (FE-0042), no desde la cantidad de egresos.
    await prisma.egresoFI.createMany({
      data: [
        {
          id: "imp-f48-egreso-folio-40",
          comunidadId: COMUNIDAD,
          folio: "FE-0040",
          fecha: "2024-01-10",
          monto: 1000,
          descripcion: "Alta previa 40",
          categoria: "otro",
          fondoId: FONDO_GC,
          esRecurrente: false,
        },
        {
          id: "imp-f48-egreso-folio-42",
          comunidadId: COMUNIDAD,
          folio: "FE-0042",
          fecha: "2024-01-11",
          monto: 2000,
          descripcion: "Alta previa 42",
          categoria: "otro",
          fondoId: FONDO_GC,
          esRecurrente: false,
        },
      ],
    })
    const antes = await contarEgresos()

    const res = await pedirImport("egresos", "administrador", csv(...FILAS_FOLIO))
    expect(res.status).toBe(200)
    const reporte = (await res.json()) as Reporte
    expect(reporte.resumen).toEqual({
      total: 3,
      validas: 3,
      conError: 0,
      crear: 3,
      actualizar: 0,
      sinCambios: 0,
    })
    expect(await contarEgresos()).toBe(antes + 3)

    // Continuos con el máximo ya usado (42), distintos entre sí y no vacíos:
    // 43, 44 y 45 en el orden del archivo.
    const folios = await foliosImportados()
    expect(folios.get("Poda del jardín")).toBe("FE-0043")
    expect(folios.get("Pintura del hall")).toBe("FE-0044")
    expect(folios.get("Reja del frontis")).toBe("FE-0045")
    expect(new Set([...folios.values()]).size).toBe(3)
  })

  it("una fila con el fondo inactivo falla con el motivo literal y bloquea el archivo entero", async () => {
    await prisma.fondoFI.create({
      data: {
        id: FONDO_INACTIVO,
        comunidadId: COMUNIDAD,
        nombre: "Fondo Cerrado",
        tipo: "gasto_comun",
        activo: false,
      },
    })
    const antes = await contarEgresos()

    const res = await pedirImport(
      "egresos",
      "administrador",
      csv(FILA_VALIDA_FONDO, FILA_FONDO_INACTIVO)
    )
    expect(res.status).toBe(400)
    const cuerpo = (await res.json()) as RespuestaBloqueada
    expect(cuerpo.error).toMatch(/filas con error/i)
    expect(cuerpo.reporte?.resumen).toEqual({
      total: 2,
      validas: 1,
      conError: 1,
      crear: 1,
      actualizar: 0,
      sinCambios: 0,
    })
    // El motivo es literal y nombra el fondo inactivo con su nombre canónico.
    expect(cuerpo.reporte?.filas[1]?.errores).toEqual([
      'fondo: el fondo "Fondo Cerrado" está inactivo; un egreso debe imputarse a un fondo activo. (línea 3)',
    ])
    // El archivo entero queda bloqueado: la fila válida tampoco se escribió.
    expect(await contarEgresos()).toBe(antes)
    expect(
      await prisma.egresoFI.count({
        where: { comunidadId: COMUNIDAD, descripcion: "Hidrolavado del acceso" },
      })
    ).toBe(0)
  })

  it("reimportar el archivo no duplica ni reasigna folios sobre el fondo activo", async () => {
    const antes = await contarEgresos()

    const res = await pedirImport("egresos", "administrador", csv(...FILAS_FOLIO))
    expect(res.status).toBe(200)
    const reporte = (await res.json()) as Reporte
    expect(reporte.resumen).toEqual({
      total: 3,
      validas: 3,
      conError: 0,
      crear: 0,
      actualizar: 3,
      sinCambios: 0,
    })
    expect(await contarEgresos()).toBe(antes)

    // El folio ya asignado no se reescribe: el archivo no lo declara.
    const folios = await foliosImportados()
    expect(folios.get("Poda del jardín")).toBe("FE-0043")
    expect(folios.get("Pintura del hall")).toBe("FE-0044")
    expect(folios.get("Reja del frontis")).toBe("FE-0045")
  })
})

describe("authz y archivos que no son del bloque", () => {
  it("residente recibe 403 en las cuatro rutas", async () => {
    expect(
      (await pedirImport("egresos", "residente", csv(...FILAS_VALIDAS), true)).status
    ).toBe(403)
    expect(
      (await pedirImport("ingresos", "residente", csv(...FILAS_VALIDAS), true)).status
    ).toBe(403)
    expect((await pedirPlantilla("egresos", "residente")).status).toBe(403)
    expect((await pedirPlantilla("ingresos", "residente")).status).toBe(403)
  })

  it("sin sesión recibe 401 en las cuatro rutas", async () => {
    expect(
      (await pedirImport("egresos", "sin-sesion", csv(...FILAS_VALIDAS), true)).status
    ).toBe(401)
    expect(
      (await pedirImport("ingresos", "sin-sesion", csv(...FILAS_VALIDAS), true)).status
    ).toBe(401)
    expect((await pedirPlantilla("egresos", "sin-sesion")).status).toBe(401)
    expect((await pedirPlantilla("ingresos", "sin-sesion")).status).toBe(401)
  })

  it("un archivo con otros encabezados responde 400 y dice cuál falta", async () => {
    const res = await pedirImport(
      "egresos",
      "administrador",
      "rol_sii,metraje\nimp-f48-1,50",
      true
    )
    expect(res.status).toBe(400)
    const cuerpo = (await res.json()) as { error: string; detalle?: string }
    expect(cuerpo.error).toMatch(/no se pudo leer/i)
    // El texto del parser viaja en `detalle`: nombra las columnas que faltan.
    expect(cuerpo.detalle).toContain("fecha")
    expect(cuerpo.detalle).toContain("fondo")
  })
})
