// @vitest-environment jsdom
/**
 * T13 (S10) — el recorte del historial de certificados se DECLARA.
 *
 * Es la otra mitad de la regla: la unidad y la persona del certificado ya se
 * buscan en el servidor, pero el historial sigue leyendo páginas del padrón del
 * cliente (`usePersonas()` y `useUnidades()`, cien filas por defecto). Donde el
 * recorte no se puede evitar, S10 exige que se declare con el aviso existente y
 * los `total` que reporta el servidor: el silencio no es una opción.
 *
 * Por qué este archivo existe: un verificador independiente borró las dos líneas
 * del `AvisoTruncamiento` en `certificados-emision.tsx` y la tanda de tests de la
 * pantalla quedó **8/8 en verde**. O sea que la única guarda de «el recorte se
 * declara» no tenía quien la mordiera. Acá muerde: sin el aviso, este caso rojo.
 *
 * Los `total` de los mocks son los del servidor (400 personas, 166 unidades) y el
 * padrón del cliente va VACÍO, que es la forma límite del recorte: la pantalla no
 * puede mostrar nada de esas dos listas y tiene que decir cuánto falta igual.
 */
import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"

const PRESUPUESTO_CARGA = 60_000

vi.mock("@/lib/api/use-certificados-ct", () => ({
  useCertificadosCT: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({
    personas: [],
    total: 400,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-unidades", () => ({
  useUnidades: () => ({
    items: [],
    total: 166,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-vinculos", () => ({
  useVinculos: () => ({
    vinculos: [],
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-configuracion", () => ({
  useConfiguracion: () => ({
    config: null,
    isLoading: false,
    error: null,
    updateConfig: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-periodos-directiva", () => ({
  usePeriodosDirectiva: () => ({
    periodos: [],
    vigente: undefined,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    cerrar: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-liquidaciones", () => ({
  useLiquidaciones: () => ({
    items: [],
    liquidaciones: [],
    total: 0,
    isLoading: false,
    error: null,
    remove: vi.fn(),
    generar: vi.fn(),
    confirmar: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-cobros-fi", () => ({
  useCobrosFI: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

const { default: CertificadosEmision } = await import(
  "@/app/comunidad/certificados/_componentes/certificados-emision"
)

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("T13 — el recorte del historial se declara", () => {
  it(
    "muestra «Mostrando N de M» con los totals del servidor en el historial",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ data: [], page: 1, pageSize: 50, total: 0 }), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
        )
      )
      const user = userEvent.setup()
      render(<CertificadosEmision tiposEmisibles={["estado_cuenta", "al_dia"]} />)

      await user.click(screen.getByRole("tab", { name: /Historial de Emisión/i }))

      // Dos padrones truncados en la pantalla: personas (400) y unidades (166).
      // El aviso viaja con los totals del SERVIDOR, no con lo que llegó.
      expect(screen.getAllByRole("status").map((n) => n.textContent)).toEqual([
        "Mostrando 0 de 400 — refiná la búsqueda para ver el resto.",
        "Mostrando 0 de 166 — refiná la búsqueda para ver el resto.",
      ])
    },
    PRESUPUESTO_CARGA
  )
})
