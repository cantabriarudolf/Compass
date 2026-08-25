"use client"

import { useEffect } from "react"
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { normalizarDocumento, calcularDigitoVerificador } from "./rut"
import {
  tiposUnidad as seedTiposUnidad,
  macroSectores as seedMacroSectores,
  microSectores as seedMicroSectores,
  unidades as seedUnidades,
} from "@/data/inventario/estructura"
import { personas as seedPersonas } from "@/data/comunidad/personas"
import { vinculos as seedVinculos, ESTADOS_INMOBILIARIOS as seedEstadosInmobiliarios } from "@/data/comunidad/vinculos"
import {
  AFPS as seedAFPS,
  PREVISIONES_SALUD as seedPrevisionesSalud,
  MUTUALES_CAJAS as seedMutualesCajas,
  FERIADOS as seedFeriados,
  BANCOS as seedBancos,
  INDICES_AJUSTE as seedIndicesAjuste,
  CAJAS_FONDOS as seedCajasFondos,
  CATEGORIAS_INSUMOS as seedCategoriasInsumos,
  UNIDADES_MEDIDA as seedUnidadesMedida,
  CONTACTOS_EMERGENCIA as seedContactosEmergencia,
  CONDICIONES_ESPECIALES as seedCondicionesEspeciales,
  Afp,
  PrevisionSalud,
  MutualCaja,
  Feriado,
  Banco,
  IndiceAjuste,
  CajaFondo,
  CategoriaInsumo,
  UnidadMedida,
  ContactoEmergencia,
  CondicionEspecial,
} from "@/data/admin/maestros"
import {
  configuracionDefault as seedConfiguracion,
} from "@/data/admin/configuracion"
import {
  ESTADOS_OCUPACION as seedEstadosOcupacion,
  CATEGORIAS_MACRO as seedCategoriasMacro,
  CATEGORIAS_MICRO as seedCategoriasMicro,
  CATEGORIAS_UNIDAD as seedCategoriasUnidad,
} from "@/data/maestros"
import {
  TipoUnidadSchema,
  MacroSectorSchema,
  MicroSectorSchema,
  UnidadSchema,
  PersonaSchema,
  VinculoUnidadSchema,
  ConfiguracionGlobalSchema,
  EventoAuditoriaSchema,
  PublicacionPortalSchema,
  LeadPortalSchema,
  NotificacionSchema,
  ControlPropiedadSchema,
  ActaGDSchema,
  MAESTRO_SCHEMAS,
  validarConEsquema,
  validarMaestro,
  type TipoUnidad,
  type MacroSector,
  type MicroSector,
  type Unidad,
  type Persona,
  type VinculoUnidad,
  type ConfiguracionGlobal,
  type PublicacionPortal,
  type LeadPortal,
  type Notificacion,
  type OperacionPortal,
  type ControlPropiedad,
  type ActaGD,
} from "@/lib/schemas"
import { z } from "zod"

export type StoreResult = { ok: boolean; error?: string }

export interface EventoAuditoria {
  id: string
  timestamp: string
  usuario: string
  categoria: string
  tipoAccion: string
  referenciaId: string
  descripcion: string
}

const MAX_EVENTOS = 500

type SetStateFn = (partial: Partial<CompassStore> | ((state: CompassStore) => Partial<CompassStore>)) => void

function registrarEvento(
  set: SetStateFn,
  tipoAccion: string,
  referenciaId: string,
  descripcion: string,
  categoria = "VU"
): void {
  set(s => ({
    eventos: [
      ...s.eventos.slice(-(MAX_EVENTOS - 1)),
      {
        id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        usuario: "Admin",
        categoria,
        tipoAccion,
        referenciaId,
        descripcion,
      },
    ],
  }))
}

function nombrePersona(get: () => CompassStore, personaId: string): string {
  const p = get().personas.find(x => x.id === personaId)
  return p ? `${p.nombres} ${p.apellidos}` : personaId
}

function refUnidad(get: () => CompassStore, unidadId: string): string {
  const u = get().unidades.find(x => x.id === unidadId)
  return u ? `${u.etiqueta} ${u.numero}` : unidadId
}

export const STORE_VERSION = 13

export interface MaestroCollections {
  afps: Afp[]
  previsionesSalud: PrevisionSalud[]
  mutualesCajas: MutualCaja[]
  feriados: Feriado[]
  bancos: Banco[]
  indicesAjuste: IndiceAjuste[]
  cajasFondos: CajaFondo[]
  categoriasInsumos: CategoriaInsumo[]
  unidadesMedida: UnidadMedida[]
  contactosEmergencia: ContactoEmergencia[]
  condicionesEspeciales: CondicionEspecial[]
  estadosOcupacion: { id: string; nombre: string; color: string; hex?: string }[]
  categoriasMacro: { id: string; nombre: string }[]
  categoriasMicro: { id: string; nombre: string }[]
  categoriasUnidad: { id: string; nombre: string }[]
  estadosInmobiliarios: { id: string; nombre: string; color?: string }[]
}

export interface CompassData {
  tiposUnidad: TipoUnidad[]
  macroSectores: MacroSector[]
  microSectores: MicroSector[]
  unidades: Unidad[]
  personas: Persona[]
  vinculos: VinculoUnidad[]
  eventos: EventoAuditoria[]
  configuracion: ConfiguracionGlobal
  maestros: MaestroCollections
  // Portal Inmobiliario (PI)
  publicacionesPortal: PublicacionPortal[]
  leadsPortal: LeadPortal[]
  // Notificaciones simuladas (D3, consumidas por todos los módulos)
  notificaciones: Notificacion[]
  // Gestión Administrativa (AD)
  controlesPropiedades: ControlPropiedad[]
  // Gestión de Directiva (GD)
  actasGD: ActaGD[]
}

interface CompassStore extends CompassData {
  hasHydrated: boolean
  // Tipos de Unidad (TU)
  saveTipoUnidad: (tipo: TipoUnidad) => StoreResult
  toggleActivoTipoUnidad: (id: string) => void
  removeTipoUnidad: (id: string) => StoreResult
  // Macro Sectores (EF)
  saveMacroSector: (macro: MacroSector) => StoreResult
  removeMacroSector: (id: string) => StoreResult
  // Micro Sectores (EF)
  saveMicroSector: (micro: MicroSector) => StoreResult
  removeMicroSector: (id: string) => StoreResult
  // Unidades (EF)
  saveUnidad: (unidad: Unidad) => StoreResult
  removeUnidad: (id: string) => StoreResult
  // Personas (MP)
  savePersona: (persona: Persona) => StoreResult
  removePersona: (id: string) => StoreResult
  // Vínculos (VU)
  saveVinculo: (vinculo: VinculoUnidad) => StoreResult
  removeVinculo: (id: string) => StoreResult
  // Maestros Administrativos (MA)
  saveMaestro: <K extends keyof MaestroCollections>(key: K, item: MaestroCollections[K][number]) => StoreResult
  removeMaestro: <K extends keyof MaestroCollections>(key: K, id: string) => StoreResult
  // Configuración Global (CF)
  saveConfiguracion: (config: ConfiguracionGlobal) => StoreResult
  // Portal Inmobiliario (PI)
  savePublicacionPortal: (publicacion: PublicacionPortal) => StoreResult
  removePublicacionPortal: (id: string) => StoreResult
  saveLeadPortal: (lead: LeadPortal) => StoreResult
  syncPublicacionesDesdeVinculos: (unidadId: string) => void
  // Notificaciones simuladas (D3)
  notify: (notificacion: Omit<Notificacion, "id" | "leida" | "canal" | "fecha"> & { canal?: Notificacion["canal"]; unidadId?: string }) => void
  marcarNotificacionLeida: (id: string) => void
  // Gestión Administrativa (AD)
  saveControlPropiedad: (control: ControlPropiedad) => StoreResult
  removeControlPropiedad: (id: string) => StoreResult
  // Gestión de Directiva (GD)
  saveActaGD: (acta: ActaGD) => StoreResult
  removeActaGD: (id: string) => StoreResult
  aprobarActaGD: (id: string, personaId: string) => StoreResult
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some(i => i.id === item.id)
    ? list.map(i => (i.id === item.id ? item : i))
    : [...list, item]
}

const ESTADO_NOMBRE_A_ID: Record<string, string> = {
  "Vacante": "vacante",
  "En Uso": "en-uso",
  "En Arriendo": "en-arriendo",
  "En Venta": "en-venta",
  "En Mantención": "en-mantencion",
}

function migrarEstadoUnidades(unidades: Unidad[]): Unidad[] {
  return unidades.map(u => {
    const legacy = u as Unidad & { estado?: string }
    if (typeof legacy.estado === "string" && (u as { estadoId?: string }).estadoId === undefined) {
      const { estado, ...rest } = legacy
      return { ...rest, estadoId: ESTADO_NOMBRE_A_ID[estado] ?? estado.toLowerCase().replace(/\s+/g, "-") } as Unidad
    }
    return u
  })
}

export const seedData = (): CompassData => ({
  tiposUnidad: seedTiposUnidad,
  macroSectores: seedMacroSectores,
  microSectores: seedMicroSectores,
  unidades: seedUnidades,
  personas: seedPersonas,
  vinculos: seedVinculos,
  eventos: [],
  configuracion: seedConfiguracion,
  publicacionesPortal: [],
  leadsPortal: [],
  notificaciones: [],
  controlesPropiedades: [],
  actasGD: [],
  maestros: {
    afps: seedAFPS,
    previsionesSalud: seedPrevisionesSalud,
    mutualesCajas: seedMutualesCajas,
    feriados: seedFeriados,
    bancos: seedBancos,
    indicesAjuste: seedIndicesAjuste,
    cajasFondos: seedCajasFondos,
    categoriasInsumos: seedCategoriasInsumos,
    unidadesMedida: seedUnidadesMedida,
    contactosEmergencia: seedContactosEmergencia,
    condicionesEspeciales: seedCondicionesEspeciales,
    estadosOcupacion: seedEstadosOcupacion,
    categoriasMacro: seedCategoriasMacro,
    categoriasMicro: seedCategoriasMicro,
    categoriasUnidad: seedCategoriasUnidad,
    estadosInmobiliarios: seedEstadosInmobiliarios,
  },
})

// VAL-006: esquema por colección del estado persistido. En rehidratación/migración
// cada colección se valida con safeParse; si una llega corrupta se descarta y se
// re-siembra desde el seed, sin que el resto del store deje de cargar.
const ESQUEMAS_COLECCION = {
  tiposUnidad: z.array(TipoUnidadSchema),
  macroSectores: z.array(MacroSectorSchema),
  microSectores: z.array(MicroSectorSchema),
  unidades: z.array(UnidadSchema),
  personas: z.array(PersonaSchema),
  vinculos: z.array(VinculoUnidadSchema),
  eventos: z.array(EventoAuditoriaSchema),
  configuracion: ConfiguracionGlobalSchema,
  publicacionesPortal: z.array(PublicacionPortalSchema),
  leadsPortal: z.array(LeadPortalSchema),
  notificaciones: z.array(NotificacionSchema),
  controlesPropiedades: z.array(ControlPropiedadSchema),
  actasGD: z.array(ActaGDSchema),
} as const

type ClaveColeccion = keyof typeof ESQUEMAS_COLECCION
type ClaveMaestro = keyof MaestroCollections

function sanitizarColecciones(prev: Partial<CompassData> | undefined | null): Partial<CompassData> | null {
  if (!prev || typeof prev !== "object") return null
  const seed = seedData()
  const fixes: Record<string, unknown> = {}
  let changed = false

  for (const key of Object.keys(ESQUEMAS_COLECCION) as ClaveColeccion[]) {
    const valor = (prev as Record<string, unknown>)[key]
    if (valor === undefined) continue
    if (!ESQUEMAS_COLECCION[key].safeParse(valor).success) {
      fixes[key] = seed[key]
      changed = true
    }
  }

  // Maestros (MA): colección por colección. Las ausentes o inválidas se rellenan
  // desde el seed para no dejar huecos que rompan el consumo en la UI.
  if (prev.maestros !== undefined) {
    const maestrosSaneados: Record<string, unknown> = {}
    let maestrosChanged = false
    for (const key of Object.keys(MAESTRO_SCHEMAS) as ClaveMaestro[]) {
      const valor = prev.maestros
        ? (prev.maestros as unknown as Record<string, unknown>)[key]
        : undefined
      const valido =
        valor !== undefined && z.array(MAESTRO_SCHEMAS[key]).safeParse(valor).success
      if (valido) {
        maestrosSaneados[key] = valor
      } else {
        maestrosSaneados[key] = seed.maestros[key]
        maestrosChanged = true
      }
    }
    if (maestrosChanged) {
      fixes.maestros = maestrosSaneados
      changed = true
    }
  }

  return changed ? (fixes as Partial<CompassData>) : null
}

// VAL-005 (migración v10): los RUT sembrados históricamente tenían dígito
// verificador ficticio. Al endurecer la validación con módulo 11, todo store
// persistido previo fallaría safeParse y perdería la colección de personas.
// Se repara recalculando el DV del cuerpo (el cuerpo no cambia, solo el DV),
// preservando el formato original del cuerpo (con o sin puntos).
export function repararRut(rut: string): string {
  const normalizado = normalizarDocumento(rut)
  const indiceGuion = normalizado.lastIndexOf("-")
  if (indiceGuion === -1) return rut
  const cuerpoConFormato = normalizado.slice(0, indiceGuion)
  const cuerpo = cuerpoConFormato.replace(/\./g, "")
  if (!/^\d{7,8}$/.test(cuerpo)) return rut
  return `${cuerpoConFormato}-${calcularDigitoVerificador(cuerpo)}`
}

function repararDocumentos(result: Partial<CompassData>): Partial<CompassData> {
  let personas = result.personas
  if (Array.isArray(personas)) {
    personas = (personas as Persona[]).map((p) => ({ ...p, rut: repararRut(p.rut) }))
  }
  let configuracion = result.configuracion
  if (configuracion) {
    configuracion = {
      ...configuracion,
      rutCondominio: repararRut(configuracion.rutCondominio),
      rutAdministrador: repararRut(configuracion.rutAdministrador),
    }
  }
  if (personas === result.personas && configuracion === result.configuracion) return result
  return { ...result, ...(personas !== result.personas ? { personas } : {}), ...(configuracion !== result.configuracion ? { configuracion } : {}) }
}

export const useCompassStore = create<CompassStore>()(
  persist(
    (set, get) => ({
      ...seedData(),
      hasHydrated: false,

      // --- TU: Tipos de Unidad ---
      saveTipoUnidad: (tipo) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(TipoUnidadSchema, tipo)
        if (!validacion.ok) return validacion
        set(s => ({ tiposUnidad: upsert(s.tiposUnidad, validacion.data) }))
        return { ok: true }
      },

      toggleActivoTipoUnidad: (id) => {
        if (!get().hasHydrated) return
        set(s => ({
          tiposUnidad: s.tiposUnidad.map(t =>
            t.id === id ? { ...t, activo: !t.activo } : t
          ),
        }))
      },

      removeTipoUnidad: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const linked = get().unidades.filter(u => u.tipoUnidadId === id)
        if (linked.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar el tipo de unidad: ${linked.length} unidad(es) vinculada(s).`,
          }
        }
        set(s => ({ tiposUnidad: s.tiposUnidad.filter(t => t.id !== id) }))
        return { ok: true }
      },

      // --- EF: Macro Sectores ---
      saveMacroSector: (macro) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(MacroSectorSchema, macro)
        if (!validacion.ok) return validacion
        set(s => ({ macroSectores: upsert(s.macroSectores, validacion.data) }))
        return { ok: true }
      },

      removeMacroSector: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const linked = get().microSectores.filter(m => m.macroSectorId === id)
        if (linked.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar el macro sector: ${linked.length} sub-sector(es) asociado(s).`,
          }
        }
        set(s => ({ macroSectores: s.macroSectores.filter(m => m.id !== id) }))
        return { ok: true }
      },

      // --- EF: Micro Sectores ---
      saveMicroSector: (micro) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(MicroSectorSchema, micro)
        if (!validacion.ok) return validacion
        set(s => ({ microSectores: upsert(s.microSectores, validacion.data) }))
        return { ok: true }
      },

      removeMicroSector: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const linked = get().unidades.filter(u => u.microSectorId === id)
        if (linked.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar el sub-sector: ${linked.length} unidad(es) asociada(s).`,
          }
        }
        set(s => ({ microSectores: s.microSectores.filter(m => m.id !== id) }))
        return { ok: true }
      },

      // --- EF: Unidades ---
      saveUnidad: (unidad) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(UnidadSchema, unidad)
        if (!validacion.ok) return validacion
        set(s => ({ unidades: upsert(s.unidades, validacion.data) }))
        return { ok: true }
      },

      removeUnidad: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const linkedVinculos = get().vinculos.filter(v => v.unidadId === id)
        if (linkedVinculos.length > 0) {
          return {
            ok: false,
            error: "No se puede eliminar la unidad: tiene vínculos asociados.",
          }
        }
        set(s => ({ unidades: s.unidades.filter(u => u.id !== id) }))
        return { ok: true }
      },

      // --- MP: Personas ---
      savePersona: (persona) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        // AD (D1): foto y firma digitalizada solo por referencia; jamás base64/Blob.
        const esReferenciaValida = (valor?: string): boolean =>
          valor === undefined || (!/^data:/i.test(valor) && !/^blob:/i.test(valor) && valor.length <= 2048)
        if (!esReferenciaValida(persona.fotografiaUrl)) {
          return { ok: false, error: "Media por referencia (D1): la fotografía debe ser una URL, no contenido embebido." }
        }
        const firma = persona.datosGobernanza?.firmaDigital
        if (!esReferenciaValida(firma)) {
          return { ok: false, error: "Media por referencia (D1): la firma digitalizada debe ser una URL, no contenido embebido." }
        }
        const validacion = validarConEsquema(PersonaSchema, persona)
        if (!validacion.ok) return validacion
        const anterior = get().personas.find(p => p.id === persona.id)
        set(s => ({ personas: upsert(s.personas, validacion.data) }))
        // AD: carga/reemplazo de firma digitalizada de directiva queda auditado.
        const firmaNueva = validacion.data.datosGobernanza?.firmaDigital
        if (anterior && firmaNueva && anterior.datosGobernanza?.firmaDigital !== firmaNueva) {
          registrarEvento(set, "AD_DIRECTIVA_SIGN_UPLOAD", persona.id, `Firma digitalizada actualizada para ${validacion.data.nombres} ${validacion.data.apellidos}.`, "AD")
        }
        return { ok: true }
      },

      removePersona: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const linked = get().vinculos.filter(v => v.personaId === id)
        if (linked.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar la persona: ${linked.length} vínculo(s) de unidad asociado(s).`,
          }
        }
        set(s => ({ personas: s.personas.filter(p => p.id !== id) }))
        return { ok: true }
      },

      // --- VU: Vínculos ---
      saveVinculo: (vinculo) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(VinculoUnidadSchema, vinculo)
        if (!validacion.ok) return validacion
        const persona = get().personas.find(p => p.id === vinculo.personaId)
        if (!persona) return { ok: false, error: "La persona no existe en el Maestro de Personas." }
        if (persona.estadoCuenta === "inactiva") {
          return { ok: false, error: "No se puede vincular: la persona está marcada como inactiva en el Maestro de Personas." }
        }
        // TST-001 (D6: bloqueo duro): una cuenta bloqueada no puede recibir vínculos, sin excepciones.
        if (persona.estadoCuenta === "bloqueada") {
          return { ok: false, error: "No se puede vincular: la persona está marcada como bloqueada en el Maestro de Personas." }
        }
        const duplicado = get().vinculos.find(v =>
          v.personaId === vinculo.personaId &&
          v.unidadId === vinculo.unidadId &&
          !v.fechaFin &&
          v.id !== vinculo.id
        )
        if (duplicado) {
          return { ok: false, error: "Esta persona ya posee un vínculo activo con esta unidad." }
        }

        // Cierre automático de tramo anterior (solo propietario/arrendatario).
        // Se calcula sobre un snapshot en memoria para poder validar contra el estado post-cierre sin mutar aún el store.
        let working = [...get().vinculos]
        let cerrado: { vinculo: VinculoUnidad; fechaFin: string } | null = null
        const cerrarAnterior = vinculo.cerrarAnterior !== false
        if (cerrarAnterior && !vinculo.fechaFin && (vinculo.rol === "propietario" || vinculo.rol === "arrendatario")) {
          const anterior = working.find(v =>
            v.unidadId === vinculo.unidadId &&
            v.rol === vinculo.rol &&
            !v.fechaFin &&
            v.id !== vinculo.id
          )
          if (anterior) {
            const fechaCierre = new Date(vinculo.fechaInicio)
            fechaCierre.setDate(fechaCierre.getDate() - 1)
            const fechaFinStr = fechaCierre.toISOString().slice(0, 10)
            working = working.map(v =>
              v.id === anterior.id ? { ...v, fechaFin: fechaFinStr } : v
            )
            cerrado = { vinculo: anterior, fechaFin: fechaFinStr }
          }
        }

        const inicio = vinculo.fechaInicio
        const fin = vinculo.fechaFin ?? "9999-12-31"

        // Exclusividad de titularidad/arriendo: un solo tramo vigente por unidad (cruza personas)
        if (vinculo.rol === "propietario" || vinculo.rol === "arrendatario") {
          const conflicto = working.find(v =>
            v.unidadId === vinculo.unidadId &&
            v.rol === vinculo.rol &&
            v.id !== vinculo.id &&
            inicio <= (v.fechaFin ?? "9999-12-31") &&
            v.fechaInicio <= fin
          )
          if (conflicto) {
            return {
              ok: false,
              error:
                vinculo.rol === "arrendatario"
                  ? "El contrato de arriendo se solapa con otro contrato vigente en la misma unidad."
                  : "Ya existe un tramo de propietario que se solapa con las fechas indicadas en esta unidad.",
            }
          }
        }

        // Anti-autosolapamiento: la misma persona no puede tener dos tramos solapados del mismo rol en la unidad
        const autosolape = working.find(v =>
          v.personaId === vinculo.personaId &&
          v.unidadId === vinculo.unidadId &&
          v.rol === vinculo.rol &&
          v.id !== vinculo.id &&
          inicio <= (v.fechaFin ?? "9999-12-31") &&
          v.fechaInicio <= fin
        )
        if (autosolape) {
          return { ok: false, error: "Esta persona ya registra un tramo del mismo rol que se solapa con las fechas indicadas en esta unidad." }
        }

        set(() => ({ vinculos: upsert(working, vinculo) }))

        const nombreAnterior = cerrado ? nombrePersona(get, cerrado.vinculo.personaId) : ""
        if (cerrado) {
          registrarEvento(
            set,
            "VU_ASSIGN_RELEASED",
            cerrado.vinculo.id,
            `Tramo cerrado automáticamente (${cerrado.vinculo.rol}) de ${nombreAnterior} hasta ${cerrado.fechaFin}.`
          )
        }
        if (!vinculo.fechaFin && cerrado) {
          const nombreNuevo = nombrePersona(get, vinculo.personaId)
          if (vinculo.rol === "propietario") {
            registrarEvento(set, "VU_CHANGE_OWNER", vinculo.unidadId, `${nombreNuevo} reemplaza a ${nombreAnterior} como propietario.`)
          } else if (vinculo.rol === "arrendatario") {
            registrarEvento(set, "VU_NEW_TENANT", vinculo.unidadId, `${nombreNuevo} reemplaza a ${nombreAnterior} como arrendatario.`)
          }
        }

        // PI: sincroniza la vitrina según el estado inmobiliario del propietario vigente.
        get().syncPublicacionesDesdeVinculos(vinculo.unidadId)

        return { ok: true }
      },

      removeVinculo: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const objetivo = get().vinculos.find(v => v.id === id)
        set(s => ({ vinculos: s.vinculos.filter(v => v.id !== id) }))
        if (objetivo) {
          const unidad = get().unidades.find(u => u.id === objetivo.unidadId)
          const ref = unidad ? `${unidad.etiqueta} ${unidad.numero}` : objetivo.unidadId
          if (!objetivo.fechaFin) {
            registrarEvento(set, "VU_ASSIGN_RELEASED", id, `Vínculo eliminado (${objetivo.rol}) sobre ${ref}.`)
          } else {
            registrarEvento(set, "VU_DELETE", id, `Tramo histórico (${objetivo.rol}) eliminado de ${ref}.`)
          }
          // PI: al retirar un vínculo puede desaparecer la oferta vigente.
          get().syncPublicacionesDesdeVinculos(objetivo.unidadId)
        }
        return { ok: true }
      },

      // --- MA: Maestros Administrativos ---
      saveMaestro: (key, item) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarMaestro(key, item)
        if (!validacion.ok) return validacion
        set(s => ({
          maestros: {
            ...s.maestros,
            [key]: upsert(s.maestros[key] as { id: string }[], item),
          },
        }))
        return { ok: true }
      },

      removeMaestro: (key, id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        // Validación de integridad referencial para maestros consumidos por unidades/vínculos
        if (key === "estadosOcupacion") {
          const enUso = get().unidades.some(u => u.estadoId === id)
          if (enUso) return { ok: false, error: `No se puede eliminar el estado de ocupación: ${get().unidades.filter(u => u.estadoId === id).length} unidad(es) lo usan.` }
        }
        if (key === "categoriasUnidad") {
          const cat = get().maestros.categoriasUnidad.find(c => c.id === id)
          const nombre = cat?.nombre
          if (nombre) {
            const enUso = get().tiposUnidad.some(t => t.categoria === nombre) || get().unidades.some(u => u.etiqueta === nombre)
            if (enUso) return { ok: false, error: `No se puede eliminar la categoría de unidad "${nombre}": está en uso por tipos o unidades.` }
          }
        }
        if (key === "categoriasMacro") {
          const cat = get().maestros.categoriasMacro.find(c => c.id === id)
          // Validación laxa: si algún macroSector usa la etiqueta de esta categoría como nombre de etiqueta, bloquear
          if (cat && get().macroSectores.some(m => m.etiqueta === cat.nombre)) {
            return { ok: false, error: `No se puede eliminar la categoría macro "${cat.nombre}": hay sectores que la usan como etiqueta.` }
          }
        }
        if (key === "categoriasMicro") {
          const cat = get().maestros.categoriasMicro.find(c => c.id === id)
          if (cat && get().microSectores.some(m => m.etiqueta === cat.nombre)) {
            return { ok: false, error: `No se puede eliminar la categoría micro "${cat.nombre}": hay sub-sectores que la usan.` }
          }
        }
        if (key === "estadosInmobiliarios") {
          const enUso = get().vinculos.some(v => v.estadoOcupacionPropiedad === id)
          if (enUso) return { ok: false, error: `No se puede eliminar el estado inmobiliario: ${get().vinculos.filter(v => v.estadoOcupacionPropiedad === id).length} vínculo(s) lo usan.` }
        }
        if (key === "condicionesEspeciales") {
          const enUso = get().personas.some(p => (p.condicionesEspecialesIds ?? []).includes(id))
          if (enUso) return { ok: false, error: "No se puede eliminar la condición especial: hay personas que la tienen asignada." }
        }
        set(s => ({
          maestros: {
            ...s.maestros,
            [key]: (s.maestros[key] as { id: string }[]).filter(i => i.id !== id),
          },
        }))
        return { ok: true }
      },

      // --- CF: Configuración Global ---
      saveConfiguracion: (config) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(ConfiguracionGlobalSchema, config)
        if (!validacion.ok) return validacion
        set(() => ({ configuracion: validacion.data }))
        return { ok: true }
      },

      // --- PI: Portal Inmobiliario ---
      savePublicacionPortal: (publicacion) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(PublicacionPortalSchema, publicacion)
        if (!validacion.ok) return validacion
        const unidad = get().unidades.find(u => u.id === validacion.data.unidadId)
        if (!unidad) {
          return { ok: false, error: "No se puede guardar la publicación: la unidad no existe en el inventario." }
        }
        const existente = get().publicacionesPortal.find(p => p.id === validacion.data.id)
        set(s => ({ publicacionesPortal: upsert(s.publicacionesPortal, validacion.data) }))

        // Eventos AM según transición de visibilidad en la vitrina.
        const ref = refUnidad(get, validacion.data.unidadId)
        if ((!existente || !existente.activa) && validacion.data.activa) {
          registrarEvento(set, "PI_PROPERTY_LISTED", validacion.data.id, `Publicación ${validacion.data.operacion} activada para ${ref}.`, "PI")
        }
        if (existente?.activa && !validacion.data.activa) {
          registrarEvento(set, "PI_PROPERTY_UNLISTED", validacion.data.id, `Publicación retirada de la vitrina (${ref}).`, "PI")
        }
        return { ok: true }
      },

      removePublicacionPortal: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const leads = get().leadsPortal.filter(l => l.publicacionId === id)
        if (leads.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar la publicación: tiene ${leads.length} lead(s) asociado(s).`,
          }
        }
        set(s => ({ publicacionesPortal: s.publicacionesPortal.filter(p => p.id !== id) }))
        return { ok: true }
      },

      saveLeadPortal: (lead) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(LeadPortalSchema, lead)
        if (!validacion.ok) return validacion
        const publicacion = get().publicacionesPortal.find(p => p.id === validacion.data.publicacionId)
        if (!publicacion) {
          return { ok: false, error: "No se puede registrar el interés: la publicación no existe." }
        }
        if (!publicacion.activa) {
          return { ok: false, error: "No se puede registrar el interés: la publicación no está activa." }
        }
        // Idempotencia bulk: solo el alta nueva genera notificación y evento.
        const esNueva = !get().leadsPortal.some(l => l.id === validacion.data.id)
        set(s => ({ leadsPortal: upsert(s.leadsPortal, validacion.data) }))
        if (!esNueva) return { ok: true }

        // Contacto seguro (D3): notifica al propietario vigente sin exponer sus datos.
        const propietario = get().vinculos.find(v =>
          v.unidadId === publicacion.unidadId && v.rol === "propietario" && !v.fechaFin
        )
        get().notify({
          destinatarioRol: "propietario",
          destinatarioPersonaId: propietario?.personaId,
          asunto: "Nuevo interesado en tu propiedad",
          cuerpo: `${validacion.data.nombreContacto} mostró interés en ${refUnidad(get, publicacion.unidadId)} (${publicacion.operacion}). Contacto: ${validacion.data.contacto}`,
          moduloOrigen: "PI",
        })
        registrarEvento(set, "PI_LEAD_CONTACT", validacion.data.id, `Lead de ${validacion.data.nombreContacto} sobre ${refUnidad(get, publicacion.unidadId)}.`, "PI")
        return { ok: true }
      },

      syncPublicacionesDesdeVinculos: (unidadId) => {
        const s = get()
        const claveEstado = (estadoId?: string): string => {
          if (!estadoId) return ""
          const e = s.maestros.estadosInmobiliarios.find(x => x.id === estadoId)
          if (!e) return ""
          return `${e.id} ${e.nombre}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        }
        const esOferta = (clave: string): boolean => clave.includes("arriendo") || clave.includes("venta")

        const vigente = s.vinculos.find(
          v => v.unidadId === unidadId && v.rol === "propietario" && !v.fechaFin && esOferta(claveEstado(v.estadoOcupacionPropiedad))
        )
        const existente = s.publicacionesPortal.find(p => p.unidadId === unidadId)

        if (vigente) {
          const operacion: OperacionPortal = claveEstado(vigente.estadoOcupacionPropiedad).includes("venta") ? "venta" : "arriendo"
          if (!existente) {
            const nueva: PublicacionPortal = {
              id: `pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              unidadId,
              operacion,
              precio: 0,
              imagenes: [],
              activa: true,
              fechaPublicacion: new Date().toISOString().slice(0, 10),
            }
            set(st => ({ publicacionesPortal: upsert(st.publicacionesPortal, nueva) }))
            registrarEvento(set, "PI_PROPERTY_LISTED", nueva.id, `Trigger inmobiliario: ${refUnidad(get, unidadId)} publicada como ${operacion}.`, "PI")
          } else {
            const cambios: Partial<PublicacionPortal> = {}
            if (!existente.activa) cambios.activa = true
            if (existente.operacion !== operacion) cambios.operacion = operacion
            if (Object.keys(cambios).length > 0) {
              set(st => ({
                publicacionesPortal: st.publicacionesPortal.map(p =>
                  p.id === existente.id ? { ...p, ...cambios } : p
                ),
              }))
              if (cambios.activa) {
                registrarEvento(set, "PI_PROPERTY_LISTED", existente.id, `Trigger inmobiliario: ${refUnidad(get, unidadId)} vuelve a la vitrina como ${operacion}.`, "PI")
              }
            }
          }
        } else if (existente?.activa) {
          set(st => ({
            publicacionesPortal: st.publicacionesPortal.map(p =>
              p.id === existente.id ? { ...p, activa: false } : p
            ),
          }))
          registrarEvento(set, "PI_PROPERTY_UNLISTED", existente.id, `Trigger inmobiliario: ${refUnidad(get, unidadId)} retirada de la vitrina.`, "PI")
        }
      },

      // --- Notificaciones simuladas (D3) ---
      notify: (notificacion) => {
        if (!get().hasHydrated) return
        // AD: el propietario puede silenciar las alertas automáticas hacia los
        // residentes de su unidad ("Gestión de Alertas Residentes"). Los actos
        // formales de gobernanza (GD) no pasan por este gate.
        if (notificacion.destinatarioRol === "residente" && notificacion.unidadId) {
          const control = get().controlesPropiedades.find(c => c.unidadId === notificacion.unidadId)
          if (control && !control.alertasResidentesActivas) return
        }
        const completa: Notificacion = {
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          destinatarioRol: notificacion.destinatarioRol,
          destinatarioPersonaId: notificacion.destinatarioPersonaId,
          asunto: notificacion.asunto,
          cuerpo: notificacion.cuerpo,
          canal: notificacion.canal ?? "email_simulado",
          moduloOrigen: notificacion.moduloOrigen,
          fecha: new Date().toISOString().slice(0, 10),
          leida: false,
        }
        const validacion = validarConEsquema(NotificacionSchema, completa)
        if (!validacion.ok) return
        set(s => ({
          notificaciones: [...s.notificaciones.slice(-(MAX_EVENTOS - 1)), validacion.data],
        }))
      },

      marcarNotificacionLeida: (id) => {
        if (!get().hasHydrated) return
        set(s => ({
          notificaciones: s.notificaciones.map(n => (n.id === id ? { ...n, leida: true } : n)),
        }))
      },

      // --- AD: Gestión Administrativa ---
      saveControlPropiedad: (control) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(ControlPropiedadSchema, control)
        if (!validacion.ok) return validacion
        if (!get().unidades.some(u => u.id === validacion.data.unidadId)) {
          return { ok: false, error: "No se puede guardar el control: la unidad no existe en el inventario." }
        }
        // Unicidad: un solo registro de controles por unidad.
        const duplicado = get().controlesPropiedades.find(
          c => c.unidadId === validacion.data.unidadId && c.id !== validacion.data.id
        )
        if (duplicado) {
          return { ok: false, error: `La unidad ya tiene controles registrados (${duplicado.id}).` }
        }
        const anterior = get().controlesPropiedades.find(c => c.id === validacion.data.id)
        set(s => ({ controlesPropiedades: upsert(s.controlesPropiedades, validacion.data) }))

        const ref = refUnidad(get, validacion.data.unidadId)
        if (!anterior) {
          registrarEvento(set, "AD_OWNER_CONFIG_CHANGE", validacion.data.id, `Controles de privacidad creados para ${ref}.`, "AD")
        } else {
          const cambios: string[] = []
          if (anterior.residenteVeMorosidad !== validacion.data.residenteVeMorosidad) cambios.push(`morosidad=${validacion.data.residenteVeMorosidad ? "visible" : "oculta"}`)
          if (anterior.residenteVeActas !== validacion.data.residenteVeActas) cambios.push(`actas=${validacion.data.residenteVeActas ? "visibles" : "ocultas"}`)
          if (anterior.alertasResidentesActivas !== validacion.data.alertasResidentesActivas) cambios.push(`alertas=${validacion.data.alertasResidentesActivas ? "activas" : "silenciadas"}`)
          if (cambios.length > 0) {
            registrarEvento(set, "AD_OWNER_CONFIG_CHANGE", validacion.data.id, `Controles de ${ref} actualizados: ${cambios.join("; ")}.`, "AD")
          }
        }
        return { ok: true }
      },

      removeControlPropiedad: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        set(s => ({ controlesPropiedades: s.controlesPropiedades.filter(c => c.id !== id) }))
        return { ok: true }
      },

      // --- GD: Gestión de Directiva ---
      saveActaGD: (acta) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(ActaGDSchema, acta)
        if (!validacion.ok) return validacion
        // Integridad referencial: presentes/ausentes deben ser miembros de directiva vigentes.
        for (const idAsistente of [...validacion.data.presentes, ...validacion.data.ausentes]) {
          const persona = get().personas.find(p => p.id === idAsistente)
          if (!persona) {
            return { ok: false, error: `No se puede guardar el acta: el asistente "${idAsistente}" no existe en el Maestro de Personas.` }
          }
          if (!persona.datosGobernanza) {
            return { ok: false, error: `No se puede guardar el acta: ${persona.nombres} ${persona.apellidos} no es miembro de la directiva (sin extensión de gobernanza).` }
          }
        }
        const esNueva = !get().actasGD.some(a => a.id === validacion.data.id)
        set(s => ({ actasGD: upsert(s.actasGD, validacion.data) }))
        if (esNueva) {
          registrarEvento(set, "GD_ACTA_CREATED", validacion.data.id, `Acta de reunión del ${validacion.data.fecha} registrada (${validacion.data.lugar}).`, "GD")
          for (const presenteId of validacion.data.presentes) {
            registrarEvento(set, "GD_ASISTENCIA_REG", presenteId, `Asistencia registrada (${nombrePersona(get, presenteId)}) en acta ${validacion.data.id}.`, "GD")
          }
        }
        return { ok: true }
      },

      removeActaGD: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        set(s => ({ actasGD: s.actasGD.filter(a => a.id !== id) }))
        return { ok: true }
      },

      aprobarActaGD: (id, personaId) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const acta = get().actasGD.find(a => a.id === id)
        if (!acta) return { ok: false, error: "No se puede aprobar: el acta no existe." }
        if (acta.estado === "publicada") return { ok: false, error: "El acta ya está publicada." }
        const firmante = get().personas.find(p => p.id === personaId)
        if (!firmante?.datosGobernanza || firmante.estadoCuenta !== "activa") {
          return { ok: false, error: "Solo un miembro vigente de la directiva puede aprobar el acta." }
        }
        if (acta.aprobaciones.includes(personaId)) {
          return { ok: false, error: "Esta directiva ya aprobó el acta." }
        }
        const aprobaciones = [...acta.aprobaciones, personaId]
        // Quórum 100% de la directiva vigente (personas activas con extensión de gobernanza).
        const directivaVigente = get().personas.filter(p => p.datosGobernanza && p.estadoCuenta === "activa").map(p => p.id)
        const quorumCompleto = directivaVigente.every(idMiembro => aprobaciones.includes(idMiembro))
        if (quorumCompleto) {
          const publicada: ActaGD = {
            ...acta,
            aprobaciones,
            estado: "publicada",
            fechaPublicacion: new Date().toISOString().slice(0, 10),
            avisoCVReferencia: "pendiente",
          }
          set(s => ({ actasGD: upsert(s.actasGD, publicada) }))

          registrarEvento(set, "GD_ACTA_APPROVED", id, `Acta ${id} aprobada por ${nombrePersona(get, personaId)} y PUBLICADA (quórum 100%).`, "GD")

          // Publicación automática: notificación formal a todos los propietarios
          // (acto de gobernanza; no pasa por el gate de alertas operativas).
          const propietarios = new Set(
            get().vinculos.filter(v => v.rol === "propietario" && !v.fechaFin).map(v => v.personaId)
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
          set(s => ({
            actasGD: s.actasGD.map(a => (a.id === id ? { ...a, aprobaciones } : a)),
          }))
          registrarEvento(set, "GD_ACTA_APPROVED", id, `${nombrePersona(get, personaId)} aprobó el acta ${id}. Pendientes: ${directivaVigente.filter(x => !aprobaciones.includes(x)).length}.`, "GD")
        }
        return { ok: true }
      },
    }),
    {
      name: "compass-store",
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tiposUnidad: state.tiposUnidad,
        macroSectores: state.macroSectores,
        microSectores: state.microSectores,
        unidades: state.unidades,
        personas: state.personas,
        vinculos: state.vinculos,
        eventos: state.eventos,
        // SEC-005: los secretos no se persisten en localStorage; viven solo en
        // memoria de la sesión hasta su traslado definitivo al servidor (Fase C).
        configuracion: state.configuracion
          ? { ...state.configuracion, smtpPassword: "", claveEliminacionMaestro: "" }
          : state.configuracion,
        maestros: state.maestros,
        publicacionesPortal: state.publicacionesPortal,
        leadsPortal: state.leadsPortal,
        notificaciones: state.notificaciones,
        controlesPropiedades: state.controlesPropiedades,
        actasGD: state.actasGD,
      }),
      migrate: (persisted, version) => {
        const prev = (persisted ?? {}) as Partial<CompassData>
        let result: Partial<CompassData> = { ...prev }
        if ((version ?? 0) < 2) {
          result = {
            ...result,
            maestros: {
              ...seedData().maestros,
              ...prev.maestros,
            },
          }
        }
        if ((version ?? 0) < 3) {
          result = {
            ...result,
            unidades: migrarEstadoUnidades(prev.unidades ?? []),
          }
        }
        if ((version ?? 0) < 4) {
          result = {
            ...result,
            maestros: {
              ...seedData().maestros,
              ...prev.maestros,
            },
          }
        }
        if ((version ?? 0) < 5) {
          result = {
            ...result,
            maestros: {
              ...seedData().maestros,
              ...prev.maestros,
            },
          }
        }
        if ((version ?? 0) < 6) {
          result = {
            ...result,
            maestros: {
              ...seedData().maestros,
              ...prev.maestros,
            },
          }
        }
        if ((version ?? 0) < 8) {
          const seed = seedData()
          const mergeById = <T extends { id: string }>(prevArr: T[], seedArr: T[]): T[] => {
            const prevIds = new Set(prevArr.map(p => p.id))
            return [...prevArr, ...seedArr.filter(s => !prevIds.has(s.id))]
          }
          // TST-002: mergeById reconstruye `unidades` desde el persistido crudo y
          // deshacía la conversión estado→estadoId de la rama <3; se reaplica
          // migrarEstadoUnidades sobre la fusión resultante.
          const unidadesFusionadas = mergeById(
            (prev.unidades ?? []) as { id: string }[],
            seed.unidades as unknown as { id: string }[]
          )
          // Limpiar keys legacy v7 que ya no existen en CompassData
          const prevAny = prev as unknown as Record<string, unknown>
          result = {
            ...result,
            macroSectores: mergeById((prev.macroSectores ?? []) as { id: string }[], seed.macroSectores as unknown as { id: string }[]) as never,
            microSectores: mergeById((prev.microSectores ?? []) as { id: string }[], seed.microSectores as unknown as { id: string }[]) as never,
            unidades: migrarEstadoUnidades(unidadesFusionadas as unknown as Unidad[]) as never,
            maestros: {
              ...seed.maestros,
              ...(prev.maestros ?? {}),
              categoriasMacro: mergeById(
                (prev.maestros?.categoriasMacro ?? []) as { id: string }[],
                seed.maestros.categoriasMacro as unknown as { id: string }[]
              ) as never,
            } as never,
          }
          // Eliminar estacionamientos legacy del persistido si existe
          if (prevAny["estacionamientos"] !== undefined) delete (result as unknown as Record<string, unknown>)["estacionamientos"]
          const maestrosAny = (result.maestros ?? {}) as unknown as Record<string, unknown>
          if (maestrosAny["ubicacionesEstacionamiento"] !== undefined) delete maestrosAny["ubicacionesEstacionamiento"]
        }
        // PI (v11): colecciones nuevas del Portal Inmobiliario + notificaciones
        // simuladas (D3). Aditivas: si no existen en el persistido, entran vacías.
        if ((version ?? 0) < 11) {
          result = {
            ...result,
            publicacionesPortal: prev.publicacionesPortal ?? [],
            leadsPortal: prev.leadsPortal ?? [],
            notificaciones: prev.notificaciones ?? [],
          }
        }
        if ((version ?? 0) < 12) {
          result = {
            ...result,
            controlesPropiedades: prev.controlesPropiedades ?? [],
          }
        }
        if ((version ?? 0) < 13) {
          result = {
            ...result,
            actasGD: prev.actasGD ?? [],
          }
        }
        // TST-002: los stores que ya quedaron en v8 con unidades dañadas por este
        // bug (estado sin estadoId) se rescatan aquí en el salto a v9.
        if ((version ?? 0) < STORE_VERSION && Array.isArray(result.unidades)) {
          result = { ...result, unidades: migrarEstadoUnidades(result.unidades) }
        }
        // VAL-005: reparación de DV de RUT en datos persistidos ≤v9, antes del
        // saneo para que la colección personas/configuración pase la validación.
        if ((version ?? 0) < STORE_VERSION) {
          result = repararDocumentos(result)
        }
        // VAL-006: saneo por colección antes de devolver el resultado migrado.
        // Colección inválida → re-sembrada desde seed; resto del store intacto.
        const saneado = sanitizarColecciones(result)
        if (saneado) result = { ...result, ...saneado }
        return result
      },
      onRehydrateStorage: () => (state, error) => {
        // VAL-006: lo cargado sin migrate (versión vigente o fresh install) también
        // se sanea; una colección corrupta se re-siembra sin romper el resto.
        if (!error && state) {
          const saneado = sanitizarColecciones(state)
          if (saneado) useCompassStore.setState(saneado)
        }
        useCompassStore.setState({ hasHydrated: true })
      },
      skipHydration: true,
    }
  )
)

export function rehydrateStore(): void {
  if (typeof window !== "undefined") useCompassStore.persist.rehydrate()
}

export function useStoreRehydrated(): void {
  useEffect(() => {
    rehydrateStore()
  }, [])
}
