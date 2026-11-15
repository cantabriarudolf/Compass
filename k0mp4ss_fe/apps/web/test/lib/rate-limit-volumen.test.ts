// @vitest-environment node
/**
 * T16 (R3-limiter-bulk-clear + R4-1) — la poda del contador del techo de volumen.
 *
 * `lib/rate-limit-volumen.ts` podaba con `clear()` arriba de mil claves: una
 * ráfaga de usuarios DISTINTOS barría las ventanas VIGENTES de todos los demás
 * y el techo fallaba abierto justo bajo la carga que existe para frenar — el
 * mismo defecto que la revisión nativa de `91df430` encontró en el Map del
 * evento (`app/api/co/_lib/denegacion.ts`) y que `77ceeff` cerró ahí podando
 * sólo entradas vencidas.
 *
 * Dos propiedades, las dos observadas acá contra el contador:
 *   · una ventana VIGENTE sobrevive a la ráfaga de mil claves distintas (con
 *     `clear()` esto da rojo: la ventana del primero se borra a mitad de ráfaga
 *     y la llamada 61 vuelve a contar desde cero);
 *   · la memoria no crece sin límite: las entradas VENCIDAS se podan (con la
 *     poda retirada por completo, el Map no baja nunca de las 1500 entradas).
 *
 * Cada caso usa su propio `ambito` para no compartir contador entre ellos.
 */
import { describe, it, expect } from "vitest"
import {
  excedeVolumen,
  ventanasEnMemoria,
  MAX_SOLICITUDES_POR_VENTANA,
  VENTANA_LIMITE_MS,
} from "@/lib/rate-limit-volumen"

const T0 = 1_760_000_000_000

describe("excedeVolumen — la poda no borra ventanas vigentes (T16)", () => {
  it("una ventana VIGENTE sobrevive a la ráfaga de mil claves distintas", () => {
    const AMBITO = "prueba-poda-vigente"
    // El usuario de la ventana agota su cuota: las primeras 60 pasan, la 61 corta.
    for (let n = 0; n < MAX_SOLICITUDES_POR_VENTANA; n++) {
      expect(excedeVolumen(AMBITO, "usuario-0", T0)).toBe(false)
    }
    // La ráfaga: mil quinientos usuarios distintos llenan el Map por encima del
    // tope de poda. Con `clear()`, la ventana de usuario-0 se borra acá adentro.
    for (let n = 1; n <= 1500; n++) {
      expect(excedeVolumen(AMBITO, `usuario-${n}`, T0)).toBe(false)
    }
    // La ventana de usuario-0 sigue VIGENTE: la siguiente llamada corta (la 61ª).
    expect(excedeVolumen(AMBITO, "usuario-0", T0 + 1_000)).toBe(true)
  })

  it("la memoria no crece sin límite: la poda borra las entradas VENCIDAS", () => {
    const AMBITO = "prueba-poda-vencidas"
    const T1 = T0 + 200_000 // las ventanas del caso anterior ya vencieron
    for (let n = 1; n <= 1500; n++) {
      excedeVolumen(AMBITO, `usuario-${n}`, T1)
    }
    // Pasada la ventana, una clave nueva dispara la poda por entrada vencida:
    // las 1500 ventanas vencidas se borran y queda sólo la nueva.
    excedeVolumen(AMBITO, "usuario-nuevo", T1 + VENTANA_LIMITE_MS + 1)
    expect(ventanasEnMemoria()).toBe(1)
  })
})
