// Slice MT — Mantenimiento y Proyectos (Store Split Fase 2, change st-split-fase2).
// Movimiento puro desde lib/store.ts: mismo estado, mismas firmas y mismos
// mensajes de error. `CompassStore` y `StoreResult` se importan type-only
// (sin ciclo runtime), igual que helpers.ts.
import type { StateCreator } from "zustand"
import type { CompassStore, StoreResult } from "../../store"
import type { TrabajoMT, ProyectoMT, EstadoPagoMT } from "@/lib/schemas"
import {
  validarConEsquema,
  TrabajoMTSchema,
  ProyectoMTSchema,
} from "@/lib/schemas"
import { hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import { saldoFondo } from "@/lib/finanzas-utils"
import { upsert, registrarEvento } from "../helpers"

export interface MTSlic {
  trabajosMT: TrabajoMT[]
  proyectosMT: ProyectoMT[]
  saveTrabajoMT: (trabajo: TrabajoMT) => StoreResult
  removeTrabajoMT: (id: string) => StoreResult
  iniciarTrabajoMT: (id: string) => StoreResult
  finalizarTrabajoMT: (
    id: string,
    cierre?: { fechaTermino?: string; costoFinal?: number }
  ) => StoreResult
  actualizarPagoTrabajoMT: (id: string, estadoPago: EstadoPagoMT) => StoreResult
  verificarGarantiasMT: () => StoreResult
  saveProyectoMT: (proyecto: ProyectoMT) => StoreResult
}

export const mtSlice: StateCreator<CompassStore, [], [], MTSlic> = (set, get) => ({
  trabajosMT: [],
  proyectosMT: [],

      // --- MT: Mantenimiento y Proyectos ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveTrabajoMT: (trabajo) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const esNuevo = !get().trabajosMT.some((t) => t.id === trabajo.id)
        let candidato: TrabajoMT = trabajo
        if (esNuevo) {
          const numeros = get()
            .trabajosMT.map((t) =>
              Number.parseInt(t.folio.replace(/^MT-/, ""), 10)
            )
            .filter((n) => Number.isFinite(n))
          const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
          candidato = {
            ...trabajo,
            folio: `MT-${String(siguiente).padStart(4, "0")}`,
            estado: trabajo.estado ?? "planificado",
            estadoPago: trabajo.estadoPago ?? "pendiente",
            alertaGarantiaEnviada: trabajo.alertaGarantiaEnviada ?? false,
          }
        }
        const validacion = validarConEsquema(TrabajoMTSchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data

        if (!registro.unidadId && !registro.microSectorId) {
          return {
            ok: false,
            error:
              "El trabajo exige una ubicación: unidad o sub-sector de la Estructura Física.",
          }
        }
        if (
          registro.unidadId &&
          !get().unidades.some((u) => u.id === registro.unidadId)
        ) {
          return {
            ok: false,
            error:
              "No se puede guardar el trabajo: la unidad indicada no existe en el inventario.",
          }
        }
        if (
          registro.microSectorId &&
          !get().microSectores.some((m) => m.id === registro.microSectorId)
        ) {
          return {
            ok: false,
            error:
              "No se puede guardar el trabajo: el sub-sector indicado no existe en el inventario.",
          }
        }
        if (
          registro.activoIRId &&
          !get().activosIR.some((r) => r.id === registro.activoIRId)
        ) {
          return {
            ok: false,
            error:
              "No se puede guardar el trabajo: el activo del catálogo IR indicado no existe.",
          }
        }
        if (
          registro.responsablePersonaId &&
          !get().personas.some((p) => p.id === registro.responsablePersonaId)
        ) {
          return {
            ok: false,
            error:
              "No se puede guardar el trabajo: el responsable interno no existe en el Maestro de Personas.",
          }
        }
        if (!registro.responsablePersonaId && !registro.proveedor) {
          return {
            ok: false,
            error:
              "El trabajo exige responsable: personal interno del maestro o proveedor externo.",
          }
        }
        if (
          registro.garantiaInicio &&
          registro.garantiaFin &&
          registro.garantiaFin < registro.garantiaInicio
        ) {
          return {
            ok: false,
            error: "La garantía no puede terminar antes de iniciar.",
          }
        }

        set((s) => ({ trabajosMT: upsert(s.trabajosMT, registro) }))
        if (esNuevo) {
          registrarEvento(
            set,
            "MT_WORK_CREATED",
            registro.id,
            `Trabajo ${registro.folio} "${registro.titulo}" creado (${registro.prioridad}${registro.preventivo ? `, preventivo cada ${registro.preventivo.periodicidadMeses} mes(es)` : ""}).`,
            "MT"
          )
        }
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeTrabajoMT: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        set((s) => ({ trabajosMT: s.trabajosMT.filter((t) => t.id !== id) }))
        return { ok: true }
      },

      iniciarTrabajoMT: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const trabajo = get().trabajosMT.find((t) => t.id === id)
        if (!trabajo)
          return {
            ok: false,
            error: "No se puede iniciar: el trabajo no existe.",
          }
        if (trabajo.estado !== "planificado") {
          return {
            ok: false,
            error: "Solo un trabajo Planificado puede iniciarse.",
          }
        }
        set((s) => ({
          trabajosMT: s.trabajosMT.map((t) =>
            t.id === id
              ? { ...t, estado: "en_curso", fechaInicio: hoyISO() }
              : t
          ),
        }))
        registrarEvento(
          set,
          "MT_WORK_STARTED",
          id,
          `Trabajo ${trabajo.folio} "${trabajo.titulo}" En Curso.`,
          "MT"
        )
        return { ok: true }
      },

      finalizarTrabajoMT: (id, cierre) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const trabajo = get().trabajosMT.find((t) => t.id === id)
        if (!trabajo)
          return {
            ok: false,
            error: "No se puede finalizar: el trabajo no existe.",
          }
        if (trabajo.estado === "finalizado")
          return { ok: false, error: "El trabajo ya está finalizado." }
        if (trabajo.estado === "cancelado")
          return {
            ok: false,
            error: "Un trabajo cancelado no puede finalizarse.",
          }

        const fechaTermino = cierre?.fechaTermino ?? hoyISO()
        const costoFinal = cierre?.costoFinal ?? trabajo.costoTotal
        set((s) => ({
          trabajosMT: s.trabajosMT.map((t) =>
            t.id === id
              ? {
                  ...t,
                  estado: "finalizado",
                  fechaTermino,
                  costoTotal: costoFinal,
                }
              : t
          ),
        }))
        registrarEvento(
          set,
          "MT_WORK_FINISHED",
          id,
          `Trabajo ${trabajo.folio} FINALIZADO (${fechaTermino}, costo $${costoFinal.toLocaleString("es-CL")}).`,
          "MT"
        )

        // Generación automática de la siguiente mantención preventiva.
        if (trabajo.preventivo) {
          const base = new Date(`${fechaTermino}T00:00:00`)
          base.setMonth(base.getMonth() + trabajo.preventivo.periodicidadMeses)
          const proximaFecha = base.toISOString().slice(0, 10)
          const numeros = get()
            .trabajosMT.map((t) =>
              Number.parseInt(t.folio.replace(/^MT-/, ""), 10)
            )
            .filter((n) => Number.isFinite(n))
          const siguienteNum =
            (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
          const siguiente: TrabajoMT = {
            ...trabajo,
            id: generarId("mt"),
            folio: `MT-${String(siguienteNum).padStart(4, "0")}`,
            titulo: trabajo.titulo,
            estado: "planificado",
            estadoPago: "pendiente",
            alertaGarantiaEnviada: false,
            evidencias: [],
            fechaProgramada: proximaFecha,
            fechaInicio: undefined,
            fechaTermino: undefined,
          }
          set((s) => ({ trabajosMT: upsert(s.trabajosMT, siguiente) }))
          registrarEvento(
            set,
            "MT_PREVENTIVE_GENERATED",
            siguiente.id,
            `Mantención preventiva ${siguiente.folio} generada automáticamente (${siguiente.fechaProgramada}).`,
            "MT"
          )
          get().notify({
            destinatarioRol: "administracion",
            asunto: `Mantención preventiva programada (${siguiente.folio})`,
            cuerpo: `"${siguiente.titulo}" fue reprogramada automáticamente para el ${proximaFecha}.`,
            moduloOrigen: "MT",
          })
        }
        return { ok: true }
      },

      actualizarPagoTrabajoMT: (id, estadoPago) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const trabajo = get().trabajosMT.find((t) => t.id === id)
        if (!trabajo)
          return {
            ok: false,
            error: "No se puede actualizar: el trabajo no existe.",
          }
        if (trabajo.estadoPago === estadoPago) return { ok: true }
        // Sin saltos inversos inválidos: pagado solo desde parcial; parcial desde pendiente.
        const FLUJO: Record<EstadoPagoMT, EstadoPagoMT[]> = {
          pendiente: ["parcial", "pagado"],
          parcial: ["pagado", "pendiente"],
          pagado: ["pendiente"],
        }
        if (!FLUJO[trabajo.estadoPago]?.includes(estadoPago)) {
          return {
            ok: false,
            error: `Transición inválida: un pago ${trabajo.estadoPago} no puede pasar directamente a ${estadoPago}.`,
          }
        }
        set((s) => ({
          trabajosMT: s.trabajosMT.map((t) =>
            t.id === id ? { ...t, estadoPago } : t
          ),
        }))
        registrarEvento(
          set,
          "MT_PAYMENT_UPDATE",
          id,
          `Estado de pago de ${trabajo.folio}: ${trabajo.estadoPago} → ${estadoPago}.`,
          "MT"
        )
        return { ok: true }
      },

      verificarGarantiasMT: () => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const hoyStr = hoyISO()
        const limite30 = new Date()
        limite30.setDate(limite30.getDate() + 30)
        const limiteStr = limite30.toISOString().slice(0, 10)
        for (const trabajo of get().trabajosMT) {
          if (
            !trabajo.garantiaFin ||
            trabajo.alertaGarantiaEnviada ||
            trabajo.estado !== "finalizado"
          )
            continue
          const porVencer =
            trabajo.garantiaFin >= hoyStr && trabajo.garantiaFin <= limiteStr
          const vencida = trabajo.garantiaFin < hoyStr
          if (!porVencer && !vencida) continue
          set((s) => ({
            trabajosMT: s.trabajosMT.map((t) =>
              t.id === trabajo.id ? { ...t, alertaGarantiaEnviada: true } : t
            ),
          }))
          registrarEvento(
            set,
            "MT_GUARANTEE_EXPIRED",
            trabajo.id,
            vencida
              ? `Garantía VENCIDA de ${trabajo.folio} "${trabajo.titulo}" (hasta ${trabajo.garantiaFin}); agendar inspección con proveedor.`
              : `Garantía por expirar (${trabajo.garantiaFin}) de ${trabajo.folio}; realizar inspección final.`,
            "MT"
          )
          get().notify({
            destinatarioRol: "administracion",
            asunto: `Garantía ${vencida ? "vencida" : "por expirar"}: ${trabajo.titulo}`,
            cuerpo: vencida
              ? `La garantía venció el ${trabajo.garantiaFin}. Considera registrar el cumplimiento del proveedor.`
              : `Realiza la inspección final antes del ${trabajo.garantiaFin}.`,
            moduloOrigen: "MT",
          })
        }
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      saveProyectoMT: (proyecto) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(ProyectoMTSchema, proyecto)
        if (!validacion.ok) return validacion
        const registro = validacion.data
        if (registro.fondoFinanciamientoId) {
          const fondo = get().fondosFI.find(
            (f) => f.id === registro.fondoFinanciamientoId
          )
          if (!fondo)
            return {
              ok: false,
              error:
                "No se puede guardar el proyecto: el fondo de financiamiento indicado no existe en Finanzas.",
            }
          if (!fondo.activo)
            return {
              ok: false,
              error: `No se puede guardar el proyecto: el fondo "${fondo.nombre}" está inactivo.`,
            }
          const saldo = saldoFondo(fondo.id, {
            cobros: get().cobrosFI,
            egresos: get().egresosFI,
            emisiones: get().emisionesGC,
          })
          if (saldo < registro.presupuestoEstimado) {
            return {
              ok: false,
              error: `Saldo insuficiente en "${fondo.nombre}": disponible $${saldo.toLocaleString("es-CL")} para financiar un presupuesto de $${registro.presupuestoEstimado.toLocaleString("es-CL")}.`,
            }
          }
        }
        set((s) => ({ proyectosMT: upsert(s.proyectosMT, registro) }))
        return { ok: true }
      },
})
