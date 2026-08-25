"use client"

import * as React from "react"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
import type { AvisoCV, TipologiaCV } from "@/lib/schemas"
import { IconClock, IconCalendarEvent } from "@tabler/icons-react"

const TIPOLOGIA_ACENTO: Record<TipologiaCV, string> = {
  info: "from-sky-900/80 via-zinc-950 to-black border-sky-700/40",
  exito: "from-emerald-900/80 via-zinc-950 to-black border-emerald-700/40",
  advertencia: "from-orange-900/80 via-zinc-950 to-black border-orange-700/40",
  peligro: "from-red-900/90 via-zinc-950 to-black border-red-700/50",
}

const TIPOLOGIA_CHIP: Record<TipologiaCV, string> = {
  info: "bg-sky-600",
  exito: "bg-emerald-600",
  advertencia: "bg-orange-500",
  peligro: "bg-red-600",
}

function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]+)/)
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&mute=1&loop=1&playlist=${m[1]}` : null
}

export default function VisorMensajesPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const avisosCV = useCompassStore(s => s.avisosCV)
  const reservasRA = useCompassStore(s => s.reservasRA)
  const elementosRA = useCompassStore(s => s.elementosRA)
  const configuracion = useCompassStore(s => s.configuracion)

  const [indice, setIndice] = React.useState(0)
  const [ahora, setAhora] = React.useState(() => new Date())

  React.useEffect(() => {
    useCompassStore.getState().caducarAvisosCV()
    const reloj = setInterval(() => setAhora(new Date()), 1000)
    // Sincronización simulada: refresco de caducidad y estado cada 30s.
    const sync = setInterval(() => useCompassStore.getState().caducarAvisosCV(), 30000)
    return () => { clearInterval(reloj); clearInterval(sync) }
  }, [])

  const cola = React.useMemo(
    () => avisosCV.filter(a => a.estado === "publicado").sort((a, b) => (a.fechaPublicacion ?? "").localeCompare(b.fechaPublicacion ?? "")),
    [avisosCV]
  )

  React.useEffect(() => {
    if (cola.length === 0) return
    const aviso = cola[indice % cola.length]
    if (!aviso) return
    const t = setTimeout(() => setIndice(i => (i + 1) % cola.length), Math.max(3, aviso.duracionSegundos) * 1000)
    return () => clearTimeout(t)
  }, [indice, cola])

  if (!hasHydrated) {
    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black">
        <p className="animate-pulse text-lg text-white/60">Conectando con el visor…</p>
      </div>
    )
  }

  const aviso: AvisoCV | undefined = cola.length > 0 ? cola[indice % cola.length] : undefined
  const embed = aviso?.videoUrl ? youtubeEmbed(aviso.videoUrl) : null

  // Integración transversal RA: reservas confirmadas de los próximos 7 días.
  const hoyStr = new Date().toISOString().slice(0, 10)
  const limite = new Date()
  limite.setDate(limite.getDate() + 7)
  const limiteStr = limite.toISOString().slice(0, 10)
  const proximasReservas = reservasRA
    .filter(r => r.estado === "confirmada" && r.fecha >= hoyStr && r.fecha <= limiteStr)
    .sort((a, b) => `${a.fecha}${a.horaInicio}`.localeCompare(`${b.fecha}${b.horaInicio}`))
  const nombreElemento = (id: string) => elementosRA.find(e => e.id === id)?.nombre ?? id

  return (
    <div className="fixed inset-0 z-[999] overflow-hidden bg-gradient-to-br from-zinc-950 via-black to-zinc-950 text-white">
      {/* Fondo dinámico institucional */}
      <div className="pointer-events-none absolute -left-32 -top-32 size-[480px] rounded-full bg-sky-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 size-[520px] rounded-full bg-emerald-600/10 blur-3xl" />

      {/* Identidad + widgets */}
      <header className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-10 py-6 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          {configuracion.logoUrl ? (
            <img src={configuracion.logoUrl} alt="Logo" className="h-12 w-auto rounded bg-white/95 object-contain p-1" />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-xl bg-white/10 text-2xl font-black">K</div>
          )}
          <div>
            <p className="text-lg font-bold tracking-tight">{configuracion.nombreComunidad}</p>
            <p className="text-xs uppercase tracking-widest text-white/50">Visor de mensajes</p>
          </div>
        </div>
        <div className="text-right tabular-nums">
          <p className="flex items-center justify-end gap-2 text-5xl font-extrabold leading-none">
            <IconClock className="size-7 text-white/50" />
            {ahora.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="mt-1 flex items-center justify-end gap-2 text-sm capitalize text-white/70">
            <IconCalendarEvent className="size-4 text-white/50" />
            {ahora.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </header>

      {/* Carrusel */}
      <main className="flex h-full w-full items-center justify-center p-16 pt-28 pb-36">
        {!aviso ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-14 text-center backdrop-blur-md">
            <p className="text-3xl font-semibold text-white/80">Sin avisos activos por ahora</p>
            <p className="mt-2 text-white/50">El carrusel mostrará automáticamente los próximos comunicados de la comunidad.</p>
          </div>
        ) : (
          <div key={aviso.id} className={`animate-in fade-in slide-in-from-bottom-4 duration-500 relative flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border bg-gradient-to-br p-12 shadow-2xl backdrop-blur-md ${TIPOLOGIA_ACENTO[aviso.tipologia]}`}>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className={`inline-flex rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest ${TIPOLOGIA_CHIP[aviso.tipologia]}`}>
                {aviso.tipologia === "info" ? "Información" : aviso.tipologia === "exito" ? "Éxito" : aviso.tipologia === "advertencia" ? "Advertencia" : "Urgente"}
              </span>
              {aviso.tags.map(t => (
                <span key={t} className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70">#{t}</span>
              ))}
              {aviso.origen === "acta_gd" && (
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">Acta de directiva</span>
              )}
            </div>
            <h1 className={`font-black leading-tight ${aviso.pantallaCompleta ? "text-7xl" : "text-5xl"}`}>{aviso.titulo}</h1>
            <p className={`mt-6 whitespace-pre-line leading-relaxed text-white/85 ${aviso.pantallaCompleta ? "text-3xl" : "text-2xl"}`}>{aviso.cuerpo}</p>
            {aviso.imagenUrl && (
              <img src={aviso.imagenUrl} alt={aviso.titulo} className="mt-8 max-h-[42vh] self-center rounded-2xl object-contain shadow-lg" />
            )}
            {embed && (
              <iframe src={embed} title={aviso.titulo} className="mt-8 aspect-video w-full rounded-2xl" allow="autoplay; encrypted-media" allowFullScreen />
            )}
            <div className="mt-auto flex gap-2 pt-8" aria-hidden>
              {cola.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === indice % cola.length ? "w-10 bg-white" : "w-4 bg-white/25"}`} />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Próximas reservas (integración transversal con RA) */}
      {proximasReservas.length > 0 && (
        <footer className="absolute bottom-0 left-0 right-0 z-10 border-t border-white/10 bg-black/50 px-10 py-4 backdrop-blur-md">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-white/50">Próximas reservas · próximos 7 días</p>
          <div className="flex flex-wrap gap-3">
            {proximasReservas.slice(0, 5).map(r => (
              <span key={r.id} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm">
                <b>{nombreElemento(r.elementoId)}</b>
                <span className="ml-2 text-white/70">{new Date(`${r.fecha}T12:00:00`).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" })} · {r.horaInicio}–{r.horaFin}</span>
              </span>
            ))}
          </div>
        </footer>
      )}
    </div>
  )
}
