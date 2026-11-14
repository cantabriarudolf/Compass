/**
 * @vitest-environment node
 *
 * GET /api/metricas/titularidad — la superficie del panel que dice qué unidades
 * quedaron sin propietario vigente.
 *
 * El hecho lo deriva `app/admin/metricas/_titularidad.ts` (la ÚNICA definición);
 * esta ruta no recalcula nada: resuelve el scope de la sesión, exige el guard
 * del KPI de vigencia que vive al lado (`ad` + `editar`, NO `ver`: el residente
 * lo posee y esta respuesta lista unidades sin dueño) y proyecta unidad +
 * causa, sin NINGÚN dato de persona.
 *
 * Lo que fija (base REAL, fixture propio `met-tit-*`):
 *   1. sin sesión → 401; con rol `residente` (que tiene `ad: ver`) → 403.
 *   2. el administrador de una comunidad ve el total con las dos causas y una
 *      unidad por causa; la unidad con propietario vigente no aparece y la
 *      unidad sin dueño de la OTRA comunidad tampoco (scope de la sesión).
 *   3. la persona del vínculo cerrado existe en la base y JAMÁS sale en el
 *      cuerpo: ni nombre, ni RUT, ni email, ni id; cada fila es numero + causa.
 *   4. con más unidades sin dueño que el máximo de la lista, el total se
 *      declara completo y la lista viene cortada en su límite.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
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

const COMUNIDAD_A = "met-tit-com-a"
const COMUNIDAD_B = "met-tit-com-b"
const COMUNIDAD_C = "met-tit-com-c"

const EMAIL_ADMIN_A = "met-tit-admin-a@test.cl"
const EMAIL_ADMIN_B = "met-tit-admin-b@test.cl"
const EMAIL_RESIDENTE_A = "met-tit-residente@test.cl"
const EMAIL_ADMIN_C = "met-tit-admin-c@test.cl"

const USER_ADMIN_A = "met-tit-user-admin-a"
const USER_ADMIN_B = "met-tit-user-admin-b"
const USER_RESIDENTE_A = "met-tit-user-residente"
const USER_ADMIN_C = "met-tit-user-admin-c"

/** La persona detrás del vínculo cerrado: su dato NUNCA debe salir por la ruta. */
const PERSONA_CERRADA = "met-tit-persona-cerrada"
const NOMBRE_PERSONA = "Camila Ríos Soto"
const RUT_PERSONA = "12.345.678-9"
const EMAIL_PERSONA = "camila.rios@ejemplo.cl"

/** Unidad con propietario vigente: NO puede aparecer en la respuesta. */
const U_CON_DUENO = "met-tit-u-101"
/** Unidad sin NINGÚN vínculo de propietario: nunca declarada. */
const U_NUNCA = "met-tit-u-102"
/** Unidad cuyo único tramo de propietario se cerró sin reemplazo. */
const U_CERRADA = "met-tit-u-103"
/** Unidad sin dueño en la OTRA comunidad: el scope de la sesión la excluye. */
const U_OTRA_COMUNIDAD = "met-tit-u-201"

const FECHA_CIERRE = "2026-01-31"

/** Cantidad de unidades sin dueño de la comunidad C, por sobre el tope de 50. */
const SIN_DUENO_EN_C = 52

async function crearUnidad(
  id: string,
  numero: string,
  comunidadId: string
): Promise<void> {
  await prisma.unidad.create({
    data: {
      id,
      comunidadId,
      microSectorId: `micro-${id}`,
      numero,
      etiqueta: `Unidad ${numero}`,
      tipoUnidadId: `tipo-${id}`,
      metraje: 50,
      prorrateo: 1,
      rolSii: `rol-${id}`,
      estadoId: "habitada",
      servicios: {},
    },
  })
}

function moduloRuta(): Promise<typeof import("@/app/api/metricas/titularidad/route")> {
  return import("@/app/api/metricas/titularidad/route")
}

async function conSesion(
  email: string,
  fn: () => Promise<void>
): Promise<void> {
  const user = await prisma.usuario.findUnique({ where: { email } })
  if (!user) throw new Error(`usuario no encontrado: ${email}`)
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
  try {
    await fn()
  } finally {
    state.cookie = ""
  }
}

beforeAll(async () => {
  process.env.AUTH_SECRET ||= AUTH_SECRET

  for (const [id, nombre, slug] of [
    [COMUNIDAD_A, "Comunidad Titularidad A", "met-tit-com-a"],
    [COMUNIDAD_B, "Comunidad Titularidad B", "met-tit-com-b"],
    [COMUNIDAD_C, "Comunidad Titularidad C", "met-tit-com-c"],
  ] as const) {
    await prisma.comunidad.upsert({
      where: { id },
      update: {},
      create: { id, nombre, slug },
    })
  }

  const usuarios = [
    { id: USER_ADMIN_A, email: EMAIL_ADMIN_A },
    { id: USER_ADMIN_B, email: EMAIL_ADMIN_B },
    { id: USER_RESIDENTE_A, email: EMAIL_RESIDENTE_A },
    { id: USER_ADMIN_C, email: EMAIL_ADMIN_C },
  ] as const
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
  await prisma.membresia.create({
    data: { usuarioId: USER_ADMIN_A, comunidadId: COMUNIDAD_A, rol: "administrador" },
  })
  await prisma.membresia.create({
    data: { usuarioId: USER_ADMIN_B, comunidadId: COMUNIDAD_B, rol: "administrador" },
  })
  // El residente SÍ tiene `ad: ver`: si la ruta aceptara `ver`, este 403 no existiría.
  await prisma.membresia.create({
    data: { usuarioId: USER_RESIDENTE_A, comunidadId: COMUNIDAD_A, rol: "residente" },
  })
  await prisma.membresia.create({
    data: { usuarioId: USER_ADMIN_C, comunidadId: COMUNIDAD_C, rol: "administrador" },
  })

  await prisma.vinculoUnidad.deleteMany({
    where: { comunidadId: { in: [COMUNIDAD_A, COMUNIDAD_B, COMUNIDAD_C] } },
  })
  await prisma.unidad.deleteMany({
    where: { comunidadId: { in: [COMUNIDAD_A, COMUNIDAD_B, COMUNIDAD_C] } },
  })
  await prisma.persona.deleteMany({ where: { comunidadId: COMUNIDAD_A } })

  await prisma.persona.create({
    data: {
      id: PERSONA_CERRADA,
      comunidadId: COMUNIDAD_A,
      rut: RUT_PERSONA,
      nombreCompleto: NOMBRE_PERSONA,
      nombres: "Camila",
      apellidos: "Ríos Soto",
      email: EMAIL_PERSONA,
      telefonoMovil: "+56912345678",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: [],
    },
  })

  await crearUnidad(U_CON_DUENO, "101", COMUNIDAD_A)
  await crearUnidad(U_NUNCA, "102", COMUNIDAD_A)
  await crearUnidad(U_CERRADA, "103", COMUNIDAD_A)
  await crearUnidad(U_OTRA_COMUNIDAD, "201", COMUNIDAD_B)

  // La unidad con dueño: tramo de propietario VIGENTE (fechaFin null).
  await prisma.vinculoUnidad.create({
    data: {
      id: "met-tit-vinculo-vigente",
      comunidadId: COMUNIDAD_A,
      personaId: PERSONA_CERRADA,
      unidadId: U_CON_DUENO,
      rol: "propietario",
      fechaInicio: "2020-01-01",
      fechaFin: null,
      permiteVerFinanzas: false,
    },
  })
  // La unidad vendida sin comprador: el tramo quedó cerrado y no hay reemplazo.
  await prisma.vinculoUnidad.create({
    data: {
      id: "met-tit-vinculo-cerrado",
      comunidadId: COMUNIDAD_A,
      personaId: PERSONA_CERRADA,
      unidadId: U_CERRADA,
      rol: "propietario",
      fechaInicio: "2015-01-01",
      fechaFin: FECHA_CIERRE,
      permiteVerFinanzas: false,
    },
  })

  // Comunidad C: más unidades sin dueño que el máximo de la lista (52 > 50).
  for (let i = 1; i <= SIN_DUENO_EN_C; i++) {
    const numero = `C-${String(i).padStart(2, "0")}`
    await crearUnidad(`met-tit-u-c-${i}`, numero, COMUNIDAD_C)
  }
}, 30_000)

afterAll(async () => {
  try {
    await prisma.vinculoUnidad.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_A, COMUNIDAD_B, COMUNIDAD_C] } },
    })
    await prisma.unidad.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD_A, COMUNIDAD_B, COMUNIDAD_C] } },
    })
    await prisma.persona.deleteMany({ where: { comunidadId: COMUNIDAD_A } })
    await prisma.membresia.deleteMany({
      where: {
        usuarioId: {
          in: [USER_ADMIN_A, USER_ADMIN_B, USER_RESIDENTE_A, USER_ADMIN_C],
        },
      },
    })
    await prisma.usuario.deleteMany({
      where: {
        id: { in: [USER_ADMIN_A, USER_ADMIN_B, USER_RESIDENTE_A, USER_ADMIN_C] },
      },
    })
    await prisma.comunidad.deleteMany({
      where: { id: { in: [COMUNIDAD_A, COMUNIDAD_B, COMUNIDAD_C] } },
    })
  } catch {
    // limpieza best-effort
  }
})

describe("GET /api/metricas/titularidad — guard y scope", () => {
  it("sin sesión responde 401", async () => {
    const { GET } = await moduloRuta()
    const respuesta = await GET()
    expect(respuesta.status).toBe(401)
  })

  it("el residente no ve qué unidades quedaron sin dueño: 403 (ad: ver no alcanza)", async () => {
    await conSesion(EMAIL_RESIDENTE_A, async () => {
      const { GET } = await moduloRuta()
      const respuesta = await GET()
      expect(respuesta.status).toBe(403)
      const cuerpo = await respuesta.json()
      expect(cuerpo.error).toBeTruthy()
    })
  })

  it("el administrador ve el total con las dos causas y una unidad por causa", async () => {
    await conSesion(EMAIL_ADMIN_A, async () => {
      const { GET } = await moduloRuta()
      const respuesta = await GET()
      expect(respuesta.status).toBe(200)
      const cuerpo = await respuesta.json()

      expect(cuerpo.sinTitular).toBe(2)
      expect(cuerpo.nuncaDeclarado).toBe(1)
      expect(cuerpo.vinculoCerradoSinReemplazo).toBe(1)
      // Ordenado por número, con la causa exacta de cada unidad.
      expect(cuerpo.unidades).toEqual([
        { numero: "102", causa: "nunca_declarado" },
        { numero: "103", causa: "vinculo_cerrado_sin_reemplazo" },
      ])
    })
  })

  it("el scope sale de la membresía, no del cliente: cada admin ve su comunidad y ninguna otra", async () => {
    await conSesion(EMAIL_ADMIN_B, async () => {
      const { GET } = await moduloRuta()
      const respuesta = await GET()
      expect(respuesta.status).toBe(200)
      const cuerpo = await respuesta.json()

      // La de B existe y es la única: la de A (que también está sin dueño) no sale.
      expect(cuerpo.sinTitular).toBe(1)
      expect(cuerpo.unidades).toEqual([
        { numero: "201", causa: "nunca_declarado" },
      ])
    })
  })
})

describe("GET /api/metricas/titularidad — sin datos de persona", () => {
  it("la persona del vínculo cerrado está en la base y jamás sale en el cuerpo", async () => {
    // Guardia del fixture: la persona EXISTE para que la prueba no pase por vacío.
    const persona = await prisma.persona.findUnique({
      where: { id: PERSONA_CERRADA },
    })
    expect(persona?.nombreCompleto).toBe(NOMBRE_PERSONA)

    await conSesion(EMAIL_ADMIN_A, async () => {
      const { GET } = await moduloRuta()
      const respuesta = await GET()
      expect(respuesta.status).toBe(200)
      const cuerpo = await respuesta.json()

      const texto = JSON.stringify(cuerpo)
      for (const dato of [
        "Camila",
        "Ríos",
        "Soto",
        EMAIL_PERSONA,
        RUT_PERSONA,
        PERSONA_CERRADA,
        "+56912345678",
      ]) {
        expect(texto).not.toContain(dato)
      }

      // Cada fila es numero + causa, y NADA más: la forma del contrato.
      for (const unidad of cuerpo.unidades) {
        expect(Object.keys(unidad).sort()).toEqual(["causa", "numero"])
      }
    })
  })
})

describe("GET /api/metricas/titularidad — la lista se corta y el total se declara", () => {
  it("con 52 unidades sin dueño, el total declara 52 y la lista trae 50", async () => {
    await conSesion(EMAIL_ADMIN_C, async () => {
      const { GET } = await moduloRuta()
      const respuesta = await GET()
      expect(respuesta.status).toBe(200)
      const cuerpo = await respuesta.json()

      expect(cuerpo.sinTitular).toBe(SIN_DUENO_EN_C)
      expect(cuerpo.unidades).toHaveLength(50)
    })
  })
})
