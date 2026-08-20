"use client"

import { useEffect } from "react"
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import {
  tiposUnidad as seedTiposUnidad,
  macroSectores as seedMacroSectores,
  microSectores as seedMicroSectores,
  unidades as seedUnidades,
  TipoUnidad,
  MacroSector,
  MicroSector,
  Unidad,
} from "@/data/inventario/estructura"
import { personas as seedPersonas, Persona } from "@/data/comunidad/personas"
import { vinculos as seedVinculos, VinculoUnidad, ESTADOS_INMOBILIARIOS as seedEstadosInmobiliarios } from "@/data/comunidad/vinculos"
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
  ConfiguracionGlobal,
} from "@/data/admin/configuracion"
import {
  ESTADOS_OCUPACION as seedEstadosOcupacion,
  CATEGORIAS_MACRO as seedCategoriasMacro,
  CATEGORIAS_MICRO as seedCategoriasMicro,
  CATEGORIAS_UNIDAD as seedCategoriasUnidad,
} from "@/data/maestros"

export type StoreResult = { ok: boolean; error?: string }

export const STORE_VERSION = 8

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
  configuracion: ConfiguracionGlobal
  maestros: MaestroCollections
}

interface CompassStore extends CompassData {
  hasHydrated: boolean
  // Tipos de Unidad (TU)
  saveTipoUnidad: (tipo: TipoUnidad) => void
  toggleActivoTipoUnidad: (id: string) => void
  removeTipoUnidad: (id: string) => StoreResult
  // Macro Sectores (EF)
  saveMacroSector: (macro: MacroSector) => void
  removeMacroSector: (id: string) => StoreResult
  // Micro Sectores (EF)
  saveMicroSector: (micro: MicroSector) => void
  removeMicroSector: (id: string) => StoreResult
  // Unidades (EF)
  saveUnidad: (unidad: Unidad) => void
  removeUnidad: (id: string) => StoreResult
  // Personas (MP)
  savePersona: (persona: Persona) => void
  removePersona: (id: string) => StoreResult
  // Vínculos (VU)
  saveVinculo: (vinculo: VinculoUnidad) => StoreResult
  removeVinculo: (id: string) => StoreResult
  // Maestros Administrativos (MA)
  saveMaestro: <K extends keyof MaestroCollections>(key: K, item: MaestroCollections[K][number]) => void
  removeMaestro: <K extends keyof MaestroCollections>(key: K, id: string) => StoreResult
  // Configuración Global (CF)
  saveConfiguracion: (config: ConfiguracionGlobal) => void
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
  configuracion: seedConfiguracion,
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

export const useCompassStore = create<CompassStore>()(
  persist(
    (set, get) => ({
      ...seedData(),
      hasHydrated: false,

      // --- TU: Tipos de Unidad ---
      saveTipoUnidad: (tipo) => {
        if (!get().hasHydrated) return
        set(s => ({ tiposUnidad: upsert(s.tiposUnidad, tipo) }))
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
        if (!get().hasHydrated) return
        set(s => ({ macroSectores: upsert(s.macroSectores, macro) }))
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
        if (!get().hasHydrated) return
        set(s => ({ microSectores: upsert(s.microSectores, micro) }))
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
        if (!get().hasHydrated) return
        set(s => ({ unidades: upsert(s.unidades, unidad) }))
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
        if (!get().hasHydrated) return
        set(s => ({ personas: upsert(s.personas, persona) }))
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
        const persona = get().personas.find(p => p.id === vinculo.personaId)
        if (!persona) return { ok: false, error: "La persona no existe en el Maestro de Personas." }
        if (persona.estadoCuenta === "inactiva") {
          return { ok: false, error: "No se puede vincular: la persona está marcada como inactiva en el Maestro de Personas." }
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
        if (vinculo.rol === "arrendatario") {
          const inicio = vinculo.fechaInicio
          const fin = vinculo.fechaFin ?? "9999-12-31"
          const conflicto = get().vinculos.find(v =>
            v.unidadId === vinculo.unidadId &&
            v.rol === "arrendatario" &&
            v.id !== vinculo.id &&
            inicio <= (v.fechaFin ?? "9999-12-31") &&
            v.fechaInicio <= fin
          )
          if (conflicto) {
            return { ok: false, error: "El contrato de arriendo se solapa con otro contrato vigente en la misma unidad." }
          }
        }

        // Cierre automático de tramo anterior (solo propietario/arrendatario)
        const cerrarAnterior = vinculo.cerrarAnterior !== false
        if (cerrarAnterior && !vinculo.fechaFin && (vinculo.rol === "propietario" || vinculo.rol === "arrendatario")) {
          const anterior = get().vinculos.find(v =>
            v.unidadId === vinculo.unidadId &&
            v.rol === vinculo.rol &&
            !v.fechaFin &&
            v.id !== vinculo.id
          )
          if (anterior) {
            const fechaCierre = new Date(vinculo.fechaInicio)
            fechaCierre.setDate(fechaCierre.getDate() - 1)
            const fechaFinStr = fechaCierre.toISOString().split("T")[0]
            set(s => ({
              vinculos: s.vinculos.map(v =>
                v.id === anterior.id ? { ...v, fechaFin: fechaFinStr } : v
              ),
            }))
          }
        }

        set(s => ({ vinculos: upsert(s.vinculos, vinculo) }))
        return { ok: true }
      },

      removeVinculo: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        set(s => ({ vinculos: s.vinculos.filter(v => v.id !== id) }))
        return { ok: true }
      },

      // --- MA: Maestros Administrativos ---
      saveMaestro: (key, item) => {
        if (!get().hasHydrated) return
        set(s => ({
          maestros: {
            ...s.maestros,
            [key]: upsert(s.maestros[key] as { id: string }[], item),
          },
        }))
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
        if (!get().hasHydrated) return
        set(() => ({ configuracion: config }))
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
        configuracion: state.configuracion,
        maestros: state.maestros,
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
          // Limpiar keys legacy v7 que ya no existen en CompassData
          const prevAny = prev as unknown as Record<string, unknown>
          result = {
            ...result,
            macroSectores: mergeById((prev.macroSectores ?? []) as { id: string }[], seed.macroSectores as unknown as { id: string }[]) as never,
            microSectores: mergeById((prev.microSectores ?? []) as { id: string }[], seed.microSectores as unknown as { id: string }[]) as never,
            unidades: mergeById((prev.unidades ?? []) as { id: string }[], seed.unidades as unknown as { id: string }[]) as never,
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
        return result
      },
      onRehydrateStorage: () => () => {
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
