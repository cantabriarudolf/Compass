/**
 * @vitest-environment node
 *
 * INV-03 — "un solo dueño de la ESCRITURA de la bitácora" (`docs/INVARIANTES.md`,
 * fila `EventoAuditoria`).
 *
 * La regla existía en `EventoAuditoriaSchema` y NADIE la imponía: 30 sitios
 * armaban el objeto a mano y `/api/auditoria/sync` hacía `upsert` de cualquier
 * string, así que un evento sin `descripcion` (o con `descripcion: ""`) entraba
 * igual y el rastro dejaba de ser legible para la auditoría y el peritaje.
 * Centralizada en `lib/auditoria.ts`, las dos puertas —alta suelta
 * (`registrarEventoAuditoria`) e ingesta en lote (`upsertEventoAuditoria`, usada
 * por `/api/auditoria/sync`)— validan antes de escribir.
 *
 * Dos pruebas por regla (pedido del owner, mismo patrón que
 * `test/api/invariantes-persona.test.ts`):
 *   1. el caso que tiene que pasar  → evento completo, fila persistida con la forma esperada;
 *   2. el que tiene que FALLAR      → sin `descripcion`, lanza y no deja ninguna fila.
 *
 * Sesión simulada con el patrón repo (next/headers mockeado + JWE real) porque la
 * segunda puerta se ejercita por la ruta real de ingesta.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  registrarEventoAuditoria,
  upsertEventoAuditoria,
  type EventoAuditoriaRegistrado,
} from "@/lib/auditoria"

const state = vi.hoisted(() => ({ cookie: "" }))
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(
      new Headers(
        state.cookie
          ? { cookie: state.cookie, "x-forwarded-proto": "http" }
          : { "x-forwarded-proto": "http" }
      )
    ),
}))

const SUFIJO = Date.now()
const COMUNIDAD_ID = `comunidad-inv03-${SUFIJO}`
const EMAIL_ADMIN = `inv03-admin-${SUFIJO}@test.cl`

let usuarioId = ""

/** Evento completo de referencia: el caso que la regla tiene que aceptar. */
function eventoValido(overrides: Partial<EventoAuditoriaRegistrado> = {}): EventoAuditoriaRegistrado {
  return {
    id: `ev-inv03-${SUFIJO}`,
    comunidadId: COMUNIDAD_ID,
    timestamp: "2026-02-03T10:15:00.000Z",
    usuario: usuarioId,
    categoria: "FI",
    tipoAccion: "FI_RECEIVE_PAYMENT",
    referenciaId: `cobro-inv03-${SUFIJO}`,
    descripcion: "Pago recibido por $12.000 (transferencia) sobre Gasto común enero.",
    ...overrides,
  }
}

/** POST real a la ingesta en lote (segunda puerta) con la sesión del admin. */
async function postSync(eventos: unknown[]): Promise<Response> {
  const { POST } = await import("@/app/api/auditoria/sync/route")
  const req = new NextRequest(
    `http://localhost/api/auditoria/sync?comunidadId=${COMUNIDAD_ID}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "http",
        ...(state.cookie ? { cookie: state.cookie } : {}),
      },
      body: JSON.stringify({ eventos }),
    }
  )
  return POST(req as unknown as Request)
}

describe("INV-03 — la bitácora tiene una sola puerta de escritura validada", () => {
  beforeAll(async () => {
    await prisma.comunidad.create({
      data: { id: COMUNIDAD_ID, nombre: "Comunidad INV03", slug: `inv03-${SUFIJO}` },
    })
    const usuario = await prisma.usuario.create({
      data: { email: EMAIL_ADMIN, activo: true },
    })
    usuarioId = usuario.id
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, comunidadId: COMUNIDAD_ID, rol: "administrador" },
    })
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: COMUNIDAD_ID } })
      await prisma.membresia.deleteMany({ where: { comunidadId: COMUNIDAD_ID } })
      await prisma.usuario.deleteMany({ where: { email: EMAIL_ADMIN } })
      await prisma.comunidad.delete({ where: { id: COMUNIDAD_ID } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  it("persiste un evento válido con la forma esperada", async () => {
    const evento = eventoValido()
    await registrarEventoAuditoria(evento)

    const fila = await prisma.eventoAuditoria.findUnique({ where: { id: evento.id } })
    expect(fila).not.toBeNull()
    expect(fila?.id).toBe(evento.id)
    expect(fila?.comunidadId).toBe(COMUNIDAD_ID)
    expect(fila?.timestamp).toBe(evento.timestamp)
    expect(fila?.usuario).toBe(usuarioId)
    expect(fila?.categoria).toBe("FI")
    expect(fila?.tipoAccion).toBe("FI_RECEIVE_PAYMENT")
    expect(fila?.referenciaId).toBe(evento.referenciaId)
    expect(fila?.descripcion).toBe(evento.descripcion)
  })

  it("RECHAZA un evento sin descripción y no escribe ninguna fila", async () => {
    const antes = await prisma.eventoAuditoria.count({
      where: { comunidadId: COMUNIDAD_ID },
    })

    // a) `descripcion` ausente en la alta suelta y en la ingesta en lote.
    const sinDescripcion = {
      id: `ev-inv03-${SUFIJO}-sin`,
      comunidadId: COMUNIDAD_ID,
      timestamp: "2026-02-03T10:20:00.000Z",
      usuario: usuarioId,
      categoria: "FI",
      tipoAccion: "FI_MORA_APPLIED",
      referenciaId: `cobro-inv03-${SUFIJO}`,
    } as unknown as EventoAuditoriaRegistrado
    await expect(registrarEventoAuditoria(sinDescripcion)).rejects.toThrow(/descripcion/)
    await expect(upsertEventoAuditoria(sinDescripcion)).rejects.toThrow(/descripcion/)

    // b) `descripcion: ""` en la alta suelta.
    const descripcionVacia = eventoValido({
      id: `ev-inv03-${SUFIJO}-vacia`,
      descripcion: "",
    })
    await expect(registrarEventoAuditoria(descripcionVacia)).rejects.toThrow(/descripcion/)
    await expect(upsertEventoAuditoria(descripcionVacia)).rejects.toThrow(/descripcion/)

    // c) El path real de ingesta tampoco la persiste: el evento pasa el filtro
    //    laxo del batch (es un string) y lo frena la puerta validada.
    const res = await postSync([descripcionVacia])
    expect(res.status).toBe(200)
    const cuerpo = (await res.json()) as { persistidos: number }
    expect(cuerpo.persistidos).toBe(0)

    // El rechazo no deja rastro de escritura.
    const despues = await prisma.eventoAuditoria.count({
      where: { comunidadId: COMUNIDAD_ID },
    })
    expect(despues).toBe(antes)
  })
})
