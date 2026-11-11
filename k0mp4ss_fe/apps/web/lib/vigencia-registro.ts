/**
 * lib/vigencia-registro.ts — el reloj del Registro de Copropietarios (serie
 * «Vigencia del Registro», S2, S3 y S1).
 *
 * El Registro lo mantiene la administración (Ley 21.442 art. 9) y el
 * copropietario tiene **60 días corridos** para declarar los cambios; el
 * administrador debe **requerirlos anualmente** (Reglamento, D.O. 09-01-2025).
 * Hoy ese reloj no existe: el dato envejece en silencio y la multa del
 * reglamento no se puede aplicar con respaldo.
 *
 * Este módulo es **puro**: no lee la base ni el reloj. Recibe fechas y devuelve
 * el estado. Eso es lo que permite probar el calendario completo —mes 10, mes
 * 12, los 60 días, el día después— sin esperar catorce meses ni tocar datos.
 *
 * Decisión conservadora que no se reinterpreta (S2 vs. S4): los 60 días **los
 * arranca el acto de requerir**, no el cumpleaños del dato. Si la administración
 * nunca requirió, el estado tope es `requerido` —hay que requerir ya— y **nunca**
 * `habilitado_para_multa`: no se multa a alguien a quien no se le pidió nada.
 * La omisión de la administración no se convierte en sanción del propietario.
 */

/** Estados posibles, en el orden natural del calendario. */
export type EstadoVigencia =
  | "al_dia"
  | "por_vencer"
  | "requerido"
  | "habilitado_para_multa"

/** Mes 10: se avisa al propietario que los datos van a cumplir un año (S2). */
export const MES_AVISO = 10
/** Mes 12: se requiere formalmente la actualización; este acto arranca los 60 días (S2). */
export const MES_REQUERIMIENTO = 12
/** Días corridos que tiene el copropietario para responder desde el requerimiento. */
export const DIAS_PARA_RESPONDER = 60

export interface DatosVigencia {
  /** Fecha de la última declaración **o revalidación** (S3: confirmar sin cambios es cumplir). */
  readonly ultimaActualizacion: string | Date
  /** Fecha en que se requirió la actualización; `null` si todavía no se requirió. */
  readonly requerimientoEn?: string | Date | null
}

export interface VeredictoVigencia {
  readonly estado: EstadoVigencia
  /** Día en que el estado actual cambia solo, si lo hay. */
  readonly cambiaEl?: string
  /** Días que faltan para ese cambio (0 el mismo día, negativo si ya pasó). */
  readonly diasParaCambiar?: number
  /** Una frase corta para la pantalla, sin números inventados. */
  readonly descripcion: string
}

function aFecha(valor: string | Date): Date {
  const fecha = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`Fecha inválida en la vigencia del registro: ${String(valor)}`)
  }
  return fecha
}

function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha.getTime())
  copia.setUTCDate(copia.getUTCDate() + dias)
  return copia
}

/** `YYYY-MM-DD` en UTC: la fecha de calendario, sin hora ni zona. */
function isoDia(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

function diasEntre(desde: Date, hasta: Date): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000
  return Math.floor((hasta.getTime() - desde.getTime()) / MS_POR_DIA)
}

/**
 * ¿La última actualización ya cumplió `meses` meses? Se compara por mes de
 * calendario, no por 30 días: el reglamento habla de años, no de bloques de días.
 */
function cumplioMeses(desde: Date, hoy: Date, meses: number): boolean {
  const limite = new Date(desde.getTime())
  limite.setUTCMonth(limite.getUTCMonth() + meses)
  return hoy.getTime() >= limite.getTime()
}

function mesDeAviso(desde: Date): Date {
  const fecha = new Date(desde.getTime())
  fecha.setUTCMonth(fecha.getUTCMonth() + MES_AVISO)
  return fecha
}

function mesDeRequerimiento(desde: Date): Date {
  const fecha = new Date(desde.getTime())
  fecha.setUTCMonth(fecha.getUTCMonth() + MES_REQUERIMIENTO)
  return fecha
}

/**
 * El estado del registro de una unidad, para una fecha dada.
 *
 * `hoy` se recibe y no se lee del sistema: un reloj escondido hace que el mismo
 * dato dé dos respuestas distintas en dos corridas de test.
 */
export function estadoDeVigencia(
  datos: DatosVigencia,
  hoy: string | Date
): VeredictoVigencia {
  const referencia = aFecha(datos.ultimaActualizacion)
  const ahora = aFecha(hoy)

  // Requerido: manda el plazo de 60 días corridos desde el acto de requerir (S2).
  if (datos.requerimientoEn) {
    const requerido = aFecha(datos.requerimientoEn)
    const vence = sumarDias(requerido, DIAS_PARA_RESPONDER)
    const dias = diasEntre(ahora, vence)
    if (dias < 0) {
      return {
        estado: "habilitado_para_multa",
        cambiaEl: isoDia(vence),
        diasParaCambiar: dias,
        descripcion: `Venció el plazo de ${DIAS_PARA_RESPONDER} días el ${isoDia(vence)} sin actualización ni revalidación.`,
      }
    }
    return {
      estado: "requerido",
      cambiaEl: isoDia(vence),
      diasParaCambiar: dias,
      descripcion:
        dias === 0
          ? `El plazo de ${DIAS_PARA_RESPONDER} días vence hoy (${isoDia(vence)}).`
          : `Requerido: quedan ${dias} día(s) de los ${DIAS_PARA_RESPONDER} corridos (vence el ${isoDia(vence)}).`,
    }
  }

  // Sin requerimiento: el reloj anual del dato sólo puede llegar hasta «hay que requerir».
  if (cumplioMeses(referencia, ahora, MES_REQUERIMIENTO)) {
    return {
      estado: "requerido",
      cambiaEl: isoDia(mesDeRequerimiento(referencia)),
      diasParaCambiar: diasEntre(ahora, mesDeRequerimiento(referencia)),
      descripcion: `Los datos cumplieron ${MES_REQUERIMIENTO} meses el ${isoDia(mesDeRequerimiento(referencia))}: corresponde requerir la actualización y con ese acto arrancan los ${DIAS_PARA_RESPONDER} días.`,
    }
  }

  if (cumplioMeses(referencia, ahora, MES_AVISO)) {
    const aviso = mesDeAviso(referencia)
    return {
      estado: "por_vencer",
      cambiaEl: isoDia(mesDeRequerimiento(referencia)),
      diasParaCambiar: diasEntre(ahora, mesDeRequerimiento(referencia)),
      descripcion: `Los datos cumplen un año el ${isoDia(mesDeRequerimiento(referencia))}. Se avisó a los ${MES_AVISO} meses (${isoDia(aviso)}).`,
    }
  }

  return {
    estado: "al_dia",
    cambiaEl: isoDia(mesDeAviso(referencia)),
    diasParaCambiar: diasEntre(ahora, mesDeAviso(referencia)),
    descripcion: `Al día. El aviso de los ${MES_AVISO} meses es el ${isoDia(mesDeAviso(referencia))} y el requerimiento anual el ${isoDia(mesDeRequerimiento(referencia))}.`,
  }
}

/**
 * S1 — el monto sale del maestro de infracciones **de la comunidad**, con su
 * ancla legal, y si la comunidad no declaró el tipo, no se multa.
 *
 * No hay un segundo maestro de multas y no hay monto por defecto: inventar un
 * número es exactamente lo que este módulo evita.
 */
export interface TipoDeMultaDeclarado {
  readonly nombre: string
  readonly valor: number
}

export type DisponibilidadDeMulta =
  | { readonly disponible: true; readonly monto: number; readonly tipo: string }
  | { readonly disponible: false; readonly motivo: string }

export function multaDisponible(
  tipo: TipoDeMultaDeclarado | null | undefined
): DisponibilidadDeMulta {
  if (!tipo) {
    return {
      disponible: false,
      motivo:
        "La comunidad no declaró en su maestro de infracciones el tipo «Registro de Copropietarios no actualizado»: no se multa y no se inventa un monto.",
    }
  }
  if (!Number.isFinite(tipo.valor) || tipo.valor <= 0) {
    return {
      disponible: false,
      motivo: `El tipo «${tipo.nombre}» no tiene un monto válido declarado: no se multa.`,
    }
  }
  return { disponible: true, monto: tipo.valor, tipo: tipo.nombre }
}

/** Estados que habilitan proponer la multa (S4: la propone el sistema, la aplica el Comité). */
export function habilitaPropuestaDeMulta(veredicto: VeredictoVigencia): boolean {
  return veredicto.estado === "habilitado_para_multa"
}
