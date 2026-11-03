/**
 * @vitest-environment node
 *
 * `GET /api/personas` — filtros aditivos de rol y estado de cuenta (servidor).
 *
 * Defecto medido (`prisma/dev.db`, 118 personas, página de 100): `/personas/residentes` ya
 * resolvía la búsqueda en el servidor, pero `/comunidad/personas` y `/admin/gestion` filtraban el
 * rol y el estado de cuenta en el navegador sobre la primera página. 18 personas quedaban
 * inalcanzables al filtrar por rol y los contadores describían la página como si fuera el padrón.
 *
 * Este caso fija el contrato del servidor, que es la mitad que las dos pantallas consumen:
 *   - `?rol=` (roles propios de `Persona.roles`, OR entre los pedidos);
 *   - `?rolDirectorio=` (roles derivados del Directorio de Gestión Administrativa);
 *   - `?estadoCuenta=` (valor exacto de `Persona.estadoCuenta`);
 *   - los tres se INTERSECTAN entre sí, con `q`/`rut`/`esResidente` y con el ABAC del residente,
 *     sin reemplazar nunca el `where` de permisos;
 *   - sin parámetros nuevos, la respuesta es byte a byte la de antes (mismas claves, mismos ids).
 *
 * Vive en `test/componentes/` porque es la superficie que la tarea habilitó para esta ventana; el
 * entorno es `node` y usa la base descartable de la suite (`test/db-descartable.setup.ts`).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
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

describe("/api/personas — filtros de rol y estado de cuenta en el servidor", () => {
  const comunidad = "pf-comunidad-a"
  const emailAdmin = "pf-admin@test.cl"
  const emailResidente = "pf-residente@test.cl"

  /** Personas del escenario: id → el perfil que la ruta tiene que poder aislar. */
  const PERSONAS = {
    propietarioResidente: "pf-p1-prop",
    personalInactiva: "pf-p2-personal",
    directiva: "pf-p3-dir",
    contratistaLaboral: "pf-p4-contratista",
    residenteSolo: "pf-p5-residente",
    propietarioPorVinculo: "pf-p6-sin-rol",
    arrendatarioCerrado: "pf-p7-arrendatario-cerrado",
    arrendatarioVigente: "pf-p8-arrendatario-vigente",
    residentePropio: "pf-p9-propio",
  } as const

  const todosLosIds = () => Object.values(PERSONAS).sort()

  const cargaRuta = async () => import("@/app/api/personas/route")

  async function GET(query = ""): Promise<Response> {
    const { GET: handler } = await cargaRuta()
    return handler(new NextRequest(`http://localhost/api/personas${query}`))
  }

  async function idsDe(query: string): Promise<string[]> {
    const res = await GET(query)
    expect(res.status).toBe(200)
    const cuerpo = (await res.json()) as { data: { id: string }[] }
    return cuerpo.data.map((p) => p.id).sort()
  }

  async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
    const usuario = await prisma.usuario.findUnique({ where: { email } })
    if (!usuario) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  function persona(
    id: string,
    roles: string[],
    estadoCuenta: string,
    extra: Record<string, unknown> = {}
  ) {
    return {
      id,
      comunidadId: comunidad,
      rut: `9${id.replace(/\D/g, "").padStart(7, "0").slice(-7)}-9`,
      nombreCompleto: `Persona ${id}`,
      nombres: "Persona",
      apellidos: id,
      email: `${id}@pf-test.cl`,
      telefonoMovil: "+56900000000",
      estadoCuenta,
      condicionesEspecialesIds: [],
      roles,
      ...extra,
    }
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad Filtros", slug: comunidad },
    })
    for (const usuario of [
      { id: "pf-usuario-admin", email: emailAdmin },
      { id: "pf-usuario-residente", email: emailResidente },
    ]) {
      await prisma.usuario.upsert({
        where: { email: usuario.email },
        update: { personaId: null },
        create: { ...usuario, activo: true },
      })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["pf-usuario-admin", "pf-usuario-residente"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "pf-usuario-admin", comunidadId: comunidad, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "pf-usuario-residente", comunidadId: comunidad, rol: "residente" },
    })
    // El residente ve únicamente su propia ficha (ABAC mp:propios).
    await prisma.usuario.update({
      where: { id: "pf-usuario-residente" },
      data: { personaId: PERSONAS.residentePropio },
    })

    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.persona.deleteMany({ where: { comunidadId: comunidad } })

    await prisma.persona.createMany({
      data: [
        persona(PERSONAS.propietarioResidente, ["propietario", "residente"], "activa"),
        persona(PERSONAS.personalInactiva, ["personal"], "inactiva", {
          datosLaborales: { cargo: "Conserje" },
        }),
        persona(PERSONAS.directiva, ["directiva"], "bloqueada", {
          datosGobernanza: { cargoDirectiva: "presidente", fechaAsuncion: "2025-03-01" },
        }),
        persona(PERSONAS.contratistaLaboral, ["contratista"], "activa", {
          datosLaborales: { cargo: "Jardinero" },
        }),
        persona(PERSONAS.residenteSolo, ["residente"], "activa"),
        persona(PERSONAS.propietarioPorVinculo, [], "activa"),
        persona(PERSONAS.arrendatarioCerrado, [], "activa"),
        persona(PERSONAS.arrendatarioVigente, [], "activa"),
        persona(PERSONAS.residentePropio, ["propietario"], "activa", {
          datosLaborales: { cargo: "Administradora" },
        }),
      ] as never,
    })

    await prisma.vinculoUnidad.createMany({
      data: [
        {
          id: "pf-vinculo-propietario",
          comunidadId: comunidad,
          personaId: PERSONAS.propietarioPorVinculo,
          unidadId: "pf-unidad-1",
          rol: "propietario",
          fechaInicio: "2025-01-01",
          fechaFin: null,
          permiteVerFinanzas: true,
        },
        {
          id: "pf-vinculo-arrendatario-cerrado",
          comunidadId: comunidad,
          personaId: PERSONAS.arrendatarioCerrado,
          unidadId: "pf-unidad-2",
          rol: "arrendatario",
          fechaInicio: "2024-01-01",
          fechaFin: "2025-01-01",
          permiteVerFinanzas: false,
        },
        {
          id: "pf-vinculo-arrendatario-vigente",
          comunidadId: comunidad,
          personaId: PERSONAS.arrendatarioVigente,
          unidadId: "pf-unidad-3",
          rol: "arrendatario",
          fechaInicio: "2025-01-01",
          fechaFin: null,
          permiteVerFinanzas: false,
        },
      ] as never,
    })
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.persona.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["pf-usuario-admin", "pf-usuario-residente"] } },
      })
      for (const id of ["pf-usuario-admin", "pf-usuario-residente"]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  describe("comportamiento de siempre (sin parámetros nuevos)", () => {
    it("devuelve las mismas claves y los mismos ids que antes de los filtros", async () => {
      await conSesion(emailAdmin, async () => {
        const res = await GET()
        expect(res.status).toBe(200)
        const cuerpo = (await res.json()) as Record<string, unknown>
        expect(Object.keys(cuerpo).sort()).toEqual(["data", "page", "pageSize", "total"])
        expect(cuerpo.total).toBe(9)
        expect(cuerpo.page).toBe(1)
        expect(cuerpo.pageSize).toBe(50)
        expect(await idsDe("")).toEqual(todosLosIds())
      })
    })

    it("un parámetro nuevo vacío tampoco filtra (`?rol=&estadoCuenta=`)", async () => {
      await conSesion(emailAdmin, async () => {
        expect(await idsDe("?rol=&rolDirectorio=&estadoCuenta=")).toEqual(todosLosIds())
      })
    })

    it("`?q=` y `?rut=` siguen resolviendo como antes, ahora combinables con el rol", async () => {
      await conSesion(emailAdmin, async () => {
        expect(await idsDe(`?q=${PERSONAS.personalInactiva}`)).toEqual([
          PERSONAS.personalInactiva,
        ])
        expect(
          await idsDe(`?q=${PERSONAS.personalInactiva}&rol=propietario`)
        ).toEqual([])
      })
    })
  })

  describe("filtros nuevos (aditivos)", () => {
    it("`?rol=` filtra por los roles propios de la persona (OR entre los pedidos)", async () => {
      await conSesion(emailAdmin, async () => {
        expect(await idsDe("?rol=personal")).toEqual([PERSONAS.personalInactiva])
        expect(await idsDe("?rol=propietario")).toEqual([
          PERSONAS.propietarioResidente,
          PERSONAS.residentePropio,
        ])
        expect(await idsDe("?rol=propietario,residente")).toEqual([
          PERSONAS.propietarioResidente,
          PERSONAS.residenteSolo,
          PERSONAS.residentePropio,
        ])
      })
    })

    it("`?estadoCuenta=` filtra por el estado exacto persistido (`activa|inactiva|bloqueada`)", async () => {
      await conSesion(emailAdmin, async () => {
        expect(await idsDe("?estadoCuenta=inactiva")).toEqual([PERSONAS.personalInactiva])
        expect(await idsDe("?estadoCuenta=bloqueada")).toEqual([PERSONAS.directiva])
        expect(await idsDe("?estadoCuenta=bloqueada,inactiva")).toEqual(
          [PERSONAS.directiva, PERSONAS.personalInactiva].sort()
        )
      })
    })

    it("`?rolDirectorio=` resuelve los roles derivados del directorio administrativo", async () => {
      await conSesion(emailAdmin, async () => {
        // propietario = rol propio ∪ vínculo de propietario (cualquier fechaFin).
        expect(await idsDe("?rolDirectorio=propietario")).toEqual(
          [
            PERSONAS.propietarioPorVinculo,
            PERSONAS.propietarioResidente,
            PERSONAS.residentePropio,
          ].sort()
        )
        // residente = arrendatario con vínculo vigente ∪ (rol residente sin rol propietario).
        expect(await idsDe("?rolDirectorio=residente")).toEqual(
          [PERSONAS.arrendatarioVigente, PERSONAS.residenteSolo].sort()
        )
        // directiva / personal = ficha de gobernanza / ficha laboral presente.
        expect(await idsDe("?rolDirectorio=directiva")).toEqual([PERSONAS.directiva])
        expect(await idsDe("?rolDirectorio=personal")).toEqual(
          [
            PERSONAS.contratistaLaboral,
            PERSONAS.personalInactiva,
            PERSONAS.residentePropio,
          ].sort()
        )
        expect(await idsDe("?rolDirectorio=personal,directiva")).toEqual(
          [
            PERSONAS.contratistaLaboral,
            PERSONAS.directiva,
            PERSONAS.personalInactiva,
            PERSONAS.residentePropio,
          ].sort()
        )
      })
    })

    it("los filtros se intersectan entre sí (nunca se pisan)", async () => {
      await conSesion(emailAdmin, async () => {
        expect(await idsDe("?rol=propietario&estadoCuenta=inactiva")).toEqual([])
        expect(await idsDe("?rol=propietario&estadoCuenta=activa")).toEqual([
          PERSONAS.propietarioResidente,
          PERSONAS.residentePropio,
        ])
        expect(await idsDe("?rolDirectorio=personal&estadoCuenta=inactiva")).toEqual([
          PERSONAS.personalInactiva,
        ])
        expect(await idsDe("?rol=propietario&rolDirectorio=personal")).toEqual([
          PERSONAS.residentePropio,
        ])
      })
    })

    it("el filtro se aplica ANTES de paginar, así el total no es el tamaño de la página", async () => {
      await conSesion(emailAdmin, async () => {
        const res = await GET("?rolDirectorio=personal&pageSize=2")
        expect(res.status).toBe(200)
        const cuerpo = (await res.json()) as {
          data: { id: string }[]
          pageSize: number
          total: number
        }
        expect(cuerpo.pageSize).toBe(2)
        expect(cuerpo.data).toHaveLength(2)
        expect(cuerpo.total).toBe(3)
      })
    })

    it("rechaza un rol, un rol de directorio o un estado que no existen (400)", async () => {
      await conSesion(emailAdmin, async () => {
        const porRol = await GET("?rol=banana")
        expect(porRol.status).toBe(400)
        expect(((await porRol.json()) as { error: string }).error).toBe(
          "El rol informado no es válido."
        )

        const porRolDirectorio = await GET("?rolDirectorio=contratista")
        expect(porRolDirectorio.status).toBe(400)
        expect(((await porRolDirectorio.json()) as { error: string }).error).toBe(
          "El rol de directorio informado no es válido."
        )

        // `activos` (plural) es el valor que la pantalla mandaba contra `estadoCuenta` y nunca
        // coincidía con `activa`: ahora que el filtro lo resuelve el servidor, se rechaza.
        const porEstado = await GET("?estadoCuenta=activos")
        expect(porEstado.status).toBe(400)
        expect(((await porEstado.json()) as { error: string }).error).toBe(
          "El estado de cuenta informado no es válido."
        )
      })
    })
  })

  describe("ABAC: el residente no gana alcance con los filtros nuevos", () => {
    it("sigue viendo solo su ficha, con y sin filtros", async () => {
      await conSesion(emailResidente, async () => {
        expect(await idsDe("")).toEqual([PERSONAS.residentePropio])
        expect(await idsDe("?rol=propietario")).toEqual([PERSONAS.residentePropio])
        expect(await idsDe("?rolDirectorio=personal")).toEqual([PERSONAS.residentePropio])
        // Nadie más: ni el propietario-residente ni la ficha personal de la comunidad.
        expect(await idsDe("?rol=personal")).toEqual([])
        expect(await idsDe("?rolDirectorio=residente")).toEqual([])
        expect(await idsDe("?estadoCuenta=inactiva")).toEqual([])
        expect(await idsDe("?estadoCuenta=activa")).toEqual([PERSONAS.residentePropio])
      })
    })
  })

  describe("`?esResidente=1` (param de siempre) + filtros nuevos", () => {
    it("mantiene el envelope con `vinculosVigentes` y se intersecta con rol y estado", async () => {
      await conSesion(emailAdmin, async () => {
        const res = await GET("?esResidente=1")
        expect(res.status).toBe(200)
        const cuerpo = (await res.json()) as {
          data: { id: string }[]
          vinculosVigentes?: unknown[]
        }
        expect(Object.keys(cuerpo).sort()).toContain("vinculosVigentes")
        expect(cuerpo.data.map((p) => p.id).sort()).toEqual(
          [PERSONAS.arrendatarioVigente, PERSONAS.propietarioPorVinculo].sort()
        )

        expect(await idsDe("?esResidente=1&rolDirectorio=residente")).toEqual([
          PERSONAS.arrendatarioVigente,
        ])
        expect(await idsDe("?esResidente=1&rol=propietario")).toEqual([])
        expect(await idsDe("?esResidente=1&estadoCuenta=activa")).toEqual(
          [PERSONAS.arrendatarioVigente, PERSONAS.propietarioPorVinculo].sort()
        )
      })
    })
  })
})
