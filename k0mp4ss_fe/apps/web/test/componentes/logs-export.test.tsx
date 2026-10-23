// @vitest-environment jsdom
/**
 * Exportación CSV de /admin/logs — el archivo lleva el resultado del FILTRO, no la página.
 *
 * Hallazgo de la auditoría de "funciones de palo": el botón "Exportar CSV" iteraba
 * `eventos`, las ~50 filas de la página visible, mientras el usuario creía haber exportado
 * el filtro completo. El contrato nuevo es:
 *   · `GET /api/auditoria?exportar=1` devuelve el conjunto filtrado entero (tope explícito
 *     `LIMITE_EXPORTACION`, con `total`/`exportados`/`truncado` en la respuesta);
 *   · el CSV incluye todas esas filas, y si hubo tope lo declara DENTRO del archivo y en la UI.
 *
 * El test monta el endpoint real (con prisma y auth mockeados) y hace que `fetch` delegue en
 * él: el CSV que se verifica es el que produce el código de producción, no un mock.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// jsdom no implementa el fetching relativo del componente: se sirve el handler real.
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u-admin" } })) }))

const TOTAL = 137

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    usuario: { findUnique: vi.fn() },
    membresia: { findFirst: vi.fn() },
    eventoAuditoria: { count: vi.fn(), findMany: vi.fn() },
  },
}))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

import { LIMITE_EXPORTACION, GET } from "@/app/api/auditoria/route"
import LogsPage from "@/app/admin/logs/page"

type Evento = {
  id: string
  timestamp: string
  usuario: string
  categoria: string
  tipoAccion: string
  referenciaId: string
  descripcion: string
}

/** Eventos sintéticos: el primero y el último son los que delatan el recorte. */
function eventosDe(n: number): Evento[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `ev-${i + 1}`,
    timestamp: new Date(Date.UTC(2026, 9, 21, 12, 0, 0) - i * 60_000).toISOString(),
    usuario: "u-admin",
    categoria: i % 2 === 0 ? "acceso" : "finanzas",
    tipoAccion: i % 2 === 0 ? "LOGIN" : "FI_EGRESO",
    referenciaId: `ref-${i + 1}`,
    descripcion: `Evento de auditoría número ${i + 1}`,
  }))
}

/** Universo visible por los mocks; se reajusta por caso para probar el tope. */
const estado = { total: TOTAL, eventos: eventosDe(TOTAL) }

beforeEach(() => {
  estado.total = TOTAL
  estado.eventos = eventosDe(TOTAL)

  prismaMock.usuario.findUnique.mockResolvedValue({ id: "u-admin", activo: true })
  prismaMock.membresia.findFirst.mockResolvedValue({
    comunidadId: "comunidad-a",
    rol: "administrador",
  })
  prismaMock.eventoAuditoria.count.mockImplementation(async () => estado.total)
  prismaMock.eventoAuditoria.findMany.mockImplementation(
    async (args: { skip?: number; take?: number; select?: Record<string, unknown> } = {}) => {
      if (args.select) {
        return args.select.categoria
          ? [{ categoria: "acceso" }, { categoria: "finanzas" }]
          : [{ tipoAccion: "LOGIN" }, { tipoAccion: "FI_EGRESO" }]
      }
      const desde = args.skip ?? 0
      const hasta = desde + (args.take ?? 20)
      return estado.eventos.slice(desde, hasta)
    }
  )

  // `fetch` del componente → handler GET real del endpoint.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: RequestInfo | URL) => {
      const destino = String(entrada)
      const url = destino.startsWith("http") ? destino : `http://localhost${destino}`
      return GET(new Request(url))
    })
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** jsdom no expone `Blob#text()`: se lee el Blob con FileReader (sí implementado). */
function leerBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result ?? ""))
    lector.onerror = () => reject(lector.error ?? new Error("no se pudo leer el CSV"))
    lector.readAsText(blob)
  })
}

/** Captura el Blob que el componente manda a descargar y devuelve su texto. */
function interceptarDescarga(): { texto: () => Promise<string> } {
  let capturado: Blob | null = null
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn((blob: Blob) => {
      capturado = blob
      return "blob:auditoria"
    }),
  })
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => {}),
  })
  return {
    texto: async () => {
      if (!capturado) throw new Error("el componente no generó ningún archivo")
      return leerBlob(capturado as Blob)
    },
  }
}

function get(params: string) {
  return GET(new Request(`http://localhost/api/auditoria?${params}`))
}

describe("GET /api/auditoria?exportar=1 — conjunto filtrado completo", () => {
  it("devuelve todas las filas del filtro, no una página", async () => {
    const res = await get("exportar=1")
    expect(res.status).toBe(200)
    const cuerpo = (await res.json()) as {
      total: number
      exportados: number
      truncado: boolean
      eventos: Evento[]
    }
    expect(cuerpo.total).toBe(TOTAL)
    expect(cuerpo.exportados).toBe(TOTAL)
    expect(cuerpo.truncado).toBe(false)
    expect(cuerpo.eventos).toHaveLength(TOTAL)
    // La última fila del universo viaja en el archivo (la página 3 nunca se pidió).
    expect(cuerpo.eventos.at(-1)?.id).toBe(`ev-${TOTAL}`)
  })

  it("con volumen mayor al tope declara cuántas filas quedaron fuera", async () => {
    estado.total = LIMITE_EXPORTACION + 2_500
    estado.eventos = eventosDe(estado.total)

    const cuerpo = (await (await get("exportar=1")).json()) as {
      total: number
      exportados: number
      limite: number
      truncado: boolean
      eventos: Evento[]
    }
    expect(cuerpo.total).toBe(LIMITE_EXPORTACION + 2_500)
    expect(cuerpo.exportados).toBe(LIMITE_EXPORTACION)
    expect(cuerpo.limite).toBe(LIMITE_EXPORTACION)
    expect(cuerpo.truncado).toBe(true)
    expect(cuerpo.eventos).toHaveLength(LIMITE_EXPORTACION)
  })

  it("la página paginada sigue devolviendo 50 filas y su total", async () => {
    const cuerpo = (await (await get("page=1&pageSize=50")).json()) as {
      total: number
      eventos: Evento[]
    }
    expect(cuerpo.total).toBe(TOTAL)
    expect(cuerpo.eventos).toHaveLength(50)
  })
})

describe("/admin/logs — el CSV exporta el filtro, no la página", () => {
  it("con más resultados que el pageSize el CSV trae todas las filas filtradas", async () => {
    const user = userEvent.setup()
    const descarga = interceptarDescarga()

    render(<LogsPage />)

    // La tabla muestra solo la primera página (50 de 137).
    await waitFor(() => {
      expect(screen.getByText("50 de 137 eventos en BD")).toBeTruthy()
    })
    expect(screen.getAllByText(/Evento de auditoría número/)).toHaveLength(50)

    await user.click(screen.getByRole("button", { name: /Exportar CSV/ }))

    const texto = await descarga.texto()
    const lineas = texto.replace(/^\uFEFF/, "").trimEnd().split("\n")

    // encabezado + todas las filas del filtro
    expect(lineas[0]).toBe("timestamp,usuario,categoria,tipoAccion,referenciaId,descripcion")
    expect(lineas).toHaveLength(TOTAL + 1)
    expect(texto).toContain("Evento de auditoría número 137")
    expect(texto).toContain("ref-137")
    // Sin tope alcanzado, no hay pie de truncamiento.
    expect(texto).not.toContain("# exportadas")

    const aviso = await screen.findByRole("status")
    expect((aviso.textContent ?? "").replace(/\s+/g, " ")).toBe(
      `CSV generado con los ${TOTAL} eventos del filtro actual.`
    )
  })

  it("si el filtro excede el tope, la UI y el archivo dicen cuántas filas quedaron fuera", async () => {
    estado.total = LIMITE_EXPORTACION + 500
    estado.eventos = eventosDe(estado.total)

    const user = userEvent.setup()
    const descarga = interceptarDescarga()

    render(<LogsPage />)
    await waitFor(() => {
      expect(screen.getByText(/50 de 5\.500 eventos en BD/)).toBeTruthy()
    })

    await user.click(screen.getByRole("button", { name: /Exportar CSV/ }))

    const texto = await descarga.texto()
    expect(texto).toContain(
      `# exportadas ${LIMITE_EXPORTACION} de 5500 filas del filtro; 500 quedaron fuera (tope ${LIMITE_EXPORTACION})`
    )

    const aviso = await screen.findByRole("status")
    expect((aviso.textContent ?? "").replace(/\s+/g, " ")).toContain(
      `CSV generado con 5.000 de 5.500 eventos filtrados: 500 quedaron fuera (tope 5.000)`
    )
  })
})
