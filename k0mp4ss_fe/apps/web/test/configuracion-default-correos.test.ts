import { describe, expect, it } from "vitest"

import { configuracionDefault } from "@/data/admin/configuracion"
import { ConfiguracionGlobalSchema } from "@/lib/schemas"

/**
 * Regla (no cadenas): ningún valor por defecto de la configuración global (CF)
 * puede ser la dirección de correo de una comunidad real. Toda forma de correo
 * que traiga `configuracionDefault` tiene que vivir en un dominio reservado de
 * documentación/pruebas — o no traer valor —, así que el buzón se puede
 * reescribir sin tocar este test y un dominio real que vuelva lo rompe.
 */
const DOMINIOS_RESERVADOS = [".test", ".example", ".invalid"] as const

/** Forma de correo (`local@dominio.tld`); basta para reconocer lo que sembramos. */
const FORMA_DE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function correosPorDefecto(): Array<[string, string]> {
  return Object.entries(configuracionDefault).flatMap(([campo, valor]) => {
    if (typeof valor !== "string") return []
    const texto = valor.trim()
    return FORMA_DE_CORREO.test(texto) ? [[campo, texto]] : []
  })
}

describe("configuración global por defecto (CF)", () => {
  it("no siembra correos de dominios reales", () => {
    const ajenos = correosPorDefecto()
      .filter(([, correo]) => {
        const dominio = correo.slice(correo.indexOf("@") + 1).toLowerCase()
        return !DOMINIOS_RESERVADOS.some((reservado) =>
          dominio.endsWith(reservado)
        )
      })
      .map(([campo, correo]) => `${campo}="${correo}"`)

    expect(ajenos).toEqual([])
  })

  it("cumple el schema y mantiene no vacíos los correos que exige", () => {
    const parseado = ConfiguracionGlobalSchema.safeParse(configuracionDefault)
    const problemas = (parseado.error?.issues ?? []).map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`
    )
    expect(problemas).toEqual([])

    // `smtpUser` y `smtpFrom` son `.min(1)` en ConfiguracionGlobalSchema: no se
    // pueden "neutralizar" vaciándolos, solo con un buzón de dominio reservado.
    expect(configuracionDefault.smtpUser.trim()).not.toBe("")
    expect(configuracionDefault.smtpFrom.trim()).not.toBe("")
  })
})
