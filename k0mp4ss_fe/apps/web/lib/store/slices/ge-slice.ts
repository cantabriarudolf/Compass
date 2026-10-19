// Slice GE — Gestión de Solicitudes (Store Split Fase 2, change st-split-fase2).
// Movimiento puro desde lib/store.ts: mismo estado, mismas firmas, mismos
// mensajes y mismo comportamiento. `CompassStore` y `StoreResult` se importan
// type-only (sin ciclo runtime), igual que los otros slices. GE no escribe
// estado de otros dominios: sólo lo lee por `get()` (personas, unidades,
// mensajesBuzonCO) y notifica vía `get().notify(...)`.
import type { StateCreator } from "zustand"
import type { CompassStore, StoreResult } from "../../store"
import type { SolicitudGE, EstadoSolicitudGE } from "@/lib/schemas"
import { validarConEsquema, SolicitudGESchema } from "@/lib/schemas"
import { ahoraISO, hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import { nombrePersona, registrarEvento, rolDestinatarioCO, upsert } from "../helpers"

export interface GESlic {
  solicitudesGE: SolicitudGE[]
  saveSolicitudGE: (solicitud: SolicitudGE) => StoreResult
  abrirSolicitudGE: (id: string) => StoreResult
  responderSolicitudGE: (
    id: string,
    comentario: { autorRol: "administracion" | "solicitante"; texto: string }
  ) => StoreResult
  resolverSolicitudGE: (id: string, resolucion: string) => StoreResult
  cerrarSolicitudGE: (id: string) => StoreResult
  removeSolicitudGE: (id: string) => StoreResult
}

export const geSlice: StateCreator<CompassStore, [], [], GESlic> = (set, get) => ({
  solicitudesGE: [],

      // --- GE: Gestión de Solicitudes ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveSolicitudGE: (solicitud) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const esNueva = !get().solicitudesGE.some((s) => s.id === solicitud.id)
        let candidato: SolicitudGE = solicitud
        if (esNueva) {
          const numeros = get()
            .solicitudesGE.map((s) =>
              Number.parseInt(s.folio.replace(/^GE-/, ""), 10)
            )
            .filter((n) => Number.isFinite(n))
          const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
          candidato = {
            ...solicitud,
            folio: `GE-${String(siguiente).padStart(4, "0")}`,
          }
        }
        const validacion = validarConEsquema(SolicitudGESchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data

        if (
          registro.solicitantePersonaId &&
          !get().personas.some((p) => p.id === registro.solicitantePersonaId)
        ) {
          return {
            ok: false,
            error:
              "No se puede crear la solicitud: el solicitante no existe en el Maestro de Personas.",
          }
        }
        if (
          registro.unidadId &&
          !get().unidades.some((u) => u.id === registro.unidadId)
        ) {
          return {
            ok: false,
            error:
              "No se puede crear la solicitud: la unidad indicada no existe en el inventario.",
          }
        }
        if (registro.tipo === "grabaciones") {
          if (!registro.unidadId) {
            return {
              ok: false,
              error:
                "Las solicitudes de grabaciones deben vincularse a una unidad/residente del maestro.",
            }
          }
          if (!registro.detalleGrabaciones) {
            return {
              ok: false,
              error:
                "Las solicitudes de grabaciones requieren fecha/hora del suceso y justificación extendida.",
            }
          }
        }
        if (registro.tipo === "insumos" && !registro.detalleInsumos) {
          return {
            ok: false,
            error:
              "Las solicitudes de insumos requieren área de destino y material solicitado (catálogo pendiente a IR).",
          }
        }
        if (registro.tipo === "buzon") {
          if (
            !registro.mensajeBuzonId ||
            !get().mensajesBuzonCO.some((m) => m.id === registro.mensajeBuzonId)
          ) {
            return {
              ok: false,
              error:
                "Los tickets del buzón deben referenciar un mensaje existente de CO.",
            }
          }
        }

        set((s) => ({ solicitudesGE: upsert(s.solicitudesGE, registro) }))
        if (esNueva) {
          registrarEvento(
            set,
            "GE_TICKET_CREATED",
            registro.id,
            `Ticket ${registro.folio} (${registro.tipo}) creado: ${registro.titulo}.`,
            "GE"
          )
          if (registro.solicitantePersonaId) {
            get().notify({
              destinatarioRol: rolDestinatarioCO(
                get,
                registro.solicitantePersonaId
              ),
              destinatarioPersonaId: registro.solicitantePersonaId,
              asunto: `Recibimos tu solicitud ${registro.folio}`,
              cuerpo: `Tu solicitud "${registro.titulo}" fue ingresada con estado Nuevo. Te avisaremos en cada avance.`,
              moduloOrigen: "GE",
              ...(registro.unidadId ? { unidadId: registro.unidadId } : {}),
            })
          }
        }
        return { ok: true }
      },

      abrirSolicitudGE: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const ticket = get().solicitudesGE.find((s) => s.id === id)
        if (!ticket)
          return { ok: false, error: "No se puede abrir: el ticket no existe." }
        if (ticket.estado !== "nuevo") return { ok: true }
        set((s) => ({
          solicitudesGE: s.solicitudesGE.map((t) =>
            t.id === id
              ? {
                  ...t,
                  estado: "en_revision",
                  historialEstados: [
                    ...t.historialEstados,
                    { de: t.estado, a: "en_revision", fecha: ahoraISO() },
                  ],
                }
              : t
          ),
        }))
        registrarEvento(
          set,
          "GE_TICKET_STATE_CHANGE",
          id,
          `Ticket ${ticket.folio}: Nuevo → En Revisión (primera lectura de administración).`,
          "GE"
        )
        return { ok: true }
      },

      responderSolicitudGE: (id, comentario) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const ticket = get().solicitudesGE.find((s) => s.id === id)
        if (!ticket)
          return {
            ok: false,
            error: "No se puede responder: el ticket no existe.",
          }
        if (comentario.texto.trim().length === 0)
          return { ok: false, error: "El comentario no puede estar vacío." }
        if (["resuelto", "cerrado"].includes(ticket.estado)) {
          return {
            ok: false,
            error: `No se puede comentar un ticket ${ticket.estado}.`,
          }
        }

        let nuevoEstado: EstadoSolicitudGE = ticket.estado
        if (
          comentario.autorRol === "administracion" &&
          ["en_revision", "en_proceso"].includes(ticket.estado)
        ) {
          nuevoEstado = "requiere_accion_vecino"
        } else if (
          comentario.autorRol === "solicitante" &&
          ticket.estado === "requiere_accion_vecino"
        ) {
          nuevoEstado = "en_proceso"
        }

        set((s) => ({
          solicitudesGE: s.solicitudesGE.map((t) =>
            t.id === id
              ? {
                  ...t,
                  estado: nuevoEstado,
                  comentarios: [
                    ...t.comentarios,
                    {
                      id: generarId("com"),
                      autorRol: comentario.autorRol,
                      texto: comentario.texto.trim(),
                      fecha: ahoraISO(),
                    },
                  ],
                  ...(nuevoEstado !== t.estado
                    ? {
                        historialEstados: [
                          ...t.historialEstados,
                          { de: t.estado, a: nuevoEstado, fecha: ahoraISO() },
                        ],
                      }
                    : {}),
                }
              : t
          ),
        }))

        if (nuevoEstado === "requiere_accion_vecino") {
          registrarEvento(
            set,
            "GE_TICKET_STATE_CHANGE",
            id,
            `Ticket ${ticket.folio}: administración requiere acción del vecino.`,
            "GE"
          )
          if (ticket.solicitantePersonaId) {
            get().notify({
              destinatarioRol: rolDestinatarioCO(
                get,
                ticket.solicitantePersonaId
              ),
              destinatarioPersonaId: ticket.solicitantePersonaId,
              asunto: `Tu solicitud ${ticket.folio} requiere más información`,
              cuerpo: comentario.texto,
              moduloOrigen: "GE",
              ...(ticket.unidadId ? { unidadId: ticket.unidadId } : {}),
            })
          }
        } else if (nuevoEstado === "en_proceso") {
          registrarEvento(
            set,
            "GE_TICKET_STATE_CHANGE",
            id,
            `Ticket ${ticket.folio}: el solicitante respondió → En Proceso.`,
            "GE"
          )
          get().notify({
            destinatarioRol: "administracion",
            asunto: `El vecino respondió al ticket ${ticket.folio}`,
            cuerpo: `${nombrePersona(get, ticket.solicitantePersonaId ?? "")}: "${comentario.texto}". El ticket volvió al lado de la administración.`,
            moduloOrigen: "GE",
          })
        } else {
          registrarEvento(
            set,
            "GE_TICKET_COMMENT",
            id,
            `Nuevo comentario (${comentario.autorRol}) en ticket ${ticket.folio}.`,
            "GE"
          )
        }
        return { ok: true }
      },

      resolverSolicitudGE: (id, resolucion) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const ticket = get().solicitudesGE.find((s) => s.id === id)
        if (!ticket)
          return {
            ok: false,
            error: "No se puede resolver: el ticket no existe.",
          }
        if (ticket.estado === "cerrado")
          return { ok: false, error: "El ticket ya está cerrado." }
        if (resolucion.trim().length === 0)
          return {
            ok: false,
            error: "La resolución es obligatoria para resolver el ticket.",
          }

        set((s) => ({
          solicitudesGE: s.solicitudesGE.map((t) =>
            t.id === id
              ? {
                  ...t,
                  estado: "resuelto",
                  resolucion: resolucion.trim(),
                  historialEstados: [
                    ...t.historialEstados,
                    { de: t.estado, a: "resuelto", fecha: ahoraISO() },
                  ],
                }
              : t
          ),
        }))
        registrarEvento(
          set,
          "GE_TICKET_STATE_CHANGE",
          id,
          `Ticket ${ticket.folio}: ${ticket.estado} → Resuelto.`,
          "GE"
        )
        registrarEvento(
          set,
          "GE_TICKET_RESOLVED",
          id,
          `Ticket ${ticket.folio} resuelto: ${resolucion.trim()}`,
          "GE"
        )
        if (ticket.solicitantePersonaId) {
          get().notify({
            destinatarioRol: rolDestinatarioCO(
              get,
              ticket.solicitantePersonaId
            ),
            destinatarioPersonaId: ticket.solicitantePersonaId,
            asunto: `Tu solicitud ${ticket.folio} fue resuelta`,
            cuerpo: resolucion.trim(),
            moduloOrigen: "GE",
            ...(ticket.unidadId ? { unidadId: ticket.unidadId } : {}),
          })
        }
        return { ok: true }
      },

      cerrarSolicitudGE: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const ticket = get().solicitudesGE.find((s) => s.id === id)
        if (!ticket)
          return {
            ok: false,
            error: "No se puede cerrar: el ticket no existe.",
          }
        if (ticket.estado !== "resuelto") {
          return {
            ok: false,
            error: "Solo un ticket Resuelto puede pasar a Cerrado.",
          }
        }
        set((s) => ({
          solicitudesGE: s.solicitudesGE.map((t) =>
            t.id === id
              ? {
                  ...t,
                  estado: "cerrado",
                  fechaCierre: hoyISO(),
                  historialEstados: [
                    ...t.historialEstados,
                    { de: "resuelto", a: "cerrado", fecha: ahoraISO() },
                  ],
                }
              : t
          ),
        }))
        registrarEvento(
          set,
          "GE_TICKET_STATE_CHANGE",
          id,
          `Ticket ${ticket.folio}: Resuelto → Cerrado (SLA registrado).`,
          "GE"
        )
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeSolicitudGE: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        set((s) => ({
          solicitudesGE: s.solicitudesGE.filter((t) => t.id !== id),
        }))
        return { ok: true }
      },
})
