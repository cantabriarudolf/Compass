"use client"

import * as React from "react"
// Datos de dominio (visitas y contratistas PE) viven en VisitasPanel/
// ContratistasPanel vía hooks SWR; esta página solo compone UI y vista local.
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { IconBook2 } from "@tabler/icons-react"
import { VisitasPanel } from "@/components/pe/visitas-panel"
import { ContratistasPanel } from "@/components/pe/contratistas-panel"
import { AvisoPrivacidadConserjeria } from "@/components/aviso-privacidad-conserjeria"

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function AccesosPage() {
  const [diaReporte, setDiaReporte] = React.useState(hoyISO())
  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <IconBook2 className="size-6" /> Accesos y Visitas
        </h1>
        <p className="text-sm text-muted-foreground">Control de visitas y contratistas — accesos diarios del edificio.</p>
      </header>

      <AvisoPrivacidadConserjeria />

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {okMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{okMsg}</div>}

      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dia-accesos">Día consultado</Label>
          <Input id="dia-accesos" type="date" value={diaReporte} onChange={(e) => setDiaReporte(e.target.value)} />
        </div>
      </div>

      <section className="flex flex-col gap-6">
        <VisitasPanel diaReporte={diaReporte} onError={setError} onSuccess={setOkMsg} />
        <ContratistasPanel diaReporte={diaReporte} onError={setError} onSuccess={setOkMsg} />
      </section>
    </div>
  )
}
