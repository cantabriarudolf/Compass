import { expect, type Locator, type Page } from "@playwright/test"

/**
 * Guardado de diálogos **single-shot idempotente**.
 *
 * Por qué es single-shot (y no el patrón viejo de "re-submit a los 400-800 ms"):
 * varios specs CRUD clickeaban "Guardar" y, si el diálogo seguía visible a los
 * milisegundos, volvían a hacer `requestSubmit()` (hasta 3 veces). Cuando el
 * servidor tardaba más que esa espera, el PRIMER envío ya había creado el
 * registro y el reenvío generaba filas DUPLICADAS — medido en `avisos_cv` con
 * dos filas del mismo título (`cv-1791834049113-67sra2` y `cv-1791834049909-v10a6b`)
 * y en `crud/proyectos` con `strict mode violation: resolved to 2 elements`.
 *
 * Contrato del helper:
 *   (a) clickea el botón UNA vez; solo si el click revienta, hace UN
 *       `requestSubmit()` como alternativa (nunca ambos);
 *   (b) espera el cierre REAL del diálogo (hasta `timeoutMs`);
 *   (c) reenvía como máximo UNA vez, y SOLO si el diálogo sigue abierto y la
 *       fila todavía no existe (`fila` con count 0). Si la fila ya existe, NO
 *       se reenvía jamás (eso es lo que duplica); si no se informa `fila`, no
 *       se reenvía tampoco: sin fila no se puede verificar "todavía no existe",
 *       y un diálogo abierto tras `timeoutMs` debe fallar con la causa real;
 *   (d) si se informa `fila`, afirma `toHaveCount(1)`: un duplicado en BD falla
 *       RUIDOSO en el guardado, en vez de llegar hasta el final del spec.
 *
 * Los specs conservan sus aserciones posteriores (card/fila/badge): este
 * helper reemplaza solo el bloque de envío ciego.
 */
export type GuardarDialogoOpciones = {
  /** Botón de guardar ya resuelto por el spec (dentro del diálogo). */
  boton: Locator
  /** Contenedor que envuelve el `<form>`. Por defecto, el primer `[role="dialog"]`. */
  dialogo?: Locator
  /** Locator del registro esperado (fila de tabla, card, etc.): afirma unicidad. */
  fila?: Locator
  /** Espera máxima al cierre del diálogo. Por defecto 15_000 ms. */
  timeoutMs?: number
}

/**
 * Guarda un diálogo con un solo envío (idempotente) y afirma la unicidad de la
 * fila cuando se informa.
 *
 * @example
 * await guardarDialogo(page, {
 *   boton: dialog.getByRole("button", { name: "Guardar" }),
 *   dialogo: dialog,
 *   fila: page.getByRole("row").filter({ hasText: titulo }),
 * })
 */
export async function guardarDialogo(page: Page, opciones: GuardarDialogoOpciones): Promise<void> {
  const { boton, fila, timeoutMs = 15_000 } = opciones
  const dialogo = opciones.dialogo ?? page.getByRole("dialog")

  // (a) UN click. Si el click revienta (footer fuera de viewport, elemento
  // deshabilitado al momento del intento), UN requestSubmit como alternativa.
  await boton.scrollIntoViewIfNeeded().catch(() => {})
  try {
    await boton.click({ force: true, noWaitAfter: true, timeout: 5_000 })
  } catch {
    await enviarFormulario(dialogo)
  }

  // (b) Esperar el cierre real del diálogo (eso confirma el guardado).
  const cerro = await dialogo
    .waitFor({ state: "hidden", timeout: timeoutMs })
    .then(() => true)
    .catch(() => false)

  if (!cerro) {
    const filasExistentes = fila ? await fila.count() : null
    if (fila && filasExistentes === 0) {
      // (c) Sigue abierto Y la fila todavía no existe → UN reenvío más.
      await enviarFormulario(dialogo)
      await expect(dialogo).toBeHidden({ timeout: timeoutMs })
    } else if (fila) {
      // La fila YA existe: el guardado pasó. Jamás reenviar (eso duplica);
      // margen corto solo para el cierre estético del diálogo.
      await expect(dialogo).toBeHidden({ timeout: 5_000 })
    } else {
      // Sin `fila` no hay cómo verificar que "todavía no existe": single-shot
      // estricto. El diálogo abierto tras timeoutMs = causa real, sin reenvío.
      throw new Error(
        `guardarDialogo: el diálogo siguió visible tras ${timeoutMs} ms y no se informó "fila" para verificar el guardado. ` +
          `Single-shot sin reenvío: reenviar a ciegas es lo que duplicaba filas.`,
      )
    }
  }

  // (d) Unicidad ruidosa: 2 filas con el mismo registro → fallo inmediato.
  if (fila) await expect(fila).toHaveCount(1, { timeout: timeoutMs })
}

/** Único `requestSubmit()` posible dentro del contenedor del diálogo. */
async function enviarFormulario(dialogo: Locator): Promise<void> {
  await dialogo
    .locator("form")
    .first()
    .evaluate((f) => (f as HTMLFormElement).requestSubmit(), undefined, { timeout: 3_000 })
    .catch(() => {})
}
