// @vitest-environment node
/**
 * F39 — los seis buscadores rechazan los comodines de LIKE.
 *
 * El barrido del 2026-11-16 midió nueve rutas que arman `contains` con el término
 * de búsqueda: tres (`periodos-directiva/buscar-personas`,
 * `certificados-ct/buscar-personas`, `comunicacion/buscar-personas`) ya rechazan
 * `%` y `_`, y seis no. `contains` arma el patrón `%q%` sin escapar, así que
 * `q=%%` o `q=__` dejan de ser un término y pasan a enumerar la tabla.
 *
 * Las seis se cierran con el MISMO patrón de las tres que ya lo hacen:
 * `const COMODINES_LIKE = /[%_]/` más un 400 con el mensaje exacto, corrido
 * ANTES de cualquier consulta a la base. Este archivo lo mide ruta por ruta:
 *
 *   · `q=%`, `q=__` y `q=a%b` responden 400 con el mensaje exacto y sin filas;
 *   · un término normal devuelve las mismas filas que antes (se afirma sobre
 *     datos reales creados acá, con la forma de cada envelope);
 *   · sin `q` y con `q` vacío la ruta responde exactamente lo de siempre;
 *   · el email: en `personas` salió del `OR` (paridad con las tres rutas de
 *     referencia, S2), así que buscar una dirección ya no encuentra por email y
 *     una dirección con guion bajo se rechaza igual que en esas rutas;
 *   · el candado R6 no se afloja: su propio test prueba que una ruta ficticia sin
 *     el rechazo produce hallazgo, que la misma ruta con `COMODINES_LIKE` no, y
 *     que el repo real queda en cero con la allowlist de R6 vacía.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
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

/** Mensaje exacto del rechazo, el mismo de las tres rutas de referencia. */
const MENSAJE_COMODINES = "El parámetro q no acepta los comodines % y _."

const COMUNIDAD = "f39-comunidad"
const USUARIO_ADMIN = "f39-usuario-admin"
const EMAIL_ADMIN = "f39-admin@test.cl"

const PERSONA = "f39-p-ana"
const NOMBRE_ANA = "Ana Buscada"
const RUT_ANA = "12345678-5"
/** Dirección SIN guion bajo: prueba que el email dejó de ser criterio (200, cero filas). */
const EMAIL_ANA = "ana.buscada@f39.test.cl"
/** Dirección con guion bajo legítimo: se rechaza igual que en las rutas de referencia (S2). */
const EMAIL_CON_GUION_BAJO = "ana_buscada@f39.test.cl"

const UNIDAD = "f39-u-101"
const NUMERO_UNIDAD = "101"
const ETIQUETA_UNIDAD = "Depto 101"
const ROL_SII = "7788-99"

const FONDO = "f39-fondo-operacion"
const EGRESO = "f39-egreso-1"
const FOLIO = "F-3901"
const DESCRIPCION_EGRESO = "Reparación de ascensor"
const INGRESO = "f39-ingreso-1"
const CONCEPTO_INGRESO = "Cuota extraordinaria"
const FAMILIA_INGRESO = "extraordinaria"

const EVENTO = "f39-evento-1"
const TIPO_ACCION = "F39PRUEBA"
const REFERENCIA = "f39-referencia-1"
const DESCRIPCION_EVENTO = "Cambio de administrador"

const COBRO = "f39-cobro-1"

type Ruta =
  | "personas"
  | "fi"
  | "auditoria"
  | "pe/unidades"
  | "pe/personas"
  | "convenios/unidades-con-deuda"

/** Las seis rutas bajo medición, con su módulo real. */
const MODULOS: Record<Ruta, () => Promise<unknown>> = {
  personas: () => import("@/app/api/personas/route"),
  fi: () => import("@/app/api/fi/route"),
  auditoria: () => import("@/app/api/auditoria/route"),
  "pe/unidades": () => import("@/app/api/pe/unidades/route"),
  "pe/personas": () => import("@/app/api/pe/personas/route"),
  "convenios/unidades-con-deuda": () =>
    import("@/app/api/convenios/unidades-con-deuda/route"),
}

const RUTAS: Ruta[] = [
  "personas",
  "fi",
  "auditoria",
  "pe/unidades",
  "pe/personas",
  "convenios/unidades-con-deuda",
]

/** GET a la ruta con la query ya serializada (`""` = sin parámetros). */
function pedir(ruta: Ruta, query = ""): Promise<Response> {
  return invocarApi(MODULOS[ruta](), "GET", `${ruta}${query}`)
}

function buscar(ruta: Ruta, q: string): Promise<Response> {
  return pedir(ruta, `?q=${encodeURIComponent(q)}`)
}

async function conSesion<T>(fn: () => Promise<T>): Promise<T> {
  state.cookie = await cookieDeUsuario(EMAIL_ADMIN)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

async function json200<T>(res: Response, contexto: string): Promise<T> {
  expect(res.status, contexto).toBe(200)
  return (await res.json()) as T
}

interface Pagina<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
}

interface FilaIdentidad {
  id: string
}

interface FilaUnidad {
  id: string
  numero: string
  etiqueta: string
  rolSii: string
}

interface PaginaEventos {
  total: number
  page: number
  pageSize: number
  eventos: FilaIdentidad[]
}

interface PaginaFI {
  egresos: { total: number; items: FilaIdentidad[] }
  ingresos: { total: number; items: FilaIdentidad[] }
}

interface FilaDeuda {
  unidadId: string
  numero: string
  etiqueta: string
  periodosVencidos: number
}

interface PaginaDeuda {
  data: FilaDeuda[]
  total: number
  limite: number
  mostrados: number
}

interface CuerpoError {
  error?: string
  data?: unknown
  eventos?: unknown
  egresos?: unknown
  ingresos?: unknown
}

/** Un término con comodín: 400, el mensaje exacto y ninguna fila en el cuerpo. */
async function esperarComodinRechazado(ruta: Ruta, q: string): Promise<void> {
  const contexto = `${ruta} · q=${JSON.stringify(q)}`
  const res = await buscar(ruta, q)
  expect(res.status, contexto).toBe(400)
  const cuerpo = (await res.json()) as CuerpoError
  expect(cuerpo.error, contexto).toBe(MENSAJE_COMODINES)
  expect(cuerpo.data, contexto).toBeUndefined()
  expect(cuerpo.eventos, contexto).toBeUndefined()
  expect(cuerpo.egresos, contexto).toBeUndefined()
  expect(cuerpo.ingresos, contexto).toBeUndefined()
}

function ids(filas: FilaIdentidad[]): string[] {
  return filas.map((fila) => fila.id)
}

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "test-secret-12345678"

  await prisma.comunidad.create({
    data: { id: COMUNIDAD, nombre: "Comunidad F39", slug: "f39-comunidad" },
  })
  await prisma.usuario.create({ data: { id: USUARIO_ADMIN, email: EMAIL_ADMIN } })
  await prisma.membresia.create({
    data: { usuarioId: USUARIO_ADMIN, comunidadId: COMUNIDAD, rol: "administrador" },
  })

  await prisma.persona.create({
    data: {
      id: PERSONA,
      comunidadId: COMUNIDAD,
      rut: RUT_ANA,
      nombreCompleto: NOMBRE_ANA,
      nombres: "Ana",
      apellidos: "Buscada",
      email: EMAIL_ANA,
      telefonoMovil: "+56911111111",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: ["propietario"],
    },
  })

  await prisma.unidad.create({
    data: {
      id: UNIDAD,
      comunidadId: COMUNIDAD,
      microSectorId: "f39-microsector",
      numero: NUMERO_UNIDAD,
      etiqueta: ETIQUETA_UNIDAD,
      tipoUnidadId: "f39-tipo",
      metraje: 60,
      prorrateo: 1,
      rolSii: ROL_SII,
      estadoId: "f39-estado",
      servicios: {},
    },
  })

  await prisma.fondoFI.create({
    data: {
      id: FONDO,
      comunidadId: COMUNIDAD,
      nombre: "Fondo de operación F39",
      tipo: "operacion",
      activo: true,
      saldoInicial: 0,
    },
  })
  await prisma.egresoFI.create({
    data: {
      id: EGRESO,
      comunidadId: COMUNIDAD,
      fondoId: FONDO,
      folio: FOLIO,
      fecha: "2026-01-10",
      categoria: "gasto_comun",
      descripcion: DESCRIPCION_EGRESO,
      monto: 1000,
      esRecurrente: false,
    },
  })
  await prisma.ingresoFI.create({
    data: {
      id: INGRESO,
      comunidadId: COMUNIDAD,
      fondoId: FONDO,
      fecha: "2026-01-11",
      monto: 500,
      concepto: CONCEPTO_INGRESO,
      familia: FAMILIA_INGRESO,
    },
  })

  await prisma.eventoAuditoria.create({
    data: {
      id: EVENTO,
      comunidadId: COMUNIDAD,
      timestamp: "2026-01-12T10:00:00.000Z",
      usuario: USUARIO_ADMIN,
      categoria: "acceso",
      tipoAccion: TIPO_ACCION,
      referenciaId: REFERENCIA,
      descripcion: DESCRIPCION_EVENTO,
    },
  })

  // Deuda vencida real: la ruta de convenios deriva la morosidad de los cobros,
  // así que la fila tiene que ser un cargo impago y ya vencido.
  await prisma.cobroFI.create({
    data: {
      id: COBRO,
      comunidadId: COMUNIDAD,
      unidadId: UNIDAD,
      periodo: "2020-01",
      concepto: "gasto_comun",
      origenModulo: "gc",
      fondoId: FONDO,
      descripcion: "Gasto común enero 2020",
      montoBase: 1000,
      fechaCargo: "2020-01-01",
      fechaVencimiento: "2020-01-31",
      moras: [],
      pagos: [],
      diferencias: [],
    },
  })
}, 30_000)

afterAll(async () => {
  try {
    state.cookie = ""
    await prisma.cobroFI.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.egresoFI.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.ingresoFI.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.unidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.persona.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.membresia.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.usuario.delete({ where: { id: USUARIO_ADMIN } }).catch(() => {})
    await prisma.comunidad.delete({ where: { id: COMUNIDAD } }).catch(() => {})
  } catch {
    // intencional: limpieza best-effort
  }
})

describe("F39 · los seis buscadores rechazan los comodines de LIKE", () => {
  for (const ruta of RUTAS) {
    it(`${ruta} · q=%, q=__ y q=a%b responden 400 con el mensaje exacto`, async () => {
      await conSesion(async () => {
        for (const q of ["%", "__", "a%b"]) {
          await esperarComodinRechazado(ruta, q)
        }
      })
    })
  }

  it("un email legítimo con guion bajo se rechaza igual que en las rutas de referencia (S2)", async () => {
    // `_` matchea un carácter en LIKE y `__` enumera: la dirección con guion bajo
    // cae por la misma guarda que cualquier otro término con comodín. Es la
    // decisión que en las tres rutas de referencia sacó el email del OR.
    await conSesion(async () => {
      for (const ruta of RUTAS) {
        await esperarComodinRechazado(ruta, EMAIL_CON_GUION_BAJO)
      }
    })
  })

  it("pe/unidades y pe/personas · el rechazo mira el parámetro q, no su precedencia", async () => {
    // `?ids=` gana sobre `q` cuando vienen juntos. El parámetro con comodines es
    // inválido igual: el rechazo es de `q`, no de la rama que gana.
    await conSesion(async () => {
      for (const ruta of ["pe/unidades", "pe/personas"] as const) {
        const contexto = `${ruta} · ids + q=__`
        const res = await pedir(ruta, `?ids=${encodeURIComponent(UNIDAD)}&q=__`)
        expect(res.status, contexto).toBe(400)
        const cuerpo = (await res.json()) as CuerpoError
        expect(cuerpo.error, contexto).toBe(MENSAJE_COMODINES)
      }
    })
  })

  it("personas · un término normal devuelve las mismas filas que antes", async () => {
    await conSesion(async () => {
      const porNombre = await json200<Pagina<FilaIdentidad>>(
        await buscar("personas", NOMBRE_ANA),
        "personas · nombre"
      )
      expect(porNombre.total).toBe(1)
      expect(ids(porNombre.data)).toEqual([PERSONA])

      const porRut = await json200<Pagina<FilaIdentidad>>(
        await buscar("personas", "12345678"),
        "personas · rut"
      )
      expect(porRut.total).toBe(1)
      expect(ids(porRut.data)).toEqual([PERSONA])
    })
  })

  it("personas · el email dejó de ser criterio (F39, S2)", async () => {
    // Paridad con las tres rutas de referencia: la dirección sin guion bajo no se
    // rechaza (200), pero ya no es criterio de búsqueda (cero filas).
    await conSesion(async () => {
      const porEmail = await json200<Pagina<FilaIdentidad>>(
        await buscar("personas", EMAIL_ANA),
        "personas · email"
      )
      expect(porEmail.total).toBe(0)
      expect(porEmail.data).toEqual([])
    })
  })

  it("fi · un término normal devuelve las mismas filas que antes", async () => {
    await conSesion(async () => {
      const porDescripcion = await json200<PaginaFI>(
        await buscar("fi", "ascensor"),
        "fi · descripcion de egreso"
      )
      expect(porDescripcion.egresos.total).toBe(1)
      expect(ids(porDescripcion.egresos.items)).toEqual([EGRESO])
      expect(porDescripcion.ingresos.total).toBe(0)

      const porFolio = await json200<PaginaFI>(
        await buscar("fi", FOLIO),
        "fi · folio de egreso"
      )
      expect(porFolio.egresos.total).toBe(1)
      expect(ids(porFolio.egresos.items)).toEqual([EGRESO])

      const porConcepto = await json200<PaginaFI>(
        await buscar("fi", "Cuota extraordinaria"),
        "fi · concepto de ingreso"
      )
      expect(porConcepto.ingresos.total).toBe(1)
      expect(ids(porConcepto.ingresos.items)).toEqual([INGRESO])
      expect(porConcepto.egresos.total).toBe(0)

      const porFamilia = await json200<PaginaFI>(
        await buscar("fi", FAMILIA_INGRESO),
        "fi · familia de ingreso"
      )
      expect(porFamilia.ingresos.total).toBe(1)
      expect(ids(porFamilia.ingresos.items)).toEqual([INGRESO])
    })
  })

  it("auditoria · un término normal devuelve las mismas filas que antes", async () => {
    await conSesion(async () => {
      const porDescripcion = await json200<PaginaEventos>(
        await buscar("auditoria", "administrador"),
        "auditoria · descripcion"
      )
      expect(porDescripcion.total).toBe(1)
      expect(ids(porDescripcion.eventos)).toEqual([EVENTO])

      const porTipo = await json200<PaginaEventos>(
        await buscar("auditoria", TIPO_ACCION),
        "auditoria · tipoAccion"
      )
      expect(porTipo.total).toBe(1)
      expect(ids(porTipo.eventos)).toEqual([EVENTO])

      const porReferencia = await json200<PaginaEventos>(
        await buscar("auditoria", REFERENCIA),
        "auditoria · referenciaId"
      )
      expect(porReferencia.total).toBe(1)
      expect(ids(porReferencia.eventos)).toEqual([EVENTO])
    })
  })

  it("pe/unidades · un término normal devuelve las mismas filas que antes", async () => {
    await conSesion(async () => {
      const porNumero = await json200<Pagina<FilaUnidad>>(
        await buscar("pe/unidades", NUMERO_UNIDAD),
        "pe/unidades · numero"
      )
      expect(porNumero.total).toBe(1)
      expect(ids(porNumero.data)).toEqual([UNIDAD])

      const porEtiqueta = await json200<Pagina<FilaUnidad>>(
        await buscar("pe/unidades", "Depto"),
        "pe/unidades · etiqueta"
      )
      expect(porEtiqueta.total).toBe(1)
      expect(ids(porEtiqueta.data)).toEqual([UNIDAD])

      const porRolSii = await json200<Pagina<FilaUnidad>>(
        await buscar("pe/unidades", "7788"),
        "pe/unidades · rolSii"
      )
      expect(porRolSii.total).toBe(1)
      expect(ids(porRolSii.data)).toEqual([UNIDAD])
    })
  })

  it("pe/personas · un término normal devuelve las mismas filas que antes", async () => {
    await conSesion(async () => {
      const porNombre = await json200<Pagina<FilaIdentidad>>(
        await buscar("pe/personas", NOMBRE_ANA),
        "pe/personas · nombreCompleto"
      )
      expect(porNombre.total).toBe(1)
      expect(ids(porNombre.data)).toEqual([PERSONA])

      const porRut = await json200<Pagina<FilaIdentidad>>(
        await buscar("pe/personas", "12345678"),
        "pe/personas · rut"
      )
      expect(porRut.total).toBe(1)
      expect(ids(porRut.data)).toEqual([PERSONA])
    })
  })

  it("convenios/unidades-con-deuda · un término normal devuelve las mismas filas que antes", async () => {
    await conSesion(async () => {
      const porNumero = await json200<PaginaDeuda>(
        await buscar("convenios/unidades-con-deuda", NUMERO_UNIDAD),
        "convenios · numero"
      )
      expect(porNumero.total).toBe(1)
      expect(porNumero.data.map((fila) => fila.unidadId)).toEqual([UNIDAD])
      expect(porNumero.data[0]?.periodosVencidos).toBe(1)

      const porEtiqueta = await json200<PaginaDeuda>(
        await buscar("convenios/unidades-con-deuda", "Depto"),
        "convenios · etiqueta"
      )
      expect(porEtiqueta.total).toBe(1)
      expect(porEtiqueta.data.map((fila) => fila.unidadId)).toEqual([UNIDAD])
    })
  })
})

describe("F39 · PRESERVE — sin q y con q vacío nada cambia", () => {
  it("personas · sin q y con q vacío devuelve el padrón como antes", async () => {
    await conSesion(async () => {
      for (const query of ["", "?q="]) {
        const pagina = await json200<Pagina<FilaIdentidad>>(
          await pedir("personas", query),
          `personas · ${query || "sin parámetros"}`
        )
        expect(ids(pagina.data), `personas · ${query || "sin parámetros"}`).toContain(
          PERSONA
        )
        expect(pagina.total, `personas · ${query || "sin parámetros"}`).toBe(1)
      }
    })
  })

  it("fi · sin q y con q vacío devuelve ambos libros", async () => {
    await conSesion(async () => {
      for (const query of ["", "?q="]) {
        const libro = await json200<PaginaFI>(
          await pedir("fi", query),
          `fi · ${query || "sin parámetros"}`
        )
        expect(ids(libro.egresos.items), `fi · ${query || "sin parámetros"}`).toEqual([
          EGRESO,
        ])
        expect(ids(libro.ingresos.items), `fi · ${query || "sin parámetros"}`).toEqual([
          INGRESO,
        ])
      }
    })
  })

  it("auditoria · sin q y con q vacío devuelve la bitácora", async () => {
    await conSesion(async () => {
      for (const query of ["", "?q="]) {
        const pagina = await json200<PaginaEventos>(
          await pedir("auditoria", query),
          `auditoria · ${query || "sin parámetros"}`
        )
        expect(ids(pagina.eventos), `auditoria · ${query || "sin parámetros"}`).toEqual([
          EVENTO,
        ])
      }
    })
  })

  it("pe/unidades · sin q y con q vacío devuelve el padrón", async () => {
    await conSesion(async () => {
      for (const query of ["", "?q="]) {
        const pagina = await json200<Pagina<FilaUnidad>>(
          await pedir("pe/unidades", query),
          `pe/unidades · ${query || "sin parámetros"}`
        )
        expect(ids(pagina.data), `pe/unidades · ${query || "sin parámetros"}`).toEqual([
          UNIDAD,
        ])
      }
    })
  })

  it("pe/personas · sin q y con q vacío devuelve el padrón", async () => {
    await conSesion(async () => {
      for (const query of ["", "?q="]) {
        const pagina = await json200<Pagina<FilaIdentidad>>(
          await pedir("pe/personas", query),
          `pe/personas · ${query || "sin parámetros"}`
        )
        expect(ids(pagina.data), `pe/personas · ${query || "sin parámetros"}`).toEqual([
          PERSONA,
        ])
      }
    })
  })

  it("convenios/unidades-con-deuda · sin q y con q vacío devuelve las morosas", async () => {
    await conSesion(async () => {
      for (const query of ["", "?q="]) {
        const pagina = await json200<PaginaDeuda>(
          await pedir("convenios/unidades-con-deuda", query),
          `convenios · ${query || "sin parámetros"}`
        )
        expect(
          pagina.data.map((fila) => fila.unidadId),
          `convenios · ${query || "sin parámetros"}`
        ).toEqual([UNIDAD])
      }
    })
  })
})
