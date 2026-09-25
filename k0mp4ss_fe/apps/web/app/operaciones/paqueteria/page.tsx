"use client"

import * as React from "react"
// Datos de dominio (encomiendas PE) viven en EncomiendasPanel vía hooks SWR;
// esta página solo compone UI y estado de vista local.
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { IconPackage } from "@tabler/icons-react"
import { EncomiendasPanel } from "@/components/pe/encomiendas-panel"

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function PaqueteriaPage() {
  const [diaReporte, setDiaReporte] = React.useState(hoyISO())
  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <IconPackage className="size-6" /> Encomiendas
        </h1>
        <p className="text-sm text-muted-foreground">
          Recepción y retiro de encomiendas — logística de conserjería.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {okMsg}
        </div>
      )}

      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dia-paqueteria">Día consultado</Label>
          <Input id="dia-paqueteria" type="date" value={diaReporte} onChange={(e) => setDiaReporte(e.target.value)} />
        </div>
      </div>

      <EncomiendasPanel diaReporte={diaReporte} onError={setError} onSuccess={setOkMsg} />
    </div>
  )
}
