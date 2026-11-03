/**
 * @vitest-environment node
 *
 * /api/comunidad/directorio — la puerta de LECTURA del directorio de emergencias.
 *
 * El defecto: la página `/comunidad/directorio` se gatea con `pe:directorio` ver
 * (lo tienen los cinco roles), pero los contactos se leían del maestro
 * administrativo `/api/maestros/contactos-emergencia`, cuyo gate es el del maestro
 * administrativo (`mp`: bancos, AFP, feriados, condiciones especiales), un permiso COMPLETO. Residente, conserjería y mantención abrían
 * la página y recibían 403 en los datos: directorio vacío. Y quien sí lo leía
 * (comité, administrador) estaba usando un permiso ancho para ver seis teléfonos.
 *
 * Decisión del owner: el directorio es información de la comunidad y todos los
 * roles lo leen. `pe:directorio` NO se angosta; lo que se separa es la PUERTA:
 * una lectura angosta con el permiso angosto, y el maestro administrativo intacto
 * para quien lo administra.
 *
 * Lo que se afirma acá:
 * - los cinco roles leen los contactos por la puerta nueva (200);
 * - anónimo 401 y un rol fuera de la matriz 403 (la puerta realmente gatea);
 * - los contactos servidos son IDÉNTICOS a los del maestro administrativo
 *   (mismos ids, nombres, teléfonos, categoría y sitio): mudar la puerta no puede
 *   cambiar un teléfono;
 * - la ruta no expone otros maestros ni verbos de escritura (`?tipo=bancos` sigue
 *   devolviendo contactos, y no existe POST/PUT/DELETE que tocar);
 * - el maestro administrativo no cambió: por rol, los códigos de
 *   `/api/maestros/<tipo>` son los de siempre y la fila conserva su forma completa.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { CONTACTOS_EMERGENCIA } from "@/data/admin/maestros"

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

const COMUNIDAD = "dir-emerg-comunidad"
const COMUNIDAD_VECINA = "dir-emerg-comunidad-vecina"
const COMUNIDAD_VACIA = "dir-emerg-comunidad-vacia"
const RUTA = "comunidad/directorio"

/** Los cinco roles con `pe:directorio` ver en la matriz RP. */
const ROLES_CON_DIRECTORIO = [
  "residente",
  "conserjeria",
  "mantencion",
  "comite",
  "administrador",
] as const

/** Ids propios: la PK del maestro es solo `id`, así que no se reusan los de la semilla. */
const IDS = CONTACTOS_EMERGENCIA.map((_, i) => `dir-emerg-${i + 1}`)

interface Contacto {
  id: string
  categoria?: string
  nombre: string
  telefono: string
  sitioWeb?: string
}

interface Coleccion {
  data: Contacto[]
  total?: number
}

/**
 * Huella comparable de una fila: todos los campos que el directorio pinta, con
 * los opcionales normalizados. El maestro devuelve además `comunidadId`,
 * `createdAt` y `updatedAt`; acá se comparan los datos del contacto, que es lo
 * que no puede cambiar al mudar la puerta.
 */
function huellas(filas: { id: string; categoria?: string | null; nombre: string; telefono: string; sitioWeb?: string | null }[]): string[] {
  return filas
    .map(
      (f) =>
        `${f.id}|${f.nombre}|${f.telefono}|${f.categoria ?? ""}|${f.sitioWeb ?? ""}`
    )
    .sort()
}

describe("/api/comunidad/directorio — puerta de lectura angosta", () => {
  const emails: Record<string, string> = {}

  async function crearUsuario(id: string, email: string, rol: string, comunidadId = COMUNIDAD) {
    await prisma.usuario.upsert({
      where: { email },
      update: { activo: true },
      create: { id, email, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: id } })
    await prisma.membresia.create({
      data: { usuarioId: id, comunidadId, rol },
    })
    emails[email] = id
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const [id, nombre, slug] of [
      [COMUNIDAD, "Comunidad Directorio", COMUNIDAD],
      [COMUNIDAD_VECINA, "Comunidad Vecina", COMUNIDAD_VECINA],
      // Comunidad sin contactos cargados: la lectura responde vacío y el panel
      // tiene un estado explícito para eso (no una tarjeta en blanco).
      [COMUNIDAD_VACIA, "Comunidad Sin Directorio", COMUNIDAD_VACIA],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre, slug },
      })
    }

    for (const rol of ROLES_CON_DIRECTORIO) {
      await crearUsuario(`dir-emerg-usuario-${rol}`, `dir-emerg-${rol}@test.cl`, rol)
    }
    // Rol que la matriz no conoce: existe la membresía, no el permiso.
    await crearUsuario("dir-emerg-usuario-invitado", "dir-emerg-invitado@test.cl", "invitado")
    // Sesión válida sin membresía: la API debe negarse sin comunidad asignada.
    await prisma.usuario.upsert({
      where: { email: "dir-emerg-sin-membresia@test.cl" },
      update: { activo: true },
      create: {
        id: "dir-emerg-usuario-sin-membresia",
        email: "dir-emerg-sin-membresia@test.cl",
        activo: true,
      },
    })
    await prisma.membresia.deleteMany({
      where: { usuarioId: "dir-emerg-usuario-sin-membresia" },
    })
    emails["dir-emerg-sin-membresia@test.cl"] = "dir-emerg-usuario-sin-membresia"
    // Usuario con membresía en la comunidad vecina: no ve los contactos de esta.
    await crearUsuario(
      "dir-emerg-usuario-vecino",
      "dir-emerg-vecino@test.cl",
      "residente",
      COMUNIDAD_VECINA
    )
    // Residente de una comunidad sin directorio: recibe la lista vacía explícita.
    await crearUsuario(
      "dir-emerg-usuario-vacio",
      "dir-emerg-vacio@test.cl",
      "residente",
      COMUNIDAD_VACIA
    )

    // Los seis contactos del maestro, con los mismos nombres y teléfonos de la
    // semilla de desarrollo (data/admin/maestros.ts).
    await prisma.contactoEmergencia.deleteMany({
      where: { comunidadId: COMUNIDAD },
    })
    for (const [i, contacto] of CONTACTOS_EMERGENCIA.entries()) {
      await prisma.contactoEmergencia.create({
        data: {
          id: IDS[i]!,
          comunidadId: COMUNIDAD,
          categoria: contacto.categoria ?? null,
          nombre: contacto.nombre,
          telefono: contacto.telefono,
          sitioWeb: contacto.sitioWeb ?? null,
        },
      })
    }
    // Un maestro administrativo con datos: la prueba de angostamiento necesita
    // que la ruta nueva TENGA algo más que ofrecer y no lo ofrezca.
    await prisma.banco.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.banco.create({
      data: { id: "dir-emerg-banco-1", comunidadId: COMUNIDAD, nombre: "Banco de Prueba" },
    })
    await prisma.banco.deleteMany({ where: { comunidadId: COMUNIDAD_VECINA } })
    await prisma.banco.create({
      data: {
        id: "dir-emerg-banco-vecino",
        comunidadId: COMUNIDAD_VECINA,
        nombre: "Banco Vecino",
      },
    })
    // Contacto de la comunidad vecina: no debe aparecer en la lectura de esta.
    await prisma.contactoEmergencia.deleteMany({
      where: { comunidadId: COMUNIDAD_VECINA },
    })
    await prisma.contactoEmergencia.create({
      data: {
        id: "dir-emerg-vecino-1",
        comunidadId: COMUNIDAD_VECINA,
        categoria: "urgencia",
        nombre: "Bomberos Vecinos",
        telefono: "000",
      },
    })
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      const usuarios = Object.values(emails)
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: usuarios } } })
      await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: "dir-emerg-usuario-sin-membresia" },
      })
      await prisma.usuario.deleteMany({
        where: { id: "dir-emerg-usuario-sin-membresia" },
      })
      await prisma.contactoEmergencia.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_VECINA, COMUNIDAD_VACIA] } },
      })
      await prisma.banco.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_VECINA, COMUNIDAD_VACIA] } },
      })
      await prisma.comunidad.deleteMany({
        where: { id: { in: [COMUNIDAD, COMUNIDAD_VECINA, COMUNIDAD_VACIA] } },
      })
    } catch {
      // intencional: limpieza best-effort
    }
  })

  /** Despacha un GET con la sesión del email indicado (null = anónimo). */
  async function get(
    email: string | null,
    ruta: string,
    opciones: { tipo?: string } = {}
  ): Promise<Response> {
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    const usuarioId = email ? emails[email] : undefined
    state.cookie = email
      ? await cookieSesionAuthjs({ sub: usuarioId ?? "", email })
      : ""
    try {
      const url = new URL(`http://localhost/api/${ruta}`)
      if (opciones.tipo) url.searchParams.set("tipo", opciones.tipo)
      const req = new NextRequest(url)
      if (ruta.startsWith("maestros/")) {
        const modulo = await import("@/app/api/maestros/[tipo]/route")
        const tipo = ruta.split("/")[1]!
        return await modulo.GET(req, { params: Promise.resolve({ tipo }) })
      }
      const modulo = await import("@/app/api/comunidad/directorio/route")
      return await modulo.GET()
    } finally {
      state.cookie = ""
    }
  }

  it("los cinco roles leen los seis contactos por la puerta nueva", async () => {
    for (const rol of ROLES_CON_DIRECTORIO) {
      const res = await get(`dir-emerg-${rol}@test.cl`, RUTA)
      expect(res.status, `rol ${rol}`).toBe(200)
      const cuerpo = (await res.json()) as Coleccion
      expect(cuerpo.data, `rol ${rol}`).toHaveLength(6)
      expect(cuerpo.total, `rol ${rol}`).toBe(6)
      expect(huellas(cuerpo.data)).toEqual(huellas(CONTACTOS_EMERGENCIA.map((c, i) => ({ ...c, id: IDS[i]! }))))
    }
  })

  it("anónimo no entra: 401 sin datos", async () => {
    const res = await get(null, RUTA)
    expect(res.status).toBe(401)
    const cuerpo = (await res.json()) as { error?: string }
    expect(cuerpo.error).toBe("No autenticado.")
  })

  it("un rol fuera de la matriz recibe 403 y ningún contacto", async () => {
    const res = await get("dir-emerg-invitado@test.cl", RUTA)
    expect(res.status).toBe(403)
    const cuerpo = (await res.json()) as { error?: string; data?: unknown }
    expect(cuerpo.error).toBe("Permiso denegado.")
    expect(cuerpo.data).toBeUndefined()
  })

  it("una sesión sin membresía no obtiene contactos (403 sin comunidad)", async () => {
    const res = await get("dir-emerg-sin-membresia@test.cl", RUTA)
    expect(res.status).toBe(403)
    const cuerpo = (await res.json()) as { error?: string }
    expect(cuerpo.error).toBe("Sin comunidad asignada.")
  })

  it("solo sirve los contactos de la comunidad de la sesión", async () => {
    const cuerpo = (await (await get("dir-emerg-vecino@test.cl", RUTA)).json()) as Coleccion
    expect(cuerpo.data.map((f) => f.id)).toEqual(["dir-emerg-vecino-1"])
    expect(cuerpo.total).toBe(1)
  })

  it("una comunidad sin contactos recibe una lista vacía explícita (alimenta el estado vacío)", async () => {
    const res = await get("dir-emerg-vacio@test.cl", RUTA)
    expect(res.status).toBe(200)
    const cuerpo = (await res.json()) as Coleccion
    // 200 con `data: []` y no un 403 ni un cuerpo sin forma: el panel puede
    // distinguir "no hay contactos" de "la lectura falló".
    expect(cuerpo.data).toEqual([])
    expect(cuerpo.total).toBe(0)
  })

  it("los contactos son idénticos a los del maestro administrativo", async () => {
    const nuevo = (await (await get("dir-emerg-residente@test.cl", RUTA)).json()) as Coleccion
    const maestro = (await (
      await get("dir-emerg-administrador@test.cl", "maestros/contactos-emergencia")
    ).json()) as Coleccion

    expect(nuevo.data).toHaveLength(6)
    expect(maestro.data).toHaveLength(6)
    // Mismos ids, nombres, teléfonos, categoría y sitio: una mudanza que cambie
    // un teléfono falla acá.
    expect(huellas(nuevo.data)).toEqual(huellas(maestro.data))
    // Y explícito, para que el arnés no pueda pasar por dos listas vacías.
    expect(nuevo.data.map((c) => c.telefono).sort()).toEqual(
      ["+56 2 2345 6789", "+56 9 1234 5678", "+56 9 8765 4321", "131", "132", "133"].sort()
    )
  })

  it("pedirle otro maestro devuelve contactos, nunca otro maestro", async () => {
    for (const tipo of ["bancos", "afps", "feriados", "condiciones-especiales"]) {
      const res = await get("dir-emerg-residente@test.cl", RUTA, { tipo })
      expect(res.status, tipo).toBe(200)
      const cuerpo = (await res.json()) as Coleccion
      expect(cuerpo.data, tipo).toHaveLength(6)
      expect(cuerpo.data.map((f) => f.id)).not.toContain("dir-emerg-banco-1")
      // Ninguna fila trae campos de otro maestro: el select de la ruta es cerrado.
      const CAMPOS_DE_CONTACTO = ["categoria", "id", "nombre", "sitioWeb", "telefono"]
      for (const fila of cuerpo.data) {
        for (const campo of Object.keys(fila)) {
          expect(CAMPOS_DE_CONTACTO, `${tipo}:${campo}`).toContain(campo)
        }
      }
    }
  })

  it("no expone verbos de escritura: la ruta solo sabe leer", async () => {
    const modulo = (await import("@/app/api/comunidad/directorio/route")) as Record<
      string,
      unknown
    >
    expect(typeof modulo.GET).toBe("function")
    for (const verbo of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(modulo[verbo], verbo).toBeUndefined()
    }
  })

  it("el maestro administrativo conserva sus códigos por rol (sin tocar el gate mp)", async () => {
    const esperado: Record<string, number> = {
      administrador: 200,
      comite: 200,
      residente: 403,
      conserjeria: 403,
      mantencion: 403,
    }
    for (const [rol, codigo] of Object.entries(esperado)) {
      for (const tipo of ["contactos-emergencia", "bancos"]) {
        const res = await get(`dir-emerg-${rol}@test.cl`, `maestros/${tipo}`)
        expect(res.status, `${rol} ${tipo}`).toBe(codigo)
      }
    }
    // Anónimo: 401 igual que antes.
    expect((await get(null, "maestros/bancos")).status).toBe(401)
  })

  it("el maestro administrativo sigue devolviendo la fila completa (misma forma)", async () => {
    const res = await get("dir-emerg-administrador@test.cl", "maestros/contactos-emergencia")
    const cuerpo = (await res.json()) as {
      data: Record<string, unknown>[]
      page: number
      pageSize: number
      total: number
    }
    expect(cuerpo.page).toBe(1)
    expect(cuerpo.pageSize).toBe(50)
    expect(cuerpo.total).toBe(6)
    // La fila administrativa no se angostó: conserva scoping y marcas de tiempo.
    for (const fila of cuerpo.data) {
      expect(Object.keys(fila).sort()).toEqual(
        ["categoria", "comunidadId", "createdAt", "id", "nombre", "sitioWeb", "telefono", "updatedAt"].sort()
      )
      expect(fila.comunidadId).toBe(COMUNIDAD)
    }
  })
})
