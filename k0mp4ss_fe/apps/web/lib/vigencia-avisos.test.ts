/**
 * @vitest-environment node
 *
 * Serie «Vigencia del Registro» — los avisos que S8 exige (S8).
 *
 * S8 no deja la vigencia en silencio: el propietario recibe el aviso de que su
 * dato cumple un año; el administrador **y** el Comité reciben el estado, la
 * evidencia y la propuesta; y una unidad sin propietario registrado es un
 * incidente de datos que se notifica, no un silencio.
 *
 * Lo que se prueba acá es la DECISIÓN, no la escritura: qué aviso sale, a quién
 * y con qué hito. `hito` es la clave de idempotencia —un aviso por unidad, tipo,
 * destinatario y hecho— y por eso el módulo jamás lee el reloj: dos corridas con
 * la misma entrada tienen que producir exactamente los mismos avisos.
 */
import { describe, expect, it } from "vitest"

import type { EstadoCasoRegistro, VeredictoDelCaso } from "@/lib/vigencia-registro"
import {
  HITO_SIN_FECHA,
  avisosDelCaso,
  type AvisoVigenciaDecidido,
} from "@/lib/vigencia-avisos"

const UNIDAD = "1402"
/** Hito de referencia: el requerimiento anual (mes 12 del dato). */
const HITO = "2027-01-01"

function veredicto(
  estado: EstadoCasoRegistro,
  cambiaEl?: string
): VeredictoDelCaso {
  return {
    estado,
    cambiaEl,
    descripcion: "Descripción del veredicto para el test.",
  }
}

function decisiones(avisos: AvisoVigenciaDecidido[]): string[] {
  return avisos.map((aviso) => `${aviso.tipo}:${aviso.destinatario}`)
}

describe("avisos de vigencia — a quién se le avisa cada hecho (S8)", () => {
  it("por vencer con propietario vigente: un solo aviso al propietario, con el requerimiento anual como hito", () => {
    const avisos = avisosDelCaso({
      veredicto: veredicto("por_vencer", HITO),
      numeroUnidad: UNIDAD,
      hayPropietarioVigente: true,
    })

    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toEqual({
      tipo: "por_vencer",
      destinatario: "propietario",
      hito: HITO,
      asunto: `Registro de Copropietarios: la unidad ${UNIDAD} cumple un año el ${HITO}`,
      cuerpo: `El Registro de Copropietarios de la unidad ${UNIDAD} cumple un año el ${HITO}. La administración requerirá su actualización en esa fecha y, desde ese requerimiento, usted tendrá 60 días corridos para declarar los cambios o confirmar que los datos siguen igual. Si algún dato de la unidad cambió, puede declararlo desde ya.`,
    })
  })

  it("por vencer sin propietario vigente: el aviso al propietario no existe y el incidente va al administrador y al Comité", () => {
    const avisos = avisosDelCaso({
      veredicto: veredicto("por_vencer", HITO),
      numeroUnidad: UNIDAD,
      hayPropietarioVigente: false,
    })

    expect(decisiones(avisos)).toEqual([
      "sin_propietario:administrador",
      "sin_propietario:comite",
    ])
    for (const aviso of avisos) {
      expect(aviso.hito).toBe(HITO)
      expect(aviso.asunto).toContain(UNIDAD)
      expect(aviso.cuerpo).toContain(UNIDAD)
      expect(aviso.cuerpo).toContain("incidente de datos")
    }
  })

  it("requerido sin requerimiento abierto: se avisa a la administración y al Comité que corresponde requerir, nunca al propietario", () => {
    const avisos = avisosDelCaso({
      veredicto: veredicto("requerido", HITO),
      numeroUnidad: UNIDAD,
      hayPropietarioVigente: true,
      hayRequerimientoAbierto: false,
    })

    expect(decisiones(avisos)).toEqual([
      "requerido:administrador",
      "requerido:comite",
    ])
    expect(avisos[0]?.hito).toBe(HITO)
    expect(avisos[0]?.asunto).toBe(
      `Registro de Copropietarios: corresponde requerir la unidad ${UNIDAD}`
    )
    expect(avisos[0]?.cuerpo).toContain(HITO)
    expect(avisos[0]?.cuerpo).toContain("requerir formalmente")
    expect(avisos[0]?.cuerpo).toContain("60 días corridos")
  })

  it("requerido con el plazo de 60 días ya abierto: no se pide requerir lo que ya se requirió", () => {
    const avisos = avisosDelCaso({
      veredicto: veredicto("requerido", HITO),
      numeroUnidad: UNIDAD,
      hayPropietarioVigente: true,
      hayRequerimientoAbierto: true,
    })

    expect(avisos).toEqual([])
  })

  it("vencido con propietario vigente: el hecho va al administrador, al Comité y al propietario, con el vencimiento congelado como hito", () => {
    const avisos = avisosDelCaso({
      veredicto: veredicto("habilitado_para_multa", HITO),
      numeroUnidad: UNIDAD,
      hayPropietarioVigente: true,
    })

    expect(decisiones(avisos)).toEqual([
      "vencido:administrador",
      "vencido:comite",
      "vencido:propietario",
    ])
    for (const aviso of avisos) {
      expect(aviso.hito).toBe(HITO)
      expect(aviso.asunto).toContain(UNIDAD)
      expect(aviso.asunto).toContain(HITO)
      expect(aviso.cuerpo).toContain(HITO)
      expect(aviso.cuerpo).toContain("60 días corridos")
    }
    expect(avisos[0]?.cuerpo).toContain("proponer al Comité")
    expect(avisos[2]?.cuerpo).toContain("Regularice su situación")
  })

  it("vencido sin propietario vigente: solo el administrador y el Comité, sin notificación al vacío", () => {
    const avisos = avisosDelCaso({
      veredicto: veredicto("habilitado_para_multa", HITO),
      numeroUnidad: UNIDAD,
      hayPropietarioVigente: false,
    })

    expect(decisiones(avisos)).toEqual(["vencido:administrador", "vencido:comite"])
  })

  it("sin declaración con propietario vigente: el incidente es de la administración, el propietario no recibe aviso por un dato que nunca se declaró", () => {
    const avisos = avisosDelCaso({
      veredicto: veredicto("sin_declaracion"),
      numeroUnidad: UNIDAD,
      hayPropietarioVigente: true,
    })

    expect(decisiones(avisos)).toEqual([
      "sin_declaracion:administrador",
      "sin_declaracion:comite",
    ])
    for (const aviso of avisos) {
      // Sin fecha que congelar no se inventa una: el hito es el hecho mismo.
      expect(aviso.hito).toBe(HITO_SIN_FECHA)
      expect(aviso.asunto).toContain(UNIDAD)
      expect(aviso.cuerpo).toContain(UNIDAD)
      expect(aviso.cuerpo).toContain("Ley 21.442")
      for (const texto of [aviso.asunto, aviso.cuerpo]) {
        expect(texto).not.toMatch(/\d{4}-\d{2}-\d{2}/)
        expect(texto).not.toContain("undefined")
      }
    }
  })

  it("sin declaración y sin propietario vigente: el incidente es no tener a quién avisar", () => {
    const avisos = avisosDelCaso({
      veredicto: veredicto("sin_declaracion"),
      numeroUnidad: UNIDAD,
      hayPropietarioVigente: false,
    })

    expect(decisiones(avisos)).toEqual([
      "sin_propietario:administrador",
      "sin_propietario:comite",
    ])
    for (const aviso of avisos) {
      expect(aviso.hito).toBe(HITO_SIN_FECHA)
    }
  })

  it("al día no genera ningún aviso: no se avisa lo que no pasó", () => {
    expect(
      avisosDelCaso({
        veredicto: veredicto("al_dia", HITO),
        numeroUnidad: UNIDAD,
        hayPropietarioVigente: true,
      })
    ).toEqual([])
  })

  it("la misma entrada produce los mismos avisos: el módulo no lee el reloj", () => {
    const entrada = {
      veredicto: veredicto("habilitado_para_multa", HITO),
      numeroUnidad: UNIDAD,
      hayPropietarioVigente: true,
    } as const

    expect(avisosDelCaso(entrada)).toEqual(avisosDelCaso(entrada))
  })
})
