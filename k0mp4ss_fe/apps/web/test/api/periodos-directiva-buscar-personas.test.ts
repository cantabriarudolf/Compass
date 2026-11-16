// @vitest-environment node
/**
 * T11 (S10) — `GET /api/periodos-directiva/buscar-personas`, la búsqueda ligera
 * de la nómina de la directiva.
 *
 * El diálogo de la directiva (`/comunidad/directiva`) armaba la nómina con un
 * checkbox por persona sobre `personas.filter(estadoCuenta === "activa")`, y esa
 * colección venía de `usePersonas()` → `/api/personas?pageSize=100`: una persona
 * fuera de las primeras cien filas del padrón NO podía ser nombrada directora.
 * La directiva es un órgano legal (art. 17 Ley 21.442): no poder nombrar a quien
 * corresponde es un defecto de fondo. Este endpoint resuelve la búsqueda EN el
 * servidor con la regla que la pantalla aplicaba —sólo cuentas ACTIVAS de la
 * comunidad, sin requisitos nuevos— y las garantías de la serie «permisos por
 * objeto»:
 *
 *   · `q` filtra nombre y RUT sobre TODA la comunidad, sin el techo de 100
 *     filas del padrón del cliente. El email NO es criterio (T21, decisión del
 *     owner): al rechazar los comodines de LIKE, una búsqueda por email con
 *     guion bajo rompía; se sacó el email del OR en vez de abrir el comodín;
 *   · la página es chica y la respuesta declara `total`, `page` y `pageSize`:
 *     el recorte se DECLARA, no se esconde (S10);
 *   · el scope de comunidad sale de la sesión (`withComunidadScope`): la fila de
 *     otra comunidad no es un dato ajeno que se ignora, es una fila que no existe;
 *   · el alcance por filas es el de toda la serie (`alcancePorFilasDeSesion`):
 *     administración y comité buscan la comunidad; un rol acotado sólo encuentra
 *     SU propia persona y, sin ficha en MP, nada (falla cerrado);
 *   · la compuerta de la matriz es `gd` con `ver` — la familia que gobierna el
 *     libro de la directiva (actas + períodos, la misma de las rutas hermanas
 *     `app/api/periodos-directiva/*`). No existe clave granular `gd:*` en la
 *     MATRIZ, así que la raíz no es «desnuda» para la regla R1 del auditor
 *     (no hay hermanos granulares que exigir) y el guardián queda verde;
 *   · `q` necesita AL MENOS DOS caracteres (misma literal que el buscador de
 *     certificados: un techo que sólo impone la UI no es un techo);
 *   · sesenta búsquedas por minuto por usuario con ámbito PROPIO
 *     (`"periodos-directiva"`): el pozo no se comparte con otros buscadores —
 *     el verificador midió que compartirlo dejaba sin cuota a endpoints ajenos.
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

const COM_A = "t11-com-a"
const COM_B = "t11-com-b"

const U_A1 = "t11-u-101"
const U_B1 = "t11-u-201"

const P_ANA = "t11-p-ana" // «Ana Buscada», cuenta activa — la buscable
const P_INACTIVA = "t11-p-inactiva" // existe, con cuenta INACTIVA: nunca aparece
// 100 personas del lote: Zoila queda en la fila 102 del padrón ordenado, FUERA
// de las primeras cien — el caso que el techo de `usePersonas` volvía imposible.
const LOTE_CANTIDAD = 100
const loteId = (n: number) => `t11-p-lote-${String(n).padStart(3, "0")}`
const P_ZOILA = "t11-p-zoila" // «Zoila Fondo del Padrón», activa, más allá de la fila 100
const P_B_ANA = "t11-p-bana" // MISMA identidad en la otra comunidad

const EMAIL = {
  admin: "t11-admin@test.cl",
  residente: "t11-residente@test.cl",
  mantencion: "t11-mantencion@test.cl",
  conserjeria: "t11-conserjeria@test.cl",
  comite: "t11-comite@test.cl",
  sinFicha: "t11-sinficha@test.cl",
  adminB: "t11-admin-b@test.cl",
  // Usuario propio del caso de rate limit: el contador es por usuario, así que
  // gastar 60 búsquedas acá no debe tocar la cuota de los demás casos.
  limite: "t11-limite@test.cl",
}

const moduloBuscador = () => import("@/app/api/periodos-directiva/buscar-personas/route")

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
  return invocarApi(moduloBuscador(), "GET", `periodos-directiva/buscar-personas?${query}`)
}

interface PersonaNomina {
  id: string
  nombreCompleto: string
  rut: string
}
interface Coleccion {
  data: PersonaNomina[]
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
  rut: string,
  estadoCuenta = "activa"
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
      email: `${id}@t11.test.cl`,
      telefonoMovil: "+56911111111",
      estadoCuenta,
      condicionesEspecialesIds: [],
      roles: ["propietario"],
    },
  })
}

describe("T11 — GET /api/periodos-directiva/buscar-personas", () => {
  beforeAll(async () => {
    for (const [id, nombre, slug] of [
      [COM_A, "Comunidad T11 A", "t11-a"],
      [COM_B, "Comunidad T11 B", "t11-b"],
    ] as const) {
      await prisma.comunidad.upsert({ where: { id }, update: {}, create: { id, nombre, slug } })
    }

    await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })

    await crearPersona(P_ANA, COM_A, "Ana Buscada", "7.123.456-8")
    // El universo es `estadoCuenta: "activa"` — la regla exacta que la pantalla
    // aplicaba. Una cuenta inactiva no es elegible y no aparece.
    await crearPersona(P_INACTIVA, COM_A, "Zulma Inactiva", "8.222.222-2", "inactiva")

    // El lote que rebasa el techo del padrón: 100 activas para «T11 Lote».
    for (let n = 1; n <= LOTE_CANTIDAD; n++) {
      await crearPersona(loteId(n), COM_A, `T11 Lote ${String(n).padStart(3, "0")}`, `11.444.4${String(n).padStart(3, "0")}-K`)
    }

    // Orden alfabético sobre las activas: Ana (1), lote (2..101), Zoila (102) —
    // FUERA de las primeras cien filas del padrón.
    await crearPersona(P_ZOILA, COM_A, "Zoila Fondo del Padron", "9.333.333-3")

    // La MISMA identidad en la otra comunidad: el scope la deja afuera.
    await crearPersona(P_B_ANA, COM_B, "Ana Buscada", "7.999.999-9")

    for (const u of [
      { email: EMAIL.admin, comunidadId: COM_A, rol: "administrador", personaId: null },
      { email: EMAIL.residente, comunidadId: COM_A, rol: "residente", personaId: P_ANA },
      { email: EMAIL.mantencion, comunidadId: COM_A, rol: "mantencion", personaId: null },
      { email: EMAIL.conserjeria, comunidadId: COM_A, rol: "conserjeria", personaId: null },
      { email: EMAIL.comite, comunidadId: COM_A, rol: "comite", personaId: null },
      { email: EMAIL.sinFicha, comunidadId: COM_A, rol: "residente", personaId: null },
      { email: EMAIL.adminB, comunidadId: COM_B, rol: "administrador", personaId: null },
      { email: EMAIL.limite, comunidadId: COM_A, rol: "administrador", personaId: null },
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
    const res = await conSesion(null, () => buscar("Ana"))
    expect(res.status).toBe(401)
  })

  it("un rol sin la clave `gd` no busca el padrón de la nómina (403)", async () => {
    // mantencion no tiene `gd` en la matriz: la nómina de la directiva no es
    // tarea del portón ni de la mantención. El 403 es literal y no un vacío
    // silencioso: rechazar es parte del contrato.
    const res = await conSesion(EMAIL.mantencion, () => buscar("Ana"))
    expect(res.status).toBe(403)
    expect((await cuerpo(res)).error).toBe("Permiso denegado.")
  })

  it("conserjería tampoco busca el padrón de la nómina (403)", async () => {
    const res = await conSesion(EMAIL.conserjeria, () => buscar("Ana"))
    expect(res.status).toBe(403)
    expect((await cuerpo(res)).error).toBe("Permiso denegado.")
  })

  it("el comité entra por su clave exacta `gd` ver y busca su comunidad, nunca la ajena", async () => {
    // El comité tiene `gd` con las cinco acciones (H5): la nómina de la
    // directiva es gestión del comité. Y el alcance: comité está en
    // `ROLES_CON_ALCANCE_DE_COMUNIDAD` sin ficha en MP; si cayera al alcance
    // por filas recibiría `denegado` (fail-closed) y este 200 con Ana se
    // volvería un vacío silencioso.
    await conSesion(EMAIL.comite, async () => {
      const res = await buscar("Buscada")
      expect(res.status).toBe(200)
      const vista = await cuerpo(res)
      expect(vista.data.map((p) => p.id)).toEqual([P_ANA])
      expect(vista.data.some((p) => p.id === P_B_ANA)).toBe(false)
    })
  })

  it("sin `q` responde 400: la búsqueda es la razón de la ruta", async () => {
    const res = await conSesion(EMAIL.admin, () =>
      invocarApi(moduloBuscador(), "GET", "periodos-directiva/buscar-personas")
    )
    expect(res.status).toBe(400)
    expect((await cuerpo(res)).error).toBe("Falta el parámetro q.")
  })

  it("`q` de un carácter responde 400: el mínimo de dos no lo pone sólo el componente", async () => {
    await conSesion(EMAIL.admin, async () => {
      const letra = await buscar("A")
      expect(letra.status).toBe(400)
      const vista = await cuerpo(letra)
      expect(vista.error).toBe("El parámetro q necesita al menos dos caracteres.")
      expect(vista.data).toBeUndefined()

      // Un dígito solo tampoco entra: el RUT se busca con más de un carácter.
      expect((await buscar("7")).status).toBe(400)

      // El borde de arriba sigue entrando: dos caracteres son una búsqueda.
      expect((await buscar("7.")).status).toBe(200)
    })
  })

  it("`q` filtra por nombre y RUT sobre toda la comunidad; el email deja de ser criterio (T21)", async () => {
    await conSesion(EMAIL.admin, async () => {
      const porNombre = await cuerpo(await buscar("Ana Buscada"))
      expect(porNombre.total).toBe(1)
      expect(porNombre.data.map((p) => p.id)).toEqual([P_ANA])

      const porRut = await cuerpo(await buscar("7.123.456"))
      expect(porRut.total).toBe(1)
      expect(porRut.data.map((p) => p.id)).toEqual([P_ANA])

      // T21 (decisión del owner): el email SALIÓ del OR. Al rechazar los comodines
      // de LIKE —correcto: `_` matchea un carácter y `__` enumera—, una búsqueda
      // por email que antes daba 200 pasó a 400; la salida honesta fue sacar el
      // email del OR, no reabrir el comodín. El propio email de Ana ya no la
      // encuentra por email (200 con cero filas, nunca 400), mientras el nombre y
      // el RUT de arriba siguen encontrándola.
      const porEmail = await cuerpo(await buscar("t11-p-ana@t11.test.cl"))
      expect(porEmail.total).toBe(0)
      expect(porEmail.data).toEqual([])
    })
  })

  it("`q` con comodines de LIKE responde 400: el comodín no puede enumerar el padrón (R1-001)", async () => {
    // `%%` cumple el mínimo de dos caracteres y el comodín de LIKE convierte la
    // búsqueda en un barrido del padrón completo: el patrón que arma `contains`
    // es `%q%`, con `q` sin escapar. El término con comodín se rechaza.
    await conSesion(EMAIL.admin, async () => {
      const doble = await buscar("%%")
      expect(doble.status).toBe(400)
      const vista = await cuerpo(doble)
      expect(vista.error).toBe("El parámetro q no acepta los comodines % y _.")
      expect(vista.data).toBeUndefined()

      // Un comodín escondido en un término plausiblemente real también se
      // rechaza: `_` es comodín de un carácter en LIKE, igual que `%`.
      expect((await buscar("9%")).status).toBe(400)
      expect((await buscar("a_b")).status).toBe(400)
    })
  })

  it("el orden de las guardas de `q` queda pineado con sus mensajes exactos (T21)", async () => {
    // El orden importa y se lee en los mensajes: el mínimo de dos corre ANTES
    // que la guarda de comodines, y el trim corre ANTES de la guarda de
    // parámetro faltante. Cualquier reorden de las guardas cambia alguno de
    // estos cuatro textos y este pin muere.
    await conSesion(EMAIL.admin, async () => {
      // Un solo `%` es comodín pero NO alcanza el mínimo: el error es el del
      // mínimo de dos, NO el de comodines.
      const soloComodin = await buscar("%")
      expect(soloComodin.status).toBe(400)
      expect((await cuerpo(soloComodin)).error).toBe(
        "El parámetro q necesita al menos dos caracteres."
      )

      // Dos guiones bajos SÍ alcanzan el mínimo y recién ahí muerde la guarda
      // de comodines.
      const dosComodines = await buscar("__")
      expect(dosComodines.status).toBe(400)
      expect((await cuerpo(dosComodines)).error).toBe(
        "El parámetro q no acepta los comodines % y _."
      )

      // Dos espacios se recortan a vacío: el error es el del parámetro
      // faltante, no el del mínimo.
      const soloEspacios = await buscar("  ")
      expect(soloEspacios.status).toBe(400)
      expect((await cuerpo(soloEspacios)).error).toBe("Falta el parámetro q.")

      // Un RUT parcial con puntos sigue siendo una búsqueda válida (200): el
      // punto no es comodín de LIKE.
      const rutParcial = await buscar("123.456")
      expect(rutParcial.status).toBe(200)
    })
  })

  it("el filtro de búsqueda declara `mode: insensitive` sólo para el cliente PostgreSQL (R3-1)", async () => {
    // En SQLite el `contains` ya es case-insensitive (LIKE de ASCII) y el
    // conector RECHAZA `mode`; en PostgreSQL el `contains` es case-sensitive y
    // una búsqueda en minúsculas no encontraba nada. El filtro declara `mode`
    // sólo cuando el cliente generado es PostgreSQL.
    const ruta = await import("@/app/api/periodos-directiva/buscar-personas/route")
    // El OR es nombre y RUT: el email salió del OR (T21, decisión del owner).
    expect(ruta.filtroDeBusqueda("ana", "postgresql")).toEqual([
      { nombreCompleto: { contains: "ana", mode: "insensitive" } },
      { rut: { contains: "ana", mode: "insensitive" } },
    ])
    // SQLite —y un proveedor desconocido— no declara `mode`: el conector lo
    // rechaza y con él cada búsqueda de la ruta respondería 500.
    const enSqlite = [
      { nombreCompleto: { contains: "ana" } },
      { rut: { contains: "ana" } },
    ]
    expect(ruta.filtroDeBusqueda("ana", "sqlite")).toEqual(enSqlite)
    expect(ruta.filtroDeBusqueda("ana", null)).toEqual(enSqlite)
  })

  it("la búsqueda en minúsculas encuentra a la persona (el `contains` de SQLite ya es case-insensitive)", async () => {
    // Guarda de la rama SQLite: si `mode: "insensitive"` llegara a declararse
    // sin condicional, el conector SQLite lo rechaza y ESTA búsqueda se vuelve
    // 500 en toda la suite.
    await conSesion(EMAIL.admin, async () => {
      const vista = await cuerpo(await buscar("ana buscada"))
      expect(vista.total).toBe(1)
      expect(vista.data.map((p) => p.id)).toEqual([P_ANA])
    })
  })

  it("el universo es `estadoCuenta: \"activa\"` — la misma regla que la pantalla aplicaba, sin requisitos nuevos", async () => {
    // Ni vínculo ni unidad: la pantalla filtraba SÓLO por cuenta activa.
    await conSesion(EMAIL.admin, async () => {
      expect((await cuerpo(await buscar("Zulma Inactiva"))).total).toBe(0)
    })
  })

  it("la persona fuera de las primeras cien filas SÍ se encuentra (el defecto de fondo)", async () => {
    // Zoila es la fila 102 del padrón ordenado: con `usePersonas?pageSize=100`
    // nunca podía elegirse directora. El servidor busca sobre TODA la comunidad.
    await conSesion(EMAIL.admin, async () => {
      const vista = await cuerpo(await buscar("Zoila"))
      expect(vista.total).toBe(1)
      expect(vista.data.map((p) => p.id)).toEqual([P_ZOILA])
      expect(vista.data[0]?.nombreCompleto).toBe("Zoila Fondo del Padron")
    })
  })

  it("la página declara el recorte: total 100, pageSize 25, y las páginas traen el resto sin repetir", async () => {
    await conSesion(EMAIL.admin, async () => {
      const pagina1 = await cuerpo(await buscar("T11 Lote"))
      expect(pagina1.total).toBe(LOTE_CANTIDAD)
      expect(pagina1.data).toHaveLength(25)
      expect(pagina1.page).toBe(1)
      expect(pagina1.pageSize).toBe(25)
      expect(pagina1.data.length).toBeLessThan(pagina1.total)

      const pagina2 = await cuerpo(await buscar("T11 Lote", 2))
      const pagina4 = await cuerpo(await buscar("T11 Lote", 4))
      expect(pagina4.data).toHaveLength(LOTE_CANTIDAD - 75)
      // Sin repetidos entre páginas.
      const ids = new Set([...pagina1.data, ...pagina2.data, ...pagina4.data].map((p) => p.id))
      expect(ids.size).toBe(pagina1.data.length + pagina2.data.length + pagina4.data.length)
    })
  })

  it("un `page` fuera del rango de Int no tumba la ruta: se topa en 10 000 antes del skip", async () => {
    // El verificador de la serie midió que un `page` enorme hacía que Prisma
    // rechazara el `skip` (fuera del rango de Int) y la ruta respondiera 500
    // en vez de una página vacía.
    await conSesion(EMAIL.admin, async () => {
      const res = await buscar("Zoila", 99_999_999_999_999)
      expect(res.status).toBe(200)
      const vista = await cuerpo(res)
      expect(vista.page).toBe(10_000)
      expect(vista.data).toEqual([])
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
      // Aunque 100 filas del lote matcheen para la administración, el residente
      // no ve ninguna que no sea la suya.
      const ajena = await cuerpo(await buscar("T11 Lote"))
      expect(ajena.total).toBe(0)
      expect(ajena.data).toEqual([])
    })
    await conSesion(EMAIL.sinFicha, async () => {
      const denegada = await cuerpo(await buscar("Buscada"))
      expect(denegada.total).toBe(0)
      expect(denegada.data).toEqual([])
    })
  })

  it("más de 60 búsquedas por minuto responden 429 sin emitir filas, y el bloqueo es por usuario", async () => {
    // El límite corre ANTES de validar `q`, así que las 60 se gastan con 400
    // baratos: la prueba no golpea la base y de paso fija el orden de las
    // guardas (si el limiter pasara después, este bucle haría 60 búsquedas).
    //
    // T21/R4-001: el 429 deja rastro propio — SU evento `RP_VOLUME_LIMITED` con
    // el emisor de esta ruta — y no una denegación de privilegio. Como en los
    // otros dos buscadores, el evento es por EVENTO del limitador: dos 429 del
    // mismo usuario dentro de la ventana emiten UN aviso, no uno por respuesta.
    const espia = vi.spyOn(logger, "warn").mockImplementation(() => {})
    await conSesion(EMAIL.limite, async () => {
      for (let n = 0; n < 60; n++) {
        expect((await buscar("A")).status).toBe(400)
      }
      const cortada = await buscar("Ana Buscada")
      expect(cortada.status).toBe(429)
      const vista = await cuerpo(cortada)
      expect(vista.error).toBe("Demasiadas solicitudes.")
      expect(vista.data).toBeUndefined()
      // Segundo 429 del mismo usuario, adentro de la ventana: no re-emite.
      expect((await buscar("Ana Buscada")).status).toBe(429)
    })
    const eventos = (espia.mock.calls as unknown as [Record<string, unknown>][]).filter(
      ([cuerpo]) => cuerpo?.event === "RP_VOLUME_LIMITED"
    )
    expect(eventos, "el 429 emite RP_VOLUME_LIMITED").toHaveLength(1)
    const usuario = await prisma.usuario.findUnique({ where: { email: EMAIL.limite } })
    expect((eventos[0]?.[0] as { usuarioId?: string } | undefined)?.usuarioId).toBe(usuario?.id)
    // El emisor dice de dónde viene el techo: el evento es de ESTA ruta, no del
    // pozo compartido de los otros buscadores.
    expect((eventos[0]?.[0] as { emisor?: string } | undefined)?.emisor).toBe("periodos-directiva")
    vi.restoreAllMocks()

    // El pin inverso: la clave es `ambito:usuarioId` — y el ámbito es PROPIO de
    // esta ruta (`"periodos-directiva"`, no el pozo de otros buscadores). El
    // bloqueo del usuario que agotó su cuota no se le contagia a otro usuario.
    await conSesion(EMAIL.admin, async () => {
      expect((await buscar("Ana Buscada")).status).toBe(200)
    })
  })
})
