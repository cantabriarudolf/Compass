// @vitest-environment node
/**
 * S10 — `GET /api/comunicacion/buscar-personas`, el buscador de vecinos del buzón.
 *
 * La consola de comunicación ofrecía al reportante de un reclamo en un `Select` que
 * montaba `usePersonas()` (`/api/personas?pageSize=100`): una persona fuera de las
 * primeras cien filas del padrón no se podía elegir. Este endpoint resuelve la búsqueda
 * en el servidor y lo que se fija acá es:
 *
 *   · la persona FUERA de las primeras cien filas se encuentra (el defecto);
 *   · la compuerta es `co:buzon` con `crear` —no `co` a secas—, así que un rol sin ese
 *     permiso recibe 403 literal y no un vacío silencioso;
 *   · el residente SÍ entra (tiene `co:buzon` crear): cerrarle esa clave le cerraría el
 *     canal de reclamos, que es justo lo que el sistema no puede hacer;
 *   · alcance por filas: el rol acotado sólo encuentra su propia persona, así que no
 *     puede registrar un reclamo a nombre de un vecino;
 *   · la comunidad ajena nunca aparece, en ninguna de las dos direcciones;
 *   · el recorte se declara (`total`), `q` necesita dos caracteres y el volumen tiene
 *     techo de 60 por minuto y por USUARIO —otro usuario no hereda el bloqueo.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
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

/**
 * T16 (R3-alcance-fuera-de-try): interruptor para que `alcancePorFilasDeSesion`
 * falle. El resto de los casos usan la implementación real sin enterarse.
 */
const alcanceControl = vi.hoisted(() => ({ fallar: false }))
vi.mock("@/lib/api/sesion-persona", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/sesion-persona")>()
  return {
    ...original,
    alcancePorFilasDeSesion: async (
      scope: Parameters<typeof original.alcancePorFilasDeSesion>[0]
    ) => {
      if (alcanceControl.fallar) throw new Error("fallo simulado del alcance por filas")
      return original.alcancePorFilasDeSesion(scope)
    },
  }
})

const COM_A = "s10b-com-a"
const COM_B = "s10b-com-b"

const P_ANA = "s10b-p-ana" // «Ana Vecina», la buscable
const P_INACTIVA = "s10b-p-inactiva" // activa=no: la pantalla tampoco la ofrecía
const P_B_ANA = "s10b-p-bana" // MISMA identidad en la otra comunidad

/** El lote que rebasa el techo del padrón del cliente: 120 filas ordenadas al final. */
const LOTE_CANTIDAD = 120
const loteId = (n: number) => `s10b-p-lote-${String(n).padStart(3, "0")}`
const loteNombre = (n: number) => `Zz Vecino ${String(n).padStart(3, "0")}`

const EMAIL = {
  admin: "s10b-admin@test.cl",
  comite: "s10b-comite@test.cl",
  residente: "s10b-residente@test.cl",
  sinFicha: "s10b-sinficha@test.cl",
  mantencion: "s10b-mantencion@test.cl", // sin `co:buzon`: el 403
  limite: "s10b-limite@test.cl", // cuota propia del caso de volumen
  adminB: "s10b-admin-b@test.cl",
}

const moduloBuscador = () => import("@/app/api/comunicacion/buscar-personas/route")

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
  return invocarApi(moduloBuscador(), "GET", `comunicacion/buscar-personas?${query}`)
}

interface Fila {
  id: string
  nombres: string
  apellidos: string
  rut: string
}
interface Coleccion {
  data?: Fila[]
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
  estadoCuenta = "activa"
): Promise<void> {
  const [nombres, apellidos] = nombre.split(" ") as [string, string]
  await prisma.persona.create({
    data: {
      id,
      comunidadId,
      rut: `44.${id.slice(-3)}.${id.slice(0, 3)}-K`,
      nombreCompleto: nombre,
      nombres,
      apellidos,
      email: `${id}@s10b.test.cl`,
      telefonoMovil: "+56922222222",
      estadoCuenta,
      condicionesEspecialesIds: [],
      roles: ["propietario"],
    },
  })
}

describe("S10 — GET /api/comunicacion/buscar-personas", () => {
  beforeAll(async () => {
    for (const [id, nombre, slug] of [
      [COM_A, "Comunidad S10B A", "s10b-a"],
      [COM_B, "Comunidad S10B B", "s10b-b"],
    ] as const) {
      await prisma.comunidad.upsert({ where: { id }, update: {}, create: { id, nombre, slug } })
    }

    await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })

    await crearPersona(P_ANA, COM_A, "Ana Vecina")
    await crearPersona(P_INACTIVA, COM_A, "Ines Inactiva", "inactiva")
    // 120 filas: si la ruta heredara el techo de cien del padrón del cliente, la última
    // no aparecería nunca.
    for (let n = 1; n <= LOTE_CANTIDAD; n++) {
      await crearPersona(loteId(n), COM_A, loteNombre(n))
    }
    await crearPersona(P_B_ANA, COM_B, "Ana Vecina")

    for (const u of [
      { email: EMAIL.admin, comunidadId: COM_A, rol: "administrador", personaId: null },
      { email: EMAIL.comite, comunidadId: COM_A, rol: "comite", personaId: null },
      { email: EMAIL.residente, comunidadId: COM_A, rol: "residente", personaId: P_ANA },
      { email: EMAIL.sinFicha, comunidadId: COM_A, rol: "residente", personaId: null },
      { email: EMAIL.mantencion, comunidadId: COM_A, rol: "mantencion", personaId: null },
      { email: EMAIL.limite, comunidadId: COM_A, rol: "administrador", personaId: null },
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
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.mensajeBuzonCO.deleteMany({ where: { id: { startsWith: "s10b-buz-" } } })
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
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
    const res = await conSesion(null, () => buscar("Ana"))
    expect(res.status).toBe(401)
  })

  it("un rol sin `co:buzon` crear no busca el padrón del buzón (403 literal)", async () => {
    // Mantención no tiene el buzón: el 403 es explícito, no un vacío silencioso que se
    // leería como «la persona no existe». Y el 403 de un handler a medida deja
    // constancia: RP §Menor Privilegio exige el evento `RP_PERMISSION_DENIED`
    // (T16, hallazgo L9c).
    const espia = vi.spyOn(logger, "warn").mockImplementation(() => {})
    try {
      const res = await conSesion(EMAIL.mantencion, () => buscar("Ana"))
      expect(res.status).toBe(403)
      expect((await cuerpo(res)).error).toBe("Permiso denegado.")

      const eventos = (
        espia.mock.calls as unknown as [Record<string, unknown>, string][]
      ).filter(([ctx]) => ctx?.event === "RP_PERMISSION_DENIED")
      expect(eventos).toHaveLength(1)
      expect(eventos[0]?.[0]).toMatchObject({
        rol: "mantencion",
        recurso: "co:buzon",
        accion: "crear",
        comunidadId: COM_A,
      })
      expect(typeof eventos[0]?.[0]?.usuarioId).toBe("string")
    } finally {
      espia.mockRestore()
    }
  })

  it("un fallo del alcance por filas muere en el 500 propio de la ruta, con constancia", async () => {
    // T16 (R3-alcance-fuera-de-try, R4-4): la resolución del alcance se esperaba
    // FUERA del `try`, así que un fallo de esa consulta escapaba del handler — la
    // promesa del GET se rechazaba sin `logger.error` ni 500 propio. Con el
    // interruptor activado, la respuesta tiene que ser la de la ruta, no una
    // excepción sin capturar que aterriza en la mano del test.
    const espia = vi.spyOn(logger, "error").mockImplementation(() => {})
    alcanceControl.fallar = true
    try {
      const res = await conSesion(EMAIL.admin, () => buscar("Ana"))
      expect(res.status).toBe(500)
      expect((await cuerpo(res)).error).toBe("Error interno del servidor.")
      const llamadas = espia.mock.calls as unknown as [unknown, string][]
      expect(llamadas.some(([, mensaje]) => mensaje.includes("buscar-personas"))).toBe(true)
    } finally {
      alcanceControl.fallar = false
      espia.mockRestore()
    }
  })

  it("la persona fuera de las primeras cien filas del padrón SÍ se encuentra", async () => {
    // El defecto: la consola sólo montaba `/api/personas?pageSize=100`, así que la fila
    // 120 era inelegible. La búsqueda mira toda la comunidad.
    await conSesion(EMAIL.admin, async () => {
      const vista = await cuerpo(await buscar(loteNombre(LOTE_CANTIDAD)))
      expect(vista.total).toBe(1)
      expect(vista.data?.map((p) => p.id)).toEqual([loteId(LOTE_CANTIDAD)])
    })
  })

  it("la búsqueda abarca la comunidad entera y declara el recorte con `total`", async () => {
    await conSesion(EMAIL.admin, async () => {
      const pagina1 = await cuerpo(await buscar("Zz Vecino"))
      expect(pagina1.total).toBe(LOTE_CANTIDAD)
      expect(pagina1.data).toHaveLength(25)
      expect(pagina1.pageSize).toBe(25)
      expect(pagina1.data?.length).toBeLessThan(pagina1.total)

      const pagina5 = await cuerpo(await buscar("Zz Vecino", 5))
      expect(pagina5.total).toBe(LOTE_CANTIDAD)
      expect(pagina5.data).toHaveLength(LOTE_CANTIDAD - 4 * 25)
    })
  })

  it("la persona inactiva no se ofrece, igual que antes en la pantalla", async () => {
    await conSesion(EMAIL.admin, async () => {
      const vista = await cuerpo(await buscar("Ines Inactiva"))
      expect(vista.total).toBe(0)
      expect(vista.data).toEqual([])
    })
  })

  it("la comunidad ajena nunca aparece, en ninguna de las dos direcciones", async () => {
    await conSesion(EMAIL.admin, async () => {
      const vista = await cuerpo(await buscar("Ana Vecina"))
      expect(vista.data?.map((p) => p.id)).toEqual([P_ANA])
      expect(vista.data?.some((p) => p.id === P_B_ANA)).toBe(false)
    })
    await conSesion(EMAIL.adminB, async () => {
      const vista = await cuerpo(await buscar("Ana Vecina"))
      expect(vista.data?.map((p) => p.id)).toEqual([P_B_ANA])
      expect(vista.data?.some((p) => p.id === P_ANA)).toBe(false)
    })
  })

  it("el residente entra (tiene `co:buzon` crear) pero sólo encuentra su propia persona", async () => {
    // El lado atractivo del pin: cerrarle `co:buzon` al residente le cerraría el canal
    // de reclamos, así que el 200 se fija. El alcance por filas es lo que impide que
    // registre un reclamo a nombre de un vecino.
    await conSesion(EMAIL.residente, async () => {
      const propia = await cuerpo(await buscar("Ana Vecina"))
      expect(propia.data?.map((p) => p.id)).toEqual([P_ANA])

      const ajena = await cuerpo(await buscar("Zz Vecino"))
      expect(ajena.total).toBe(0)
      expect(ajena.data).toEqual([])
    })
    await conSesion(EMAIL.sinFicha, async () => {
      const denegada = await cuerpo(await buscar("Ana Vecina"))
      expect(denegada.total).toBe(0)
      expect(denegada.data).toEqual([])
    })
  })

  it("sin `q` y con `q` de un carácter responde 400 literal, sin filas", async () => {
    await conSesion(EMAIL.admin, async () => {
      const sinQ = await invocarApi(moduloBuscador(), "GET", "comunicacion/buscar-personas")
      expect(sinQ.status).toBe(400)
      expect((await cuerpo(sinQ)).error).toBe("Falta el parámetro q.")

      const letra = await buscar("A")
      expect(letra.status).toBe(400)
      const vista = await cuerpo(letra)
      expect(vista.error).toBe("El parámetro q necesita al menos dos caracteres.")
      expect(vista.data).toBeUndefined()

      // El borde de arriba sigue entrando.
      expect((await buscar("An")).status).toBe(200)
    })
  })

  it("la cuota es por RUTA: las búsquedas de certificados no gastan la del buzón", async () => {
    // Lo encontró el verificador independiente midiendo: con el contador compartido y sin
    // ámbito, cuarenta búsquedas de certificados dejaban al mismo usuario con el buzón
    // cortado en la solicitud 21. El ámbito de la clave es obligatorio en `excedeVolumen`,
    // y este caso fija que las dos rutas gasten pozos distintos.
    //
    // Usa `admin` y no `limite`: el caso del 429 es el dueño exclusivo de la cuota de
    // `limite`, y compartir usuario entre los dos casos los acoplaría por orden de corrida.
    await conSesion(EMAIL.admin, async () => {
      const cert = () => import("@/app/api/certificados-ct/buscar-personas/route")
      for (let n = 0; n < 40; n++) {
        expect((await invocarApi(cert(), "GET", "certificados-ct/buscar-personas?q=Ana")).status).toBe(200)
      }
      // 40 + 25 = 65 > 60: con un pozo compartido, la búsqueda 21 del buzón ya corta
      // (`[200×20, 429×5]`, medido por el verificador). Con pozos separados, las 25 pasan.
      for (let n = 0; n < 25; n++) {
        expect((await buscar("Ana Vecina")).status).toBe(200)
      }
    })
  }, 60_000)

  it("una persona con vínculo cerrado sigue siendo buscable: el universo es la cuenta activa", async () => {
    // Decisión, no accidente: la ruta NO agrega el requisito de vínculo vigente de la de
    // certificados, porque acotar la población sería decidir quién puede reclamar. Este
    // caso fija el universo que la pantalla ya tenía (`estadoCuenta: "activa"`).
    await prisma.persona.create({
      data: {
        id: "s10b-p-egresada",
        comunidadId: COM_A,
        rut: "44.999.999-Z",
        nombreCompleto: "Egreso Cerrado",
        nombres: "Egreso",
        apellidos: "Cerrado",
        email: "s10b-p-egresada@s10b.test.cl",
        telefonoMovil: "+56922222222",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["propietario"],
      },
    })
    await conSesion(EMAIL.admin, async () => {
      const vista = await cuerpo(await buscar("Egreso Cerrado"))
      expect(vista.data?.map((p) => p.id)).toEqual(["s10b-p-egresada"])
    })
  })

  it("el servidor no confía en el nombre ni en el `personaId` que manda el cliente", async () => {
    // El payload del componente es una etiqueta, no la verdad: `resolverReportante`
    // (`app/api/co/_lib/buzon-alcance.ts`) sólo honra una persona indicada si es de la
    // comunidad y el rol es administrador. Una etiqueta inventada y una persona de OTRA
    // comunidad no deben llegar a la fila.
    const id = "s10b-buz-ajena"
    await conSesion(EMAIL.admin, async () => {
      const res = await invocarApi(import("@/app/api/co/mensajes-buzon/route"), "POST", "co/mensajes-buzon", {
        body: {
          id,
          folio: "BUZ-9100",
          clasificacion: "reclamo",
          reportanteNombre: "etiqueta inventada",
          reportantePersonaId: P_B_ANA,
          asunto: "Intento de atribución",
          cuerpo: "Cuerpo del reclamo.",
          visibilidadComite: true,
          fechaIngreso: "2026-11-15",
          estado: "recibido",
          respuestas: [],
        },
      })
      expect(res.ok).toBe(true)
    })

    const fila = await prisma.mensajeBuzonCO.findUnique({ where: { id } })
    expect(fila).not.toBeNull()
    expect(fila?.reportantePersonaId).not.toBe(P_B_ANA)
    expect(fila?.reportanteNombre).not.toBe("etiqueta inventada")
  })

  it("más de 60 búsquedas por minuto responden 429 sin filas, y el bloqueo es por usuario", async () => {
    // T21: el 429 deja rastro propio — SU evento `RP_VOLUME_LIMITED` (mismo
    // criterio que R4-001), no una denegación de privilegio — y el evento es
    // por EVENTO del limitador: dos 429 del mismo usuario emiten UN evento, no
    // uno por respuesta. El espía vive en ESTE caso porque es el dueño
    // exclusivo de la cuota de `limite`: otro caso con el mismo usuario dentro
    // de la ventana robaría la cuota o el dedup.
    const espia = vi.spyOn(logger, "warn").mockImplementation(() => {})
    await conSesion(EMAIL.limite, async () => {
      for (let n = 0; n < 60; n++) {
        expect((await buscar("A")).status).toBe(400)
      }
      const cortada = await buscar("Ana Vecina")
      expect(cortada.status).toBe(429)
      const vista = await cuerpo(cortada)
      expect(vista.error).toBe("Demasiadas solicitudes.")
      expect(vista.data).toBeUndefined()
      // El segundo 429 del mismo usuario, dentro de la ventana, no re-emite.
      expect((await buscar("Ana Vecina")).status).toBe(429)
    })
    const eventos = (espia.mock.calls as unknown as [Record<string, unknown>][]).filter(
      ([cuerpo]) => cuerpo?.event === "RP_VOLUME_LIMITED"
    )
    expect(eventos).toHaveLength(1)
    const usuario = await prisma.usuario.findUnique({ where: { email: EMAIL.limite } })
    expect((eventos[0]?.[0] as { usuarioId?: string } | undefined)?.usuarioId).toBe(usuario?.id)
    vi.restoreAllMocks()

    // Otro usuario no hereda el bloqueo: si la clave pasara a `comunidadId` o a la IP,
    // este 200 se volvería 429.
    await conSesion(EMAIL.admin, async () => {
      expect((await buscar("Ana Vecina")).status).toBe(200)
    })
  })
})
