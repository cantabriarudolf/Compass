// @vitest-environment node
/** S3: la compuerta del cron de la cola de CO y el orden del drenaje. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const cola = vi.hoisted(() => ({
  resumen: 0,
  comunidades: 0,
  llamadas: [] as Array<{ comunidadId: string; limite: unknown }>,
  fallar: null as string | null,
}))

vi.mock("@/lib/co-cola", () => ({
  comunidadesConColaSalidaCO: async () => {
    cola.comunidades += 1
    return ["com-a", "com-b"]
  },
  drenarColaSalidaCO: async (filtro: { comunidadId: string; limite?: unknown }) => {
    cola.llamadas.push({ comunidadId: filtro.comunidadId, limite: filtro.limite })
    if (filtro.comunidadId === cola.fallar) throw new Error("falla forzada del lote")
    return {
      tomadas: 25,
      enviadas: 24,
      fallidas: 1,
      pendientes: 7,
      totales: { enviados: 1, fallidos: 1, pendientes: 7, ultimoError: "m" },
      ultimoError: "motivo-del-lote",
    }
  },
  resumenColaSalidaCO: async () => {
    cola.resumen += 1
    return { enviados: 2, fallidos: 1, pendientes: 3, ultimoError: "ultimo" }
  },
}))

vi.mock("@/lib/api/with-comunidad-scope", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  return {
    ...real,
    withComunidadScope: async () => ({
      ok: true,
      scope: { rol: "admin", comunidadId: "com-a", usuarioId: "probe-u" },
    }),
  }
})

vi.mock("@/lib/authz", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  return { ...real, puede: () => true }
})

const modulo = () => import("@/app/api/co/cola/route")
const SECRETO = "secreto-probe-t3"
const TEXTO_BEARER =
  "No autorizado: la cola de salida de CO exige el secreto del cron en el encabezado Authorization (Bearer)."
const TEXTO_SIN_VARIABLE =
  "No autorizado: falta la variable de entorno CRON_SECRET en el servidor, así que la cola de salida de CO no se drena."

async function pedir(headers: Record<string, string> = {}): Promise<Response> {
  const { GET } = await modulo()
  return GET(new Request("http://localhost/api/co/cola", { method: "GET", headers }))
}

const previo = process.env.CRON_SECRET

beforeEach(() => {
  cola.resumen = 0
  cola.comunidades = 0
  cola.llamadas = []
  cola.fallar = null
  process.env.CRON_SECRET = SECRETO
})

afterEach(() => {
  if (previo === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = previo
})

describe("GET /api/co/cola con el bearer del cron (S3)", () => {
  it("drena un lote por comunidad y suma totales", async () => {
    const res = await pedir({ authorization: `Bearer ${SECRETO}` })
    expect(res.status).toBe(200)
    const cuerpo = (await res.json()) as Record<string, any>
    expect(cuerpo.totales).toEqual({
      comunidades: 2,
      tomadas: 50,
      enviadas: 48,
      fallidas: 2,
      pendientes: 14,
    })
    expect(cola.llamadas).toEqual([
      { comunidadId: "com-a", limite: undefined },
      { comunidadId: "com-b", limite: undefined },
    ])
  })

  it("el esquema Bearer no distingue mayúsculas ni espacios", async () => {
    expect((await pedir({ authorization: `bearer ${SECRETO}` })).status).toBe(200)
    expect((await pedir({ authorization: `BEARER   ${SECRETO}` })).status).toBe(200)
    expect((await pedir({ authorization: `  Bearer ${SECRETO}  ` })).status).toBe(200)
  })

  it("un lote que lanza no aborta la corrida", async () => {
    cola.fallar = "com-a"
    const res = await pedir({ authorization: `Bearer ${SECRETO}` })
    expect(res.status).toBe(200)
    const cuerpo = (await res.json()) as Record<string, any>
    expect(cuerpo.comunidades.map((f: any) => [f.comunidadId, f.ok])).toEqual([
      ["com-a", false],
      ["com-b", true],
    ])
    expect(cuerpo.comunidades[0].error).toBe(
      "No se pudo drenar la cola de salida de esta comunidad."
    )
    expect(cuerpo.totales.tomadas).toBe(25)
  })

  const casos: Array<[string, Record<string, string>]> = [
    ["bearer equivocado", { authorization: "Bearer otro" }],
    ["esquema Basic", { authorization: `Basic ${SECRETO}` }],
    ["Bearer sin valor", { authorization: "Bearer" }],
    ["Bearer vacío", { authorization: "Bearer    " }],
    ["sin esquema", { authorization: SECRETO }],
    ["prefijo del secreto", { authorization: `Bearer ${SECRETO.slice(0, -1)}` }],
    ["secreto con sufijo", { authorization: `Bearer ${SECRETO}x` }],
  ]
  for (const [nombre, headers] of casos) {
    it(`${nombre} → 401 sin leer la cola ni drenar`, async () => {
      const res = await pedir(headers)
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: TEXTO_BEARER })
      expect(cola.comunidades).toBe(0)
      expect(cola.llamadas).toEqual([])
      expect(cola.resumen).toBe(0)
    })
  }

  it("CRON_SECRET ausente → 401 fail-closed, sin tocar la base", async () => {
    delete process.env.CRON_SECRET
    const res = await pedir({ authorization: `Bearer ${SECRETO}` })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: TEXTO_SIN_VARIABLE })
    expect(cola.comunidades).toBe(0)
    expect(cola.llamadas).toEqual([])
  })

  it("CRON_SECRET en blanco o vacío → 401 fail-closed", async () => {
    process.env.CRON_SECRET = "   "
    expect((await pedir({ authorization: "Bearer    " })).status).toBe(401)
    process.env.CRON_SECRET = ""
    expect((await pedir({ authorization: "Bearer " })).status).toBe(401)
    expect(cola.comunidades).toBe(0)
    expect(cola.llamadas).toEqual([])
  })

  it("sin encabezado la ruta sigue siendo la métrica y no drena", async () => {
    const res = await pedir()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      enviados: 2,
      fallidos: 1,
      pendientes: 3,
      ultimoError: "ultimo",
    })
    expect(cola.resumen).toBe(1)
    expect(cola.comunidades).toBe(0)
    expect(cola.llamadas).toEqual([])
  })
})
