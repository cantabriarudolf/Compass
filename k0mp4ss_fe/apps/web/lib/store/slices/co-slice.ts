// Slice CO — Comunicación con Vecinos (Store Split Fase 2, change st-split-fase2).
// Movimiento puro desde lib/store.ts: mismo estado, mismas firmas y mismos
// mensajes de error. `CompassStore` y `StoreResult` se importan type-only
// (sin ciclo runtime), igual que los otros slices. Los helpers puros de CO
// (`resolverVariablesCO`, `rolDestinatarioCO`) ya vivían en `../helpers` y se
// importan desde ahí, sin duplicarlos.
import type { StateCreator } from "zustand"
import type { CompassStore, StoreResult } from "../../store"
import type {
  PlantillaCO,
  EnvioCO,
  MensajeBuzonCO,
  EstadoBuzonCO,
  DocumentoCO,
} from "@/lib/schemas"
import {
  validarConEsquema,
  PlantillaCOSchema,
  EnvioCOSchema,
  MensajeBuzonCOSchema,
  DocumentoCOSchema,
} from "@/lib/schemas"
import { hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import { plantillasComunicacion } from "@/data/comunidad/plantillas-co"
import {
  registrarEvento,
  resolverVariablesCO,
  rolDestinatarioCO,
  upsert,
} from "../helpers"

export interface COSlic {
  plantillasCO: PlantillaCO[]
  enviosCO: EnvioCO[]
  mensajesBuzonCO: MensajeBuzonCO[]
  documentosCO: DocumentoCO[]
  savePlantillaCO: (plantilla: PlantillaCO) => StoreResult
  removePlantillaCO: (id: string) => StoreResult
  saveEnvioCO: (envio: EnvioCO) => StoreResult
  registrarLecturaEnvioCO: (id: string, personaId: string) => StoreResult
  saveMensajeBuzonCO: (mensaje: MensajeBuzonCO) => StoreResult
  responderMensajeBuzonCO: (
    id: string,
    respuesta: { autor: string; texto: string; compromisos?: string }
  ) => StoreResult
  cambiarEstadoBuzonCO: (id: string, estado: EstadoBuzonCO) => StoreResult
  removeMensajeBuzonCO: (id: string) => StoreResult
  saveDocumentoCO: (documento: DocumentoCO) => StoreResult
  removeDocumentoCO: (id: string) => StoreResult
}

export const coSlice: StateCreator<CompassStore, [], [], COSlic> = (set, get) => ({
  // Maestro de plantillas sembrado: mismo módulo seed que `seedData()` en
  // lib/store.ts (comportamiento idéntico al monolito).
  plantillasCO: plantillasComunicacion,
  enviosCO: [],
  mensajesBuzonCO: [],
  documentosCO: [],

          // --- CO: Comunicación con Vecinos ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      savePlantillaCO: (plantilla) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(PlantillaCOSchema, plantilla)
        if (!validacion.ok) return validacion
        set((s) => ({ plantillasCO: upsert(s.plantillasCO, validacion.data) }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removePlantillaCO: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const enUso = get().enviosCO.filter((e) => e.plantillaId === id)
        if (enUso.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar la plantilla: ${enUso.length} envío(s) la utilizan.`,
          }
        }
        set((s) => ({
          plantillasCO: s.plantillasCO.filter((p) => p.id !== id),
        }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      saveEnvioCO: (envio) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(EnvioCOSchema, envio)
        if (!validacion.ok) return validacion
        if (
          validacion.data.plantillaId &&
          !get().plantillasCO.some((p) => p.id === validacion.data!.plantillaId)
        ) {
          return {
            ok: false,
            error:
              "No se puede enviar: la plantilla indicada no existe en el Maestro de Mensajes.",
          }
        }
        for (const d of validacion.data.destinatarios) {
          if (!get().personas.some((p) => p.id === d.personaId)) {
            return {
              ok: false,
              error: `No se puede enviar: el destinatario "${d.personaId}" no existe en el Maestro de Personas.`,
            }
          }
          if (d.unidadId && !get().unidades.some((u) => u.id === d.unidadId)) {
            return {
              ok: false,
              error: `No se puede enviar: la unidad "${d.unidadId}" del destinatario no existe.`,
            }
          }
        }
        // Idempotencia bulk: solo el alta nueva dispara notificaciones y evento.
        const esNuevo = !get().enviosCO.some((e) => e.id === validacion.data.id)
        set((s) => ({ enviosCO: upsert(s.enviosCO, validacion.data) }))
        if (!esNuevo) return { ok: true }

        const nombreDe = (personaId: string): string => {
          const p = get().personas.find((x) => x.id === personaId)
          return p ? `${p.nombres} ${p.apellidos}` : ""
        }
        for (const d of validacion.data.destinatarios) {
          get().notify({
            destinatarioRol: rolDestinatarioCO(get, d.personaId),
            destinatarioPersonaId: d.personaId,
            asunto: resolverVariablesCO(
              get,
              validacion.data.asunto,
              nombreDe(d.personaId)
            ),
            cuerpo: resolverVariablesCO(
              get,
              validacion.data.cuerpo,
              nombreDe(d.personaId)
            ),
            moduloOrigen: "CO",
            ...(d.unidadId ? { unidadId: d.unidadId } : {}),
          })
        }
        registrarEvento(
          set,
          "CO_SEND_MASSIVE",
          validacion.data.id,
          `Envío masivo "${validacion.data.asunto}" a ${validacion.data.destinatarios.length} destinatario(s).`,
          "CO"
        )
        return { ok: true }
      },

      registrarLecturaEnvioCO: (id, personaId) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const envio = get().enviosCO.find((e) => e.id === id)
        if (!envio)
          return {
            ok: false,
            error: "No se puede confirmar lectura: el envío no existe.",
          }
        if (envio.lecturas.includes(personaId)) return { ok: true }
        set((s) => ({
          enviosCO: s.enviosCO.map((e) =>
            e.id === id ? { ...e, lecturas: [...e.lecturas, personaId] } : e
          ),
        }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      saveMensajeBuzonCO: (mensaje) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const esNuevo = !get().mensajesBuzonCO.some((m) => m.id === mensaje.id)
        // Folio BUZ-#### único por construcción (se ignora el entrante en alta);
        // estado inicial forzado a Recibido.
        let candidato: MensajeBuzonCO = mensaje
        if (esNuevo) {
          const numeros = get()
            .mensajesBuzonCO.map((m) =>
              Number.parseInt(m.folio.replace(/^BUZ-/, ""), 10)
            )
            .filter((n) => Number.isFinite(n))
          const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
          candidato = {
            ...mensaje,
            folio: `BUZ-${String(siguiente).padStart(4, "0")}`,
          }
        }
        const validacion = validarConEsquema(MensajeBuzonCOSchema, candidato)
        if (!validacion.ok) return validacion
        if (
          validacion.data.reportantePersonaId &&
          !get().personas.some(
            (p) => p.id === validacion.data!.reportantePersonaId
          )
        ) {
          return {
            ok: false,
            error:
              "No se puede registrar: el reportante no existe en el Maestro de Personas.",
          }
        }
        let registro = validacion.data
        if (esNuevo) {
          registro = {
            ...registro,
            estado: "recibido",
            respuestas: [],
          }
        }
        set((s) => ({ mensajesBuzonCO: upsert(s.mensajesBuzonCO, registro) }))
        if (esNuevo) {
          registrarEvento(
            set,
            "CO_TICKET_CREATED",
            registro.id,
            `Ticket ${registro.folio} (${registro.clasificacion}) ingresado por ${registro.reportanteNombre}: ${registro.asunto}.`,
            "CO"
          )
        }
        return { ok: true }
      },

      responderMensajeBuzonCO: (id, respuesta) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const mensaje = get().mensajesBuzonCO.find((m) => m.id === id)
        if (!mensaje)
          return {
            ok: false,
            error: "No se puede responder: el ticket del buzón no existe.",
          }
        if (respuesta.texto.trim().length === 0)
          return { ok: false, error: "La respuesta no puede estar vacía." }
        const nueva: MensajeBuzonCO = {
          ...mensaje,
          estado: mensaje.estado === "recibido" ? "en_gestion" : mensaje.estado,
          respuestas: [
            ...mensaje.respuestas,
            {
              id: generarId("resp"),
              autor: respuesta.autor,
              texto: respuesta.texto,
              compromisos: respuesta.compromisos?.trim() || undefined,
              fecha: hoyISO(),
            },
          ],
        }
        set((s) => ({ mensajesBuzonCO: upsert(s.mensajesBuzonCO, nueva) }))
        registrarEvento(
          set,
          "CO_TICKET_RESPONDIDO",
          id,
          `Respuesta de administración al ticket ${nueva.folio}${mensaje.estado === "recibido" ? " (Recibido → En Gestión)" : ""}.`,
          "CO"
        )
        if (mensaje.estado === "recibido" && nueva.estado !== mensaje.estado) {
          registrarEvento(
            set,
            "CO_TICKET_ESTADO",
            id,
            `Ticket ${nueva.folio}: Recibido → En Gestión.`,
            "CO"
          )
        }
        return { ok: true }
      },

      cambiarEstadoBuzonCO: (id, estado) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const mensaje = get().mensajesBuzonCO.find((m) => m.id === id)
        if (!mensaje)
          return {
            ok: false,
            error: "No se puede actualizar: el ticket del buzón no existe.",
          }
        if (mensaje.estado === estado) return { ok: true }
        const TRANSICIONES: Record<string, EstadoBuzonCO[]> = {
          recibido: ["en_gestion"],
          en_gestion: ["resuelto", "cerrado"],
          resuelto: ["cerrado"],
          cerrado: [],
        }
        if (!TRANSICIONES[mensaje.estado]?.includes(estado)) {
          return {
            ok: false,
            error: `Transición inválida: un ticket ${mensaje.estado} no puede pasar a ${estado}.`,
          }
        }
        set((s) => ({
          mensajesBuzonCO: s.mensajesBuzonCO.map((m) =>
            m.id === id ? { ...m, estado } : m
          ),
        }))
        registrarEvento(
          set,
          "CO_TICKET_ESTADO",
          id,
          `Ticket ${mensaje.folio}: ${mensaje.estado} → ${estado}.`,
          "CO"
        )
        if (estado === "resuelto" && mensaje.reportantePersonaId) {
          get().notify({
            destinatarioRol: rolDestinatarioCO(
              get,
              mensaje.reportantePersonaId
            ),
            destinatarioPersonaId: mensaje.reportantePersonaId,
            asunto: `Tu ticket ${mensaje.folio} fue resuelto`,
            cuerpo: `La administración resolvió tu ${mensaje.clasificacion} "${mensaje.asunto}". Gracias por ayudarnos a mejorar.`,
            moduloOrigen: "CO",
            ...(mensaje.unidadId ? { unidadId: mensaje.unidadId } : {}),
          })
        }
        return { ok: true }
      },

      removeMensajeBuzonCO: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        set((s) => ({
          mensajesBuzonCO: s.mensajesBuzonCO.filter((m) => m.id !== id),
        }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      saveDocumentoCO: (documento) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(DocumentoCOSchema, documento)
        if (!validacion.ok) return validacion
        set((s) => ({ documentosCO: upsert(s.documentosCO, validacion.data) }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeDocumentoCO: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        set((s) => ({
          documentosCO: s.documentosCO.filter((d) => d.id !== id),
        }))
        return { ok: true }
      },
})
