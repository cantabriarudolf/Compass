/**
 * lib/vigencia-avisos.ts — quién se entera de qué en la vigencia del Registro
 * de Copropietarios (S8).
 *
 * S8 no deja el estado en silencio: el propietario recibe el aviso de que su
 * dato cumple un año; el administrador **y** el Comité reciben el estado, la
 * evidencia y la propuesta de multa; y una unidad sin propietario registrado es
 * un incidente de datos que se notifica, no un silencio. Siempre hay un dueño,
 * aunque el inmueble se haya rematado.
 *
 * Este módulo es **puro**: no lee la base, no lee el reloj y no escribe nada.
 * Recibe el veredicto ya derivado por `lib/vigencia-registro.ts` y devuelve los
 * avisos que corresponden. Esa separación es lo que permite probar los avisos
 * con fechas fijas, y lo que impide que el texto invente una fecha: el `hito`
 * sale del veredicto (`cambiaEl`, la fecha congelada del ciclo) o de una
 * constante que declara que no hay fecha, nunca de `new Date()`.
 *
 * **Idempotencia**: `hito` es la clave. Un aviso se identifica por
 * (unidad, tipo, destinatario, `hito`), así que volver a decidir con los mismos
 * hechos produce exactamente el mismo aviso y la ruta no lo vuelve a escribir.
 * Por eso emitir es un acto explícito y repetible de la administración: no hay
 * reloj escondido que cambie el resultado entre dos corridas.
 *
 * **La emisión puede ser programada**: el cron de Vercel llama al mismo barrido por
 * `GET /api/vigencia-registro/avisos` con el secreto del entorno (ver
 * `lib/vigencia-barrido.ts`), y este módulo sigue siendo puro: no sabe de relojes, ni de
 * cron, ni de correo. La frase que había acá (que no habría cron) quedó falsa cuando el
 * owner decidió programarlo.
 * por este contrato. La administración corre el barrido; el barrido es
 * idempotente. La programación automática está fuera de alcance (S8).
 *
 * Decisión conservadora que no se reinterpreta: al propietario se le avisa lo
 * que le toca a él —el año que se cumple, el plazo vencido— y no los incidentes
 * de datos de la administración. El aviso de «requerido» va a la administración
 * y al Comité porque es ella la que debe requerir; si el requerimiento ya está
 * abierto, no se le pide requerir lo que ya requirió.
 */
import type { VeredictoDelCaso } from "@/lib/vigencia-registro"

/** Los hechos que generan aviso, en el vocabulario de S8. */
export type TipoAvisoVigencia =
  | "por_vencer"
  | "requerido"
  | "vencido"
  | "sin_propietario"
  | "sin_declaracion"

/** A quién le toca cada aviso: nunca «a todo el mundo». */
export type DestinatarioAvisoVigencia = "propietario" | "administrador" | "comite"

/** Un aviso decidido: todavía no escrito. `hito` es su clave de idempotencia. */
export interface AvisoVigenciaDecidido {
  readonly tipo: TipoAvisoVigencia
  readonly destinatario: DestinatarioAvisoVigencia
  readonly hito: string
  readonly asunto: string
  readonly cuerpo: string
}

/**
 * Hito de un estado que no tiene fecha que congelar. `sin_declaracion` es la
 * ausencia de un dato, no un día: inventarle una fecha haría que el aviso
 * cambiara de clave sin que nada haya pasado.
 */
export const HITO_SIN_FECHA = "sin_fecha"

export interface EntradaAvisosDelCaso {
  readonly veredicto: VeredictoDelCaso
  readonly numeroUnidad: string
  readonly hayPropietarioVigente: boolean
  /**
   * Si la unidad ya tiene un requerimiento abierto dentro de sus 60 días.
   * `estadoDelCaso` devuelve `requerido` en dos situaciones distintas —el mes 12
   * sin requerir y el plazo abierto— y sólo la primera exige avisar «hay que
   * requerir». Cuando no se informa, se asume el caso del mes 12 (la regla de S8
   * se enuncia como «requerido **sin** requerimiento abierto»).
   */
  readonly hayRequerimientoAbierto?: boolean
}

/** El hito del aviso: la fecha que el veredicto ya congeló, o el hecho sin fecha. */
function hitoDe(veredicto: VeredictoDelCaso): string {
  return veredicto.cambiaEl ?? HITO_SIN_FECHA
}

function aviso(
  tipo: TipoAvisoVigencia,
  destinatario: DestinatarioAvisoVigencia,
  hito: string,
  asunto: string,
  cuerpo: string
): AvisoVigenciaDecidido {
  return { tipo, destinatario, hito, asunto, cuerpo }
}

/** El par que S8 exige siempre: administrador y Comité, en ese orden. */
const DESTINATARIOS_DE_GOBIERNO: readonly DestinatarioAvisoVigencia[] = [
  "administrador",
  "comite",
]

/**
 * Los avisos que corresponden a un caso, con los hechos ya derivados.
 *
 * Reglas (S8), en el orden del calendario:
 * - `por_vencer` con propietario vigente → un aviso al propietario, con el
 *   requerimiento anual como hito. Sin propietario vigente el aviso no tiene
 *   destinatario: el incidente va al administrador y al Comité.
 * - `requerido` sin requerimiento abierto → administrador y Comité: es la
 *   administración la que debe requerir y el propietario todavía no fue
 *   requerido, así que no se le avisa.
 * - `habilitado_para_multa` → administrador y Comité, más el propietario
 *   vigente si lo hay: a él también le venció el plazo.
 * - `sin_declaracion` con propietario vigente → administrador y Comité: es un
 *   incidente de datos de la administración, que nunca declaró ese dato.
 * - `sin_declaracion` sin propietario vigente → administrador y Comité, como
 *   incidente por unidad sin propietario.
 * - `al_dia` → nada: no se avisa lo que no pasó.
 */
export function avisosDelCaso(
  entrada: EntradaAvisosDelCaso
): AvisoVigenciaDecidido[] {
  const { veredicto, numeroUnidad, hayPropietarioVigente } = entrada
  const hito = hitoDe(veredicto)

  switch (veredicto.estado) {
    case "al_dia":
      return []

    case "por_vencer": {
      if (hayPropietarioVigente) {
        return [
          aviso(
            "por_vencer",
            "propietario",
            hito,
            `Registro de Copropietarios: la unidad ${numeroUnidad} cumple un año el ${hito}`,
            `El Registro de Copropietarios de la unidad ${numeroUnidad} cumple un año el ${hito}. La administración requerirá su actualización en esa fecha y, desde ese requerimiento, usted tendrá 60 días corridos para declarar los cambios o confirmar que los datos siguen igual. Si algún dato de la unidad cambió, puede declararlo desde ya.`
          ),
        ]
      }
      return DESTINATARIOS_DE_GOBIERNO.map((destinatario) =>
        avisoSinPropietario(numeroUnidad, hito, destinatario)
      )
    }

    case "requerido": {
      if (entrada.hayRequerimientoAbierto) return []
      return DESTINATARIOS_DE_GOBIERNO.map((destinatario) =>
        aviso(
          "requerido",
          destinatario,
          hito,
          `Registro de Copropietarios: corresponde requerir la unidad ${numeroUnidad}`,
          `Los datos del Registro de Copropietarios de la unidad ${numeroUnidad} alcanzaron el hito del ${hito} sin un requerimiento abierto. La administración debe requerir formalmente la actualización: ese acto arranca los 60 días corridos que tiene el copropietario para declarar los cambios o confirmar que siguen igual. Sin ese requerimiento no corresponde habilitar multa por este concepto.`
        )
      )
    }

    case "habilitado_para_multa": {
      const avisos: AvisoVigenciaDecidido[] = DESTINATARIOS_DE_GOBIERNO.map(
        (destinatario) =>
          aviso(
            "vencido",
            destinatario,
            hito,
            `Registro de Copropietarios: venció el plazo de la unidad ${numeroUnidad} el ${hito}`,
            `El plazo de 60 días corridos para actualizar el Registro de Copropietarios de la unidad ${numeroUnidad} venció el ${hito} sin declaración de cambios ni revalidación. La administración debe dejar constancia del incumplimiento y proponer al Comité la multa que fije el maestro de infracciones de la comunidad; sin monto declarado no se multa.`
          )
      )
      if (hayPropietarioVigente) {
        avisos.push(
          aviso(
            "vencido",
            "propietario",
            hito,
            `Registro de Copropietarios: venció el plazo de la unidad ${numeroUnidad} el ${hito}`,
            `El plazo de 60 días corridos para actualizar el Registro de Copropietarios de la unidad ${numeroUnidad} venció el ${hito}. No consta la declaración de cambios ni la confirmación de que los datos siguen igual. Regularice su situación ante la administración para evitar la multa que el reglamento fija por este concepto.`
          )
        )
      }
      return avisos
    }

    case "sin_declaracion": {
      if (!hayPropietarioVigente) {
        return DESTINATARIOS_DE_GOBIERNO.map((destinatario) =>
          avisoSinPropietario(numeroUnidad, hito, destinatario)
        )
      }
      return DESTINATARIOS_DE_GOBIERNO.map((destinatario) =>
        aviso(
          "sin_declaracion",
          destinatario,
          hito,
          `Incidente de datos: la unidad ${numeroUnidad} no tiene declaración de Registro`,
          `No consta la declaración del Registro de Copropietarios de la unidad ${numeroUnidad}. Es un incidente de datos: la administración debe mantener actualizado el Registro (Ley 21.442, art. 9). La administración debe cargar la declaración de la unidad y, desde esa fecha, cumplir el requerimiento anual; mientras no conste declaración no corresponde habilitar multa por este concepto.`
        )
      )
    }
  }
}

/**
 * El incidente de una unidad sin propietario vigente. No depende del estado: el
 * hecho que lo dispara es la ausencia de dueño, y el texto lo dice sin inventar
 * una fecha ni prometer una multa.
 */
function avisoSinPropietario(
  numeroUnidad: string,
  hito: string,
  destinatario: DestinatarioAvisoVigencia
): AvisoVigenciaDecidido {
  return aviso(
    "sin_propietario",
    destinatario,
    hito,
    `Incidente de datos: la unidad ${numeroUnidad} no tiene propietario vigente`,
    `La unidad ${numeroUnidad} no tiene propietario vigente en el Registro de Copropietarios, así que no hay a quién notificar el estado de su registro. Es un incidente de datos: siempre hay un dueño, incluso si el inmueble se remató. La administración debe identificar al propietario actual y actualizar el Registro antes de requerir, multar o cerrar el caso de la unidad.`
  )
}
