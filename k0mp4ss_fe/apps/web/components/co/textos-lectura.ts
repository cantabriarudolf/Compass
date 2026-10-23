/**
 * textos-lectura — los tres textos del dictamen sobre tratamiento de datos de
 * Comunicación con Vecinos (change co-lectura-residente, design §Textos de UI ·
 * S7 y S9).
 *
 * SON LITERALES: no se parafrasean ni se acortan. El dictamen los deja con dos
 * marcadores que este módulo resuelve sin inventar datos:
 *
 *   `[canal]` → el buzón ciudadano de la plataforma. Es el canal que CO ya
 *               expone hoy; cuál usa cada cliente para ARCO es la pregunta
 *               abierta 3 del tasks.md, y hasta que el owner la responda no se
 *               anuncia ningún otro medio (ni teléfono, ni correo, ni oficina).
 *   `[plazo que defina el owner]` → «sin plazo definido aún». No se fija un
 *               número: el design declara el TTL fuera de este change y la
 *               pregunta abierta 1 sigue sin respuesta.
 *
 * Los tres textos son la contraparte de D6: por lectura se guarda envío,
 * persona y fecha/hora; nada de RUT, IP, user-agent ni contenido duplicado.
 */

/**
 * Texto 1 — bajo cada mensaje de la bandeja del residente: avisa, ANTES de
 * abrir, que la lectura queda registrada y quién puede verla.
 */
export const AVISO_REGISTRO_LECTURA =
  "ℹ️ Al abrir esta comunicación se registra tu lectura (fecha y hora) para acreditar que la Administración cumplió su deber de informar. Solo la Administración y el Comité pueden ver estadísticas; ningún vecino ve tu lectura."

/**
 * Texto 2 — descargo de la métrica de lecturas: un dato de recepción del canal
 * no acredita conocimiento del contenido ni vale como notificación legal.
 */
export const TEXTO_METRICA_DESCARGO =
  "Dato estadístico de recepción del canal; no acredita conocimiento del contenido ni constituye notificación legal por sí solo."

/** Texto 2 completo, con los totales reales en lugar de «X/Y». */
export function textoMetricaLecturas(leidos: number, total: number): string {
  return `${leidos}/${total} leídos. ${TEXTO_METRICA_DESCARGO}`
}

/**
 * Texto 3 — aviso de tratamiento, permanente en la bandeja: responsable,
 * finalidad, base de licitud, derechos y conservación.
 */
export function textoAvisoTratamiento(nombreComunidad: string | null): string {
  const responsable = nombreComunidad ? `Comunidad ${nombreComunidad}` : "la Comunidad"
  return `Responsable: ${responsable}, a través de su Administración. Finalidad: informar asuntos de la comunidad y acreditar entrega. Base: deber de informar (Ley 21.442) y autorización legal/consentimiento (Ley 19.628 art. 4). Derechos: acceso, rectificación, cancelación y oposición ante la Administración (buzón ciudadano de la plataforma). Conservación: sin plazo definido aún por la Administración.`
}
