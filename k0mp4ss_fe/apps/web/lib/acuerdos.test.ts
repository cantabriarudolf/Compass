/**
 * @vitest-environment node
 *
 * U3 — resultado de un acuerdo de gobernanza (comité y asamblea).
 *
 * `resultadoDelAcuerdo` es la regla pura que decide el estado de un acuerdo con
 * los votos emitidos hasta ese momento. No consulta la base ni el reloj: recibe
 * el cuerpo, la regla de quórum aplicada, los votos con su peso y el padrón de
 * derechos, y devuelve el resultado con el detalle que lo sostiene.
 *
 * Base legal verificada (Ley 21.442 art. 15 y tabla MINVU; no se re-deriva acá):
 *   - la asamblea vota PONDERADO por el prorrateo de la unidad, nunca un voto
 *     por persona; los acuerdos se adoptan por mayoría absoluta de los
 *     presentes en la ordinaria, por mayoría absoluta de los derechos en la
 *     extraordinaria y por mayoría reforzada (66% de los derechos) cuando
 *     corresponde esa exigencia;
 *   - el comité vota por MIEMBRO, un voto por persona (art. 17).
 *
 * Lo que se fija acá, todo observable por el resultado:
 *
 *   1. comité: mayoría estricta de los votos emitidos, con la abstención
 *      contada como emitida (no a favor) y un voto por miembro;
 *   2. asamblea: los pesos se suman y el umbral depende de la regla declarada
 *      (`mayoria_absoluta_presentes`, `mayoria_absoluta_derechos`,
 *      `mayoria_reforzada_derechos`), con el 66% como borde cerrado;
 *   3. sin votos → pendiente, y mientras una mayoría todavía sea alcanzable el
 *      acuerdo queda pendiente en lugar de cerrarse (un solo voto no decide un
 *      acuerdo de tres miembros);
 *   4. nunca se divide por cero: sin derechos o sin votos con peso el resultado
 *      queda pendiente y lo dice;
 *   5. el motivo nombra la regla en español con los números calculados, sin
 *      umbrales inventados.
 */
import { describe, it, expect } from "vitest"
import { resultadoDelAcuerdo } from "@/lib/acuerdos"

const voto = (decision: string, peso = 1) => ({ decision, peso })

describe("acuerdos — comité: un voto por miembro", () => {
  const comite = (votos: { decision: string; peso: number }[], padron: number) =>
    resultadoDelAcuerdo({
      cuerpo: "comite",
      quorumRequerido: "un_voto_por_miembro",
      votos,
      derechosTotales: padron,
    })

  it("aprueba con mayoría estricta de los votos emitidos", () => {
    const r = comite([voto("a_favor"), voto("a_favor"), voto("en_contra")], 3)
    expect(r.resultado).toBe("aprobado")
    expect(r.aFavor).toBe(2)
    expect(r.enContra).toBe(1)
    expect(r.abstenciones).toBe(0)
    expect(r.motivo).toContain("Mayoría absoluta de los votos emitidos por el comité")
  })

  it("rechaza cuando la mayoría emitida está en contra", () => {
    const r = comite([voto("a_favor"), voto("en_contra"), voto("en_contra")], 3)
    expect(r.resultado).toBe("rechazado")
    expect(r.aFavor).toBe(1)
    expect(r.enContra).toBe(2)
  })

  it("la abstención cuenta como emitida pero nunca como favor", () => {
    // 2 a favor, 1 abstención: la mayoría se mide sobre 3 votos emitidos.
    const aprueba = comite([voto("a_favor"), voto("a_favor"), voto("abstencion")], 3)
    expect(aprueba.resultado).toBe("aprobado")
    expect(aprueba.abstenciones).toBe(1)
    expect(aprueba.aFavor).toBe(2)

    // 1 a favor y 2 abstenciones: la abstención no se suma al favor.
    const noAlcanza = comite(
      [voto("a_favor"), voto("abstencion"), voto("abstencion")],
      3
    )
    expect(noAlcanza.resultado).toBe("rechazado")
    expect(noAlcanza.aFavor).toBe(1)
    expect(noAlcanza.abstenciones).toBe(2)
  })

  it("un solo voto no decide un acuerdo de tres miembros", () => {
    // Con el padrón incompleto el resultado todavía puede cambiar: no se cierra.
    expect(comite([voto("a_favor")], 3).resultado).toBe("pendiente")
    expect(comite([voto("en_contra")], 3).resultado).toBe("pendiente")
    expect(comite([voto("abstencion")], 3).resultado).toBe("pendiente")
    // Dos votos en contra de tres ya son irreversibles: el tercero no alcanza.
    expect(comite([voto("en_contra"), voto("en_contra")], 3).resultado).toBe(
      "rechazado"
    )
  })

  it("sin votos el acuerdo queda pendiente", () => {
    const r = comite([], 3)
    expect(r.resultado).toBe("pendiente")
    expect(r.motivo).toContain("aún no tiene votos")
  })
})

describe("acuerdos — asamblea: voto ponderado por prorrateo", () => {
  const asamblea = (
    quorumRequerido: string,
    votos: { decision: string; peso: number }[],
    derechosTotales = 100
  ) =>
    resultadoDelAcuerdo({
      cuerpo: "asamblea",
      quorumRequerido,
      votos,
      derechosTotales,
    })

  it("mayoría absoluta de los derechos: el peso manda y un solo voto puede decidir", () => {
    // Una unidad con 60 de 100 derechos supera por sí sola el 50%.
    const r = asamblea("mayoria_absoluta_derechos", [voto("a_favor", 60)])
    expect(r.resultado).toBe("aprobado")
    expect(r.aFavor).toBe(60)
    expect(r.motivo).toContain("Mayoría absoluta de los derechos de la comunidad")
    expect(r.motivo).toContain("60")
    expect(r.motivo).toContain("100")

    // La unidad chica, sola, no decide: 40 de 100 no supera el 50%.
    expect(
      asamblea("mayoria_absoluta_derechos", [voto("a_favor", 40)]).resultado
    ).toBe("pendiente")
  })

  it("mayoría absoluta de los presentes mide sobre el peso emitido", () => {
    const r = asamblea("mayoria_absoluta_presentes", [voto("a_favor", 60)])
    expect(r.resultado).toBe("aprobado")
    expect(r.motivo).toContain("Mayoría absoluta de los derechos presentes")
    expect(r.motivo).toContain("derechos emitidos")
  })

  it("mayoría reforzada: 66% de los derechos es borde cerrado", () => {
    // 66 de 100 llega exacto al 66%: el requisito es «al menos», no «más que».
    const justo = asamblea("mayoria_reforzada_derechos", [voto("a_favor", 66)])
    expect(justo.resultado).toBe("aprobado")
    expect(justo.motivo).toContain(
      "Mayoría reforzada de los derechos de la comunidad"
    )

    // 65 de 100 no llega; con 35 derechos sin votar el resultado puede cambiar.
    expect(
      asamblea("mayoria_reforzada_derechos", [voto("a_favor", 65)]).resultado
    ).toBe("pendiente")

    // Agotado el padrón, 65% no alcanza y el acuerdo se rechaza.
    const agotado = asamblea("mayoria_reforzada_derechos", [
      voto("a_favor", 65),
      voto("en_contra", 35),
    ])
    expect(agotado.resultado).toBe("rechazado")
    expect(agotado.motivo).toContain("no se alcanza")
  })

  it("la abstención no suma a favor aunque pese", () => {
    // 60 derechos se abstienen y 40 votan a favor: hay 40 a favor de 100.
    const r = asamblea("mayoria_absoluta_derechos", [
      voto("abstencion", 60),
      voto("a_favor", 40),
    ])
    expect(r.aFavor).toBe(40)
    expect(r.abstenciones).toBe(60)
    expect(r.resultado).toBe("rechazado")
  })

  it("sin votos el acuerdo queda pendiente", () => {
    const r = asamblea("mayoria_absoluta_derechos", [])
    expect(r.resultado).toBe("pendiente")
    expect(r.motivo).toContain("aún no tiene votos")
  })
})

describe("acuerdos — nunca divide por cero ni inventa umbrales", () => {
  it("sin derechos declarados no se puede evaluar la mayoría de derechos", () => {
    const r = resultadoDelAcuerdo({
      cuerpo: "asamblea",
      quorumRequerido: "mayoria_absoluta_derechos",
      votos: [voto("a_favor", 1)],
      derechosTotales: 0,
    })
    expect(r.resultado).toBe("pendiente")
    expect(Number.isFinite(r.aFavor)).toBe(true)
    expect(r.motivo).toContain("prorrateo")
  })

  it("votos sin peso no mueven la cuenta", () => {
    const r = resultadoDelAcuerdo({
      cuerpo: "asamblea",
      quorumRequerido: "mayoria_absoluta_presentes",
      votos: [voto("a_favor", 0), voto("a_favor", Number.NaN)],
      derechosTotales: 100,
    })
    expect(r.resultado).toBe("pendiente")
    expect(r.aFavor).toBe(0)
    expect(Number.isNaN(r.aFavor)).toBe(false)
  })

  it("una decisión fuera del contrato no se cuenta", () => {
    const r = resultadoDelAcuerdo({
      cuerpo: "comite",
      quorumRequerido: "un_voto_por_miembro",
      votos: [voto("a_favor"), voto("indeciso")],
      derechosTotales: 1,
    })
    expect(r.aFavor).toBe(1)
    expect(r.enContra).toBe(0)
    expect(r.abstenciones).toBe(0)
    expect(r.resultado).toBe("aprobado")
  })

  it("una regla desconocida deja el acuerdo pendiente y lo declara", () => {
    const r = resultadoDelAcuerdo({
      cuerpo: "asamblea",
      quorumRequerido: "mayoria_inventada",
      votos: [voto("a_favor", 60)],
      derechosTotales: 100,
    })
    expect(r.resultado).toBe("pendiente")
    expect(r.motivo).toContain("mayoria_inventada")
  })
})
