// Slice IR — Inventario y Recursos (Store Split Fase 2, change st-split-fase2).
// Movimiento puro desde lib/store.ts: mismo estado, mismas firmas y mismos
// mensajes de error. `CompassStore` y `StoreResult` se importan type-only
// (sin ciclo runtime), igual que helpers.ts.
import type { StateCreator } from "zustand"
import type { CompassStore, StoreResult } from "../../store"
import type { RecursoIR, SolicitudInsumoIR, EntregaEPP } from "@/lib/schemas"
import {
  validarConEsquema,
  RecursoIRSchema,
  SolicitudInsumoIRSchema,
  EntregaEPPSchema,
} from "@/lib/schemas"
import { hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import {
  upsert,
  nombrePersona,
  rolDestinatarioCO,
  siguienteCodigoIR,
  registrarEvento,
} from "../helpers"

export interface IRSlic {
  activosIR: RecursoIR[]
  solicitudesInsumoIR: SolicitudInsumoIR[]
  entregasEPP: EntregaEPP[]
  saveRecursoIR: (recurso: RecursoIR) => StoreResult
  removeRecursoIR: (id: string) => StoreResult
  saveSolicitudInsumoIR: (solicitud: SolicitudInsumoIR) => StoreResult
  resolverComodinIR: (
    id: string,
    decision: "aprobar_crear" | "sustituir" | "rechazar",
    opts?: { recursoSustitutoId?: string; justificacion?: string }
  ) => StoreResult
  entregarSolicitudInsumoIR: (id: string) => StoreResult
  registrarEntregaEPP: (entrega: EntregaEPP) => StoreResult
  asignarAccesoIR: (recursoId: string, personaId: string) => StoreResult
  devolverAccesoIR: (recursoId: string) => StoreResult
}

export const irSlice: StateCreator<CompassStore, [], [], IRSlic> = (set, get) => ({
  activosIR: [],
  solicitudesInsumoIR: [],
  entregasEPP: [],

      // --- IR: Inventario y Recursos ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveRecursoIR: (recurso) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const esNuevo = !get().activosIR.some((r) => r.id === recurso.id)
        let candidato: RecursoIR = recurso
        if (esNuevo) {
          candidato = {
            ...recurso,
            codigo: recurso.codigo ?? siguienteCodigoIR(get),
            estadoActivo: recurso.estadoActivo ?? "disponible",
          }
        }
        const validacion = validarConEsquema(RecursoIRSchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data

        // Validaciones por naturaleza del recurso.
        if (
          registro.categoria === "infraestructura" &&
          !registro.microSectorId &&
          !registro.unidadId
        ) {
          return {
            ok: false,
            error:
              "Los activos de infraestructura deben vincularse a una ubicación de la Estructura Física.",
          }
        }
        if (registro.categoria === "acceso" && !registro.unidadId) {
          return {
            ok: false,
            error:
              "Las llaves y credenciales deben vincularse a la unidad correspondiente.",
          }
        }
        if (
          registro.categoria === "insumo" &&
          registro.esCritico &&
          registro.umbralCritico === undefined
        ) {
          return {
            ok: false,
            error: "Un insumo crítico debe fijar su umbral de Stock Crítico.",
          }
        }
        if (
          registro.microSectorId &&
          !get().microSectores.some((m) => m.id === registro.microSectorId)
        ) {
          return {
            ok: false,
            error:
              "No se puede guardar el recurso: el sub-sector indicado no existe en el inventario.",
          }
        }
        if (
          registro.unidadId &&
          !get().unidades.some((u) => u.id === registro.unidadId)
        ) {
          return {
            ok: false,
            error:
              "No se puede guardar el recurso: la unidad indicada no existe en el inventario.",
          }
        }
        if (
          registro.responsablePersonaId &&
          !get().personas.some((p) => p.id === registro.responsablePersonaId)
        ) {
          return {
            ok: false,
            error:
              "No se puede guardar el recurso: el responsable no existe en el Maestro de Personas.",
          }
        }
        if (
          registro.unidadMedidaId &&
          !get().maestros.unidadesMedida.some(
            (u) => u.id === registro.unidadMedidaId
          )
        ) {
          return {
            ok: false,
            error:
              "No se puede guardar el recurso: la unidad de medida no existe en los maestros.",
          }
        }

        let final = registro
        if (esNuevo) {
          final = {
            ...registro,
            cargoFIReferencia:
              registro.proveedor || registro.numeroFactura
                ? "pendiente"
                : registro.cargoFIReferencia,
          }
        }
        set((s) => ({ activosIR: upsert(s.activosIR, final) }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeRecursoIR: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const conSolicitudes = get().solicitudesInsumoIR.filter(
          (s) => s.recursoInsumoId === id || s.recursoSustitutoId === id
        )
        if (conSolicitudes.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar el recurso: ${conSolicitudes.length} solicitud(es) de insumo lo referencian.`,
          }
        }
        const conEntregas = get().entregasEPP.filter((e) => e.recursoId === id)
        if (conEntregas.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar el EPP: ${conEntregas.length} entrega(s) individual(es) asociadas.`,
          }
        }
        set((s) => ({ activosIR: s.activosIR.filter((r) => r.id !== id) }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      saveSolicitudInsumoIR: (solicitud) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const esNueva = !get().solicitudesInsumoIR.some(
          (s) => s.id === solicitud.id
        )
        let candidato: SolicitudInsumoIR = solicitud
        if (esNueva) {
          const numeros = get()
            .solicitudesInsumoIR.map((s) =>
              Number.parseInt(s.folio.replace(/^SI-/, ""), 10)
            )
            .filter((n) => Number.isFinite(n))
          const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
          candidato = {
            ...solicitud,
            folio: `SI-${String(siguiente).padStart(4, "0")}`,
            estado: "pendiente",
            estadoComodin: solicitud.comodin ? "pendiente" : "no_comodin",
          }
        }
        const validacion = validarConEsquema(SolicitudInsumoIRSchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data

        if (
          !get().personas.some((p) => p.id === registro.solicitantePersonaId)
        ) {
          return {
            ok: false,
            error:
              "No se puede crear la solicitud: el solicitante no existe en el Maestro de Personas.",
          }
        }
        if (!registro.comodin && !registro.recursoInsumoId) {
          return {
            ok: false,
            error:
              "La solicitud exige un artículo del catálogo o ser un comodín descrito y justificado.",
          }
        }
        if (registro.comodin && registro.recursoInsumoId) {
          return {
            ok: false,
            error:
              "Una solicitud comodín no debe referenciar un artículo del catálogo.",
          }
        }
        if (registro.recursoInsumoId) {
          const recurso = get().activosIR.find(
            (r) => r.id === registro.recursoInsumoId
          )
          if (!recurso) {
            return {
              ok: false,
              error:
                "No se puede crear la solicitud: el artículo del catálogo no existe.",
            }
          }
          if (recurso.categoria !== "insumo") {
            return {
              ok: false,
              error:
                "Solo pueden solicitarse artículos de tipo insumo/consumible.",
            }
          }
        }

        set((s) => ({
          solicitudesInsumoIR: upsert(s.solicitudesInsumoIR, registro),
        }))
        if (esNueva && registro.comodin) {
          // Comodín: alerta crítica al administrador para decidir (aprobar/sustituir/rechazar).
          registrarEvento(
            set,
            "IR_COMODIN_ALERTA",
            registro.id,
            `Comodín ${registro.folio}: "${registro.comodin.descripcionArticulo}" fuera de catálogo requiere decisión.`,
            "IR"
          )
          get().notify({
            destinatarioRol: "administracion",
            asunto: `Alerta crítica: artículo no catalogado (${registro.folio})`,
            cuerpo: `${nombrePersona(get, registro.solicitantePersonaId)} solicitó "${registro.comodin.descripcionArticulo}" para ${registro.areaDestino}. Justificación: ${registro.comodin.justificacion}`,
            moduloOrigen: "IR",
          })
        }
        return { ok: true }
      },

      resolverComodinIR: (id, decision, opts) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const solicitud = get().solicitudesInsumoIR.find((s) => s.id === id)
        if (!solicitud)
          return {
            ok: false,
            error: "No se puede resolver: la solicitud no existe.",
          }
        if (solicitud.estadoComodin !== "pendiente" || !solicitud.comodin) {
          return {
            ok: false,
            error: "Solo una solicitud comodín pendiente puede resolverse.",
          }
        }

        if (decision === "rechazar") {
          const justificacion = opts?.justificacion?.trim()
          if (!justificacion)
            return {
              ok: false,
              error: "El rechazo exige justificación obligatoria.",
            }
          set((s) => ({
            solicitudesInsumoIR: s.solicitudesInsumoIR.map((x) =>
              x.id === id
                ? {
                    ...x,
                    estado: "rechazada",
                    estadoComodin: "rechazada",
                    rechazoJustificacion: justificacion,
                  }
                : x
            ),
          }))
          registrarEvento(
            set,
            "IR_COMODIN_RESUELTO",
            id,
            `Comodín ${solicitud.folio} rechazado: ${justificacion}`,
            "IR"
          )
          get().notify({
            destinatarioRol: rolDestinatarioCO(
              get,
              solicitud.solicitantePersonaId
            ),
            destinatarioPersonaId: solicitud.solicitantePersonaId,
            asunto: `Tu solicitud comodín ${solicitud.folio} fue rechazada`,
            cuerpo: justificacion,
            moduloOrigen: "IR",
          })
          return { ok: true }
        }

        if (decision === "sustituir") {
          const sustitutoId = opts?.recursoSustitutoId
          const sustituto = sustitutoId
            ? get().activosIR.find((r) => r.id === sustitutoId)
            : undefined
          if (!sustituto || sustituto.categoria !== "insumo") {
            return {
              ok: false,
              error:
                "La sustitución exige un artículo similar existente en el catálogo.",
            }
          }
          set((s) => ({
            solicitudesInsumoIR: s.solicitudesInsumoIR.map((x) =>
              x.id === id
                ? {
                    ...x,
                    recursoInsumoId: sustituto.id,
                    recursoSustitutoId: sustituto.id,
                    estadoComodin: "sustituida",
                  }
                : x
            ),
          }))
          registrarEvento(
            set,
            "IR_COMODIN_RESUELTO",
            id,
            `Comodín ${solicitud.folio} sustituido por ${sustituto.nombre} (stock disponible).`,
            "IR"
          )
          get().notify({
            destinatarioRol: rolDestinatarioCO(
              get,
              solicitud.solicitantePersonaId
            ),
            destinatarioPersonaId: solicitud.solicitantePersonaId,
            asunto: `Tu solicitud comodín ${solicitud.folio} fue sustituida`,
            cuerpo: `Se asignó "${sustituto.nombre}" como artículo similar disponible.`,
            moduloOrigen: "IR",
          })
          return { ok: true }
        }

        // aprobar_crear: alta automática al catálogo para futuras solicitudes.
        const nombreArticulo = solicitud.comodin.descripcionArticulo.trim()
        const creado: RecursoIR = {
          id: generarId("ir"),
          codigo: siguienteCodigoIR(get),
          nombre: nombreArticulo,
          categoria: "insumo",
          descripcion: `Creado automáticamente desde comodín ${solicitud.folio}: ${solicitud.comodin.justificacion}`,
          estadoActivo: "disponible",
          stock: 0,
          esCritico: false,
        }
        const validacion = validarConEsquema(RecursoIRSchema, creado)
        if (!validacion.ok) return validacion
        set((s) => ({ activosIR: upsert(s.activosIR, validacion.data) }))
        set((s) => ({
          solicitudesInsumoIR: s.solicitudesInsumoIR.map((x) =>
            x.id === id
              ? {
                  ...x,
                  recursoInsumoId: validacion.data.id,
                  estadoComodin: "aprobada_creada",
                }
              : x
          ),
        }))
        registrarEvento(
          set,
          "IR_COMODIN_RESUELTO",
          id,
          `Comodín ${solicitud.folio} aprobado: "${nombreArticulo}" añadido al catálogo (${validacion.data.codigo}).`,
          "IR"
        )
        get().notify({
          destinatarioRol: rolDestinatarioCO(
            get,
            solicitud.solicitantePersonaId
          ),
          destinatarioPersonaId: solicitud.solicitantePersonaId,
          asunto: `Tu solicitud comodín ${solicitud.folio} fue aprobada`,
          cuerpo: `"${nombreArticulo}" quedó incorporado al catálogo para futuras solicitudes.`,
          moduloOrigen: "IR",
        })
        return { ok: true }
      },

      entregarSolicitudInsumoIR: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const solicitud = get().solicitudesInsumoIR.find((s) => s.id === id)
        if (!solicitud)
          return {
            ok: false,
            error: "No se puede entregar: la solicitud no existe.",
          }
        if (solicitud.estado !== "pendiente") {
          return {
            ok: false,
            error: "Solo una solicitud Pendiente puede entregarse.",
          }
        }
        if (!solicitud.recursoInsumoId) {
          return {
            ok: false,
            error:
              "No se puede entregar: el comodín aún no tiene artículo asociado (resuélvelo primero).",
          }
        }
        const recurso = get().activosIR.find(
          (r) => r.id === solicitud.recursoInsumoId
        )
        if (!recurso)
          return {
            ok: false,
            error:
              "No se puede entregar: el artículo del catálogo ya no existe.",
          }
        if (recurso.stock < solicitud.cantidad) {
          return {
            ok: false,
            error: `Stock insuficiente: quedan ${recurso.stock} unidad(es) y se solicitaron ${solicitud.cantidad}.`,
          }
        }
        const stockPrevio = recurso.stock
        const stockNuevo = stockPrevio - solicitud.cantidad
        set((s) => ({
          activosIR: s.activosIR.map((r) =>
            r.id === recurso.id ? { ...r, stock: stockNuevo } : r
          ),
          solicitudesInsumoIR: s.solicitudesInsumoIR.map((x) =>
            x.id === id
              ? { ...x, estado: "entregada", entregaFecha: hoyISO() }
              : x
          ),
        }))
        // Alarma de reposición automática al cruzar el umbral crítico.
        if (
          recurso.esCritico &&
          recurso.umbralCritico !== undefined &&
          stockNuevo <= recurso.umbralCritico &&
          stockPrevio > recurso.umbralCritico
        ) {
          registrarEvento(
            set,
            "IR_STOCK_LOW",
            recurso.id,
            `Alarma de reposición: ${recurso.nombre} llegó a ${stockNuevo} (umbral ${recurso.umbralCritico}).`,
            "IR"
          )
          get().notify({
            destinatarioRol: "administracion",
            asunto: `Alarma de reposición: ${recurso.nombre}`,
            cuerpo: `El stock crítico bajó a ${stockNuevo} unidad(es), en o bajo el umbral definido (${recurso.umbralCritico}). Considera reponer pronto.`,
            moduloOrigen: "IR",
          })
        }
        return { ok: true }
      },

      registrarEntregaEPP: (entrega) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(EntregaEPPSchema, entrega)
        if (!validacion.ok) return validacion
        const recurso = get().activosIR.find(
          (r) => r.id === validacion.data.recursoId
        )
        if (!recurso)
          return {
            ok: false,
            error:
              "No se puede registrar la entrega: el recurso EPP no existe.",
          }
        if (recurso.categoria !== "epp") {
          return {
            ok: false,
            error:
              "Solo pueden registrarse entregas sobre recursos de protección personal (EPP).",
          }
        }
        if (!get().personas.some((p) => p.id === validacion.data.personaId)) {
          return {
            ok: false,
            error:
              "No se puede registrar la entrega: el receptor no existe en el Maestro de Personas.",
          }
        }
        let registro = validacion.data
        if (recurso.renovacionMeses) {
          const proxima = new Date(`${registro.fechaEntrega}T00:00:00`)
          proxima.setMonth(proxima.getMonth() + recurso.renovacionMeses)
          registro = {
            ...registro,
            proximaRenovacion: proxima.toISOString().slice(0, 10),
          }
        }
        set((s) => ({ entregasEPP: upsert(s.entregasEPP, registro) }))
        registrarEvento(
          set,
          "IR_DELIVERY_EPP",
          registro.id,
          `EPP ${recurso.nombre} entregado a ${nombrePersona(get, registro.personaId)}${registro.proximaRenovacion ? ` (renovación: ${registro.proximaRenovacion})` : ""}.`,
          "IR"
        )
        return { ok: true }
      },

      asignarAccesoIR: (recursoId, personaId) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const recurso = get().activosIR.find((r) => r.id === recursoId)
        if (!recurso)
          return {
            ok: false,
            error: "No se puede asignar: el acceso no existe.",
          }
        if (recurso.categoria !== "acceso") {
          return {
            ok: false,
            error: "Solo llaves y credenciales admiten asignación.",
          }
        }
        if (recurso.asignacionActual) {
          return {
            ok: false,
            error: `El acceso ya está asignado a ${nombrePersona(get, recurso.asignacionActual.personaId)}; regístralo como devuelto primero.`,
          }
        }
        if (!get().personas.some((p) => p.id === personaId)) {
          return {
            ok: false,
            error:
              "No se puede asignar: la persona no existe en el Maestro de Personas.",
          }
        }
        set((s) => ({
          activosIR: s.activosIR.map((r) =>
            r.id === recursoId
              ? {
                  ...r,
                  asignacionActual: { personaId, fecha: hoyISO() },
                  estadoActivo: "en_uso",
                }
              : r
          ),
        }))
        registrarEvento(
          set,
          "IR_ACCESO_ASIGNADO",
          recursoId,
          `${recurso.nombre} asignado a ${nombrePersona(get, personaId)} (quién tiene qué).`,
          "IR"
        )
        return { ok: true }
      },

      devolverAccesoIR: (recursoId) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const recurso = get().activosIR.find((r) => r.id === recursoId)
        if (!recurso)
          return {
            ok: false,
            error: "No se puede devolver: el acceso no existe.",
          }
        if (!recurso.asignacionActual)
          return {
            ok: false,
            error: "El acceso no registra asignación vigente.",
          }
        set((s) => ({
          activosIR: s.activosIR.map((r) =>
            r.id === recursoId
              ? {
                  ...r,
                  asignacionActual: undefined,
                  estadoActivo: "disponible",
                }
              : r
          ),
        }))
        registrarEvento(
          set,
          "IR_ACCESO_DEVUELTO",
          recursoId,
          `${recurso.nombre} devuelto por ${nombrePersona(get, recurso.asignacionActual.personaId)}.`,
          "IR"
        )
        return { ok: true }
      },
})
