import { useCompassStore, seedData } from "@/lib/store"

export function resetStore(): void {
  useCompassStore.setState({ ...seedData(), hasHydrated: true })
}

export function lastEvent(): { tipoAccion: string; descripcion: string } | undefined {
  const eventos = useCompassStore.getState().eventos
  return eventos[eventos.length - 1]
}
