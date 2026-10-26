// @vitest-environment jsdom
/**
 * F16 — banner de información + acuse de la política de privacidad.
 *
 * El banner ya no es un «acepto» global: informa datos, finalidades y
 * responsable, y registra un acuse versionado («Entendido»). Estos casos fijan
 * el contrato observable: muestra finalidades y responsable, registra el acuse
 * con la versión vigente, se oculta mientras el acuse sea vigente y permite
 * retirarlo (la revocación cuesta lo mismo que otorgar: un click).
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConsentBanner } from "@/components/consent-banner"
import {
  CLAVE_ACUSE_PRIVACIDAD,
  VERSION_POLITICA_PRIVACIDAD,
  type AcusePrivacidad,
  leerAcuse,
} from "@/lib/politica-privacidad"

function seedAcuse(acuse: AcusePrivacidad): void {
  window.localStorage.setItem(CLAVE_ACUSE_PRIVACIDAD, JSON.stringify(acuse))
}

/** El banner resuelve su visibilidad en un microtask tras montar: hay que esperar. */
function avisoVisible(): Promise<HTMLElement> {
  return screen.findByRole("region", { name: "Aviso de privacidad" })
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe("ConsentBanner", () => {
  it("muestra finalidades, datos tratados y responsable (la comunidad)", async () => {
    render(<ConsentBanner />)

    const aviso = await avisoVisible()
    // Finalidades activas con su base legal en lenguaje llano.
    expect(aviso.textContent).toContain("Operación de la comunidad")
    expect(aviso.textContent).toContain("Seguridad y control de acceso")
    expect(aviso.textContent).toMatch(/comunicaciones operativas al residente/i)
    // Responsable y datos.
    expect(aviso.textContent).toContain("responsable")
    expect(aviso.textContent).toContain("la comunidad")
    // La mayoría del tratamiento no depende de consentimiento: se informa.
    expect(aviso.textContent).toContain("no depende de tu consentimiento")
    // Enlace a la política.
    expect(screen.getByRole("link", { name: /política de privacidad/ })).toHaveAttribute(
      "href",
      "/privacidad"
    )
  })

  it("«Entendido» registra el acuse con la versión vigente y oculta el banner", async () => {
    const user = userEvent.setup()
    render(<ConsentBanner />)

    await user.click(await screen.findByRole("button", { name: "Entendido" }))

    const acuse = leerAcuse(window.localStorage)
    expect(acuse?.version).toBe(VERSION_POLITICA_PRIVACIDAD)
    expect(acuse?.fecha).toBeTruthy()
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Aviso de privacidad" })
      ).toBeNull()
    )
  })

  it("con acuse vigente no se muestra", async () => {
    seedAcuse({ version: VERSION_POLITICA_PRIVACIDAD, fecha: "2026-10-25T12:00:00.000Z" })
    render(<ConsentBanner />)
    await waitFor(() =>
      expect(leerAcuse(window.localStorage)?.version).toBe(VERSION_POLITICA_PRIVACIDAD)
    )

    expect(screen.queryByRole("region", { name: "Aviso de privacidad" })).toBeNull()
  })

  it("con acuse de versión vieja vuelve a mostrarse (cambio de política)", async () => {
    seedAcuse({ version: "0.9", fecha: "2026-01-01T12:00:00.000Z" })
    render(<ConsentBanner />)

    expect(await avisoVisible()).toBeTruthy()
  })

  it("«Retirar mi aceptación» borra el acuse y el aviso (re)aparece", async () => {
    const user = userEvent.setup()
    seedAcuse({ version: "0.9", fecha: "2026-01-01T12:00:00.000Z" })
    render(<ConsentBanner />)

    await user.click(await screen.findByRole("button", { name: "Retirar mi aceptación" }))

    expect(window.localStorage.getItem(CLAVE_ACUSE_PRIVACIDAD)).toBeNull()
    expect(await avisoVisible()).toBeTruthy()
  })
})
