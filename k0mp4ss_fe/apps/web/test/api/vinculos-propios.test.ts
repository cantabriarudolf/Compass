/**
 * @vitest-environment node
 *
 * /api/vinculos — alcance «solo lo propio» del RESIDENTE (`vu:propio`).
 *
 * El defecto que este archivo fija: `GET /api/vinculos` exigía el módulo `mp`, y
 * el residente solo tiene `mp:propios`, así que recibía 403. La pantalla
 * `/comunidad/certificados` arma «Persona solicitante» con `useVinculos`, de modo
 * que el select le quedaba VACÍO y no podía emitir su certificado de residencia
 * (lo destapó el journey endurecido de `e2e/crud/roles-journeys.spec.ts`).
 *
 * El arreglo es el mismo patrón que `fi:aviso:propio`: clave PROPIA en la matriz
 * + alcance resuelto en el SERVIDOR. Se prueba en las dos direcciones:
 * el residente ve SOLO su ficha (y por id ajeno obtiene 404, no 403: un 403
 * confirmaría que el vínculo existe) y administración y comité siguen viendo
 * todos los vínculos de la comunidad.
 *
 * Prisma real; el único mock es `next/headers` (la cookie de sesión Auth.js).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
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

const comunidadA = "vup-com-a"
const comunidadB = "vup-com-b"

const emailAdmin = "vup-admin@test.cl"
const emailComite = "vup-comite@test.cl"
const emailResidente = "vup-residente@test.cl"
const emailSinFicha = "vup-sin-ficha@test.cl"

/** La ficha del residente y la de un tercero de la misma comunidad. */
const personaPropia = "vup-p-propia"
const personaAjena = "vup-p-ajena"

const vinculoPropioVigente = "vup-v-propia-vig"
const vinculoPropioCerrado = "vup-v-propia-cerrado"
const vinculoAjeno = "vup-v-ajena"
/** Vínculo de la MISMA persona en otra comunidad: el scoping no cambia por eso. */
const vinculoOtraComunidad = "vup-v-otra-com"

type FilaVinculo = { id: string; personaId: string; unidadId: string; fechaFin: string | null }
type RespuestaLista = { data: FilaVinculo[]; page: number; pageSize: number; total: number }

describe("/api/vinculos — el residente lee solo sus vínculos (vu:propio)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const c of [
      { id: comunidadA, nombre: "Comunidad VUP A", slug: "vup-a" },
      { id: comunidadB, nombre: "Comunidad VUP B", slug: "vup-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    const usuarios = [
      { id: "vup-user-admin", email: emailAdmin, personaId: null },
      { id: "vup-user-comite", email: emailComite, personaId: null },
      // La identidad MP del residente sale de su usuario: es la que la ruta usa
      // para acotar el conjunto. El cliente nunca la aporta.
      { id: "vup-user-residente", email: emailResidente, personaId: personaPropia },
      // Sin ficha ligada: «lo propio» no existe → conjunto vacío, nunca 403.
      { id: "vup-user-sin-ficha", email: emailSinFicha, personaId: null },
    ]
    for (const u of usuarios) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: true, personaId: u.personaId },
        create: { ...u, activo: true },
      })
    }

    const membresias = [
      { usuarioId: "vup-user-admin", comunidadId: comunidadA, rol: "administrador" },
      { usuarioId: "vup-user-comite", comunidadId: comunidadA, rol: "comite" },
      { usuarioId: "vup-user-residente", comunidadId: comunidadA, rol: "residente" },
      { usuarioId: "vup-user-sin-ficha", comunidadId: comunidadA, rol: "residente" },
    ]
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: membresias.map((m) => m.usuarioId) } },
    })
    for (const m of membresias) await prisma.membresia.create({ data: m })

    await limpiarEntidades()

    const personas: Prisma.PersonaUncheckedCreateInput[] = [
      { id: personaPropia, comunidadId: comunidadA, nombreCompleto: "Rita Propia" },
      { id: personaAjena, comunidadId: comunidadA, nombreCompleto: "Tito Ajeno" },
      { id: "vup-p-b", comunidadId: comunidadB, nombreCompleto: "Bea Otra" },
    ].map((p, i) => ({
      ...p,
      rut: `4000000${i}-1`,
      nombres: (p.nombreCompleto as string).split(" ")[0] as string,
      apellidos: (p.nombreCompleto as string).split(" ")[1] as string,
      email: `${p.id}@test.cl`,
      telefonoMovil: "+56900000000",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: [],
    }))
    for (const p of personas) await prisma.persona.create({ data: p })

    const unidades = [
      { id: "vup-u-1", comunidadId: comunidadA, numero: "101" },
      { id: "vup-u-2", comunidadId: comunidadA, numero: "102" },
      { id: "vup-u-b", comunidadId: comunidadB, numero: "201" },
    ]
    for (const u of unidades) {
      await prisma.unidad.create({
        data: {
          ...u,
          microSectorId: "vup-ms-1",
          etiqueta: `Depto ${u.numero}`,
          tipoUnidadId: "vup-tu-1",
          metraje: 60,
          prorrateo: 1,
          rolSii: `7777-${u.numero}`,
          estadoId: "vup-est-1",
          servicios: {},
        },
      })
    }

    const vinculos = [
      // Los dos tramos de la ficha propia: uno vigente y uno ya cerrado (la API
      // devuelve el historial de la persona; quién está vigente lo decide el
      // consumidor con `fechaFin`).
      { id: vinculoPropioVigente, comunidadId: comunidadA, personaId: personaPropia, unidadId: "vup-u-1", fechaInicio: "2020-05-10", fechaFin: null },
      { id: vinculoPropioCerrado, comunidadId: comunidadA, personaId: personaPropia, unidadId: "vup-u-2", fechaInicio: "2018-01-01", fechaFin: "2019-12-31" },
      // Tercero de la MISMA comunidad: el residente no debe verlo.
      { id: vinculoAjeno, comunidadId: comunidadA, personaId: personaAjena, unidadId: "vup-u-2", fechaInicio: "2021-03-01", fechaFin: null },
      // Misma persona en OTRA comunidad: tampoco (el scope de comunidad manda).
      { id: vinculoOtraComunidad, comunidadId: comunidadB, personaId: personaPropia, unidadId: "vup-u-b", fechaInicio: "2022-01-01", fechaFin: null },
    ]
    for (const v of vinculos) {
      await prisma.vinculoUnidad.create({
        data: { ...v, rol: "propietario", permiteVerFinanzas: true },
      })
    }
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    await limpiarEntidades()
    await prisma.membresia.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
    await prisma.usuario.deleteMany({ where: { email: { startsWith: "vup-" } } })
    await prisma.comunidad.deleteMany({ where: { id: { in: [comunidadB, comunidadA] } } })
  })

  async function limpiarEntidades(): Promise<void> {
    const enComunidades = { in: [comunidadA, comunidadB] }
    await prisma.controlPropiedad.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.unidad.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.persona.deleteMany({ where: { comunidadId: enComunidades } })
  }

  async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
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

  async function llamar(
    metodo: "GET" | "POST" | "PUT" | "DELETE",
    id?: string,
    body?: unknown,
    query = ""
  ): Promise<Response> {
    const esItem = id !== undefined
    const ruta = esItem
      ? await import("@/app/api/vinculos/[id]/route")
      : await import("@/app/api/vinculos/route")
    const req = new NextRequest(`http://localhost/api/vinculos${esItem ? `/${id}` : ""}${query}`, {
      method: metodo,
      ...(metodo === "GET" || metodo === "DELETE"
        ? {}
        : {
            body: JSON.stringify(body ?? {}),
            headers: { "content-type": "application/json" },
          }),
    })
    type HandlerItem = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
    if (esItem) {
      const handler = (ruta as unknown as Record<string, HandlerItem>)[metodo]
      if (!handler) throw new Error(`método no soportado: ${metodo}`)
      return handler(req, { params: Promise.resolve({ id }) })
    }
    const handler = (ruta as unknown as Record<string, (req: NextRequest) => Promise<Response>>)[metodo]
    if (!handler) throw new Error(`método no soportado: ${metodo}`)
    return handler(req)
  }

  async function lista(query = ""): Promise<RespuestaLista> {
    const res = await llamar("GET", undefined, undefined, query)
    expect(res.status).toBe(200)
    return (await res.json()) as RespuestaLista
  }

  it("el residente ve los vínculos de SU ficha (vigentes incluidos) y ninguno ajeno", async () => {
    await conSesion(emailResidente, async () => {
      const j = await lista("?pageSize=100")
      // 200 y no 403: la lectura propia existe. Solo los tramos de su persona,
      // nunca el de un tercero ni el de la misma persona en otra comunidad.
      expect(j.total).toBe(2)
      expect(j.data.map((v) => v.id).sort()).toEqual([vinculoPropioCerrado, vinculoPropioVigente].sort())
      expect(j.data.every((v) => v.personaId === personaPropia)).toBe(true)
      expect(j.data.some((v) => v.id === vinculoAjeno)).toBe(false)
      expect(j.data.some((v) => v.id === vinculoOtraComunidad)).toBe(false)
      // El tramo vigente de la unidad donde reside viaja con `fechaFin` nulo: es
      // lo que la pantalla necesita para ofrecer «Persona solicitante» + «Unidad».
      const vigentes = j.data.filter((v) => v.fechaFin === null)
      expect(vigentes.map((v) => v.unidadId)).toEqual(["vup-u-1"])
    })
  })

  it("pedir los vínculos de un tercero devuelve conjunto VACÍO con 200, nunca 403", async () => {
    await conSesion(emailResidente, async () => {
      const j = await lista(`?personaId=${personaAjena}`)
      // El parámetro solo INTERSECTA: no amplía el alcance propio.
      expect(j.data).toEqual([])
      expect(j.total).toBe(0)
      // Pedir la propia por parámetro sí devuelve lo mismo que sin parámetro.
      const propia = await lista(`?personaId=${personaPropia}`)
      expect(propia.total).toBe(2)
    })
  })

  it("el vínculo ajeno no se lee ni por id: 404 (no 403, que confirmaría que existe)", async () => {
    await conSesion(emailResidente, async () => {
      const propio = await llamar("GET", vinculoPropioVigente)
      expect(propio.status).toBe(200)
      const fila = (await propio.json()) as FilaVinculo
      expect(fila.personaId).toBe(personaPropia)

      const ajeno = await llamar("GET", vinculoAjeno)
      expect(ajeno.status).toBe(404)
      expect(((await ajeno.json()) as { error: string }).error).toBe("Registro no encontrado.")
    })
  })

  it("un residente sin ficha ligada lee conjunto vacío, no 403", async () => {
    await conSesion(emailSinFicha, async () => {
      const j = await lista()
      expect(j.data).toEqual([])
      expect(j.total).toBe(0)
    })
  })

  it("el residente NO escribe el padrón: POST, PUT y DELETE → 403 y la BD no cambia", async () => {
    await conSesion(emailResidente, async () => {
      const antes = await prisma.vinculoUnidad.count({ where: { comunidadId: comunidadA } })
      const alta = await llamar("POST", undefined, {
        id: "vup-v-intento",
        personaId: personaPropia,
        unidadId: "vup-u-1",
        rol: "propietario",
        fechaInicio: "2026-01-01",
        permiteVerFinanzas: true,
      })
      expect(alta.status).toBe(403)
      expect(
        (await llamar("PUT", vinculoPropioVigente, { permiteVerFinanzas: false })).status
      ).toBe(403)
      expect((await llamar("DELETE", vinculoPropioVigente)).status).toBe(403)
      expect(await prisma.vinculoUnidad.count({ where: { comunidadId: comunidadA } })).toBe(antes)
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "vup-v-intento" } })).toBeNull()
      const propio = await prisma.vinculoUnidad.findUnique({ where: { id: vinculoPropioVigente } })
      expect(propio?.permiteVerFinanzas).toBe(true)
    })
  })

  it("administración ve TODOS los vínculos de la comunidad, con o sin filtro por persona", async () => {
    await conSesion(emailAdmin, async () => {
      const todos = await lista("?pageSize=100")
      expect(todos.total).toBe(3)
      expect(todos.data.map((v) => v.id).sort()).toEqual(
        [vinculoPropioVigente, vinculoPropioCerrado, vinculoAjeno].sort()
      )
      // `?personaId=` acota la lista completa; no es la clave del residente.
      const filtrado = await lista(`?personaId=${personaAjena}`)
      expect(filtrado.total).toBe(1)
      expect(filtrado.data[0]?.id).toBe(vinculoAjeno)
    })
  })

  it("el comité sigue viendo TODOS los vínculos de la comunidad (rama mp sin cambios)", async () => {
    await conSesion(emailComite, async () => {
      const j = await lista("?pageSize=100")
      expect(j.total).toBe(3)
      expect(j.data.some((v) => v.id === vinculoAjeno)).toBe(true)
      expect(j.data.every((v) => v.id !== vinculoOtraComunidad)).toBe(true)
    })
  })
})
