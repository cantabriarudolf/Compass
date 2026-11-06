/**
 * @vitest-environment node
 *
 * T3 cobro-gastos-comunes-parametrico (S1/S3/S7) — resolución de la versión
 * vigente y compuerta de emisión, sin base de datos.
 *
 * Las versiones de prueba llevan nombre ("v1 del reglamento", "v2 del acta")
 * porque son datos de fixture, no números de un reglamento real (S8).
 */
import { describe, it, expect } from "vitest"
import {
  autorizaEmision,
  parametrosDeVersion,
  resolverDocumentoRespaldo,
  versionReglamentoVigente,
  type ClienteDocumentoReglamento,
} from "./reglamento"
import type { ParametrosReglamento } from "./schemas"

const PARAMETROS: ParametrosReglamento = {
  porcentajeReserva: 10,
  diasPagoGc: 10,
  tasaMoraMensualPct: 1,
  topeMoraPct: 50,
  cuotasCorte: 3,
  diasPreavisoCorte: 5,
  ipcActivo: false,
}

/** Tres versiones del fixture: histórica, intermedia y futura. */
const VERSIONES = [
  {
    version: 1,
    vigenteDesde: "2026-01",
    fuenteInstrumento: "migracion_automatica",
    parametros: PARAMETROS,
  },
  {
    version: 2,
    vigenteDesde: "2026-06",
    fuenteInstrumento: "acta_asamblea",
    parametros: PARAMETROS,
  },
  {
    version: 3,
    vigenteDesde: "2027-01",
    fuenteInstrumento: "reglamento_copropiedad",
    parametros: PARAMETROS,
  },
]

describe("versionReglamentoVigente", () => {
  it("elige la versión con el vigenteDesde más alto que no supere el período", () => {
    expect(versionReglamentoVigente(VERSIONES, "2026-08")?.version).toBe(2)
  })

  it("ignora las versiones futuras al período pedido", () => {
    expect(versionReglamentoVigente(VERSIONES, "2026-05")?.version).toBe(1)
    expect(versionReglamentoVigente(VERSIONES, "2026-12")?.version).toBe(2)
  })

  it("devuelve null cuando ninguna versión rige todavía el período", () => {
    expect(versionReglamentoVigente(VERSIONES, "2025-12")).toBeNull()
    expect(versionReglamentoVigente([], "2026-05")).toBeNull()
  })

  it("incluye el período exacto en que empieza a regir", () => {
    expect(versionReglamentoVigente(VERSIONES, "2026-06")?.version).toBe(2)
  })

  it("desempata por número de versión cuando dos comparten vigenteDesde", () => {
    const mismoPeriodo = [
      { version: 1, vigenteDesde: "2026-01" },
      { version: 3, vigenteDesde: "2026-02" },
      { version: 2, vigenteDesde: "2026-02" },
    ]
    expect(versionReglamentoVigente(mismoPeriodo, "2026-03")?.version).toBe(3)
  })
})

describe("autorizaEmision", () => {
  it("solo autoriza las fuentes reales (reglamento de copropiedad o acta de asamblea)", () => {
    expect(autorizaEmision({ fuenteInstrumento: "reglamento_copropiedad" })).toBe(true)
    expect(autorizaEmision({ fuenteInstrumento: "acta_asamblea" })).toBe(true)
    expect(autorizaEmision({ fuenteInstrumento: "migracion_automatica" })).toBe(false)
    expect(autorizaEmision({ fuenteInstrumento: "otra_cosa" })).toBe(false)
  })
})

describe("parametrosDeVersion", () => {
  it("devuelve los parámetros cuando la versión los declara completos", () => {
    // Una versión persistida sin el dato declarado parsea con la lectura
    // normativa: el recargo de reserva va ENCIMA del presupuesto (S5).
    expect(parametrosDeVersion({ parametros: PARAMETROS })).toEqual({
      ...PARAMETROS,
      reservaIncluidaEnPresupuesto: false,
    })
  })

  it("devuelve null cuando falta un parámetro obligatorio", () => {
    expect(parametrosDeVersion({ parametros: {} })).toBeNull()
    expect(parametrosDeVersion({ parametros: { ...PARAMETROS, diasPagoGc: 61 } })).toBeNull()
  })
})

/**
 * S9 (A4 · T17) — el respaldo documental de una versión NUEVA del reglamento.
 *
 * Tres motivos, y el rechazo no confirma la existencia de un documento de otra
 * comunidad: el mismo motivo que un id inexistente.
 */
function clienteConDocumento(
  fila: { id: string; comunidadId: string; naturaleza: string } | null
): { client: ClienteDocumentoReglamento; consultas: string[] } {
  const consultas: string[] = []
  const client = {
    documento: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        consultas.push(where.id)
        return fila
      },
    },
  } as unknown as ClienteDocumentoReglamento
  return { client, consultas }
}

describe("resolverDocumentoRespaldo", () => {
  it("sin documento declarado devuelve «faltante» y no consulta la base", async () => {
    for (const valor of [undefined, null, "", "   ", 42, {}]) {
      const { client, consultas } = clienteConDocumento(null)
      await expect(resolverDocumentoRespaldo("com-1", valor, client)).resolves.toEqual({
        ok: false,
        motivo: "faltante",
      })
      expect(consultas).toEqual([])
    }
  })

  it("un documento de otra comunidad no confirma que exista: mismo motivo que un id inexistente", async () => {
    const ajena = await resolverDocumentoRespaldo(
      "com-1",
      "doc-ajeno",
      clienteConDocumento({ id: "doc-ajeno", comunidadId: "com-2", naturaleza: "legal" })
        .client
    )
    const inexistente = await resolverDocumentoRespaldo(
      "com-1",
      "doc-fantasma",
      clienteConDocumento(null).client
    )
    expect(ajena).toEqual({ ok: false, motivo: "no_existe" })
    expect(inexistente).toEqual(ajena)
  })

  it("un documento comunitario no puede respaldar la versión: motivo «no_legal»", async () => {
    const { client } = clienteConDocumento({
      id: "doc-circular",
      comunidadId: "com-1",
      naturaleza: "comunitario",
    })
    await expect(
      resolverDocumentoRespaldo("com-1", "doc-circular", client)
    ).resolves.toEqual({ ok: false, motivo: "no_legal" })
  })

  it("un legal de la misma comunidad resuelve y consulta con el id recortado", async () => {
    const { client, consultas } = clienteConDocumento({
      id: "doc-legal",
      comunidadId: "com-1",
      naturaleza: "legal",
    })
    await expect(
      resolverDocumentoRespaldo("com-1", "  doc-legal  ", client)
    ).resolves.toEqual({ ok: true, documentoId: "doc-legal" })
    expect(consultas).toEqual(["doc-legal"])
  })
})
