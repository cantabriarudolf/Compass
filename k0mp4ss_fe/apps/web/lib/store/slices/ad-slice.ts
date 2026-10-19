// Slice AD — Gestión Administrativa (controles de propiedad + actas GD) y su
// puente a CV (publicarActaEnCV). Store Split Fase 2, change st-split-fase2.
// Movimiento puro desde lib/store.ts: mismo estado, mismas firmas y mismos
// mensajes de error. `CompassStore` y `StoreResult` se importan type-only
// (sin ciclo runtime), igual que helpers.ts.
import type { StateCreator } from "zustand"
import type { CompassStore, StoreResult } from "../../store"
import type { ActaGD, AvisoCV, ControlPropiedad } from "@/lib/schemas"
import {
  validarConEsquema,
  ActaGDSchema,
  AvisoCVSchema,
  ControlPropiedadSchema,
} from "@/lib/schemas"
import { hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import {
  esMiembroDirectivaVigente,
  nombrePersona,
  periodoDirectivaVigente,
  refUnidad,
  registrarEvento,
  upsert,
} from "../helpers"

export interface ADSlic {
  controlesPropiedades: ControlPropiedad[]
  actasGD: ActaGD[]
  saveControlPropiedad: (control: ControlPropiedad) => StoreResult
  removeControlPropiedad: (id: string) => StoreResult
  saveActaGD: (acta: ActaGD) => StoreResult
  removeActaGD: (id: string) => StoreResult
  aprobarActaGD: (id: string, personaId: string) => StoreResult
  publicarActaEnCV: (actaId: string) => StoreResult
}

export const adSlice: StateCreator<CompassStore, [], [], ADSlic> = (set, get) => ({
  controlesPropiedades: [],
  actasGD: [],
      // --- AD: Gestión Administrativa ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveControlPropiedad: (control) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(ControlPropiedadSchema, control)
        if (!validacion.ok) return validacion
        if (!get().unidades.some((u) => u.id === validacion.data.unidadId)) {
          return {
            ok: false,
            error:
              "No se puede guardar el control: la unidad no existe en el inventario.",
          }
        }
        // Unicidad: un solo registro de controles por unidad.
        const duplicado = get().controlesPropiedades.find(
          (c) =>
            c.unidadId === validacion.data.unidadId &&
            c.id !== validacion.data.id
        )
        if (duplicado) {
          return {
            ok: false,
            error: `La unidad ya tiene controles registrados (${duplicado.id}).`,
          }
        }
        const anterior = get().controlesPropiedades.find(
          (c) => c.id === validacion.data.id
        )
        set((s) => ({
          controlesPropiedades: upsert(s.controlesPropiedades, validacion.data),
        }))

        const ref = refUnidad(get, validacion.data.unidadId)
        if (!anterior) {
          registrarEvento(
            set,
            "AD_OWNER_CONFIG_CHANGE",
            validacion.data.id,
            `Controles de privacidad creados para ${ref}.`,
            "AD"
          )
        } else {
          const cambios: string[] = []
          if (
            anterior.residenteVeMorosidad !==
            validacion.data.residenteVeMorosidad
          )
            cambios.push(
              `morosidad=${validacion.data.residenteVeMorosidad ? "visible" : "oculta"}`
            )
          if (anterior.residenteVeActas !== validacion.data.residenteVeActas)
            cambios.push(
              `actas=${validacion.data.residenteVeActas ? "visibles" : "ocultas"}`
            )
          if (
            anterior.alertasResidentesActivas !==
            validacion.data.alertasResidentesActivas
          )
            cambios.push(
              `alertas=${validacion.data.alertasResidentesActivas ? "activas" : "silenciadas"}`
            )
          if (cambios.length > 0) {
            registrarEvento(
              set,
              "AD_OWNER_CONFIG_CHANGE",
              validacion.data.id,
              `Controles de ${ref} actualizados: ${cambios.join("; ")}.`,
              "AD"
            )
          }
        }
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeControlPropiedad: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        set((s) => ({
          controlesPropiedades: s.controlesPropiedades.filter(
            (c) => c.id !== id
          ),
        }))
        return { ok: true }
      },

      // --- GD: Gestión de Directiva ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveActaGD: (acta) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(ActaGDSchema, acta)
        if (!validacion.ok) return validacion
        // Integridad referencial: presentes/ausentes deben ser miembros de directiva vigentes.
        for (const idAsistente of [
          ...validacion.data.presentes,
          ...validacion.data.ausentes,
        ]) {
          const persona = get().personas.find((p) => p.id === idAsistente)
          if (!persona) {
            return {
              ok: false,
              error: `No se puede guardar el acta: el asistente "${idAsistente}" no existe en el Maestro de Personas.`,
            }
          }
          const vigenteActa = periodoDirectivaVigente(get())
          if (!esMiembroDirectivaVigente(persona, vigenteActa?.id)) {
            return {
              ok: false,
              error: `No se puede guardar el acta: ${persona.nombres} ${persona.apellidos} no es miembro de la directiva (sin extensión de gobernanza).`,
            }
          }
        }
            const esNueva = !get().actasGD.some((a) => a.id === validacion.data.id)
            if (!validacion.data.periodoId) {
              const vigenteActa = periodoDirectivaVigente(get())
              if (vigenteActa) validacion.data.periodoId = vigenteActa.id
            }
            set((s) => ({ actasGD: upsert(s.actasGD, validacion.data) }))
        if (esNueva) {
          registrarEvento(
            set,
            "GD_ACTA_CREATED",
            validacion.data.id,
            `Acta de reunión del ${validacion.data.fecha} registrada (${validacion.data.lugar}).`,
            "GD"
          )
          for (const presenteId of validacion.data.presentes) {
            registrarEvento(
              set,
              "GD_ASISTENCIA_REG",
              presenteId,
              `Asistencia registrada (${nombrePersona(get, presenteId)}) en acta ${validacion.data.id}.`,
              "GD"
            )
          }
        }
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeActaGD: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        set((s) => ({ actasGD: s.actasGD.filter((a) => a.id !== id) }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      aprobarActaGD: (id, personaId) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const acta = get().actasGD.find((a) => a.id === id)
        if (!acta)
          return { ok: false, error: "No se puede aprobar: el acta no existe." }
        if (acta.estado === "publicada")
          return { ok: false, error: "El acta ya está publicada." }
        const firmante = get().personas.find((p) => p.id === personaId)
        const vigenteFirma = periodoDirectivaVigente(get())
        if (
          !firmante ||
          !esMiembroDirectivaVigente(firmante, vigenteFirma?.id)
        ) {
          return {
            ok: false,
            error:
              "Solo un miembro vigente de la directiva puede aprobar el acta.",
          }
        }
        if (acta.aprobaciones.includes(personaId)) {
          return { ok: false, error: "Esta directiva ya aprobó el acta." }
        }
        const aprobaciones = [...acta.aprobaciones, personaId]
        // Quórum 100% de la directiva vigente (fichas del período vigente; legado sin período incluido).
        const vigenteQuorum = periodoDirectivaVigente(get())
        const directivaVigente = get()
          .personas.filter((p) =>
            esMiembroDirectivaVigente(p, vigenteQuorum?.id)
          )
          .map((p) => p.id)
        const quorumCompleto = directivaVigente.every((idMiembro) =>
          aprobaciones.includes(idMiembro)
        )
        if (quorumCompleto) {
          const publicada: ActaGD = {
            ...acta,
            aprobaciones,
            estado: "publicada",
            fechaPublicacion: hoyISO(),
            avisoCVReferencia: "pendiente",
          }
          set((s) => ({ actasGD: upsert(s.actasGD, publicada) }))

          registrarEvento(
            set,
            "GD_ACTA_APPROVED",
            id,
            `Acta ${id} aprobada por ${nombrePersona(get, personaId)} y PUBLICADA (quórum 100%).`,
            "GD"
          )

          // Publicación automática: notificación formal a todos los propietarios
          // (acto de gobernanza; no pasa por el gate de alertas operativas).
          const propietarios = new Set(
            get()
              .vinculos.filter((v) => v.rol === "propietario" && !v.fechaFin)
              .map((v) => v.personaId)
          )
          for (const idPropietario of propietarios) {
            get().notify({
              destinatarioRol: "propietario",
              destinatarioPersonaId: idPropietario,
              asunto: `Nueva acta publicada (${publicada.fecha})`,
              cuerpo: `Ya está disponible el acta de la reunión del ${publicada.fecha} en ${publicada.lugar}. Revisa el repositorio de actas.`,
              moduloOrigen: "GD",
            })
          }
        } else {
          set((s) => ({
            actasGD: s.actasGD.map((a) =>
              a.id === id ? { ...a, aprobaciones } : a
            ),
          }))
          registrarEvento(
            set,
            "GD_ACTA_APPROVED",
            id,
            `${nombrePersona(get, personaId)} aprobó el acta ${id}. Pendientes: ${directivaVigente.filter((x) => !aprobaciones.includes(x)).length}.`,
            "GD"
          )
        }
        return { ok: true }
      },

      // Cross-write permitido en Fase 2: `publicarActaEnCV` es una acción de AD/GD
      // pero escribe `avisosCV` (dominio CV), que en esta ventana todavía vive en
      // `lib/store.ts`. Se muta con `get()`/`set()` como antes; cuando P5 extraiga
      // el slice CV, la escritura cruzada debe seguir funcionando igual.
      publicarActaEnCV: (actaId) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const acta = get().actasGD.find((a) => a.id === actaId)
        if (!acta)
          return {
            ok: false,
            error: "No se puede publicar: el acta no existe.",
          }
        if (acta.estado !== "publicada") {
          return {
            ok: false,
            error:
              "Solo un acta Publicada por quórum puede difundirse en el visor.",
          }
        }
        if (acta.avisoCVReferencia && acta.avisoCVReferencia !== "pendiente") {
          return {
            ok: false,
            error: `El acta ya fue publicada en el visor (aviso ${acta.avisoCVReferencia}).`,
          }
        }
        const hoyStr = hoyISO()
        const temas =
          acta.tablaTemas.length > 0
            ? `Temas: ${acta.tablaTemas.join("; ")}. `
            : ""
        const minuta = acta.minuta ? acta.minuta.slice(0, 240) : ""
        const aviso: AvisoCV = {
          id: generarId("cv"),
          titulo: `Acta de reunión del ${acta.fecha}`,
          cuerpo:
            `Reunión de directiva en ${acta.lugar}. ${temas}${minuta}`.trim(),
          tipologia: "info",
          duracionSegundos: 15,
          pantallaCompleta: false,
          tags: ["directiva", "acta"],
          estado: "publicado",
          requiereVistoBueno: false,
          origen: "acta_gd",
          actaId: acta.id,
          fechaCreacion: hoyStr,
          fechaPublicacion: hoyStr,
        }
        const validacion = validarConEsquema(AvisoCVSchema, aviso)
        if (!validacion.ok) return validacion
        set((s) => ({
          avisosCV: upsert(s.avisosCV, validacion.data),
          actasGD: s.actasGD.map((a) =>
            a.id === actaId
              ? { ...a, avisoCVReferencia: validacion.data.id }
              : a
          ),
        }))
        registrarEvento(
          set,
          "CV_PUBLISHED",
          validacion.data.id,
          `Aviso "${aviso.titulo}" PUBLICADO desde acta ${acta.id}; referencia avisoCVReferencia materializada.`,
          "CV"
        )
        return { ok: true }
      },
})
