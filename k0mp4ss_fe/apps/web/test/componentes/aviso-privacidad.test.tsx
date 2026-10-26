// @vitest-environment jsdom
/**
 * Aviso de privacidad en conserjería (F14).
 *
 * La bitácora registra a un tercero (el visitante) y la 19.628 exige que el
 * tratamiento sea «debidamente informado». Estos casos fijan el contrato
 * observable del aviso: se renderiza, nombra los datos que se registran,
 * declara que el responsable es la comunidad y enlaza a la política de
 * privacidad. El canal ARCO es la administración (el visitante no tiene cuenta),
 * así que el aviso NO puede mandarlo a `/admin/mis-datos`.
 */
import React from "react"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { AvisoPrivacidadConserjeria } from "@/components/aviso-privacidad-conserjeria"

afterEach(() => {
  cleanup()
})

describe("AvisoPrivacidadConserjeria", () => {
  it("se renderiza y nombra los datos que se registran", () => {
    render(<AvisoPrivacidadConserjeria />)

    const aviso = screen.getByRole("region", {
      name: "Aviso de privacidad para visitantes",
    })
    expect(aviso.textContent).toContain("nombre")
    expect(aviso.textContent).toContain("documento de identidad")
    expect(aviso.textContent).toContain("patente")
    expect(aviso.textContent).toContain("unidad destino")
    expect(aviso.textContent).toContain("jornada")
    expect(aviso.textContent).toContain("hora")
  })

  it("declara que el responsable es la comunidad y la finalidad", () => {
    render(<AvisoPrivacidadConserjeria />)

    const aviso = screen.getByRole("region", {
      name: "Aviso de privacidad para visitantes",
    })
    expect(aviso.textContent).toContain("El responsable de estos datos es la comunidad")
    expect(aviso.textContent).toContain("control de acceso y la seguridad de la comunidad")
    // El plazo de retención está pendiente (F15): se remite a la política,
    // sin inventar un número.
    expect(aviso.textContent).toContain("según la política de retención de la comunidad")
  })

  it("enlaza a /privacidad y manda el pedido ARCO a la administración, no a una cuenta", () => {
    render(<AvisoPrivacidadConserjeria />)

    expect(screen.getByRole("link", { name: /política de privacidad/ })).toHaveAttribute(
      "href",
      "/privacidad"
    )
    const aviso = screen.getByRole("region", {
      name: "Aviso de privacidad para visitantes",
    })
    expect(aviso.textContent).toContain("solicítalo a la administración de la comunidad")
    // El visitante es un tercero sin cuenta: `/admin/mis-datos` es la vía del
    // usuario autenticado y no sirve acá.
    expect(aviso.textContent).not.toContain("/admin/mis-datos")
  })

  it("aplica className al contenedor", () => {
    render(<AvisoPrivacidadConserjeria className="mt-4" />)

    const aviso = screen.getByRole("region", {
      name: "Aviso de privacidad para visitantes",
    })
    expect(aviso.className).toContain("mt-4")
  })
})
