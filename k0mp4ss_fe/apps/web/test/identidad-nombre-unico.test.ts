/**
 * @vitest-environment node
 *
 * Guardián de la identidad única (S1) y del encabezado de los papeles (S3).
 * `odd/tasks/identidad-unica.md`.
 *
 * Qué garantiza, exactamente:
 *
 *   1. **Un solo nombre.** Renombrar la comunidad UNA vez (por el único camino de
 *      escritura, `PUT /api/comunidad-actual`) cambia a la vez la marca del
 *      encabezado de la app, lo que muestra la pestaña «Identidad Legal» (lo que
 *      sirve `GET /api/configuracion`) y el asunto y cuerpo del correo. Ninguna de
 *      las tres sale de otra fuente.
 *   2. **La columna deprecada no se lee ni se escribe.** Un valor señuelo en
 *      `ConfiguracionGlobal.nombreComunidad` no aparece en ninguna salida, y un
 *      `PUT` que intente cambiarlo no la toca. Al crear la fila se escribe un
 *      snapshot de `Comunidad.nombre` que queda congelado.
 *   3. **Ningún papel cambia de aspecto.** El encabezado del aviso, la liquidación
 *      y el certificado es el arreglo completo de siempre (nombre, dirección · RUT,
 *      administrador · RUT), en el mismo orden y con el mismo estilo. El único papel
 *      que cambia es el requerimiento de corte, que ahora imprime ese mismo bloque
 *      completo: antes salía sólo con el nombre.
 *   4. **El remitente vacío no inventa otro nombre.** Sin `smtpFromName`, el `From:`
 *      se presenta con el nombre de la comunidad.
 *   5. **Ningún lector nuevo.** Barrido de fuente: la lista de archivos de `app/` y
 *      `lib/` que tocan `nombreComunidad` es exacta y cada uno es una proyección, no
 *      una lectura de la base; ningún `select` pide la columna.
 *
 * La prueba del señuelo es la que de verdad muerde: si mañana alguien vuelve a leer
 * la columna deprecada (en la API, en una pantalla o en un papel), la salida deja de
 * coincidir con `Comunidad.nombre` y este archivo falla.
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { configuracionDefault } from "@/data/admin/configuracion"
import {
  documentoAvisoCobroPDF,
  documentoCertificadoPDF,
  documentoLiquidacionPDF,
  encabezadoInstitucional,
} from "@/lib/pdf-utils"
import {
  COLUMNAS_IDENTIDAD_INSTITUCIONAL,
  definicionDelRequerimiento,
} from "@/lib/requerimiento-corte"
import { asuntoBienvenida, cuerpoBienvenida } from "@/lib/correo-bienvenida"
import { nombreDelRemitente, leerConfiguracionSMTP } from "@/lib/smtp"
import { COLUMNAS_DOCUMENTO as COLUMNAS_AVISO } from "@/app/api/avisos-cobro/_documento"
import { COLUMNAS_DOCUMENTO as COLUMNAS_LIQUIDACION } from "@/app/api/liquidaciones/_documento"
import type { ConfiguracionGlobal, LiquidacionPL } from "@/lib/schemas"

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

/** `apps/web` — este archivo vive en `test/`. */
const RAIZ = path.resolve(__dirname, "..")

const COMUNIDAD = "idn-comunidad"
const COMUNIDAD_SIN_CF = "idn-comunidad-sin-cf"

const NOMBRE = "Comunidad Identidad Única"
const NOMBRE_DESPUES = "Comunidad Renombrada Una Sola Vez"
const SEÑUELO = "Comunidad Señuelo Deprecada"

const CUENTAS = {
  administrador: { id: "idn-user-admin", email: "idn-admin@test.cl", comunidadId: COMUNIDAD, rol: "administrador" },
  comite: { id: "idn-user-comite", email: "idn-comite@test.cl", comunidadId: COMUNIDAD, rol: "comite" },
  residente: { id: "idn-user-residente", email: "idn-residente@test.cl", comunidadId: COMUNIDAD, rol: "residente" },
  /** Administración de una comunidad que todavía no tiene fila de configuración. */
  sinCf: { id: "idn-user-sin-cf", email: "idn-sin-cf@test.cl", comunidadId: COMUNIDAD_SIN_CF, rol: "administrador" },
} as const

type RolCuenta = keyof typeof CUENTAS

describe("Identidad única de la comunidad y encabezado de los papeles", () => {
  const cookies: Record<RolCuenta, string> = {
    administrador: "",
    comite: "",
    residente: "",
    sinCf: "",
  }
  let GET_COMUNIDAD: (req: Request) => Promise<Response>
  let PUT_COMUNIDAD: (req: Request) => Promise<Response>
  let GET_CONFIGURACION: () => Promise<Response>
  let PUT_CONFIGURACION: (req: Request) => Promise<Response>

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const [id, nombre] of [
      [COMUNIDAD, NOMBRE],
      [COMUNIDAD_SIN_CF, "Comunidad Sin Configuración"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: { nombre },
        create: { id, nombre, slug: id },
      })
    }

    const { cookieSesionAuthjs } = await import("./helpers/sesion-authjs")
    for (const [clave, cuenta] of Object.entries(CUENTAS) as [RolCuenta, (typeof CUENTAS)[RolCuenta]][]) {
      await prisma.usuario.upsert({
        where: { email: cuenta.email },
        update: {},
        create: { id: cuenta.id, email: cuenta.email, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: cuenta.id } })
      await prisma.membresia.create({
        data: { usuarioId: cuenta.id, comunidadId: cuenta.comunidadId, rol: cuenta.rol },
      })
      cookies[clave] = await cookieSesionAuthjs({ sub: cuenta.id, email: cuenta.email })
    }

    await prisma.configuracionGlobal.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_SIN_CF] } },
    })
    // La fila de la comunidad principal lleva un nombre señuelo en la columna
    // deprecada: cualquier salida que lo muestre está leyendo la fuente vieja.
    await prisma.configuracionGlobal.create({
      data: {
        ...configuracionDefault,
        smtpPassword: "secreto-smtp-no-exponer",
        claveEliminacionMaestro: "clave-no-exponer",
        id: "idn-cf-principal",
        comunidadId: COMUNIDAD,
        nombreComunidad: SEÑUELO,
        smtpFromName: "",
      },
    })

    const rutaComunidad = await import("@/app/api/comunidad-actual/route")
    GET_COMUNIDAD = rutaComunidad.GET
    PUT_COMUNIDAD = rutaComunidad.PUT
    const rutaConfiguracion = await import("@/app/api/configuracion/route")
    GET_CONFIGURACION = rutaConfiguracion.GET
    PUT_CONFIGURACION = rutaConfiguracion.PUT
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    try {
      await prisma.configuracionGlobal.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_SIN_CF] } },
      })
      const ids = Object.values(CUENTAS).map((c) => c.id)
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } })
      await prisma.comunidad.deleteMany({ where: { id: { in: [COMUNIDAD, COMUNIDAD_SIN_CF] } } })
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function como(
    rol: RolCuenta | "sin-sesion",
    fn: () => Promise<void>
  ): Promise<void> {
    state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  function pedirComunidad(metodo: "GET" | "PUT", cuerpo?: unknown): Promise<Response> {
    const init: ConstructorParameters<typeof NextRequest>[1] =
      metodo === "PUT"
        ? {
            method: "PUT",
            body: JSON.stringify(cuerpo),
            headers: { "content-type": "application/json" },
          }
        : {}
    return metodo === "GET"
      ? GET_COMUNIDAD(new NextRequest("http://localhost/api/comunidad-actual", init))
      : PUT_COMUNIDAD(new NextRequest("http://localhost/api/comunidad-actual", init))
  }

  async function nombreDeMarca(): Promise<string> {
    const res = await pedirComunidad("GET")
    expect(res.status).toBe(200)
    return ((await res.json()) as { data: { nombre: string } }).data.nombre
  }

  async function configuracionExpuesta(): Promise<Record<string, unknown>> {
    const res = await GET_CONFIGURACION()
    expect(res.status).toBe(200)
    return (await res.json()) as Record<string, unknown>
  }

  async function renombrar(nombre: string): Promise<void> {
    const res = await pedirComunidad("PUT", { nombre })
    expect(res.status).toBe(200)
  }

  it("renombrar una sola vez cambia la app, la pestaña y el correo con el mismo string", async () => {
    await como("administrador", async () => {
      await renombrar(NOMBRE_DESPUES)

      // 1. Encabezado de la app (app-sidebar y community-header leen esta proyección).
      expect(await nombreDeMarca()).toBe(NOMBRE_DESPUES)

      // 2. «Identidad Legal»: el campo que la pantalla pinta es la misma fuente.
      expect((await configuracionExpuesta()).nombreComunidad).toBe(NOMBRE_DESPUES)

      // 3. Correo de bienvenida: la ruta toma el nombre de la fila de la comunidad.
      //    Se afirma la fila leída de la base y el texto que sale del builder.
      const comunidad = await prisma.comunidad.findUnique({
        where: { id: COMUNIDAD },
        select: { nombre: true },
      })
      expect(comunidad?.nombre).toBe(NOMBRE_DESPUES)
      const destinatario = "Ana Pérez"
      expect(asuntoBienvenida({ comunidad: String(comunidad?.nombre) })).toBe(
        `Tu acceso a ${NOMBRE_DESPUES} en Compass`
      )
      const cuerpo = cuerpoBienvenida({
        nombre: destinatario,
        comunidad: String(comunidad?.nombre),
        rol: "residente",
        enlace: "https://app.test/invitar/token",
      })
      expect(cuerpo).toContain(`La administración de ${NOMBRE_DESPUES} te creó una cuenta`)
      expect(cuerpo).toContain(`avísale a la administración de ${NOMBRE_DESPUES}`)

      // La ruta del alta de cuentas es la que alimenta ese `comunidad`: no puede
      // pasar la configuración global (sería la tercera fuente otra vez).
      const alta = readFileSync(
        path.join(RAIZ, "app", "api", "admin", "usuarios", "route.ts"),
        "utf8"
      )
      expect(alta).toMatch(/comunidad:\s*comunidad\.nombre/)

      await renombrar(NOMBRE)
    })
  })

  it("la columna deprecada no se lee: el señuelo no sale en ninguna respuesta", async () => {
    await como("administrador", async () => {
      const fila = await prisma.configuracionGlobal.findUnique({
        where: { comunidadId: COMUNIDAD },
      })
      expect(fila?.nombreComunidad).toBe(SEÑUELO)

      expect(await nombreDeMarca()).toBe(NOMBRE)
      const expuesta = await configuracionExpuesta()
      expect(expuesta.nombreComunidad).toBe(NOMBRE)
      expect(JSON.stringify(expuesta)).not.toContain(SEÑUELO)
    })
  })

  it("un PUT que intenta escribir la columna deprecada no la toca", async () => {
    await como("administrador", async () => {
      const res = await PUT_CONFIGURACION(
        new NextRequest("http://localhost/api/configuracion", {
          method: "PUT",
          body: JSON.stringify({ nombreComunidad: "Intento de Sobrescritura", diaCortePago: 11 }),
          headers: { "content-type": "application/json" },
        })
      )
      expect(res.status).toBe(200)

      const fila = await prisma.configuracionGlobal.findUnique({
        where: { comunidadId: COMUNIDAD },
      })
      expect(fila?.nombreComunidad).toBe(SEÑUELO)
      expect(fila?.diaCortePago).toBe(11)
      // Y la identidad expuesta sigue siendo la de la comunidad, no la del cuerpo.
      expect((await configuracionExpuesta()).nombreComunidad).toBe(NOMBRE)
    })
  })

  it("al crear la fila se escribe el snapshot de Comunidad.nombre y queda congelado", async () => {
    await como("sinCf", async () => {
      const creada = await PUT_CONFIGURACION(
        new NextRequest("http://localhost/api/configuracion", {
          method: "PUT",
          body: JSON.stringify({ diaCortePago: 9 }),
          headers: { "content-type": "application/json" },
        })
      )
      expect(creada.status).toBe(201)
      const fila = await prisma.configuracionGlobal.findUnique({
        where: { comunidadId: COMUNIDAD_SIN_CF },
      })
      // El snapshot es el nombre de LA comunidad, no el default del seed.
      expect(fila?.nombreComunidad).toBe("Comunidad Sin Configuración")
      expect(fila?.nombreComunidad).not.toBe(configuracionDefault.nombreComunidad)

      await prisma.comunidad.update({
        where: { id: COMUNIDAD_SIN_CF },
        data: { nombre: "Comunidad Sin Configuración Renombrada" },
      })
      const actualizada = await PUT_CONFIGURACION(
        new NextRequest("http://localhost/api/configuracion", {
          method: "PUT",
          body: JSON.stringify({ diaCortePago: 10 }),
          headers: { "content-type": "application/json" },
        })
      )
      expect(actualizada.status).toBe(200)
      const despues = await prisma.configuracionGlobal.findUnique({
        where: { comunidadId: COMUNIDAD_SIN_CF },
      })
      // El snapshot no se actualiza: la columna queda donde nació y nadie la reescribe.
      expect(despues?.nombreComunidad).toBe("Comunidad Sin Configuración")
      expect(despues?.diaCortePago).toBe(10)
    })
  })

  // ── S3 · el encabezado de los papeles ───────────────────────────────────────

  const CF: ConfiguracionGlobal = {
    ...configuracionDefault,
    nombreComunidad: "Comunidad de los Papeles",
    direccionOficial: "Av. Los Papeles 456, Providencia",
    rutComunidad: "77.777.777-7",
    administradorResponsable: "Ricardo Pérez",
    rutAdministrador: "12.345.678-9",
  }

  /**
   * El encabezado tal como lo imprimían los tres papeles ANTES de esta unidad
   * (`lib/pdf-utils.ts:115-121`, sin tocar una línea de formato). Se escribe literal
   * a propósito: comparar contra el constructor nuevo no probaría que nada cambió.
   */
  const encabezadoDeSiempre = (config: ConfiguracionGlobal): unknown[] => [
    { text: config.nombreComunidad, style: "titulo" },
    `${config.direccionOficial} · RUT ${config.rutComunidad}`,
    `Administrador responsable: ${config.administradorResponsable} (${config.rutAdministrador})`,
  ]

  const LIQUIDACION: LiquidacionPL = {
    id: "idn-liq-1",
    folio: "LQ-0001",
    trabajadorPersonaId: "idn-per-1",
    periodo: "2026-09",
    fechaGeneracion: "2026-09-30",
    diasTrabajados: 30,
    sueldoBaseContrato: 900000,
    diasMesComercial: 30,
    jornadaSemanal: 44,
    sueldoBaseProporcional: 900000,
    horasExtrasHoras: 0,
    valorHoraOrdinaria: 5113,
    montoHorasExtras: 0,
    bonos: [],
    gratificacionLegal: 0,
    totalImponible: 900000,
    asignacionMovilizacion: 0,
    asignacionColacion: 0,
    cargas: 0,
    montoAsignacionFamiliar: 0,
    totalHaberes: 900000,
    nombreAfp: "AFP Modelo",
    tasaAFP: 10.44,
    montoAFP: 93960,
    nombreSalud: "Fonasa",
    saludTipo: "fonasa",
    montoSalud: 63000,
    tasaSIS: 1.88,
    montoSIS: 16920,
    montoSeguroCesantia: 5400,
    montoAPV: 0,
    totalDescuentos: 179280,
    descuentoAnticipos: 0,
    adelantosIds: [],
    alcanceLiquido: 720720,
    liquidoAPagar: 720720,
    estado: "confirmada",
  }

  async function encabezadoDelAviso(): Promise<unknown> {
    const doc = documentoAvisoCobroPDF({
      aviso: {
        folio: "A-1",
        codigoVerificacion: "A1B2C3D4",
        periodo: "2026-09",
        fechaEmision: "2026-09-05",
        vencimiento: null,
        contenido: {},
      },
      config: CF,
      firmaDataUrl: null,
      hash: "A1B2C3D4E5F60718",
    })
    return doc.header
  }

  async function encabezadoDeLaLiquidacion(): Promise<unknown> {
    const doc = await documentoLiquidacionPDF(LIQUIDACION, "Ana Pérez", "11.111.111-1", CF)
    return doc.header
  }

  async function encabezadoDelCertificado(): Promise<unknown> {
    const doc = await documentoCertificadoPDF({
      tipo: "certificado de residencia",
      titulo: "Certificado de residencia",
      folio: "C-1",
      codigoVerificacion: "C1D2E3F4",
      fechaEmision: "2026-09-05",
      parrafos: ["Se deja constancia de la residencia."],
      detalle: [],
      solicitanteNombre: "Ana Pérez",
      config: CF,
    })
    return doc.header
  }

  it("aviso, liquidación y certificado imprimen el MISMO encabezado de siempre, completo y en orden", async () => {
    const esperado = encabezadoDeSiempre(CF)

    expect(encabezadoInstitucional(CF)).toEqual(esperado)
    expect(await encabezadoDelAviso()).toEqual(esperado)
    expect(await encabezadoDeLaLiquidacion()).toEqual(esperado)
    expect(await encabezadoDelCertificado()).toEqual(esperado)

    // Las tres piezas siguen ahí: el nombre no reemplaza a nadie.
    for (const encabezado of [
      await encabezadoDelAviso(),
      await encabezadoDeLaLiquidacion(),
      await encabezadoDelCertificado(),
    ]) {
      const plano = JSON.stringify(encabezado)
      expect(plano).toContain(CF.rutComunidad)
      expect(plano).toContain(CF.direccionOficial)
      expect(plano).toContain(CF.administradorResponsable)
      expect(plano).toContain(CF.rutAdministrador)
    }
  })

  it("el requerimiento de corte imprime el mismo bloque que el aviso (antes salía sólo el nombre)", async () => {
    const base = {
      corteId: "cse-1",
      comunidadNombre: CF.nombreComunidad,
      unidadNumero: "101",
      servicio: "electricidad",
      cuotasImpagas: 3,
      montoAdeudado: 300000,
      fechaPreaviso: new Date("2026-09-01T12:00:00Z"),
      fechaHabilitada: new Date("2026-09-06T12:00:00Z"),
      acuerdoFolio: "AD-2026-1",
    }

    const conIdentidad = definicionDelRequerimiento({ ...base, identidad: CF })
    expect(conIdentidad.header).toEqual(encabezadoDeSiempre(CF))
    // El mismo arreglo completo que imprime el aviso: mismo bloque, misma fuente,
    // mismo orden. Comparar las dos construcciones es lo que pinea S3.
    expect(conIdentidad.header).toEqual(await encabezadoDelAviso())

    // Sin fila de configuración no hay RUT ni administrador que imprimir: el papel
    // conserva el encabezado mínimo de antes en vez de inventar datos (S6).
    const sinIdentidad = definicionDelRequerimiento(base)
    expect(sinIdentidad.header).toEqual([
      { text: CF.nombreComunidad, bold: true, fontSize: 13 },
      "Requerimiento de suspensión de servicios · Ley 21.442 art. 20 N°9",
    ])
  })

  // ── Remitente del correo ────────────────────────────────────────────────────

  it("sin nombre de remitente, el correo se presenta con el nombre de la comunidad", async () => {
    expect(
      nombreDelRemitente({ smtpFromName: "", nombreDeLaComunidad: NOMBRE })
    ).toBe(NOMBRE)
    expect(
      nombreDelRemitente({ smtpFromName: "   ", nombreDeLaComunidad: NOMBRE })
    ).toBe(NOMBRE)
    // Si la comunidad eligió un nombre propio, ese manda: es legítimo que difiera.
    expect(
      nombreDelRemitente({
        smtpFromName: "Administración Los Almendros",
        nombreDeLaComunidad: NOMBRE,
      })
    ).toBe("Administración Los Almendros")
  })

  it("la fila SMTP trae el nombre de la comunidad para resolver el remitente", async () => {
    const fila = await leerConfiguracionSMTP(COMUNIDAD)
    expect(fila?.smtpFromName).toBe("")
    expect(fila?.nombreDeLaComunidad).toBe(NOMBRE)
  })

  // ── Barrido de fuente: ningún lector nuevo ──────────────────────────────────

  /** Archivos `.ts`/`.tsx` de `app/` y `lib/`, sin comentarios: sólo código. */
  function archivosDeCodigo(): string[] {
    const encontrados: string[] = []
    const recorrer = (actual: string): void => {
      for (const entrada of readdirSync(actual, { withFileTypes: true })) {
        const completo = path.join(actual, entrada.name)
        if (entrada.isDirectory()) {
          recorrer(completo)
          continue
        }
        if (!/\.(ts|tsx)$/.test(entrada.name)) continue
        encontrados.push(path.relative(RAIZ, completo))
      }
    }
    for (const dir of ["app", "lib"]) recorrer(path.join(RAIZ, dir))
    return encontrados.sort()
  }

  function lineasDeCodigo(archivo: string): string[] {
    return readFileSync(path.join(RAIZ, archivo), "utf8")
      .split("\n")
      .filter((linea) => {
        const limpia = linea.trim()
        return (
          limpia !== "" &&
          !limpia.startsWith("//") &&
          !limpia.startsWith("*") &&
          !limpia.startsWith("/*")
        )
      })
  }

  /**
   * El inventario COMPLETO de archivos de `app/` y `lib/` que tocan la columna
   * deprecada. Ninguno la lee de la base: todos reciben o proyectan el nombre ya
   * resuelto. Si aparece un archivo nuevo acá, es un lector nuevo y el test falla;
   * no hay allowlist que se pueda ampliar sin editar esta lista a propósito.
   */
  const PROYECTAN_EL_NOMBRE: Record<string, string> = {
    "app/admin/configuracion/page.tsx":
      "formulario: muestra la proyección y manda el renombre a PUT /api/comunidad-actual",
    "app/api/avisos-cobro/[id]/pdf/route.ts":
      "proyección: compone el nombre desde Comunidad.nombre antes de imprimir",
    "app/api/avisos-cobro/route.ts":
      "proyección: compone el nombre desde Comunidad.nombre para la pantalla",
    "app/api/certificados-ct/[id]/pdf/route.ts":
      "proyección: compone el nombre desde Comunidad.nombre antes de imprimir",
    "app/api/configuracion/route.ts":
      "GET proyecta Comunidad.nombre y omite la columna; PUT escribe el snapshot de creación y descarta el campo",
    "app/api/cortes-servicio/requerimiento/route.ts":
      "proyección: compone la identidad del encabezado (nombre desde Comunidad.nombre)",
    "app/api/cortes-servicio/route.ts":
      "proyección: compone la identidad del encabezado (nombre desde Comunidad.nombre)",
    "app/api/liquidaciones/[id]/pdf/route.ts":
      "proyección: compone el nombre desde Comunidad.nombre antes de imprimir",
    "app/comunidad/comunicacion/page.tsx":
      "prop con el nombre de la comunidad para el texto de lectura; no toca la columna",
    "app/visor-mensajes/page.tsx":
      "pinta la proyección de GET /api/configuracion; no toca la columna",
    "lib/api/use-avisos-cobro.ts":
      "tipo del documento que sirve la API, con el nombre ya proyectado",
    "lib/pdf-utils.ts": "recibe el nombre ya resuelto; no consulta la base",
    "lib/schemas.ts":
      "campo del contrato (marcado deprecado), su exclusión en el schema de escritura y la regla reutilizable del nombre",
  }

  it("ningún archivo nuevo de app/ o lib/ toca la columna deprecada", () => {
    const conMencion = archivosDeCodigo().filter((archivo) =>
      lineasDeCodigo(archivo).some((linea) => linea.includes("nombreComunidad"))
    )
    expect(conMencion).toEqual(Object.keys(PROYECTAN_EL_NOMBRE).sort())
  })

  it("ningún select pide la columna: sólo se excluye (omit) o se escribe el snapshot", () => {
    for (const archivo of archivosDeCodigo()) {
      for (const linea of lineasDeCodigo(archivo)) {
        if (!/nombreComunidad\s*:\s*true/.test(linea)) continue
        // `omit: { nombreComunidad: true }` es lo contrario de leerla: la deja afuera.
        expect(linea, `${archivo}: ${linea}`).toMatch(/omit/)
      }
    }
    // Las dos proyecciones compartidas por los papeles no la piden.
    expect(COLUMNAS_AVISO).not.toHaveProperty("nombreComunidad")
    expect(COLUMNAS_LIQUIDACION).not.toHaveProperty("nombreComunidad")
    // Y la del requerimiento de corte tampoco: el nombre lo completa la ruta desde
    // `Comunidad.nombre`.
    expect(COLUMNAS_IDENTIDAD_INSTITUCIONAL).not.toHaveProperty("nombreComunidad")
  })
})
