/**
 * lib/acuerdos.ts — resultado de un acuerdo de gobernanza (comité o asamblea).
 *
 * REGLA PURA: no consulta la base, no lee el reloj y no escribe nada. Recibe los
 * votos ya registrados (con su peso) y el padrón de derechos, y devuelve el
 * resultado con el detalle que lo sostiene. La usa el `POST` del voto para
 * recomputar el acuerdo dentro de la misma transacción que escribe el voto.
 *
 * Base legal verificada (Ley 21.442 art. 15 y tabla MINVU; no se re-deriva acá):
 *   - ASAMBLEA: los votos se PONDERAN por el prorrateo de la unidad (nunca uno
 *     por persona). La mayoría absoluta de la ordinaria se mide sobre los
 *     derechos presentes; la extraordinaria de mayoría absoluta exige más de la
 *     mitad de los derechos de la comunidad; la extraordinaria de mayoría
 *     reforzada exige el 66% de los derechos de la comunidad.
 *   - COMITÉ: un voto por MIEMBRO (art. 17 le da las facultades de la asamblea
 *     salvo las reservadas a extraordinaria). El peso de su voto es 1.
 *
 * Frontera deliberada: el quórum de ASISTENCIA de la asamblea (33% de los
 * derechos para que sesione) es un requisito de la SESIÓN, no del acuerdo: lo
 * prueba el acta de la asamblea, que el acuerdo referencia con `actaId`. Acá se
 * computa el resultado de los votos emitidos.
 *
 * Por qué «pendiente» no es sólo «sin votos»: con el padrón incompleto una
 * mayoría todavía puede alcanzarse, así que cerrar el acuerdo sería afirmar un
 * resultado que los votos no sostienen. Un acuerdo se resuelve cuando la
 * mayoría exigida YA se alcanzó (nadie la puede quitar) o cuando YA es
 * imposible alcanzarla (ni sumando todos los votos que faltan). En cualquier
 * otro punto queda `pendiente`, y el motivo dice cuántos derechos faltan.
 */

/** Cuerpos que adoptan acuerdos: el comité (art. 6/17/20) y la asamblea (art. 15). */
export const CUERPOS_DEL_ACUERDO = ["comite", "asamblea"] as const

export type CuerpoDelAcuerdo = (typeof CUERPOS_DEL_ACUERDO)[number]

/**
 * Reglas de quórum que el registro puede declarar. Se guardan como TEXTO en el
 * acuerdo (`quorumRequerido`) porque son la regla APLICADA: la ley exige un
 * cuerpo u otro según la materia (corte de servicios → comité, art. 20 N°9;
 * convenio de pago → comité, art. 6) y el presupuesto lo define el reglamento de
 * cada comunidad. El registro no lo asume: lo conserva.
 *
 * - `un_voto_por_miembro`        comité: mayoría de los votos emitidos.
 * - `mayoria_absoluta_presentes` asamblea ordinaria: > 50% del peso emitido.
 * - `mayoria_absoluta_derechos`  asamblea extraordinaria: > 50% de los derechos.
 * - `mayoria_reforzada_derechos` asamblea extraordinaria reforzada: >= 66% de
 *                                los derechos de la comunidad.
 */
export const QUORUMS_DEL_ACUERDO = [
  "un_voto_por_miembro",
  "mayoria_absoluta_presentes",
  "mayoria_absoluta_derechos",
  "mayoria_reforzada_derechos",
] as const

export type QuorumDelAcuerdo = (typeof QUORUMS_DEL_ACUERDO)[number]

/** Decisiones admitidas en un voto: nunca se edita ni se borra (es evidencia). */
export const DECISIONES_DEL_VOTO = [
  "a_favor",
  "en_contra",
  "abstencion",
] as const

export type DecisionDelVoto = (typeof DECISIONES_DEL_VOTO)[number]

/**
 * Umbral de la mayoría reforzada: 66% de los derechos (Ley 21.442 art. 15,
 * tabla MINVU). El borde es cerrado (`>=`): 66 de 100 derechos alcanza.
 * No se aproxima a 2/3 por cuenta propia: el número es el verificado.
 */
const MAYORIA_REFORZADA = 0.66

/** Voto ya registrado, en la forma mínima que necesita el cómputo. */
export interface VotoParaElResultado {
  readonly decision: string
  readonly peso: number
}

export interface EntradaResultadoDelAcuerdo {
  readonly cuerpo: CuerpoDelAcuerdo
  /** Regla aplicada, en texto: una de `QUORUMS_DEL_ACUERDO`. */
  readonly quorumRequerido: string
  readonly votos: readonly VotoParaElResultado[]
  /**
   * Padrón de derechos del cuerpo que vota, en la misma unidad que los pesos:
   * - comité: número de miembros de la directiva vigente (un voto por miembro);
   * - asamblea: suma de los prorrateos de las unidades de la comunidad.
   */
  readonly derechosTotales: number
}

export interface ResultadoDelAcuerdo {
  readonly resultado: "aprobado" | "rechazado" | "pendiente"
  /** Peso acumulado a favor (en comité, `peso` = 1 por miembro). */
  readonly aFavor: number
  /** Peso acumulado en contra. */
  readonly enContra: number
  /** Peso acumulado de las abstenciones: cuentan como emitidas, nunca como favor. */
  readonly abstenciones: number
  /** La regla aplicada, en español, con los números calculados. */
  readonly motivo: string
}

/** Nombre legible de cada regla: el motivo no inventa umbrales, nombra la regla. */
const NOMBRE_DE_LA_REGLA: Record<QuorumDelAcuerdo, string> = {
  un_voto_por_miembro: "Mayoría absoluta de los votos emitidos por el comité",
  mayoria_absoluta_presentes: "Mayoría absoluta de los derechos presentes",
  mayoria_absoluta_derechos: "Mayoría absoluta de los derechos de la comunidad",
  mayoria_reforzada_derechos:
    "Mayoría reforzada de los derechos de la comunidad",
}

/** ¿La regla declarada es una de las que el registro sabe computar? */
export function esQuorumDelAcuerdo(valor: string): valor is QuorumDelAcuerdo {
  return (QUORUMS_DEL_ACUERDO as readonly string[]).includes(valor)
}

/**
 * Peso saneado: un prorrateo no declarado (0) o corrupto (NaN/negativo) no
 * puede envenenar la suma. No es un valor por defecto: no suma nada.
 */
function pesoSano(peso: number): number {
  return Number.isFinite(peso) && peso > 0 ? peso : 0
}

/** Número para el motivo: hasta 4 decimales y coma decimal (español). */
function formatearNumero(valor: number): string {
  const redondeado = Math.round(valor * 10_000) / 10_000
  return String(redondeado).replace(".", ",")
}

/** Regla cuya mayoría se mide sobre los derechos de TODA la comunidad. */
function seMideSobreElPadron(quorum: QuorumDelAcuerdo): boolean {
  return (
    quorum === "mayoria_absoluta_derechos" ||
    quorum === "mayoria_reforzada_derechos"
  )
}

export function resultadoDelAcuerdo(
  entrada: EntradaResultadoDelAcuerdo
): ResultadoDelAcuerdo {
  const { cuerpo, quorumRequerido, votos, derechosTotales } = entrada

  let aFavor = 0
  let enContra = 0
  let abstenciones = 0
  for (const voto of votos) {
    const peso = pesoSano(voto.peso)
    if (voto.decision === "a_favor") aFavor += peso
    else if (voto.decision === "en_contra") enContra += peso
    else if (voto.decision === "abstencion") abstenciones += peso
    // Una decisión fuera del contrato no suma ni resta: el voto no se puede
    // interpretar, así que no mueve el resultado (la ruta lo valida con zod).
  }

  const totales = { aFavor, enContra, abstenciones }
  const emitido = aFavor + enContra + abstenciones

  if (votos.length === 0) {
    return {
      ...totales,
      resultado: "pendiente",
      motivo: "El acuerdo aún no tiene votos registrados.",
    }
  }

  if (emitido <= 0) {
    // Votos con peso 0 (unidad sin prorrateo declarado) o todos corruptos: no
    // hay masa sobre la que medir una mayoría, y dividir por cero mentiría.
    return {
      ...totales,
      resultado: "pendiente",
      motivo:
        "Los votos emitidos no suman derecho alguno (las unidades no tienen prorrateo declarado): no se puede medir una mayoría.",
    }
  }

  if (!esQuorumDelAcuerdo(quorumRequerido)) {
    return {
      ...totales,
      resultado: "pendiente",
      motivo: `No se reconoce la regla de quórum declarada («${quorumRequerido}»): el acuerdo no se resuelve.`,
    }
  }

  const regla = NOMBRE_DE_LA_REGLA[quorumRequerido]
  const padron =
    Number.isFinite(derechosTotales) && derechosTotales > 0
      ? derechosTotales
      : 0

  if (seMideSobreElPadron(quorumRequerido) && padron <= 0) {
    return {
      ...totales,
      resultado: "pendiente",
      motivo: `${regla}: la comunidad no tiene derechos (prorrateo) declarados, así que no hay padrón contra el que medir la mayoría.`,
    }
  }

  // Masa que todavía puede pronunciarse. En el comité se cuenta en votos (un
  // voto por miembro); en la asamblea, en derechos (prorrateo sin emitir).
  const restante =
    padron <= 0
      ? 0
      : Math.max(
          0,
          padron - (quorumRequerido === "un_voto_por_miembro" ? votos.length : emitido)
        )

  const emitidoFinal = emitido + restante

  const aprobado = seMideSobreElPadron(quorumRequerido)
    ? quorumRequerido === "mayoria_reforzada_derechos"
      ? aFavor / padron >= MAYORIA_REFORZADA
      : aFavor / padron > 0.5
    : aFavor > emitidoFinal / 2

  // «Imposible» = ni sumando todos los derechos que faltan se alcanza: recién
  // ahí el acuerdo se rechaza. Con el padrón incompleto no se cierra.
  const rechazado = seMideSobreElPadron(quorumRequerido)
    ? quorumRequerido === "mayoria_reforzada_derechos"
      ? (aFavor + restante) / padron < MAYORIA_REFORZADA
      : (aFavor + restante) / padron <= 0.5
    : aFavor + restante <= emitidoFinal / 2

  const marcador =
    cuerpo === "comite" || quorumRequerido === "un_voto_por_miembro"
      ? `${formatearNumero(aFavor)} a favor de ${formatearNumero(emitidoFinal)} votos emitidos`
      : quorumRequerido === "mayoria_absoluta_presentes"
        ? `${formatearNumero(aFavor)} a favor de ${formatearNumero(emitidoFinal)} derechos emitidos`
        : `${formatearNumero(aFavor)} a favor de ${formatearNumero(padron)} derechos de la comunidad`

  if (aprobado) {
    return {
      ...totales,
      resultado: "aprobado",
      motivo: `${regla}: ${marcador}; se alcanzó la mayoría exigida.`,
    }
  }

  if (rechazado) {
    return {
      ...totales,
      resultado: "rechazado",
      motivo:
        restante > 0
          ? `${regla}: ${marcador}; la mayoría exigida no se alcanza, ni siquiera sumando los votos que faltan.`
          : `${regla}: ${marcador}; la mayoría exigida no se alcanza con los votos emitidos.`,
    }
  }

  const unidadRestante = cuerpo === "comite" ? "votos" : "derechos"
  return {
    ...totales,
    resultado: "pendiente",
    motivo: `${regla}: ${marcador}; restan ${formatearNumero(restante)} ${unidadRestante} por pronunciarse y el resultado todavía puede cambiar.`,
  }
}
