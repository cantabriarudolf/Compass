// @vitest-environment node
/**
 * F36 — `GET /api/certificados-ct/buscar-personas`, la búsqueda ligera del
 * formulario de emisión.
 *
 * El formulario de certificados ofrecía la persona solicitante en una lista
 * truncada (`/api/personas?pageSize=100` filtrada en el cliente): un documento
 * legal sobre una persona que tenía que estar dentro de las primeras 100 filas
 * del padrón para poder elegirse. Este endpoint resuelve la búsqueda EN el
 * servidor con la regla de la pantalla —sólo personas con vínculo VIGENTE— y las
 * garantías de la serie «permisos por objeto»:
 *
 *   · `q` filtra sobre TODA la comunidad (nombre, RUT y email, como `/api/personas`);
 *   · la página es chica y la respuesta declara `total`, `page` y `pageSize`, así
 *     que el recorte se DECLARA en vez de esconderse;
 *   · el scope de comunidad sale de la sesión: la fila de otra comunidad no es un
 *     dato ajeno que se ignora, es una fila que no existe;
 *   · el alcance por filas es el de toda la serie (`alcancePorFilasDeSesion`):
 *     administración y comité buscan la comunidad; un rol acotado sólo encuentra
 *     SU propia persona y, sin ficha en MP, nada (falla cerrado);
 *   · la compuerta de la matriz es la clave de emisión de la tipología que
 *     alimenta (`ct:residencia` con `ver`, que por el fallback de prefijo da la
 *     misma población que `mis-vinculos`): quien no ve certificados no busca el
 *     padrón del formulario de emisión.
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

const COM_A = "f36b-com-a"
const COM_B = "f36b-com-b"

const U_A1 = "f36b-u-101"
const U_A2 = "f36b-u-102"
const U_B1 = "f36b-u-b1"

const P_ANA = "f36b-p-ana" // «Ana Buscada», vínculo vigente — la buscable
const P_CERRADA = "f36b-p-cerrada" // tiene vínculo, pero CERRADO: no aparece
const P_SUELTA = "f36b-p-suelta" // existe, sin vínculo: no aparece
// 30 personas del lote: la búsqueda de «F36 Lote» tiene más matches que la página.
const LOTE_CANTIDAD = 30
const loteId = (n: number) => `f36b-p-lote-${String(n).padStart(2, "0")}`
const P_B_ANA = "f36b-p-bana" // MISMA identidad en la otra comunidad

const EMAIL = {
  admin: "f36b-admin@test.cl",
  residente: "f36b-residente@test.cl",
  mantencion: "f36b-mantencion@test.cl",
  sinFicha: "f36b-sinficha@test.cl",
  adminB: "f36b-admin-b@test.cl",
}

const moduloBuscador = () => import("@/app/api/certificados-ct/buscar-personas/route")

async function conSesion<T>(email: string | null, fn: () => Promise<T>): Promise<T> {
  if (email) state.cookie = await cookieDeUsuario(email)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

function buscar(q: string, page?: number) {
  const query = new URLSearchParams({ q })
  if (page !== undefined) query.set("page", String(page))
  return invocarApi(moduloBuscador(), "GET", `certificados-ct/buscar-personas?${query}`)
}

interface FilaBuscada {
  id: string
  nombres: string
  apellidos: string
  rut: string
  vinculos: { id: string; unidadId: string; unidad: string; rol: string }[]
}
interface Coleccion {
  data: FilaBuscada[]
  page: number
  pageSize: number
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
  rut: string
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
      email: `${id}@f36b.test.cl`,
      telefonoMovil: "+56911111111",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: ["propietario"],
    },
  })
}

async function crearVinculo(
  id: string,
  comunidadId: string,
  personaId: string,
  unidadId: string,
  cerrado: boolean
): Promise<void> {
  await prisma.vinculoUnidad.create({
    data: {
      id,
      comunidadId,
      personaId,
      unidadId,
      rol: "propietario",
      fechaInicio: "2026-01-01",
      fechaFin: cerrado ? "2026-06-30" : null,
      permiteVerFinanzas: true,
    },
  })
}

describe("F36 — GET /api/certificados-ct/buscar-personas", () => {
  beforeAll(async () => {
    for (const [id, nombre, slug] of [
      [COM_A, "Comunidad F36B A", "f36b-a"],
      [COM_B, "Comunidad F36B B", "f36b-b"],
    ] as const) {
      await prisma.comunidad.upsert({ where: { id }, update: {}, create: { id, nombre, slug } })
    }

    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
    await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
    await prisma.unidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })

    for (const [id, comunidadId, numero] of [
      [U_A1, COM_A, "101"],
      [U_A2, COM_A, "102"],
      [U_B1, COM_B, "201"],
    ] as const) {
      await prisma.unidad.create({
        data: {
          id,
          comunidadId,
          microSectorId: `f36b-ms-${comunidadId}`,
          numero,
          etiqueta: "Depto",
          tipoUnidadId: `f36b-tu-${comunidadId}`,
          metraje: 55,
          prorrateo: 0.1,
          rolSii: `7100-${numero}`,
          estadoId: `f36b-est-${comunidadId}`,
          servicios: {},
        },
      })
    }

    await crearPersona(P_ANA, COM_A, "Ana Buscada", "7.123.456-8")
    await crearVinculo("f36b-v-ana", COM_A, P_ANA, U_A1, false)

    // Tiene vínculo, pero CERRADO: no es vigente, así que no es certificable.
    await crearPersona(P_CERRADA, COM_A, "Carla Cerrada", "8.222.222-2")
    await crearVinculo("f36b-v-cerrada", COM_A, P_CERRADA, U_A2, true)

    // Existe en el padrón pero sin vínculo alguno: nunca aparece.
    await crearPersona(P_SUELTA, COM_A, "Diego Suelto", "9.333.333-3")

    // El lote que rebasa el tope de la página: 30 matches para «F36 Lote».
    for (let n = 1; n <= LOTE_CANTIDAD; n++) {
      const id = loteId(n)
      await crearPersona(id, COM_A, `F36 Lote ${n}`, `11.444.44${n}-K`)
      await crearVinculo(`f36b-v-lote-${n}`, COM_A, id, U_A1, false)
    }

    // La MISMA identidad en la otra comunidad: el scope la deja afuera.
    await crearPersona(P_B_ANA, COM_B, "Ana Buscada", "7.999.999-9")
    await crearVinculo("f36b-v-bana", COM_B, P_B_ANA, U_B1, false)

    for (const u of [
      { email: EMAIL.admin, comunidadId: COM_A, rol: "administrador", personaId: null },
      { email: EMAIL.residente, comunidadId: COM_A, rol: "residente", personaId: P_ANA },
      { email: EMAIL.mantencion, comunidadId: COM_A, rol: "mantencion", personaId: null },
      { email: EMAIL.sinFicha, comunidadId: COM_A, rol: "residente", personaId: null },
      { email: EMAIL.adminB, comunidadId: COM_B, rol: "administrador", personaId: null },
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
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.unidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
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
    const res = await conSesion(null, () => buscar("Ana"))
    expect(res.status).toBe(401)
  })

  it("un rol sin `ct` ver no busca el padrón del formulario (403)", async () => {
    // mantencion no tiene `ct` en la matriz: no tiene nada que hacer en la emisión.
    const res = await conSesion(EMAIL.mantencion, () => buscar("Ana"))
    expect(res.status).toBe(403)
    expect((await cuerpo(res)).error).toBe("Permiso denegado.")
  })

  it("sin `q` responde 400: la búsqueda es la razón de la ruta", async () => {
    const res = await conSesion(EMAIL.admin, () =>
      invocarApi(moduloBuscador(), "GET", "certificados-ct/buscar-personas")
    )
    expect(res.status).toBe(400)
    expect((await cuerpo(res)).error).toBe("Falta el parámetro q.")
  })

  it("`q` filtra por nombre y por RUT sobre toda la comunidad", async () => {
    await conSesion(EMAIL.admin, async () => {
      const porNombre = await cuerpo(await buscar("Ana Buscada"))
      expect(porNombre.total).toBe(1)
      expect(porNombre.data.map((p) => p.id)).toEqual([P_ANA])

      const porRut = await cuerpo(await buscar("7.123.456"))
      expect(porRut.total).toBe(1)
      expect(porRut.data.map((p) => p.id)).toEqual([P_ANA])
    })
  })

  it("sin vínculo vigente no hay persona certificable: ni suelta ni con vínculo cerrado", async () => {
    await conSesion(EMAIL.admin, async () => {
      expect((await cuerpo(await buscar("Diego Suelto"))).total).toBe(0)
      expect((await cuerpo(await buscar("Carla Cerrada"))).total).toBe(0)
    })
  })

  it("la página declara el recorte: total 30, pageSize 25, y la página 2 trae el resto", async () => {
    await conSesion(EMAIL.admin, async () => {
      const pagina1 = await cuerpo(await buscar("F36 Lote"))
      expect(pagina1.total).toBe(LOTE_CANTIDAD)
      expect(pagina1.data).toHaveLength(25)
      expect(pagina1.page).toBe(1)
      expect(pagina1.pageSize).toBe(25)
      expect(pagina1.data.length).toBeLessThan(pagina1.total)

      const pagina2 = await cuerpo(await buscar("F36 Lote", 2))
      expect(pagina2.total).toBe(LOTE_CANTIDAD)
      expect(pagina2.data).toHaveLength(LOTE_CANTIDAD - 25)
      // Sin repetidos entre páginas.
      const ids = new Set([...pagina1.data, ...pagina2.data].map((p) => p.id))
      expect(ids.size).toBe(LOTE_CANTIDAD)
    })
  })

  it("la comunidad ajena nunca aparece, en ninguna de las dos direcciones", async () => {
    await conSesion(EMAIL.admin, async () => {
      const vista = await cuerpo(await buscar("Buscada"))
      expect(vista.data.map((p) => p.id)).toEqual([P_ANA])
      expect(vista.data.some((p) => p.id === P_B_ANA)).toBe(false)
    })
    await conSesion(EMAIL.adminB, async () => {
      const vista = await cuerpo(await buscar("Buscada"))
      expect(vista.data.map((p) => p.id)).toEqual([P_B_ANA])
      expect(vista.data.some((p) => p.id === P_ANA)).toBe(false)
    })
  })

  it("un rol acotado sólo encuentra su propia persona; sin ficha en MP, nada (fail-closed)", async () => {
    await conSesion(EMAIL.residente, async () => {
      const propia = await cuerpo(await buscar("Buscada"))
      expect(propia.data.map((p) => p.id)).toEqual([P_ANA])
      // Aunque 30 filas del lote matcheen para la administración, el residente no
      // ve ninguna que no sea la suya.
      const ajena = await cuerpo(await buscar("F36 Lote"))
      expect(ajena.total).toBe(0)
      expect(ajena.data).toEqual([])
    })
    await conSesion(EMAIL.sinFicha, async () => {
      const denegada = await cuerpo(await buscar("Buscada"))
      expect(denegada.total).toBe(0)
      expect(denegada.data).toEqual([])
    })
  })

  it("las filas traen los vínculos VIGENTES con el rótulo de unidad que imprime el certificado", async () => {
    await conSesion(EMAIL.admin, async () => {
      const vista = await cuerpo(await buscar("Ana Buscada"))
      expect(vista.data[0]?.nombres).toBe("Ana")
      expect(vista.data[0]?.apellidos).toBe("Buscada")
      expect(vista.data[0]?.rut).toBe("7.123.456-8")
      expect(vista.data[0]?.vinculos).toEqual([
        { id: "f36b-v-ana", unidadId: U_A1, unidad: "Depto 101", rol: "propietario" },
      ])
    })
  })
})
