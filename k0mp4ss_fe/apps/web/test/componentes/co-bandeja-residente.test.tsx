// @vitest-environment jsdom
/**
 * S1 + S7 — bandeja del residente derivada del rol (change co-lectura-residente,
 * tarea 1.7).
 *
 * Contratos que fija este test:
 *   (a) el residente ve SOLO el shape proyectado que entrega la API (D2): ni
 *       nómina de destinatarios, ni lecturas ajenas, ni totales;
 *   (b) los textos del dictamen se muestran LITERALES (S7): aviso de registro
 *       bajo cada mensaje y aviso de tratamiento permanente en la bandeja;
 *   (c) abrir una comunicación registra la lectura propia (`POST …/leer`);
 *       la fecha/hora de la lectura propia se muestra cuando existe;
 *   (d) una cuenta SIN persona vinculada no se disfraza de «no tenés mensajes»:
 *       el vacío por falta de pertenencia se declara (R4: nada de vacíos mudos);
 *   (e) el comité ve agregados y no registra lectura (no es destinatario).
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * Fuente controlada por el test: exactamente lo que `useEnviosCO()` /
 * `useLecturaCO()` devolverían en el navegador.
 */
const co = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
  total: 0,
  isLoading: false,
  error: null as Error | null,
  registrar: vi.fn<(envioId: string) => Promise<{ ok: true }>>(async () => ({ ok: true as const })),
}))

vi.mock("@/lib/api/use-co", () => ({
  useEnviosCO: () => ({
    items: co.items,
    total: co.total,
    isLoading: co.isLoading,
    error: co.error,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
  useLecturaCO: () => ({ registrar: co.registrar }),
}))

import { BandejaResidente, formatearLeidoEn } from "@/components/co/bandeja-residente"

/** Literal del dictamen (design §Textos de UI, punto 1). */
const AVISO_LECTURA =
  "ℹ️ Al abrir esta comunicación se registra tu lectura (fecha y hora) para acreditar que la Administración cumplió su deber de informar. Solo la Administración y el Comité pueden ver estadísticas; ningún vecino ve tu lectura."

/** Literal del dictamen (design §Textos de UI, punto 3) con los marcadores resueltos. */
const AVISO_TRATAMIENTO =
  "Responsable: Comunidad Edificio Plaza Central, a través de su Administración. Finalidad: informar asuntos de la comunidad y acreditar entrega. Base: deber de informar (Ley 21.442) y autorización legal/consentimiento (Ley 19.628 art. 4). Derechos: acceso, rectificación, cancelación y oposición ante la Administración (buzón ciudadano de la plataforma). Conservación: sin plazo definido aún por la Administración."

/** Envío tal como lo proyecta el servidor para el residente (D2). */
function envioResidente(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "env-res-1",
    asunto: "Corte de agua programado",
    cuerpo: "El martes entre 09:00 y 13:00 se suspende el suministro.",
    fechaEnvio: "2026-10-20",
    createdAt: "2026-10-20T12:00:00.000Z",
    lecturaPropia: { leidoEn: null },
    ...overrides,
  }
}

beforeEach(() => {
  co.items = []
  co.total = 0
  co.isLoading = false
  co.error = null
  co.registrar.mockClear()
})

afterEach(() => {
  cleanup()
})

describe("BandejaResidente — textos del dictamen", () => {
  it("muestra el aviso de registro bajo cada mensaje y el aviso de tratamiento permanente", () => {
    co.items = [envioResidente()]
    co.total = 1
    render(
      <BandejaResidente
        rol="residente"
        cuentaVinculada
        nombreComunidad="Edificio Plaza Central"
      />
    )

    expect(screen.getByRole("heading", { name: /Comunicación/ })).toBeTruthy()
    expect(screen.getByText("Corte de agua programado")).toBeTruthy()
    expect(screen.getByText(AVISO_LECTURA)).toBeTruthy()
    expect(screen.getByText(AVISO_TRATAMIENTO)).toBeTruthy()
  })

  it("no expone nómina de destinatarios ni totales al residente", () => {
    co.items = [
      envioResidente({
        // Aunque un servidor viejo los mandara, la bandeja no los proyecta (D2).
        destinatarios: [{ personaId: "p-vecino-ajeno", unidadId: "u-1" }],
        lecturas: ["p-vecino-ajeno"],
        totalDestinatarios: 3,
        totalLecturas: 2,
      }),
    ]
    co.total = 1
    render(
      <BandejaResidente rol="residente" cuentaVinculada nombreComunidad="Edificio Plaza Central" />
    )

    expect(screen.queryByText("p-vecino-ajeno")).toBeNull()
    expect(screen.queryByText(/3 leídos|\/3 leídos/)).toBeNull()
  })
})

describe("BandejaResidente — lectura propia", () => {
  it("abrir la comunicación registra la lectura y muestra su fecha y hora", async () => {
    co.items = [envioResidente()]
    co.total = 1
    const { container } = render(
      <BandejaResidente rol="residente" cuentaVinculada nombreComunidad="Edificio Plaza Central" />
    )

    const item = within(container).getAllByRole("listitem")[0]!
    expect(within(item).getByText("Sin leer")).toBeTruthy()

    await userEvent.click(within(item).getByRole("button", { name: "Abrir" }))

    await waitFor(() => expect(co.registrar).toHaveBeenCalledTimes(1))
    expect(co.registrar).toHaveBeenCalledWith("env-res-1")
    // Abrir también despliega el cuerpo de la comunicación.
    expect(
      screen.getByText("El martes entre 09:00 y 13:00 se suspende el suministro.")
    ).toBeTruthy()
  })

  it("con lectura ya registrada muestra la fecha y hora propias", () => {
    const leidoEn = "2026-10-21T15:42:00.000Z"
    co.items = [envioResidente({ lecturaPropia: { leidoEn } })]
    co.total = 1
    const { container } = render(
      <BandejaResidente rol="residente" cuentaVinculada nombreComunidad="Edificio Plaza Central" />
    )

    const item = within(container).getAllByRole("listitem")[0]!
    expect(within(item).getByText(`Leído el ${formatearLeidoEn(leidoEn)}`)).toBeTruthy()
    expect(within(item).queryByText("Sin leer")).toBeNull()
  })

  it("formatea la lectura propia como dd-mm-aaaa hh:mm", () => {
    expect(formatearLeidoEn("2026-10-21T15:42:00.000Z")).toMatch(
      /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/
    )
    // Dato corrupto: se muestra tal cual, sin inventar una fecha.
    expect(formatearLeidoEn("no-es-fecha")).toBe("no-es-fecha")
  })
})

describe("BandejaResidente — vacíos honestos", () => {
  it("una cuenta sin persona vinculada lo declara en vez de decir «no hay mensajes»", () => {
    co.items = []
    co.total = 0
    render(
      <BandejaResidente
        rol="residente"
        cuentaVinculada={false}
        nombreComunidad="Edificio Plaza Central"
      />
    )

    expect(screen.getByText(/no está vinculada a una persona/i)).toBeTruthy()
    expect(screen.getByText(/la Administración debe vincular/i)).toBeTruthy()
    expect(screen.queryByText(/No hay comunicaciones dirigidas a tu cuenta/i)).toBeNull()
  })

  it("una cuenta vinculada sin comunicaciones sí dice que no hay mensajes", () => {
    co.items = []
    co.total = 0
    render(
      <BandejaResidente rol="residente" cuentaVinculada nombreComunidad="Edificio Plaza Central" />
    )

    expect(screen.getByText(/No hay comunicaciones dirigidas a tu cuenta/i)).toBeTruthy()
    expect(screen.queryByText(/no está vinculada a una persona/i)).toBeNull()
  })

  it("declara el recorte cuando la API pagina y hay más comunicaciones", () => {
    co.items = [envioResidente()]
    co.total = 120
    render(
      <BandejaResidente rol="residente" cuentaVinculada nombreComunidad="Edificio Plaza Central" />
    )

    expect(screen.getByText(/Mostrando 1 de 120 comunicaciones/i)).toBeTruthy()
  })
})

describe("BandejaResidente — comité con agregados", () => {
  it("muestra X/Y leídos y no registra lectura", async () => {
    co.items = [
      {
        id: "env-com-1",
        asunto: "Asamblea ordinaria",
        cuerpo: "Convocatoria a asamblea.",
        fechaEnvio: "2026-10-22",
        totalDestinatarios: 32,
        totalLecturas: 10,
      },
    ]
    co.total = 1
    render(
      <BandejaResidente rol="comite" cuentaVinculada nombreComunidad="Edificio Plaza Central" />
    )

    expect(screen.getByText("10/32 leídos")).toBeTruthy()
    expect(
      screen.getByText(
        "Dato estadístico de recepción del canal; no acredita conocimiento del contenido ni constituye notificación legal por sí solo."
      )
    ).toBeTruthy()
    // El aviso de lectura propia es del destinatario, no del comité.
    expect(screen.queryByText(AVISO_LECTURA)).toBeNull()

    await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
    await waitFor(() =>
      expect(screen.getByText("Convocatoria a asamblea.")).toBeTruthy()
    )
    expect(co.registrar).not.toHaveBeenCalled()
  })
})
