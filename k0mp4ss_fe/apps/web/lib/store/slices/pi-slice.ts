// Slice PI/D3 — Portal Inmobiliario y notificaciones simuladas (Store Split Fase 2, change st-split-fase2).
// Movimiento puro desde lib/store.ts: mismo estado, mismas firmas y mismos
// mensajes de error. `CompassStore` y `StoreResult` se importan type-only
// (sin ciclo runtime), igual que helpers.ts.
import type { StateCreator } from "zustand"
import type { CompassStore, StoreResult } from "../../store"
import type {
  LeadPortal,
  Notificacion,
  OperacionPortal,
  PublicacionPortal,
} from "@/lib/schemas"
import { validarConEsquema, NotificacionSchema } from "@/lib/schemas"
import { hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import { MAX_EVENTOS, refUnidad, registrarEvento, upsert } from "../helpers"

export interface PISlic {
  publicacionesPortal: PublicacionPortal[]
  leadsPortal: LeadPortal[]
  notificaciones: Notificacion[]
  removePublicacionPortal: (id: string) => StoreResult
  syncPublicacionesDesdeVinculos: (unidadId: string) => void
  notify: (
    notificacion: Omit<Notificacion, "id" | "leida" | "canal" | "fecha"> & {
      canal?: Notificacion["canal"]
      unidadId?: string
    }
  ) => void
}

export const piSlice: StateCreator<CompassStore, [], [], PISlic> = (set, get) => ({
  publicacionesPortal: [],
  leadsPortal: [],
  notificaciones: [],
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removePublicacionPortal: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const leads = get().leadsPortal.filter((l) => l.publicacionId === id)
        if (leads.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar la publicación: tiene ${leads.length} lead(s) asociado(s).`,
          }
        }
        set((s) => ({
          publicacionesPortal: s.publicacionesPortal.filter((p) => p.id !== id),
        }))
        return { ok: true }
      },

      syncPublicacionesDesdeVinculos: (unidadId) => {
        const s = get()
        const claveEstado = (estadoId?: string): string => {
          if (!estadoId) return ""
          const e = s.maestros.estadosInmobiliarios.find(
            (x) => x.id === estadoId
          )
          if (!e) return ""
          return `${e.id} ${e.nombre}`
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
        }
        const esOferta = (clave: string): boolean =>
          clave.includes("arriendo") || clave.includes("venta")

        const vigente = s.vinculos.find(
          (v) =>
            v.unidadId === unidadId &&
            v.rol === "propietario" &&
            !v.fechaFin &&
            esOferta(claveEstado(v.estadoOcupacionPropiedad))
        )
        const existente = s.publicacionesPortal.find(
          (p) => p.unidadId === unidadId
        )

        if (vigente) {
          const operacion: OperacionPortal = claveEstado(
            vigente.estadoOcupacionPropiedad
          ).includes("venta")
            ? "venta"
            : "arriendo"
          if (!existente) {
            const nueva: PublicacionPortal = {
              id: generarId("pub"),
              unidadId,
              operacion,
              precio: 0,
              imagenes: [],
              activa: true,
              fechaPublicacion: hoyISO(),
            }
            set((st) => ({
              publicacionesPortal: upsert(st.publicacionesPortal, nueva),
            }))
            registrarEvento(
              set,
              "PI_PROPERTY_LISTED",
              nueva.id,
              `Trigger inmobiliario: ${refUnidad(get, unidadId)} publicada como ${operacion}.`,
              "PI"
            )
          } else {
            const cambios: Partial<PublicacionPortal> = {}
            if (!existente.activa) cambios.activa = true
            if (existente.operacion !== operacion) cambios.operacion = operacion
            if (Object.keys(cambios).length > 0) {
              set((st) => ({
                publicacionesPortal: st.publicacionesPortal.map((p) =>
                  p.id === existente.id ? { ...p, ...cambios } : p
                ),
              }))
              if (cambios.activa) {
                registrarEvento(
                  set,
                  "PI_PROPERTY_LISTED",
                  existente.id,
                  `Trigger inmobiliario: ${refUnidad(get, unidadId)} vuelve a la vitrina como ${operacion}.`,
                  "PI"
                )
              }
            }
          }
        } else if (existente?.activa) {
          set((st) => ({
            publicacionesPortal: st.publicacionesPortal.map((p) =>
              p.id === existente.id ? { ...p, activa: false } : p
            ),
          }))
          registrarEvento(
            set,
            "PI_PROPERTY_UNLISTED",
            existente.id,
            `Trigger inmobiliario: ${refUnidad(get, unidadId)} retirada de la vitrina.`,
            "PI"
          )
        }
      },

      // --- Notificaciones simuladas (D3) ---
      notify: (notificacion) => {
        if (!get().hasHydrated) return
        // AD: el propietario puede silenciar las alertas automáticas hacia los
        // residentes de su unidad ("Gestión de Alertas Residentes"). Los actos
        // formales de gobernanza (GD) no pasan por este gate.
        if (
          notificacion.destinatarioRol === "residente" &&
          notificacion.unidadId
        ) {
          const control = get().controlesPropiedades.find(
            (c) => c.unidadId === notificacion.unidadId
          )
          if (control && !control.alertasResidentesActivas) return
        }
        const completa: Notificacion = {
          id: generarId("notif"),
          destinatarioRol: notificacion.destinatarioRol,
          destinatarioPersonaId: notificacion.destinatarioPersonaId,
          asunto: notificacion.asunto,
          cuerpo: notificacion.cuerpo,
          canal: notificacion.canal ?? "email_simulado",
          moduloOrigen: notificacion.moduloOrigen,
          fecha: hoyISO(),
          leida: false,
        }
        const validacion = validarConEsquema(NotificacionSchema, completa)
        if (!validacion.ok) return
        set((s) => ({
          notificaciones: [
            ...s.notificaciones.slice(-(MAX_EVENTOS - 1)),
            validacion.data,
          ],
        }))
      },
})
