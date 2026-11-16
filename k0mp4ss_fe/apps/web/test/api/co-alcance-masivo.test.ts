// @vitest-environment node
/**
 * T14 (S10) — `GET /api/co/alcance-masivo`: los destinatarios del envío masivo
 * se resuelven en el SERVIDOR.
 *
 * La consola de comunicación calculaba los destinatarios del envío masivo en el
 * CLIENTE cruzando TRES colecciones paginadas a cien (personas, vínculos y
 * unidades): una comunidad con más de cien filas recibía el envío incompleto y
 * nadie se entera, porque el alcance mostrado era exactamente el alcance enviado.
 * Este endpoint aplica las MISMAS reglas que el cliente tenía —cuenta activa,
 * vínculos vigentes (`fechaFin: null`), caso especial `personal`, filtros de
 * sector/unidad— sobre la comunidad completa, y pagina el conjunto resuelto.
 *
 * Lo que se fija acá:
 *   · la persona y la unidad FUERA de las primeras cien SÍ entran en el alcance
 *     (el defecto): el total del servidor incluye las 120 del lote, y la unidad
 *     más vieja del lote —fuera de cualquier primera página de `useUnidades`—
 *     resuelve a sus residentes;
 *   · `estadoCuenta` inactiva fuera; sin vínculo vigente fuera, y el vínculo
 *     CERRADO (`fechaFin` pasado) no es vigente;
 *   · el caso `personal` se conserva tal cual: entra con `unidadId` indefinido
 *     cuando el filtro de roles lo incluye (aunque su vínculo tenga unidad) y
 *     con un filtro de sector/unidad activo cae, igual que en el cliente;
 *   · los filtros de micro sector y de unidad puntual se resuelven en el
 *     servidor. El de macro resuelve vía los micro sectores del macro: en el
 *     cliente ese filtro era un no-op sobre el alcance resuelto (`unidadesVisibles`
 *     sólo miraba `microSel`), y acá se aplica de verdad — decisión declarada
 *     del endpoint, no una regla nueva sobre quién entra;
 *   · la comunidad ajena nunca aparece, en ninguna de las dos direcciones;
 *   · 401 sin sesión; 403 literal para un rol sin `co` crear —la compuerta del
 *     envío masivo, la misma de POST /api/co/envios—;
 *   · alcance acotado fail-closed: hoy NINGUNA clave de la matriz le da `co`
 *     crear a un rol acotado, así que el borde cerrado observable es el 403 del
 *     guardián (el `denegado` de `alcancePorFilasDeSesion` queda de guardia por
 *     si la matriz alguna vez cambia);
 *   · el envelope pagina de verdad (`page`, `pageSize` con tope, `total`) y el
 *     techo de volumen (`co-alcance`) es por usuario: otro usuario no hereda
 *     el bloqueo;
 *   · T15 (R4-001): el 403 del portón emite `RP_PERMISSION_DENIED` y el 429 del
 *     techo emite `RP_VOLUME_LIMITED` UNA vez por ventana por usuario — dos 429
 *     del mismo usuario, un solo evento; el 429 de otro usuario, el suyo.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
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

const COM_A = "t14a-com-a"
const COM_B = "t14a-com-b"

const MACRO_1 = "t14a-macro-1"
const MACRO_2 = "t14a-macro-2"
const MICRO_1 = "t14a-micro-1"
const MICRO_2 = "t14a-micro-2"
const MICRO_3 = "t14a-micro-3"

const U_1 = "t14a-u-1" // micro-1
const U_2 = "t14a-u-2" // micro-1
const U_3 = "t14a-u-3" // micro-2
const U_4 = "t14a-u-4" // micro-3 (macro-2)
const U_B = "t14a-u-b" // COM_B
/** La unidad MÁS VIEJA del lote: fuera de cualquier primera página de unidades. */
const U_LOTE_101 = "t14a-u-lote-101"

const P_INACTIVA = "t14a-p-inactiva"
const P_SIN_VINCULO = "t14a-p-sinvinculo"
const P_CERRADA = "t14a-p-cerrada"
const P_PERSONAL_FICHA = "t14a-p-personal"
const P_PERSONAL_VINCULO = "t14a-p-personalv"
const P_ARRENDATARIO = "t14a-p-arrend"
const P_PROPIETARIO_U1 = "t14a-p-propu1"
const P_MACRO2 = "t14a-p-macro2"
const P_RESIDENTE = "t14a-p-residente"
const P_B = "t14a-p-b"

/** El lote que rebasa el techo del padrón del cliente: 120 propietarios con vínculo vigente. */
const LOTE_CANTIDAD = 120
const lotePersonaId = (n: number) => `t14a-p-lote-${String(n).padStart(3, "0")}`
const loteUnidadId = (n: number) => `t14a-u-lote-${String(n).padStart(3, "0")}`
const loteNombre = (n: number) => `Zz Vecino ${String(n).padStart(3, "0")}`
const loteIds = () => Array.from({ length: LOTE_CANTIDAD }, (_, i) => lotePersonaId(i + 1))

const EMAIL = {
  admin: "t14a-admin@test.cl",
  comite: "t14a-comite@test.cl",
  residente: "t14a-residente@test.cl",
  mantencion: "t14a-mantencion@test.cl",
  limite: "t14a-limite@test.cl", // cuota propia del caso de volumen
  adminB: "t14a-admin-b@test.cl",
  auditA: "t14a-audit-a@test.cl", // cuota DEDICADA del caso de eventos R4-001 (el usuario que cruza)
  auditB: "t14a-audit-b@test.cl", // cuota DEDICADA del caso de eventos R4-001 (el otro usuario)
  auditC: "t14a-audit-c@test.cl", // cuota DEDICADA del caso del 403 (sin `co` crear, usuario virgen)
}

const moduloAlcance = () => import("@/app/api/co/alcance-masivo/route")

async function conSesion<T>(email: string | null, fn: () => Promise<T>): Promise<T> {
  if (email) state.cookie = await cookieDeUsuario(email)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

function alcance(query: string) {
  return invocarApi(moduloAlcance(), "GET", `co/alcance-masivo${query}`)
}

interface Fila {
  personaId: string
  unidadId?: string
  personaNombre: string
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
  estadoCuenta = "activa",
  roles: string[] = ["propietario"],
  createdAt = new Date("2026-02-01T00:00:00Z")
): Promise<void> {
  const [nombres = "", ...apellidosResto] = nombre.split(" ")
  const apellidos = apellidosResto.join(" ")
  await prisma.persona.create({
    data: {
      id,
      comunidadId,
      rut: `55.${id.slice(-3)}.${id.slice(0, 3)}-K`,
      nombreCompleto: nombre,
      nombres,
      apellidos,
      email: `${id}@t14a.test.cl`,
      telefonoMovil: "+56933333333",
      estadoCuenta,
      condicionesEspecialesIds: [],
      roles,
      createdAt,
    },
  })
}

async function crearUnidad(
  id: string,
  comunidadId: string,
  numero: string,
  microSectorId: string,
  createdAt: Date
): Promise<void> {
  await prisma.unidad.create({
    data: {
      id,
      comunidadId,
      microSectorId,
      numero,
      etiqueta: `Depto ${numero}`,
      tipoUnidadId: "t14a-tu-1",
      metraje: 60,
      prorrateo: 0.33,
      rolSii: `8888-${numero}`,
      estadoId: "t14a-est-1",
      servicios: {},
      createdAt,
    },
  })
}

async function crearVinculo(
  id: string,
  comunidadId: string,
  personaId: string,
  unidadId: string,
  rol: string,
  fechaFin: string | null = null
): Promise<void> {
  await prisma.vinculoUnidad.create({
    data: {
      id,
      comunidadId,
      personaId,
      unidadId,
      rol,
      fechaInicio: "2026-01-01",
      fechaFin,
      permiteVerFinanzas: false,
    },
  })
}

/** El alcance completo (default: propietarios) uniendo las dos páginas. */
async function alcanceCompleto(): Promise<Fila[]> {
  const pagina1 = await cuerpo(await alcance("?roles=propietario"))
  const pagina2 = await cuerpo(await alcance(`?roles=propietario&page=2`))
  return [...(pagina1.data ?? []), ...(pagina2.data ?? [])]
}

describe("T14 — GET /api/co/alcance-masivo", () => {
  beforeAll(async () => {
    for (const [id, nombre, slug] of [
      [COM_A, "Comunidad T14 A", "t14a-a"],
      [COM_B, "Comunidad T14 B", "t14a-b"],
    ] as const) {
      await prisma.comunidad.upsert({ where: { id }, update: {}, create: { id, nombre, slug } })
    }

    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
    await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
    await prisma.unidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
    await prisma.microSector.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })

    for (const [id, macro] of [
      [MICRO_1, MACRO_1],
      [MICRO_2, MACRO_1],
      [MICRO_3, MACRO_2],
    ] as const) {
      await prisma.microSector.create({
        data: { id, comunidadId: COM_A, macroSectorId: macro, nombre: `Micro ${id}`, etiqueta: `micro ${id}` },
      })
    }

    // Unidades: la más vieja del lote primero (Jan 1), el resto del lote después
    // (Jan 2) y las nombradas al final (Jan 3). Bajo el orden más nuevo primero
    // de la colección, U_LOTE_101 queda fuera de las primeras cien.
    await crearUnidad(U_LOTE_101, COM_A, "L101", MICRO_2, new Date("2026-01-01T00:00:00Z"))
    for (let n = 1; n <= 100; n++) {
      await crearUnidad(
        loteUnidadId(n),
        COM_A,
        `L${String(n).padStart(3, "0")}`,
        MICRO_2,
        new Date(Date.UTC(2026, 0, 2, 0, 0, n))
      )
    }
    await crearUnidad(U_1, COM_A, "101", MICRO_1, new Date("2026-01-03T00:00:01Z"))
    await crearUnidad(U_2, COM_A, "102", MICRO_1, new Date("2026-01-03T00:00:02Z"))
    await crearUnidad(U_3, COM_A, "103", MICRO_2, new Date("2026-01-03T00:00:03Z"))
    await crearUnidad(U_4, COM_A, "104", MICRO_3, new Date("2026-01-03T00:00:04Z"))
    await crearUnidad(U_B, COM_B, "B1", "t14a-micro-b", new Date("2026-01-03T00:00:05Z"))

    // 120 propietarios con vínculo vigente: la persona n vive en la unidad
    // ((n % 101) + 1), así que «Zz Vecino 100» vive en la unidad lote-101 (la
    // que queda fuera de las primeras cien de `useUnidades`).
    for (let n = 1; n <= LOTE_CANTIDAD; n++) {
      await crearPersona(lotePersonaId(n), COM_A, loteNombre(n), "activa", ["propietario"], new Date(Date.UTC(2026, 1, 1, 0, 0, n)))
      await crearVinculo(
        `t14a-v-lote-${String(n).padStart(3, "0")}`,
        COM_A,
        lotePersonaId(n),
        loteUnidadId((n % 101) + 1),
        "propietario"
      )
    }

    await crearPersona(P_INACTIVA, COM_A, "Ines Inactiva", "inactiva")
    await crearVinculo("t14a-v-inactiva", COM_A, P_INACTIVA, U_1, "propietario")

    await crearPersona(P_SIN_VINCULO, COM_A, "Simon Sinvinculo")
    await crearPersona(P_CERRADA, COM_A, "Clara Cerrada")
    await crearVinculo("t14a-v-cerrada", COM_A, P_CERRADA, U_2, "propietario", "2026-01-01")

    await crearPersona(P_PERSONAL_FICHA, COM_A, "Pablo Personal", "activa", ["personal"])
    await crearPersona(P_PERSONAL_VINCULO, COM_A, "Paula Personalv", "activa", ["propietario"])
    await crearVinculo("t14a-v-personalv", COM_A, P_PERSONAL_VINCULO, U_1, "personal")

    await crearPersona(P_ARRENDATARIO, COM_A, "Andres Arrendatario")
    await crearVinculo("t14a-v-arrend", COM_A, P_ARRENDATARIO, U_2, "arrendatario")

    await crearPersona(P_PROPIETARIO_U1, COM_A, "Beto Propio")
    await crearVinculo("t14a-v-propu1", COM_A, P_PROPIETARIO_U1, U_1, "propietario")

    await crearPersona(P_MACRO2, COM_A, "Marta Macro2")
    await crearVinculo("t14a-v-macro2", COM_A, P_MACRO2, U_4, "propietario")

    await crearPersona(P_RESIDENTE, COM_A, "Roberto Residente", "activa", ["residente"])
    await crearPersona(P_B, COM_B, "Beatriz Otra")
    await crearVinculo("t14a-v-b", COM_B, P_B, U_B, "propietario")

    for (const u of [
      { email: EMAIL.admin, comunidadId: COM_A, rol: "administrador", personaId: null },
      { email: EMAIL.comite, comunidadId: COM_A, rol: "comite", personaId: null },
      { email: EMAIL.residente, comunidadId: COM_A, rol: "residente", personaId: P_RESIDENTE },
      { email: EMAIL.mantencion, comunidadId: COM_A, rol: "mantencion", personaId: null },
      { email: EMAIL.limite, comunidadId: COM_A, rol: "administrador", personaId: null },
      { email: EMAIL.adminB, comunidadId: COM_B, rol: "administrador", personaId: null },
      { email: EMAIL.auditA, comunidadId: COM_A, rol: "administrador", personaId: null },
      { email: EMAIL.auditB, comunidadId: COM_B, rol: "administrador", personaId: null },
      { email: EMAIL.auditC, comunidadId: COM_A, rol: "mantencion", personaId: null },
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
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.unidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.microSector.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
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
    const res = await conSesion(null, () => alcance("?roles=propietario"))
    expect(res.status).toBe(401)
    expect((await cuerpo(res)).error).toBe("No autenticado.")
  })

  it("un rol sin `co` crear recibe 403 literal (mantención ni siquiera tiene la clave)", async () => {
    const res = await conSesion(EMAIL.mantencion, () => alcance("?roles=propietario"))
    expect(res.status).toBe(403)
    expect((await cuerpo(res)).error).toBe("Permiso denegado.")
  })

  it("alcance acotado fail-closed: el residente con ficha recibe 403, nunca el alcance", async () => {
    // El residente tiene `co:buzon` crear (el canal de reclamos) pero NO `co`
    // crear (la difusión masiva es de administración y comité). Hoy NINGUNA
    // clave le da el envío masivo a un rol acotado, así que el 403 del guardián
    // ES el borde cerrado observable; el `denegado` de la serie queda de guardia.
    const res = await conSesion(EMAIL.residente, () => alcance("?roles=propietario"))
    const vista = await cuerpo(res)
    expect(res.status).toBe(403)
    expect(vista.error).toBe("Permiso denegado.")
    expect(vista.data).toBeUndefined()
  })

  it("la persona fuera de las primeras cien filas del padrón SÍ entra en el alcance (el defecto)", async () => {
    // 122 propietarios resueltos en el servidor (120 del lote + Beto + Marta).
    // El padrón del cliente (`usePersonas`, pageSize=100, más nuevo primero)
    // nunca montó a «Zz Vecino 001»..«Zz Vecino 020»: hoy ese envío salía incompleto.
    const filas = await conSesion(EMAIL.admin, () => alcanceCompleto())
    const ids = new Set(filas.map((f) => f.personaId))
    expect(ids.size).toBe(122)
    expect(new Set(ids)).toEqual(new Set([...loteIds(), P_PROPIETARIO_U1, P_MACRO2]))
    // Concretamente las MÁS VIEJAS del lote, fuera de la página 1 del padrón:
    expect(ids.has(lotePersonaId(1))).toBe(true)
    expect(ids.has(lotePersonaId(20))).toBe(true)
    // Y las excluidas por las reglas del cliente, que el servidor respeta:
    expect(ids.has(P_INACTIVA)).toBe(false)
    expect(ids.has(P_SIN_VINCULO)).toBe(false)
    expect(ids.has(P_CERRADA)).toBe(false)
    expect(ids.has(P_ARRENDATARIO)).toBe(false)
    // La fila resuelve el nombre en el SERVIDOR (la pantalla no puede resolver
    // el de una persona fuera de la primera página del padrón):
    const beto = filas.find((f) => f.personaId === P_PROPIETARIO_U1)
    expect(beto?.personaNombre).toBe("Beto Propio")
    expect(typeof beto?.unidadId).toBe("string")
  })

  it("la unidad fuera de las primeras cien resuelve a sus residentes", async () => {
    // U_LOTE_101 se creó ANTES que el resto del lote: bajo el orden más nuevo
    // primero de `useUnidades` queda fuera de cualquier primera página. Hoy el
    // cliente la filtraba con el techo de cien y sus residentes caían del envío.
    const vista = await cuerpo(await conSesion(EMAIL.admin, () => alcance(`?roles=propietario&unidad=${U_LOTE_101}`)))
    expect(vista.total).toBe(1)
    expect(vista.data?.map((f) => f.personaId)).toEqual([lotePersonaId(100)])
    expect(vista.data?.[0]?.personaNombre).toBe("Zz Vecino 100")
  })

  it("el caso `personal` se conserva: entra sin unidad, y con filtro de sector cae", async () => {
    await conSesion(EMAIL.admin, async () => {
      const soloPersonal = await cuerpo(await alcance("?roles=personal"))
      expect(soloPersonal.total).toBe(2)
      expect(new Set((soloPersonal.data ?? []).map((f) => f.personaId))).toEqual(
        new Set([P_PERSONAL_FICHA, P_PERSONAL_VINCULO])
      )
      // Ninguna fila de personal lleva unidad, ni siquiera Paula, cuyo vínculo
      // vigente tiene unidadId: la rama del cliente hace `continue` antes.
      for (const fila of soloPersonal.data ?? []) {
        expect("unidadId" in fila).toBe(false)
      }

      // Filtro de sector o unidad activo → el `personal` (unidadId indefinido)
      // cae, igual que el `lista.filter(d => d.unidadId && ...)` del cliente.
      const conUnidad = await cuerpo(await alcance(`?roles=personal&unidad=${U_1}`))
      expect(conUnidad.total).toBe(0)
      const conMicro = await cuerpo(await alcance(`?roles=personal&micro=${MICRO_1}`))
      expect(conMicro.total).toBe(0)

      // Y con el filtro mixto se suma a los propietarios: 122 + 2.
      const mixto = await cuerpo(await alcance("?roles=propietario,personal"))
      expect(mixto.total).toBe(124)
    })
  })

  it("el filtro por micro sector se resuelve en el servidor", async () => {
    await conSesion(EMAIL.admin, async () => {
      const micro1 = await cuerpo(await alcance(`?roles=propietario&micro=${MICRO_1}`))
      expect(micro1.total).toBe(1)
      expect(micro1.data?.map((f) => f.personaId)).toEqual([P_PROPIETARIO_U1])

      const micro2 = await cuerpo(await alcance(`?roles=propietario&micro=${MICRO_2}`))
      expect(micro2.total).toBe(LOTE_CANTIDAD)
    })
  })

  it("el filtro por macro sector resuelve vía los micro sectores del macro", async () => {
    // Decisión declarada: en el cliente, `macroSel` era un no-op sobre el alcance
    // (`unidadesVisibles` sólo miraba `microSel`). El endpoint lo aplica de verdad.
    await conSesion(EMAIL.admin, async () => {
      const macro1 = await cuerpo(await alcance(`?roles=propietario&macro=${MACRO_1}`))
      expect(macro1.total).toBe(121)
      const ids = new Set((macro1.data ?? []).map((f) => f.personaId))
      expect(ids.has(P_PROPIETARIO_U1)).toBe(true)
      expect(ids.has(P_MACRO2)).toBe(false)

      const macro2 = await cuerpo(await alcance(`?roles=propietario&macro=${MACRO_2}`))
      expect(macro2.total).toBe(1)
      expect(macro2.data?.map((f) => f.personaId)).toEqual([P_MACRO2])
    })
  })

  it("el filtro por unidad puntual resuelve en el servidor", async () => {
    const vista = await cuerpo(await conSesion(EMAIL.admin, () => alcance(`?roles=propietario&unidad=${U_1}`)))
    expect(vista.total).toBe(1)
    expect(vista.data?.map((f) => f.personaId)).toEqual([P_PROPIETARIO_U1])
  })

  it("el rol del vínculo decide: el arrendatario entra con su propio rol", async () => {
    const vista = await cuerpo(await conSesion(EMAIL.admin, () => alcance("?roles=arrendatario")))
    expect(vista.total).toBe(1)
    expect(vista.data?.map((f) => f.personaId)).toEqual([P_ARRENDATARIO])
  })

  it("la comunidad ajena nunca aparece, en ninguna de las dos direcciones", async () => {
    await conSesion(EMAIL.admin, async () => {
      const vista = await cuerpo(await alcance("?roles=propietario"))
      expect((vista.data ?? []).some((f) => f.personaId === P_B)).toBe(false)
    })
    await conSesion(EMAIL.adminB, async () => {
      const vista = await cuerpo(await alcance("?roles=propietario"))
      expect(vista.total).toBe(1)
      expect(vista.data?.map((f) => f.personaId)).toEqual([P_B])
    })
    // El comité —el otro rol con `co` crear— ve la comunidad entera, no la ajena.
    await conSesion(EMAIL.comite, async () => {
      const vista = await cuerpo(await alcance("?roles=propietario"))
      expect(vista.total).toBe(122)
      expect((vista.data ?? []).some((f) => f.personaId === P_B)).toBe(false)
    })
  })

  it("el envelope pagina el conjunto resuelto: page, pageSize (con tope) y total", async () => {
    await conSesion(EMAIL.admin, async () => {
      const pagina2 = await cuerpo(await alcance("?roles=propietario&pageSize=25&page=2"))
      expect(pagina2.page).toBe(2)
      expect(pagina2.pageSize).toBe(25)
      expect(pagina2.total).toBe(122)
      expect(pagina2.data).toHaveLength(25)

      // El lote por página de la ruta NO es el de las colecciones CO a medida: con 122
      // propietarios, la página por defecto los trae a todos en una sola respuesta.
      const tope = await cuerpo(await alcance("?roles=propietario&pageSize=500"))
      expect(tope.pageSize).toBe(500)
      expect(tope.data).toHaveLength(122)

      const vacia = await cuerpo(await alcance("?roles=propietario&page=99"))
      expect(vacia.data).toEqual([])
      expect(vacia.total).toBe(122)
    })
  })

  it("F37 — el lote por página resuelve un universo de 6.000 en 12 solicitudes, no en 60", async () => {
    await conSesion(EMAIL.admin, async () => {
      // La consola NO manda `pageSize`: camina con el default de la ruta, y cada página
      // es una solicitud contra el techo de 60/min por usuario. Con el lote en 100, un
      // universo de 6.000 necesitaba 60 solicitudes —justo el techo: la caminata moría
      // en el 429, el alcance se limpiaba y el envío no se podía resolver
      // (`R1-ALCANCE-RATE-LIMIT` del refuter de `review-7ac93a0a9180ee0a`).
      const universo = 6_000
      const primera = await cuerpo(await alcance("?roles=propietario"))
      const porPagina = primera.pageSize
      expect(porPagina).toBe(500)
      expect(Math.ceil(universo / porPagina)).toBe(12)
      // El techo no se toca: el lote tampoco puede crecer más allá de esta constante a
      // pedido del cliente, así que el default y el tope son el mismo número.
      const masGrande = await cuerpo(await alcance("?roles=propietario&pageSize=5000"))
      expect(masGrande.pageSize).toBe(500)
    })
  })

  it("más de 60 consultas por minuto responden 429 literal, y el bloqueo es por usuario", async () => {
    await conSesion(EMAIL.limite, async () => {
      for (let n = 0; n < 60; n++) {
        expect((await alcance("?roles=personal")).status).toBe(200)
      }
      const cortada = await alcance("?roles=personal")
      expect(cortada.status).toBe(429)
      const vista = await cuerpo(cortada)
      expect(vista.error).toBe("Demasiadas solicitudes.")
      expect(vista.data).toBeUndefined()
    })

    // Otro usuario no hereda el bloqueo: si la clave pasara a `comunidadId` o a
    // la IP, este 200 se volvería 429.
    await conSesion(EMAIL.admin, async () => {
      expect((await alcance("?roles=personal")).status).toBe(200)
    })
  }, 60_000)

  // T15 (R4-001) — los eventos de auditoría del techo de volumen y del portón.
  // El techo va DELANTE del portón, así que la inundación legítima —el llamador
  // tiene `co:difusiones` crear— responde 429 sin tocar `RP_PERMISSION_DENIED`:
  // el evento del techo es SU PROPIO evento (`RP_VOLUME_LIMITED`) y es por
  // EVENTO del limitador (uno por ventana por usuario), no por respuesta. Cada
  // caso usa un usuario con cuota DEDICADA: la cuota del techo y la ventana del
  // evento viven en Maps en memoria por usuario, y compartirlas con la prueba
  // del techo de arriba las robaría o envenenaría la ventana del evento.
  describe("T15 (R4-001) — eventos de auditoría: 403 del portón y techo de volumen", () => {
    afterEach(() => {
      // Cada caso restaura el espía: los casos quedan independientes.
      vi.restoreAllMocks()
    })

    function llamadasDelEspia(espia: ReturnType<typeof vi.spyOn>): [Record<string, unknown>, string?][] {
      return espia.mock.calls as unknown as [Record<string, unknown>, string?][]
    }

    it("una denegación de permiso emite RP_PERMISSION_DENIED (una vez, con el usuarioId)", async () => {
      const espia = vi.spyOn(logger, "warn")
      // Usuario DEDICADO, no `EMAIL.residente`: este caso movía la cuota
      // compartida del residente y podía volverse 429 por orden de casos si
      // otros acumulaban requests en la misma ventana (advisory `R3-002` de la
      // revisión nativa de `91df430`).
      const res = await conSesion(EMAIL.auditC, () => alcance("?roles=propietario"))
      expect(res.status).toBe(403)
      const eventos = llamadasDelEspia(espia).filter(
        ([cuerpo]) => cuerpo?.event === "RP_PERMISSION_DENIED"
      )
      expect(eventos).toHaveLength(1)
      const usuario = await prisma.usuario.findUnique({ where: { email: EMAIL.auditC } })
      expect((eventos[0]?.[0] as { usuarioId?: string } | undefined)?.usuarioId).toBe(usuario?.id)
    })

    it("dos 429 del MISMO usuario emiten exactamente UN RP_VOLUME_LIMITED", async () => {
      const espia = vi.spyOn(logger, "warn")
      // La cuota de auditA es VIRGEN (ningún otro caso la consulta): 60 × 200 y
      // el cruce de verdad en la 61. El 429 no se supone, se OBSERVA — la lección
      // del proyecto: una cuota mal dimensionada no muerde nunca.
      await conSesion(EMAIL.auditA, async () => {
        for (let n = 0; n < 60; n++) {
          expect((await alcance("?roles=personal")).status).toBe(200)
        }
        const primera = await alcance("?roles=personal")
        expect(primera.status).toBe(429)
        const segunda = await alcance("?roles=personal")
        expect(segunda.status).toBe(429)
      })
      const eventos = llamadasDelEspia(espia).filter(
        ([cuerpo]) => cuerpo?.event === "RP_VOLUME_LIMITED"
      )
      expect(eventos).toHaveLength(1)
      const usuario = await prisma.usuario.findUnique({ where: { email: EMAIL.auditA } })
      expect((eventos[0]?.[0] as { usuarioId?: string } | undefined)?.usuarioId).toBe(usuario?.id)
    }, 60_000)

    it("el 429 de OTRO usuario emite su propio RP_VOLUME_LIMITED", async () => {
      const espia = vi.spyOn(logger, "warn")
      await conSesion(EMAIL.auditB, async () => {
        for (let n = 0; n < 60; n++) {
          expect((await alcance("?roles=personal")).status).toBe(200)
        }
        const cortada = await alcance("?roles=personal")
        expect(cortada.status).toBe(429)
      })
      const eventos = llamadasDelEspia(espia).filter(
        ([cuerpo]) => cuerpo?.event === "RP_VOLUME_LIMITED"
      )
      expect(eventos).toHaveLength(1)
      const usuario = await prisma.usuario.findUnique({ where: { email: EMAIL.auditB } })
      expect((eventos[0]?.[0] as { usuarioId?: string } | undefined)?.usuarioId).toBe(usuario?.id)
    }, 60_000)
  })
})
