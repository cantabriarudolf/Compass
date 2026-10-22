/**
 * @vitest-environment node
 *
 * Acta de asamblea publicada en el visor CV — POR REFERENCIA (SERIE-FASE2 §V6).
 * BD real.
 *
 * La página `app/comunidad/visor/page.tsx` publicaba el acta con la acción
 * legacy `publicarActaEnCV` del store, que COPIABA el acta dentro de un aviso CV.
 * El contrato nuevo es por referencia: el visor guarda `actaId` + visibilidad y
 * resuelve el contenido al leer desde GD. Este archivo fija la ventana:
 *
 * - publicar acta publicada → 201 y visible en la vista general;
 * - publicar dos veces no duplica la fila ni repite el evento;
 * - borrador y desestimada → 409 (solo lo publicado por quórum se difunde);
 * - despublicar deja de aparecer, audita `CV_ACTA_DESPUBLICADA` y la segunda
 *   llamada → 404;
 * - comité y administrador publican/despublican;
 * - residente solo ve con `residenteVeActas` vigente (403 sin el control);
 * - vista general informativa: RUT enmascarado, sin minuta ni individualización;
 * - 401 sin sesión y 404 cross-comunidad.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
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

const comunidad = "cv6-comunidad"
const otraComunidad = "cv6-otra-comunidad"

const emailAdmin = "cv6-admin@test.cl"
const emailComite = "cv6-comite@test.cl"
const emailResidente = "cv6-residente@test.cl"
const emailAdminOtra = "cv6-admin-otra@test.cl"

const actaPublicada = "cv6-acta-publicada"
const actaBorrador = "cv6-acta-borrador"
const actaDesestimada = "cv6-acta-desestimada"
const actaOtraComunidad = "cv6-acta-otra"

const unidadId = "cv6-u1"
const personaResidente = "cv6-p3"
const controlId = "cv6-ctrl-1"

const MINUTA_SENSIBLE =
  "Se debate la situación de la unidad 302 y su deuda; se aplica una sanción al propietario."

const emailToId = (email: string): string => email.split("@")[0] ?? email

const cargaModulos = async () => ({
  coleccion: await import("@/app/api/cv/actas/route"),
  despublicar: await import("@/app/api/cv/actas/[actaId]/despublicar/route"),
})

const getJson = async (): Promise<Response> => {
  const { coleccion } = await cargaModulos()
  return coleccion.GET()
}

const postJson = async (url: string, body: unknown): Promise<Response> => {
  const { coleccion } = await cargaModulos()
  return coleccion.POST(
    new NextRequest(`http://localhost${url}`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
      headers: { "content-type": "application/json" },
    })
  )
}

const publicar = (actaId: string): Promise<Response> =>
  postJson("/api/cv/actas", { actaId })

const despublicar = async (actaId: string): Promise<Response> => {
  const { despublicar: modulo } = await cargaModulos()
  return modulo.POST(
    new NextRequest(
      `http://localhost/api/cv/actas/${actaId}/despublicar`,
      { method: "POST" }
    ),
    { params: Promise.resolve({ actaId }) }
  )
}

interface PublicacionApi {
  id: string
  actaId: string
  estado: string
  publicadoEn: string
  publicadoPorUsuarioId: string
  despublicadoEn?: string
  despublicadoPorUsuarioId?: string
  duplicado?: boolean
  acta?: {
    actaId: string
    fecha: string
    hora: string
    lugar: string
    temas: number
    asistentes: Array<{ nombre: string; documento: string }>
  } | null
}

const leerCuerpo = async (res: Response): Promise<Record<string, unknown>> =>
  (await res.json()) as Record<string, unknown>

const publicacionesVisibles = async (): Promise<PublicacionApi[]> => {
  const res = await getJson()
  expect(res.status).toBe(200)
  const cuerpo = (await res.json()) as { data: PublicacionApi[] }
  return cuerpo.data
}

const eventosCV = (tipoAccion?: string) =>
  prisma.eventoAuditoria.findMany({
    where: {
      comunidadId: comunidad,
      categoria: "CV",
      ...(tipoAccion ? { tipoAccion } : {}),
    },
    orderBy: { createdAt: "asc" },
  })

async function sembrarUsuarios(): Promise<void> {
  const roles: Array<[string, string, string, string | null]> = [
    [emailAdmin, "administrador", comunidad, null],
    [emailComite, "comite", comunidad, null],
    [emailResidente, "residente", comunidad, personaResidente],
    [emailAdminOtra, "administrador", otraComunidad, null],
  ]
  const ids = roles.map(([email]) => emailToId(email))
  await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
  for (const [email, rol, comunidadId, personaId] of roles) {
    await prisma.usuario.upsert({
      where: { email },
      update: { personaId },
      create: { id: emailToId(email), email, activo: true, personaId },
    })
    await prisma.membresia.create({
      data: { usuarioId: emailToId(email), comunidadId, rol },
    })
  }
}

function actaConstruida(
  id: string,
  estado: string,
  comunidadId: string
): Record<string, unknown> {
  return {
    id,
    comunidadId,
    fecha: "2026-10-15",
    hora: "19:30",
    lugar: "Sede comunitaria",
    tablaTemas: ["Presupuesto 2027", "Seguridad"],
    presentes: ["cv6-p1", "cv6-p2"],
    ausentes: [],
    invitados: [],
    minuta: MINUTA_SENSIBLE,
    adjuntos: [],
    estado,
    aprobaciones: [],
  }
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

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET
  for (const c of [
    { id: comunidad, nombre: "Comunidad CV6", slug: "cv6-comunidad" },
    { id: otraComunidad, nombre: "Comunidad CV6 Otra", slug: "cv6-otra" },
  ]) {
    await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
  }

  await prisma.periodoDirectiva.upsert({
    where: { id: "cv6-per-vig" },
    update: {},
    create: {
      id: "cv6-per-vig",
      comunidadId: comunidad,
      fechaInicio: "2026-01-15",
      duracionMeses: 24,
      fechaInscripcion: "2026-02-01",
      referenciaInscripcion: "Acta asamblea N° 1/2026",
      estado: "vigente",
      miembros: [],
    },
  })

  // RUT reales-formato: el de la vista general debe salir enmascarado.
  const personas: Array<[string, string, string, boolean]> = [
    ["cv6-p1", "11111111-1", "Ana Presidenta", true],
    ["cv6-p2", "22222222-2", "Bruno Tesorero", true],
    [personaResidente, "12345678-9", "Rosa Residente", false],
  ]
  for (const [id, rut, nombre, directiva] of personas) {
    await prisma.persona.upsert({
      where: { id },
      update: {},
      create: {
        id,
        comunidadId: comunidad,
        rut,
        nombreCompleto: nombre,
        nombres: nombre.split(" ")[0] ?? nombre,
        apellidos: nombre.split(" ").slice(1).join(" "),
        email: `${id}@test.cl`,
        telefonoMovil: "+56900000000",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: directiva ? ["propietario", "directiva"] : ["propietario"],
        ...(directiva
          ? {
              datosGobernanza: {
                id: `g-${id}`,
                cargoDirectiva: id === "cv6-p1" ? "presidente" : "tesorero",
                fechaAsuncion: "2026-01-15",
                periodoId: "cv6-per-vig",
              } as never,
            }
          : {}),
      },
    })
  }

  await prisma.unidad.upsert({
    where: { id: unidadId },
    update: {},
    create: {
      id: unidadId,
      comunidadId: comunidad,
      microSectorId: "cv6-ms1",
      numero: "101",
      etiqueta: "Depto",
      tipoUnidadId: "cv6-t1",
      metraje: 50,
      prorrateo: 1,
      rolSii: "1-1",
      estadoId: "habitada",
      servicios: {},
    },
  })
  await prisma.controlPropiedad.upsert({
    where: { id: controlId },
    update: { residenteVeActas: true, estado: "vigente" },
    create: {
      id: controlId,
      comunidadId: comunidad,
      unidadId,
      residenteVeMorosidad: false,
      residenteVeActas: true,
      alertasResidentesActivas: true,
      estado: "vigente",
    },
  })

  await sembrarUsuarios()
  // Los módulos de ruta importan el stack de Auth.js: se cargan acá para que el
  // primer test no pague ese costo.
  await cargaModulos()
}, 60_000)

beforeEach(async () => {
  state.cookie = ""
  await prisma.actaPublicadaCV.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.eventoAuditoria.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] }, categoria: "CV" },
  })
  await prisma.actaGD.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  // El acta canónica vive en GD: el visor solo referencia su id.
  await prisma.actaGD.create({
    data: actaConstruida(actaPublicada, "publicada", comunidad) as never,
  })
  await prisma.actaGD.create({
    data: actaConstruida(actaBorrador, "borrador", comunidad) as never,
  })
  await prisma.actaGD.create({
    data: actaConstruida(actaDesestimada, "desestimada", comunidad) as never,
  })
  await prisma.actaGD.create({
    data: actaConstruida(actaOtraComunidad, "publicada", otraComunidad) as never,
  })
  await prisma.controlPropiedad.update({
    where: { id: controlId },
    data: { residenteVeActas: true, estado: "vigente" },
  })
})

afterAll(async () => {
  try {
    state.cookie = ""
    await prisma.actaPublicadaCV.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.actaGD.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.controlPropiedad.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.unidad.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.periodoDirectiva.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.persona.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.membresia.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    for (const email of [emailAdmin, emailComite, emailResidente, emailAdminOtra]) {
      await prisma.usuario.delete({ where: { email } }).catch(() => {})
    }
    for (const id of [comunidad, otraComunidad]) {
      await prisma.comunidad.delete({ where: { id } }).catch(() => {})
    }
  } catch {
    // intencional: limpieza best-effort
  }
})

describe("/api/cv/actas — publicar actas por referencia (V6)", () => {
  it("sin sesión → 401 en GET y POST", async () => {
    state.cookie = ""
    expect((await getJson()).status).toBe(401)
    expect((await publicar(actaPublicada)).status).toBe(401)
  })

  it("publica un acta publicada por quórum → 201, referencia sin copiar contenido y evento", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await publicar(actaPublicada)
      expect(res.status).toBe(201)
      const cuerpo = (await leerCuerpo(res)) as unknown as PublicacionApi
      expect(cuerpo.estado).toBe("publicado")
      expect(cuerpo.actaId).toBe(actaPublicada)
      expect(cuerpo.publicadoPorUsuarioId).toBe(emailToId(emailAdmin))

      const filas = await prisma.actaPublicadaCV.findMany({
        where: { comunidadId: comunidad },
      })
      expect(filas).toHaveLength(1)
      // POR REFERENCIA: la tabla del visor no guarda contenido del acta.
      expect(Object.keys(filas[0] ?? {})).not.toContain("minuta")
      expect(Object.keys(filas[0] ?? {})).not.toContain("cuerpo")

      const visibles = await publicacionesVisibles()
      expect(visibles.map((p) => p.actaId)).toEqual([actaPublicada])

      const eventos = await eventosCV("CV_ACTA_PUBLICADA")
      expect(eventos).toHaveLength(1)
      expect(eventos[0]?.usuario).toBe(emailToId(emailAdmin))
    })
  })

  it("publicar dos veces no duplica la fila ni repite el evento", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await publicar(actaPublicada)).status).toBe(201)
      const repetido = await publicar(actaPublicada)
      expect(repetido.status).toBe(200)
      const cuerpo = (await leerCuerpo(repetido)) as unknown as PublicacionApi
      expect(cuerpo.duplicado).toBe(true)

      expect(
        await prisma.actaPublicadaCV.count({ where: { comunidadId: comunidad } })
      ).toBe(1)
      expect(await eventosCV("CV_ACTA_PUBLICADA")).toHaveLength(1)
    })
  })

  it("acta en borrador o desestimada → 409 (no se difunde lo no publicado)", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await publicar(actaBorrador)).status).toBe(409)
      expect((await publicar(actaDesestimada)).status).toBe(409)
      expect(
        await prisma.actaPublicadaCV.count({ where: { comunidadId: comunidad } })
      ).toBe(0)
      expect(await eventosCV("CV_ACTA_PUBLICADA")).toHaveLength(0)
    })
  })

  it("acta de otra comunidad o inexistente → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await publicar(actaOtraComunidad)).status).toBe(404)
      expect((await publicar("cv6-acta-nadie")).status).toBe(404)
    })
    await conSesion(emailAdminOtra, async () => {
      // El admin de la otra comunidad no puede publicar el acta de ésta.
      expect((await publicar(actaPublicada)).status).toBe(404)
      expect(await publicacionesVisibles()).toEqual([])
    })
  })

  it("despublicar → deja de aparecer, audita quién y cuándo; segunda llamada 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await publicar(actaPublicada)).status).toBe(201)
      expect(await publicacionesVisibles()).toHaveLength(1)

      const res = await despublicar(actaPublicada)
      expect(res.status).toBe(200)
      const cuerpo = (await leerCuerpo(res)) as unknown as PublicacionApi
      expect(cuerpo.estado).toBe("despublicado")
      expect(cuerpo.despublicadoPorUsuarioId).toBe(emailToId(emailAdmin))
      expect(cuerpo.despublicadoEn).toBeTruthy()

      expect(await publicacionesVisibles()).toEqual([])

      const eventos = await eventosCV("CV_ACTA_DESPUBLICADA")
      expect(eventos).toHaveLength(1)
      expect(eventos[0]?.usuario).toBe(emailToId(emailAdmin))
      expect(eventos[0]?.referenciaId).toBe(actaPublicada)

      expect((await despublicar(actaPublicada)).status).toBe(404)
    })
  })

  it("el comité publica y despublica (authz cv crear/editar)", async () => {
    await conSesion(emailComite, async () => {
      expect((await publicar(actaPublicada)).status).toBe(201)
      expect((await despublicar(actaPublicada)).status).toBe(200)
    })
    await conSesion(emailAdmin, async () => {
      const eventos = await eventosCV()
      expect(eventos.map((e) => e.tipoAccion)).toEqual([
        "CV_ACTA_PUBLICADA",
        "CV_ACTA_DESPUBLICADA",
      ])
      expect(eventos.every((e) => e.usuario === emailToId(emailComite))).toBe(true)
    })
  })

  it("residente con residenteVeActas vigente ve la vista general informativa", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await publicar(actaPublicada)).status).toBe(201)
    })
    await conSesion(emailResidente, async () => {
      const res = await getJson()
      expect(res.status).toBe(200)
      const cuerpo = (await res.json()) as {
        data: PublicacionApi[]
        textoInformativo: string
      }
      expect(cuerpo.textoInformativo).toBe(
        "Versión informativa — el documento oficial es el libro de actas"
      )
      expect(cuerpo.data).toHaveLength(1)
      const acta = cuerpo.data[0]?.acta
      expect(acta?.lugar).toBe("Sede comunitaria")
      expect(acta?.temas).toBe(2)

      // La vista general no individualiza: RUT enmascarado y sin minuta.
      const crudo = JSON.stringify(cuerpo)
      expect(crudo).not.toContain("22222222-2")
      expect(crudo).not.toContain(MINUTA_SENSIBLE)
      expect(crudo).not.toContain("unidad 302")
      const documentos = (acta?.asistentes ?? []).map((a) => a.documento)
      expect(documentos).toContain("***.***.222-2")
      expect(documentos.every((d) => d.includes("***"))).toBe(true)
    })
  })

  it("residente sin residenteVeActas vigente → 403", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await publicar(actaPublicada)).status).toBe(201)
    })
    await prisma.controlPropiedad.update({
      where: { id: controlId },
      data: { residenteVeActas: false },
    })
    await conSesion(emailResidente, async () => {
      expect((await getJson()).status).toBe(403)
    })
    // Un control desestimado tampoco habilita la vista.
    await prisma.controlPropiedad.update({
      where: { id: controlId },
      data: { residenteVeActas: true, estado: "desestimada" },
    })
    await conSesion(emailResidente, async () => {
      expect((await getJson()).status).toBe(403)
    })
  })
})
