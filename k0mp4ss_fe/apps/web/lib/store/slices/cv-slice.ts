// Slice CV — Visor de Mensajes (Store Split Fase 2, change st-split-fase2).
// Movimiento puro desde lib/store.ts: mismo estado, mismas firmas, mismos
// mensajes y mismo comportamiento. `CompassStore` y `StoreResult` se importan
// type-only (sin ciclo runtime), igual que los otros slices. CV no escribe
// estado de otros dominios; el cross-write inverso (`publicarActaEnCV` de AD,
// P3) muta `avisosCV` con `set()` sobre el store combinado y sigue funcionando
// porque el estado vive en el mismo objeto final.
import type { StateCreator } from "zustand"
import type { CompassStore, StoreResult } from "../../store"
import type { AvisoCV, PlantillaCV } from "@/lib/schemas"
import { validarConEsquema, AvisoCVSchema } from "@/lib/schemas"
import { hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import { plantillasCVSeed } from "@/data/comunidad/plantillas-cv"
import { registrarEvento, upsert } from "../helpers"

export interface CVSlic {
  avisosCV: AvisoCV[]
  plantillasCV: PlantillaCV[]
  saveAvisoCV: (aviso: AvisoCV, creadoPorPersonaId?: string) => StoreResult
  publicarAvisoCV: (id: string) => StoreResult
  caducarAvisosCV: () => StoreResult
  activarPlantillaCV: (id: string) => StoreResult
}

export const cvSlice: StateCreator<CompassStore, [], [], CVSlic> = (set, get) => ({
  avisosCV: [],
  plantillasCV: plantillasCVSeed,

      // --- CV: Visor de Mensajes ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveAvisoCV: (aviso, creadoPorPersonaId) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const esNuevo = !get().avisosCV.some((a) => a.id === aviso.id)
        let candidato: AvisoCV = aviso

        if (esNuevo) {
          // Creación por tercero habilitado: exige flag MP y visto bueno según CF.
          if (creadoPorPersonaId) {
            const autor = get().personas.find(
              (p) => p.id === creadoPorPersonaId
            )
            if (!autor)
              return {
                ok: false,
                error:
                  "No se puede crear el mensaje: el autor no existe en el Maestro de Personas.",
              }
            if (!autor.permiteCreacionManualCV) {
              return {
                ok: false,
                error:
                  "Sin habilitación: la creación manual exige el permiso especial en el perfil del usuario.",
              }
            }
            const vbGlobal = get().configuracion.cvRequiereVistoBueno !== false
            candidato = {
              ...candidato,
              creadoPorPersonaId,
              requiereVistoBueno: vbGlobal,
              estado: "borrador",
              origen: "manual",
              fechaCreacion: hoyISO(),
            }
          } else {
            // Creación directa de administración.
            candidato = {
              ...candidato,
              requiereVistoBueno: false,
              estado: "borrador",
              fechaCreacion: hoyISO(),
            }
          }
        } else {
          const anterior = get().avisosCV.find((a) => a.id === aviso.id)!
          if (anterior.estado === "archivado") {
            return {
              ok: false,
              error:
                "Un aviso Archivado conserva su data para auditoría y no admite ediciones.",
            }
          }
        }

        const validacion = validarConEsquema(AvisoCVSchema, candidato)
        if (!validacion.ok) return validacion
        set((s) => ({ avisosCV: upsert(s.avisosCV, validacion.data) }))
        if (esNuevo) {
          registrarEvento(
            set,
            "CV_DRAFT_CREATED",
            validacion.data.id,
            `Borrador "${validacion.data.titulo}" creado (${validacion.data.tipologia}${validacion.data.requiereVistoBueno ? ", espera visto bueno" : ""}).`,
            "CV"
          )
        } else {
          registrarEvento(
            set,
            "CV_EDITED",
            validacion.data.id,
            `Aviso "${validacion.data.titulo}" editado (${validacion.data.duracionSegundos}s${validacion.data.expiresAt ? `, vence ${validacion.data.expiresAt}` : ""}).`,
            "CV"
          )
        }
        return { ok: true }
      },

      publicarAvisoCV: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const aviso = get().avisosCV.find((a) => a.id === id)
        if (!aviso)
          return {
            ok: false,
            error: "No se puede publicar: el aviso no existe.",
          }
        if (aviso.estado !== "borrador") {
          return {
            ok: false,
            error: `Solo un aviso Borrador puede publicarse (estado actual: ${aviso.estado}).`,
          }
        }
        const publicado: AvisoCV = {
          ...aviso,
          estado: "publicado",
          requiereVistoBueno: false,
          fechaPublicacion: hoyISO(),
        }
        set((s) => ({ avisosCV: upsert(s.avisosCV, publicado) }))
        registrarEvento(
          set,
          "CV_PUBLISHED",
          id,
          `Aviso "${aviso.titulo}" PUBLICADO en el carrusel (${aviso.duracionSegundos}s por ciclo${aviso.actaId ? ", desde acta de directiva" : ""}).`,
          "CV"
        )
        return { ok: true }
      },

      caducarAvisosCV: () => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const hoyStr = hoyISO()
        const vencidos = get().avisosCV.filter(
          (a) => a.estado === "publicado" && a.expiresAt && a.expiresAt < hoyStr
        )
        if (vencidos.length === 0) return { ok: true }
        set((s) => ({
          avisosCV: s.avisosCV.map((a) =>
            vencidos.some((v) => v.id === a.id)
              ? { ...a, estado: "archivado", fechaArchivado: hoyStr }
              : a
          ),
        }))
        for (const aviso of vencidos) {
          registrarEvento(
            set,
            "CV_ARCHIVED",
            aviso.id,
            `Aviso "${aviso.titulo}" expiró automáticamente (${aviso.expiresAt}) y salió del carrusel.`,
            "CV"
          )
        }
        return { ok: true }
      },

      activarPlantillaCV: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const plantilla = get().plantillasCV.find((p) => p.id === id)
        if (!plantilla)
          return {
            ok: false,
            error: "No se puede activar: la plantilla no existe.",
          }
        if (!plantilla.activa)
          return {
            ok: false,
            error: "La plantilla está desactivada por administración.",
          }
        const hoyStr = hoyISO()
        const aviso: AvisoCV = {
          id: generarId("cv"),
          titulo: plantilla.titulo,
          cuerpo: plantilla.cuerpo,
          tipologia: plantilla.tipologia,
          duracionSegundos: plantilla.duracionSegundosSugerida,
          ...(plantilla.imagenUrl ? { imagenUrl: plantilla.imagenUrl } : {}),
          ...(plantilla.videoUrl ? { videoUrl: plantilla.videoUrl } : {}),
          pantallaCompleta: plantilla.pantallaCompleta,
          tags: [...plantilla.tags],
          estado: "publicado",
          requiereVistoBueno: false,
          origen: "plantilla",
          plantillaId: plantilla.id,
          fechaCreacion: hoyStr,
          fechaPublicacion: hoyStr,
        }
        const validacion = validarConEsquema(AvisoCVSchema, aviso)
        if (!validacion.ok) return validacion
        set((s) => ({ avisosCV: upsert(s.avisosCV, validacion.data) }))
        registrarEvento(
          set,
          "CV_PUBLISHED",
          validacion.data.id,
          `Plantilla "${plantilla.titulo}" activada por personal de servicio: aviso PUBLICADO (${aviso.duracionSegundos}s).`,
          "CV"
        )
        return { ok: true }
      },
})
