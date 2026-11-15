/**
 * Rate limit de VOLUMEN (en memoria) para los buscadores que consultan al servidor.
 *
 * `lib/rate-limit.ts` cuenta FALLOS de autenticación en la base —diez cada quince
 * minutos sobre `rate_limit_attempts`—: esa forma no sirve para un typeahead, donde
 * cada tecla es una request legítima y el techo tiene que ser alto, por minuto y sin
 * escribir en la base. Este es el contador que ya usaban escritos a mano
 * `app/api/csp-report/route.ts` y `app/api/health/route.ts`, extraído para que cada
 * buscador no lo copie: con el buscador de certificados, el del buzón y los del visor
 * la copia dejaría de ser un detalle.
 *
 * La clave la elige el consumidor, y en una ruta con sesión es el `usuarioId`, NO la
 * IP: una conserjería con varios residentes detrás de la misma IP se bloquearía a sí
 * misma. Los tests de los consumidores pinean justamente ese lado — otro usuario no
 * hereda el bloqueo.
 */

/** Sesenta búsquedas por minuto alcanzan de sobra para tipear y cortan el barrido. */
export const MAX_SOLICITUDES_POR_VENTANA = 60

/** Ventana del techo de volumen. */
export const VENTANA_LIMITE_MS = 60_000

/** Contador por clave: `{ n, reset }`, con `reset` en milisegundos epoch. */
const contador = new Map<string, { n: number; reset: number }>()

/**
 * `true` cuando la clave ya gastó su ventana: el que llama responde 429 y no emite nada.
 *
 * `ambito` es OBLIGATORIO y no opcional a propósito: sin él, dos buscadores distintos
 * comparten el mismo pozo y cuarenta búsquedas de certificados dejan sin cuota al buzón
 * del mismo usuario. Lo encontró el verificador independiente de S10, midiéndolo: con el
 * pozo común, el buzón cortaba en la solicitud 21. El ámbito va en la clave para que el
 * error no se pueda repetir por olvido.
 */
export function excedeVolumen(ambito: string, clave: string, ahora: number = Date.now()): boolean {
  const llave = `${ambito}:${clave}`
  const registro = contador.get(llave)
  if (!registro || ahora >= registro.reset) {
    // Poda oportunista por ENTRADA VENCIDA, nunca `clear()` (T16,
    // R3-limiter-bulk-clear + R4-1): barrer el Map entero borra las ventanas
    // VIGENTES de usuarios que no son el que llama, y el techo falla abierto justo
    // bajo la ráfaga de usuarios distintos que existe para frenar — el mismo
    // defecto que `77ceeff` cerró en el Map del evento. El Map queda acotado por
    // los usuarios DISTINTOS dentro de la ventana y se auto-sana en la primera
    // pasada posterior al vencimiento; `ventanasEnMemoria` es la única ventana
    // observable de ese acotamiento.
    if (contador.size > 1000) {
      for (const [claveVieja, registroViejo] of contador) {
        if (ahora >= registroViejo.reset) contador.delete(claveVieja)
      }
    }
    contador.set(llave, { n: 1, reset: ahora + VENTANA_LIMITE_MS })
    return false
  }
  registro.n += 1
  return registro.n > MAX_SOLICITUDES_POR_VENTANA
}

/**
 * Cantidad de ventanas vivas en el contador. Existe para que los tests observen
 * la memoria del Map: la poda de entradas vencidas no se ve en el valor de
 * retorno de `excedeVolumen` — una ventana vencida y una ausente se comportan
 * igual —, así que el acotamiento de memoria sólo es observable por acá.
 */
export function ventanasEnMemoria(): number {
  return contador.size
}
