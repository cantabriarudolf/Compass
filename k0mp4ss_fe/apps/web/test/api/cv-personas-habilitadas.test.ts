// @vitest-environment node
/**
 * T12 (S10) — `GET /api/cv/personas-habilitadas`, el padrón de la creación manual
 * del visor.
 *
 * `app/comunidad/visor` llenaba dos lugares con el padrón truncado del cliente
 * (`usePersonas()` → `/api/personas?pageSize=100`, filtrado después con
 * `permiteCreacionManualCV`): la lectura de quién tiene habilitación
 * (visor/page.tsx:529) y el Select del autor «Registrar como creación de tercero
 * habilitado» (visor/page.tsx:607). Una persona habilitada fuera de las primeras
 * cien filas del padrón no existía para la pantalla — decía «Nadie habilitado
 * además de administración» cuando SÍ había alguien. Es la misma lista ciega que
 * la serie cerró en certificados y comunicación, pero el universo es
 * deliberadamente CHICO (sólo quien tiene el flag), así que la ruta NO es un
 * buscador con `q`: devuelve el conjunto COMPLETO, sin paginar, y declara `total`
 * para que el consumidor pueda declarar el recorte si algún día hiciera falta.
 *
 * Garantías de la serie «permisos por objeto»:
 *   · la compuerta de la matriz es `cv` con `ver` — la acción de lectura de la
 *     clave del visor, la misma del GET del crud-factory de avisos. Los cinco
 *     roles tienen `cv` ver (decisión owner 2026-10-21), así que la denegación
 *     observable es la de un rol que la matriz no conoce: falla cerrado;
 *   · el scope de comunidad sale de la sesión: la fila de otra comunidad no es un
 *     dato ajeno que se ignora, es una fila que no existe;
 *   · alcance por filas (`alcancePorFilasDeSesion`): administración y comité ven
 *     la comunidad; un rol acotado recibe a lo sumo SU propia persona y, sin
 *     ficha en el Maestro de Personas, NADA (fail-closed) — con `total: 0` antes
 *     de tocar la colección;
 *   · el filtro `permiteCreacionManualCV` es del SERVIDOR.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { cookieDeUsuario, invocarApi } from "../helpers/api-sesion"

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

const COM_A = "t12cv-com-a"
const COM_B = "t12cv-com-b"

// 120 personas habilitadas: la habilitada número 120 del padrón es la que el
// cliente recortaba con `pageSize=100` (el defecto T12).
const LOTE_CANTIDAD = 120
const filaId = (n: number) => `t12cv-p-fila-${String(n).padStart(3, "0")}`
const filaNombre = (n: number) => `Fila ${String(n).padStart(3, "0")}`

const P_ROSA = "t12cv-p-rosa" // habilitada; es la ficha del residente de COM_A
const P_ZOILA = "t12cv-p-zoila" // existe SIN el flag: el filtro es del servidor
const P_BERTA = "t12cv-p-berta" // habilitada de la OTRA comunidad

const EMAIL = {
  admin: "t12-cv-admin@test.cl",
  adminB: "t12-cv-admin-b@test.cl",
  residente: "t12-cv-residente@test.cl",
  sinFicha: "t12-cv-sinficha@test.cl",
  conserjeria: "t12-cv-conserjeria@test.cl",
  mantencion: "t12-cv-mantencion@test.cl",
  // `supervisor` no está en ROLES ni en los alias de `normalizaRol`: es el rol
  // sin la clave, la denegación observable de la compuerta.
  sinClave: "t12-cv-sinclave@test.cl",
}

const moduloRuta = () => import("@/app/api/cv/personas-habilitadas/route")

async function conSesion<T>(email: string | null, fn: () => Promise<T>): Promise<T> {
  if (email) state.cookie = await cookieDeUsuario(email)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

function pedir() {
  return invocarApi(moduloRuta(), "GET", "cv/personas-habilitadas")
}

interface PersonaHabilitada {
  id: string
  nombres: string
  apellidos: string
}
interface Coleccion {
  data: PersonaHabilitada[]
  total: number
  error?: string
}

async function cuerpo(res: Response): Promise<Coleccion> {
  return (await res.json()) as Coleccion
}

async function crearPersona(
  id: string,
  comunidadId: string,
  nombre: string,
  rut: string,
  habilitada: boolean
): Promise<void> {
  const [nombres, apellidos] = nombre.split(" ") as [string, string]
  await prisma.persona.create({
    data: {
      id,
      comunidadId,
      rut,
      nombreCompleto: nombre,
      nombres,
      apellidos,
      email: `${id}@t12.test.cl`,
      telefonoMovil: "+56911111111",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: ["propietario"],
      permiteCreacionManualCV: habilitada,
    },
  })
}

describe("T12 — GET /api/cv/personas-habilitadas", () => {
  beforeAll(async () => {
    for (const [id, nombre, slug] of [
      [COM_A, "Comunidad T12 CV A", "t12cv-a"],
      [COM_B, "Comunidad T12 CV B", "t12cv-b"],
    ] as const) {
      await prisma.comunidad.upsert({ where: { id }, update: {}, create: { id, nombre, slug } })
    }

    await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })

    // El lote: 120 habilitadas que ordenan primero (por nombreCompleto). Rosa
    // (121) y Zoila (122) quedan después; la posición 120 del padrón es una
    // habilitada, exactamente donde cortaba el cliente truncado.
    for (let n = 1; n <= LOTE_CANTIDAD; n++) {
      await crearPersona(filaId(n), COM_A, filaNombre(n), `10.${String(n).padStart(6, "0")}-K`, true)
    }
    await crearPersona(P_ROSA, COM_A, "Rosa Residente", "7.123.456-8", true)
    await crearPersona(P_ZOILA, COM_A, "Zoila Sin Flag", "8.222.222-2", false)
    await crearPersona(P_BERTA, COM_B, "Berta Ajena", "7.999.999-9", true)

    for (const u of [
      { email: EMAIL.admin, comunidadId: COM_A, rol: "administrador", personaId: null },
      { email: EMAIL.adminB, comunidadId: COM_B, rol: "administrador", personaId: null },
      { email: EMAIL.residente, comunidadId: COM_A, rol: "residente", personaId: P_ROSA },
      { email: EMAIL.sinFicha, comunidadId: COM_A, rol: "residente", personaId: null },
      { email: EMAIL.conserjeria, comunidadId: COM_A, rol: "conserjeria", personaId: null },
      { email: EMAIL.mantencion, comunidadId: COM_A, rol: "mantencion", personaId: P_ZOILA },
      { email: EMAIL.sinClave, comunidadId: COM_A, rol: "supervisor", personaId: null },
    ]) {
      const usuario = await prisma.usuario.upsert({
        where: { email: u.email },
        update: { personaId: u.personaId },
        create: { email: u.email, personaId: u.personaId, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
      await prisma.membresia.create({
        data: { usuarioId: usuario.id, comunidadId: u.comunidadId, rol: u.rol },
      })
    }
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      for (const email of Object.values(EMAIL)) {
        const usuario = await prisma.usuario.findUnique({ where: { email } })
        if (usuario) {
          await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
          await prisma.usuario.delete({ where: { id: usuario.id } }).catch(() => {})
        }
      }
      await prisma.comunidad.delete({ where: { id: COM_A } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: COM_B } }).catch(() => {})
    } catch {
      /* best-effort */
    }
  })

  it("sin sesión responde 401", async () => {
    const res = await conSesion(null, () => pedir())
    expect(res.status).toBe(401)
  })

  it("un rol que la matriz no conoce responde 403 literal (fail-closed de la compuerta)", async () => {
    // Con `cv` ver como compuerta, los cinco roles estándar entran (decisión
    // owner 2026-10-21: comité ver/crear/editar; conserjería, residente y
    // mantención sólo ver). La denegación observable es para un rol FUERA de la
    // matriz: si la compuerta se abriera o fallara abierto, este 403 se vuelve
    // 200 con el padrón de habilitados.
    const res = await conSesion(EMAIL.sinClave, () => pedir())
    expect(res.status).toBe(403)
    expect((await cuerpo(res)).error).toBe("Permiso denegado.")
  })

  it("la persona habilitada número 120 del padrón SÍ aparece, y el conjunto llega completo", async () => {
    await conSesion(EMAIL.admin, async () => {
      const res = await pedir()
      expect(res.status).toBe(200)
      const vista = await cuerpo(res)
      const esperadas = LOTE_CANTIDAD + 1 // las 120 Filas + Rosa
      expect(vista.total).toBe(esperadas)
      // Sin paginar: la respuesta no aplica el techo de cien del padrón truncado.
      expect(vista.data).toHaveLength(esperadas)
      // El defecto: la habilitada en la posición 120 del padrón se recortaba en
      // el cliente (`/api/personas?pageSize=100`); acá está, como todas.
      const ids = vista.data.map((p) => p.id)
      expect(ids).toContain(filaId(120))
      for (let n = 1; n <= LOTE_CANTIDAD; n++) {
        expect(ids).toContain(filaId(n))
      }
      expect(ids).toContain(P_ROSA)
    })
  })

  it("una persona habilitada de otra comunidad nunca aparece, en ninguna dirección", async () => {
    await conSesion(EMAIL.admin, async () => {
      const vista = await cuerpo(await pedir())
      expect(vista.data.some((p) => p.id === P_BERTA)).toBe(false)
    })
    await conSesion(EMAIL.adminB, async () => {
      const vista = await cuerpo(await pedir())
      // Para la administración de COM_B, lo único habilitado es Berta: la
      // comunidad ajena no es un dato que se ignore, es una fila que no existe.
      expect(vista.data.map((p) => p.id)).toEqual([P_BERTA])
    })
  })

  it("una persona SIN el flag nunca aparece: el filtro es del servidor", async () => {
    await conSesion(EMAIL.admin, async () => {
      const vista = await cuerpo(await pedir())
      expect(vista.data.some((p) => p.id === P_ZOILA)).toBe(false)
      // Zoila tampoco entra en el conteo: el recorte no lo hizo el cliente.
      expect(vista.total).toBe(LOTE_CANTIDAD + 1)
    })
  })

  it("un rol acotado sólo recibe su propia persona; sin ficha en MP, nada (fail-closed)", async () => {
    await conSesion(EMAIL.residente, async () => {
      // Aunque 121 filas de la comunidad son habilitadas para la administración,
      // el residente sólo recibe la SUYA.
      const vista = await cuerpo(await pedir())
      expect(vista.total).toBe(1)
      expect(vista.data.map((p) => p.id)).toEqual([P_ROSA])
    })
    await conSesion(EMAIL.sinFicha, async () => {
      // Sin ficha en MP no hay «lo propio» que comparar: colección vacía con
      // total 0, no un vacío que parezca «nadie está habilitado».
      const vista = await cuerpo(await pedir())
      expect(vista).toEqual({ data: [], total: 0 })
    })
    await conSesion(EMAIL.conserjeria, async () => {
      const vista = await cuerpo(await pedir())
      expect(vista).toEqual({ data: [], total: 0 })
    })
    // Con ficha, el flag del servidor también rige para «lo propio»: Zoila
    // existe y es la ficha de mantención, pero no tiene el flag → vacío.
    await conSesion(EMAIL.mantencion, async () => {
      const vista = await cuerpo(await pedir())
      expect(vista).toEqual({ data: [], total: 0 })
    })
  })
})
