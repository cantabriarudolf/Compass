"use client"

/**
 * lib/store-ui.ts — Estado de UI puro (BD-FUENTE-VERDAD Fase 5A).
 *
 * Este store reemplaza al store monolito para todo lo que NO es datos de dominio:
 * modales, filtros, vistas, sidebar, toasts.
 *
 * Regla: ningún dato de dominio vive aquí. Toda entidad de negocio persiste en
 * el servidor vía API REST y se accede con los hooks de `lib/api/use-*.ts`.
 */
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export const UI_STORE_VERSION = 1

export interface Toast {
  id: string
  tipo: "success" | "error" | "warning" | "info"
  mensaje: string
  duracion?: number
}

interface UIState {
  // Modales
  modalAbierto: string | null
  modalData: unknown
  // Filtros
  filtrosActivos: Record<string, string>
  // Vista
  vistaSeleccionada: string
  // Sidebar
  sidebarExpandido: boolean
  // Toast notifications (transient)
  toasts: Toast[]
  // Acciones
  abrirModal: (id: string, data?: unknown) => void
  cerrarModal: () => void
  setFiltro: (clave: string, valor: string) => void
  limpiarFiltros: () => void
  setVista: (vista: string) => void
  toggleSidebar: () => void
  agregarToast: (toast: Omit<Toast, "id">) => void
  removerToast: (id: string) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      modalAbierto: null,
      modalData: null,
      filtrosActivos: {},
      vistaSeleccionada: "lista",
      sidebarExpandido: true,
      toasts: [],

      abrirModal: (id, data) =>
        set({ modalAbierto: id, modalData: data ?? null }),

      cerrarModal: () => set({ modalAbierto: null, modalData: null }),

      setFiltro: (clave, valor) =>
        set((s) => ({
          filtrosActivos: { ...s.filtrosActivos, [clave]: valor },
        })),

      limpiarFiltros: () => set({ filtrosActivos: {} }),

      setVista: (vista) => set({ vistaSeleccionada: vista }),

      toggleSidebar: () =>
        set((s) => ({ sidebarExpandido: !s.sidebarExpandido })),

      agregarToast: (toast) =>
        set((s) => ({
          toasts: [
            ...s.toasts,
            { ...toast, id: `${Date.now()}-${Math.random()}` },
          ],
        })),

      removerToast: (id) =>
        set((s) => ({
          toasts: s.toasts.filter((t) => t.id !== id),
        })),
    }),
    {
      name: "compass-ui-store",
      version: UI_STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarExpandido: state.sidebarExpandido,
        vistaSeleccionada: state.vistaSeleccionada,
      }),
    }
  )
)
