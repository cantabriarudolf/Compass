// @vitest-environment jsdom
/**
 * Archivo, Maestros y Certificados borran con guarda (T5 segunda parte, S1/S2).
 *
 * Tres bajas reales que el censo viejo no tenía (`odd/tasks/borrados-con-guarda.md`,
 * medición fina T1 + decisión del orquestador): el maestro administrativo de
 * `/admin/maestros`, el documento comunitario del Archivo y el certificado
 * emitido del historial de emisión. Las tres se llevaban el registro con un solo
 * click; ahora montan `components/eliminar-con-confirmacion.tsx`.
 *
 * La regla es la misma que fijaron T2–T4: el primer click en la papelera **no
 * llama a la función de borrado**; abre el diálogo con el nombre concreto de la
 * entidad y la consecuencia literal, y la baja viaja recién al confirmar, una
 * sola vez. Los hooks de `lib/api/` se mockean —no la red— para poder afirmar
 * que el primer click no los toca.
 *
 * Dos particularidades de este lote:
 *   · `admin/maestros` es UN punto de montaje que borra quince tipos de maestro
 *     distintos, así que la consecuencia no puede ser una sola frase: se afirma
 *     que dos tipos dicen cosas distintas, con el motivo de rechazo que el
 *     endpoint ya devuelve (409 por vínculos de unidad / fichas laborales).
 *   · El DELETE de un certificado siempre responde 409 («Documento inmutable»).
 *     Ese motivo tiene que poder leerse **dentro** del diálogo: el overlay tapa
 *     el banner de la pantalla y el historial no tiene banner propio.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import { MENSAJE_LEGAL_INMUTABLE } from "@/lib/documento-archivo"

vi.setConfig({ testTimeout: 60_000 })

/* -------------------------------------------------------------------------- */
/* Textos de la guarda: nombre de la entidad + qué se pierde (S1).            */
/* -------------------------------------------------------------------------- */

const GLOSA_DOCUMENTO = "Circular del plan de emergencia"
const ARIA_DOCUMENTO = `Eliminar ${GLOSA_DOCUMENTO}`
const TITULO_DOCUMENTO = `Eliminar el documento «${GLOSA_DOCUMENTO}» · v1`
const CONSECUENCIA_DOCUMENTO =
  "Se pierde el documento con su glosa, su versión y la URL del archivo: sale del archivo de la comunidad y no se puede recuperar."

const NOMBRE_BANCO = "Banco Propio"
const TITULO_BANCO = `Eliminar el banco «${NOMBRE_BANCO}»`
const CONSECUENCIA_BANCO =
  "Las fichas laborales que lo tienen quedan sin banco. El servidor rechaza la baja si alguna ficha laboral lo usa («Conflicto: el maestro está en uso por fichas laborales (campo bancoId).»)."

const NOMBRE_ESTADO = "Vacante"
const TITULO_ESTADO = `Eliminar el estado de ocupación «${NOMBRE_ESTADO}»`
const CONSECUENCIA_ESTADO =
  "Las unidades y los vínculos de unidad quedan con un estado que ya no existe. El servidor rechaza la baja si algún vínculo lo usa («Conflicto: el estado de ocupación está en uso por vínculos de unidad.»)."

const FOLIO_CERTIFICADO = "CT-0007"
const ARIA_CERTIFICADO = `Eliminar el certificado ${FOLIO_CERTIFICADO}`
const TITULO_CERTIFICADO = `Eliminar el certificado ${FOLIO_CERTIFICADO} · Certificado de Residencia`
const CONSECUENCIA_CERTIFICADO =
  "Se pierde la constancia de la emisión: su folio y su código de verificación dejan de poder contrastarse contra el historial."

const MOTIVO_INMUTABLE = "Documento inmutable: no se puede eliminar un certificado."

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const DOCUMENTO_COMUNITARIO = {
  id: "doc-archivo-circular-emergencia",
  naturaleza: "comunitario" as const,
  tipoDocumental: "otros" as const,
  glosa: GLOSA_DOCUMENTO,
  archivoNombre: "plan-de-emergencia.pdf",
  archivoTipoMime: "application/pdf",
  archivoTamanoKB: 0,
  archivoUrl: "/archivo-documentos/plan-de-emergencia.pdf",
  vigenteDesde: "2026-04-01",
  version: 1,
}

const CERTIFICADO = {
  id: "test-ct-0007",
  folio: FOLIO_CERTIFICADO,
  codigoVerificacion: "VC-7f3a91",
  tipo: "residencia" as const,
  personaId: "p-ana",
  solicitanteNombre: "Ana Propietaria",
  resumen: "Se certifica que Ana Propietaria reside en la unidad.",
  detalle: [{ clave: "Residente", valor: "Ana Propietaria" }],
  fechaEmision: "2026-11-26",
}

const FILAS_MAESTRO: Record<string, { id: string; nombre: string; color?: string }[]> = {
  bancos: [{ id: "banco-propio-1", nombre: NOMBRE_BANCO }],
  "estados-ocupacion": [
    { id: "est-vacante", nombre: NOMBRE_ESTADO, color: "bg-blue-500 text-white" },
  ],
}

/* -------------------------------------------------------------------------- */
/* Espías: lo que el primer click NO puede llamar.                            */
/* -------------------------------------------------------------------------- */

const api = vi.hoisted(() => ({
  removeMaestro: vi.fn(),
  removeDocumento: vi.fn(),
  removeCertificado: vi.fn(),
}))

vi.mock("@/lib/api/use-maestros", () => ({
  useMaestros: (tipo?: string | null) => ({
    data: tipo ? (FILAS_MAESTRO[tipo] ?? []) : [],
    isLoading: false,
    error: null,
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: api.removeMaestro,
    ocultar: vi.fn(async () => ({ ok: true })),
  }),
}))

vi.mock("@/lib/api/use-documentos", () => ({
  useDocumentos: () => ({
    items: [DOCUMENTO_COMUNITARIO],
    total: 1,
    isLoading: false,
    error: null,
    hasMore: false,
    cargandoMas: false,
    cargarMas: vi.fn(async () => {}),
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: api.removeDocumento,
  }),
}))

vi.mock("@/lib/api/use-certificados-ct", () => ({
  useCertificadosCT: () => ({
    items: [CERTIFICADO],
    total: 1,
    isLoading: false,
    error: null,
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: api.removeCertificado,
  }),
}))

// Lecturas de la pantalla de certificados: el historial no las necesita, pero la
// gestión las consume al montar y cuentan para su estado de carga.
vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({
    personas: [{ id: "p-ana", nombres: "Ana", apellidos: "Propietaria" }],
    total: 1,
    isLoading: false,
    error: null,
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-unidades", () => ({
  useUnidades: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-vinculos", () => ({
  useVinculos: () => ({
    vinculos: [],
    isLoading: false,
    error: null,
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-configuracion", () => ({
  useConfiguracion: () => ({
    config: null,
    isLoading: false,
    error: null,
    updateConfig: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-periodos-directiva", () => ({
  usePeriodosDirectiva: () => ({
    periodos: [],
    vigente: undefined,
    isLoading: false,
    error: null,
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
    cerrar: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-liquidaciones", () => ({
  useLiquidaciones: () => ({
    items: [],
    liquidaciones: [],
    total: 0,
    isLoading: false,
    error: null,
    remove: vi.fn(async () => ({ ok: true })),
    generar: vi.fn(async () => ({ ok: true })),
    confirmar: vi.fn(async () => ({ ok: true })),
  }),
}))

import MaestrosPage from "@/app/admin/maestros/page"
import { ConsolaArchivo } from "@/app/comunidad/archivo/consola-archivo"
import CertificadosEmision from "@/app/comunidad/certificados/_componentes/certificados-emision"

const TIPOS_GESTION = [
  "residencia",
  "estado_cuenta",
  "liquidacion_sueldo",
  "al_dia",
] as const

beforeEach(() => {
  instalarEntornoRadix()
  vi.clearAllMocks()
  api.removeMaestro.mockImplementation(async () => ({ ok: true }))
  api.removeDocumento.mockImplementation(async () => ({ ok: true }))
  api.removeCertificado.mockImplementation(async () => ({ ok: true }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Abre el diálogo desde el disparador y devuelve el diálogo para leerlo. */
async function abrirGuarda(
  usuario: ReturnType<typeof userEvent.setup>,
  ariaLabel: string
): Promise<HTMLElement> {
  await usuario.click(await screen.findByRole("button", { name: ariaLabel }))
  return screen.findByRole("alertdialog")
}

/** `admin/maestros`: un subtab concreto, de la pestaña a la fila. */
async function abrirSubtab(
  usuario: ReturnType<typeof userEvent.setup>,
  pestana: RegExp,
  subtab: RegExp
): Promise<void> {
  render(<MaestrosPage />)
  await usuario.click(screen.getByRole("tab", { name: pestana }))
  await usuario.click(screen.getByRole("button", { name: subtab }))
}

describe("el primer click no borra: abre la guarda con la entidad concreta", () => {
  it("archivo: el documento comunitario se nombra con su glosa y su versión", async () => {
    const usuario = userEvent.setup({ delay: null })
    render(<ConsolaArchivo roles={["administrador"]} />)

    const dialogo = await abrirGuarda(usuario, ARIA_DOCUMENTO)

    expect(within(dialogo).getByText(TITULO_DOCUMENTO)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_DOCUMENTO)
    expect(api.removeDocumento).not.toHaveBeenCalled()
  })

  it("maestros: el banco se nombra con su tipo y su nombre de fila", async () => {
    const usuario = userEvent.setup({ delay: null })
    await abrirSubtab(usuario, /finanzas/i, /instituciones bancarias/i)

    const dialogo = await abrirGuarda(usuario, `Borrar ${NOMBRE_BANCO}`)

    expect(within(dialogo).getByText(TITULO_BANCO)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_BANCO)
    expect(api.removeMaestro).not.toHaveBeenCalled()
  })

  it("maestros: la consecuencia cambia con el tipo (el estado de ocupación no pierde lo mismo que el banco)", async () => {
    const usuario = userEvent.setup({ delay: null })
    await abrirSubtab(usuario, /inventario/i, /estados de ocupación/i)

    const dialogo = await abrirGuarda(usuario, `Borrar ${NOMBRE_ESTADO}`)

    expect(within(dialogo).getByText(TITULO_ESTADO)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_ESTADO)
    expect(dialogo).not.toHaveTextContent(CONSECUENCIA_BANCO)
    expect(api.removeMaestro).not.toHaveBeenCalled()
  })

  it("certificados: el historial ya no borra sin diálogo y nombra el folio y la tipología", async () => {
    const usuario = userEvent.setup({ delay: null })
    render(<CertificadosEmision tiposEmisibles={TIPOS_GESTION} />)

    await usuario.click(screen.getByRole("tab", { name: "Historial de Emisión" }))
    const dialogo = await abrirGuarda(usuario, ARIA_CERTIFICADO)

    expect(within(dialogo).getByText(TITULO_CERTIFICADO)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_CERTIFICADO)
    expect(api.removeCertificado).not.toHaveBeenCalled()
  })
})

describe("confirmar ejecuta la baja una sola vez y cierra", () => {
  it("archivo: la papelera + confirmar llama al hook con el id y deja su mensaje", async () => {
    const usuario = userEvent.setup({ delay: null })
    render(<ConsolaArchivo roles={["administrador"]} />)

    const dialogo = await abrirGuarda(usuario, ARIA_DOCUMENTO)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(api.removeDocumento).toHaveBeenCalledTimes(1))
    expect(api.removeDocumento).toHaveBeenCalledWith(DOCUMENTO_COMUNITARIO.id)
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Documento comunitario eliminado."
    )
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })

  it("maestros: la papelera + confirmar llama al hook con el id del maestro", async () => {
    const usuario = userEvent.setup({ delay: null })
    await abrirSubtab(usuario, /finanzas/i, /instituciones bancarias/i)

    const dialogo = await abrirGuarda(usuario, `Borrar ${NOMBRE_BANCO}`)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(api.removeMaestro).toHaveBeenCalledTimes(1))
    expect(api.removeMaestro).toHaveBeenCalledWith("banco-propio-1")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })

  it("certificados: la papelera + confirmar llama al hook con el id del certificado", async () => {
    const usuario = userEvent.setup({ delay: null })
    render(<CertificadosEmision tiposEmisibles={TIPOS_GESTION} />)

    await usuario.click(screen.getByRole("tab", { name: "Historial de Emisión" }))
    const dialogo = await abrirGuarda(usuario, ARIA_CERTIFICADO)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(api.removeCertificado).toHaveBeenCalledTimes(1))
    expect(api.removeCertificado).toHaveBeenCalledWith(CERTIFICADO.id)
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })
})

describe("el motivo del rechazo se lee dentro del diálogo", () => {
  it("certificados: el 409 de inmutabilidad queda a la vista sin cerrar la guarda", async () => {
    api.removeCertificado.mockResolvedValueOnce({ ok: false, error: MOTIVO_INMUTABLE })
    const usuario = userEvent.setup({ delay: null })
    render(<CertificadosEmision tiposEmisibles={TIPOS_GESTION} />)

    await usuario.click(screen.getByRole("tab", { name: "Historial de Emisión" }))
    const dialogo = await abrirGuarda(usuario, ARIA_CERTIFICADO)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    const sigueAbierto = await screen.findByRole("alertdialog")
    expect(within(sigueAbierto).getByRole("alert")).toHaveTextContent(MOTIVO_INMUTABLE)
    expect(api.removeCertificado).toHaveBeenCalledTimes(1)
  })

  it("archivo: el 409 del documento legal se lee en el diálogo y sigue en el aviso de la pantalla", async () => {
    api.removeDocumento.mockResolvedValueOnce({ ok: false, error: MENSAJE_LEGAL_INMUTABLE })
    const usuario = userEvent.setup({ delay: null })
    render(<ConsolaArchivo roles={["administrador"]} />)

    const dialogo = await abrirGuarda(usuario, ARIA_DOCUMENTO)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    const sigueAbierto = await screen.findByRole("alertdialog")
    expect(within(sigueAbierto).getByRole("alert")).toHaveTextContent(MENSAJE_LEGAL_INMUTABLE)
    // El manejo de error que ya existía —el aviso de la pantalla— no se pierde.
    expect(screen.getAllByText(MENSAJE_LEGAL_INMUTABLE)).toHaveLength(2)
    expect(api.removeDocumento).toHaveBeenCalledTimes(1)
  })

  it("maestros: el 409 por dependientes queda en el diálogo y en el aviso de la pantalla", async () => {
    const MOTIVO_DEPENDIENTES =
      "Conflicto: el maestro está en uso por fichas laborales (campo bancoId)."
    api.removeMaestro.mockResolvedValueOnce({ ok: false, error: MOTIVO_DEPENDIENTES })
    const usuario = userEvent.setup({ delay: null })
    await abrirSubtab(usuario, /finanzas/i, /instituciones bancarias/i)

    const dialogo = await abrirGuarda(usuario, `Borrar ${NOMBRE_BANCO}`)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    const sigueAbierto = await screen.findByRole("alertdialog")
    expect(within(sigueAbierto).getByRole("alert")).toHaveTextContent(MOTIVO_DEPENDIENTES)
    expect(screen.getAllByText(MOTIVO_DEPENDIENTES)).toHaveLength(2)
    expect(api.removeMaestro).toHaveBeenCalledTimes(1)
  })
})
