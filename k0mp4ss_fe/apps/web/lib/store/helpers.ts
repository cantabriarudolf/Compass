// Pure store helpers extracted from lib/store.ts (FASE 1).
// No state, no set/get of the zustand store: every function receives what it
// needs by argument. The CompassStore type is imported type-only, so there is
// no runtime cycle with lib/store.ts.
import type { CompassStore } from "../store"
import { hoyISO } from "@/lib/date-utils"
import { saldoPendiente } from "@/lib/finanzas-utils"

export function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((i) => i.id === item.id)
    ? list.map((i) => (i.id === item.id ? item : i))
    : [...list, item]
}

export function nombrePersona(get: () => CompassStore, personaId: string): string {
  const p = get().personas.find((x) => x.id === personaId)
  return p ? `${p.nombres} ${p.apellidos}` : personaId
}

export function refUnidad(get: () => CompassStore, unidadId: string): string {
  const u = get().unidades.find((x) => x.id === unidadId)
  return u ? `${u.etiqueta} ${u.numero}` : unidadId
}

// CO: sustitución de variables dinámicas de plantillas por destinatario.
export function resolverVariablesCO(
  get: () => CompassStore,
  texto: string,
  nombreUsuario?: string
): string {
  const comunidad = get().configuracion.nombreComunidad || "su comunidad"
  const torre = get().macroSectores[0]?.nombre ?? comunidad
  return texto
    .replace(
      /\[Nombre_Usuario\]/g,
      nombreUsuario && nombreUsuario.trim().length > 0
        ? nombreUsuario
        : "vecino/a"
    )
    .replace(/\[Nombre_Torre\]/g, torre)
    .replace(/\[Nombre_Comunidad\]/g, comunidad)
}

// CO: rol de bandeja para el destinatario de un envío masivo.
export function rolDestinatarioCO(
  get: () => CompassStore,
  personaId: string
): "propietario" | "residente" | "personal" | "directiva" {
  const persona = get().personas.find((p) => p.id === personaId)
  if (persona?.roles.includes("personal")) return "personal"
  if (persona?.roles.includes("directiva")) return "directiva"
  if (
    get().vinculos.some(
      (v) => v.personaId === personaId && v.rol === "propietario" && !v.fechaFin
    )
  )
    return "propietario"
  return "residente"
}

// IR: siguiente código de inventario IR-A-####.
export function siguienteCodigoIR(get: () => CompassStore): string {
  const numeros = get()
    .activosIR.map((r) =>
      Number.parseInt((r.codigo ?? "").replace(/^IR-A-/, ""), 10)
    )
    .filter((n) => Number.isFinite(n))
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
  return `IR-A-${String(siguiente).padStart(4, "0")}`
}

// RA: siguiente folio de reserva RA-####.
export function siguienteFolioRA(get: () => CompassStore): string {
  const numeros = get()
    .reservasRA.map((r) => Number.parseInt(r.folio.replace(/^RA-/, ""), 10))
    .filter((n) => Number.isFinite(n))
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
  return `RA-${String(siguiente).padStart(4, "0")}`
}

// RA §2: gate de morosidad — bloquea al solicitante que mantiene cobros
// vencidos sin cubrir en las unidades donde tiene vínculo vigente.
export function getDeudaVigenteFI(
  get: () => CompassStore,
  personaId: string
): string | null {
  const hoy = hoyISO()
  const unidadesPersona = get()
    .vinculos.filter((v) => v.personaId === personaId && !v.fechaFin)
    .map((v) => v.unidadId)
  const vencidos = get().cobrosFI.filter(
    (c) =>
      unidadesPersona.includes(c.unidadId) &&
      c.fechaVencimiento !== undefined &&
      c.fechaVencimiento < hoy &&
      saldoPendiente(c) > 0
  )
  if (vencidos.length === 0) return null
  const total = vencidos.reduce((acc, c) => acc + saldoPendiente(c), 0)
  return `No se puede reservar: mantienes deuda vencida en Finanzas ($${total.toLocaleString("es-CL")} en ${vencidos.length} cobro(s)). Regulariza tu situación para volver a reservar.`
}

export function siguienteFolioFE(get: () => CompassStore): string {
  const numeros = get()
    .egresosFI.map((e) =>
      Number.parseInt((e.folio ?? "").replace(/^FE-/, ""), 10)
    )
    .filter((n) => Number.isFinite(n))
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
  return `FE-${String(siguiente).padStart(4, "0")}`
}
