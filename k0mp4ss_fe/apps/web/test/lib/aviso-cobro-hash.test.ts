/**
 * @vitest-environment node
 *
 * T5 aviso-de-cobro (S2) — `hashContenido`: la huella del contenido congelado.
 *
 * El aviso firmado se imprime y se entrega en papel; el hash impreso es lo que
 * permite decir si el papel corresponde al documento que el sistema emitió. Para
 * eso el hash tiene que ser:
 *
 *   1. DETERMINISTA: el mismo contenido da el mismo hash en cualquier proceso
 *      (no depende de la identidad de los objetos ni de la memoria);
 *   2. INDEPENDIENTE del orden de inserción de las claves (el contenido se lee
 *      de un JSON de base, cuyo orden de claves no es un dato);
 *   3. SENSIBLE al contenido: si cambia un monto, cambia el hash — si no, el
 *      papel podría decir otra cosa y "verificar" igual;
 *   4. LEGIBLE: una cadena corta que se pueda comparar a ojo con la impresa.
 *
 * El orden de los ARRAYS sí es contenido (una línea antes que otra es otro
 * documento), y un número no es su versión en texto: nada de coerciones.
 */
import { describe, it, expect } from "vitest"
import { hashContenido } from "@/lib/aviso-cobro"

/** Forma corta y legible: 16 caracteres hexadecimales en mayúscula. */
const FORMATO_HASH = /^[0-9A-F]{16}$/

const CONTENIDO = {
  version: 1,
  periodo: "2026-09",
  fechaEmision: "2026-09-05",
  unidad: { id: "u-101", numero: "101", etiqueta: "Departamento" },
  montos: {
    gastoComun: 45000,
    recargoFondoReserva: 4500,
    multas: 0,
    intereses: 1200,
    exigible: 50700,
    pagado: 20000,
    totalAdeudado: 30700,
  },
}

describe("hashContenido — la huella que se imprime y se verifica a mano", () => {
  it("el formato es corto y legible: 16 caracteres hexadecimales en mayúscula", () => {
    expect(hashContenido(CONTENIDO)).toMatch(FORMATO_HASH)
  })

  it("es determinista: dos llamadas sobre el mismo contenido dan el mismo hash", () => {
    expect(hashContenido(CONTENIDO)).toBe(hashContenido(CONTENIDO))
    // Un objeto distinto con los mismos datos también: el hash no depende de
    // la identidad del objeto ni de la memoria del proceso.
    expect(hashContenido({ ...CONTENIDO })).toBe(hashContenido(CONTENIDO))
  })

  it("no depende del orden de las claves, ni en la raíz ni anidado", () => {
    const desordenado = {
      montos: {
        totalAdeudado: 30700,
        pagado: 20000,
        exigible: 50700,
        intereses: 1200,
        multas: 0,
        recargoFondoReserva: 4500,
        gastoComun: 45000,
      },
      unidad: { etiqueta: "Departamento", numero: "101", id: "u-101" },
      fechaEmision: "2026-09-05",
      periodo: "2026-09",
      version: 1,
    }
    expect(hashContenido(desordenado)).toBe(hashContenido(CONTENIDO))
  })

  it("cambia si cambia cualquier monto del contenido", () => {
    const base = hashContenido(CONTENIDO)
    for (const campo of [
      "gastoComun",
      "recargoFondoReserva",
      "multas",
      "intereses",
      "exigible",
      "pagado",
      "totalAdeudado",
    ] as const) {
      const alterado = {
        ...CONTENIDO,
        montos: { ...CONTENIDO.montos, [campo]: CONTENIDO.montos[campo] + 1 },
      }
      expect(hashContenido(alterado), `el monto ${campo} no alteró el hash`).not.toBe(base)
    }
  })

  it("cambia si cambia un dato no monetario (período, unidad)", () => {
    const base = hashContenido(CONTENIDO)
    expect(hashContenido({ ...CONTENIDO, periodo: "2026-10" })).not.toBe(base)
    expect(
      hashContenido({ ...CONTENIDO, unidad: { ...CONTENIDO.unidad, numero: "102" } })
    ).not.toBe(base)
  })

  it("el orden de un array SÍ es contenido: dos listas desordenadas son otro documento", () => {
    const conDetalle = { ...CONTENIDO, detalle: ["gasto_comun", "multa_in"] }
    const invertido = { ...CONTENIDO, detalle: ["multa_in", "gasto_comun"] }
    expect(hashContenido(invertido)).not.toBe(hashContenido(conDetalle))
  })

  it("no confunde un número con su versión en texto", () => {
    const comoNumero = { ...CONTENIDO, montos: { ...CONTENIDO.montos, gastoComun: 45000 } }
    const comoTexto = { ...CONTENIDO, montos: { ...CONTENIDO.montos, gastoComun: "45000" } }
    expect(hashContenido(comoTexto)).not.toBe(hashContenido(comoNumero))
  })

  it("una clave sin valor no cambia el hash (es lo que JSON no serializa)", () => {
    expect(hashContenido({ ...CONTENIDO, nota: undefined })).toBe(hashContenido(CONTENIDO))
  })
})
