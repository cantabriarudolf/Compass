"use client"

/**
 * panel-directorio — directorio de emergencias y utilidad pública.
 *
 * Es el MISMO bloque que era la pestaña `emergencias` de
 * `components/pe/proveedores-panel.tsx`: mismo hook (`useMaestros` sobre el
 * maestro `contactos-emergencia`), mismas dos secciones (`urgencia` y `tecnico`),
 * mismo diccionario de campos (nombre, sitio web, teléfono marcable) y misma
 * copia. La única diferencia es el encabezado: al ser página propia, el título y
 * la descripción que vivían en la `Card` pasan al `header` de la página, sin
 * reescribir el texto.
 *
 * No hay capa de datos nueva ni permiso nuevo: el portón de la ruta lo pone
 * `app/comunidad/directorio/page.tsx` en el servidor.
 */
import * as React from "react"
import { useMaestros } from "@/lib/api/use-maestros"
import type { ContactoEmergencia } from "@/lib/schemas"
import {
  Card,
  CardContent,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { IconPhoneCall, IconExternalLink } from "@tabler/icons-react"

export function DirectorioPanel() {
  const { data: contactosEmergencia, isLoading } = useMaestros<ContactoEmergencia>("contactos-emergencia")

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] animate-pulse flex-col gap-4">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-64 w-full rounded-lg bg-muted" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <IconPhoneCall className="size-6" /> Directorio de Emergencias y
          Utilidad Pública
        </h1>
        <p className="text-sm text-muted-foreground">
          Fuente: maestro contactosEmergencia de MA · disponible para
          conserjería y residentes.
        </p>
      </header>

      <Card>
        <CardContent className="grid gap-6 md:grid-cols-2">
          {(["urgencia", "tecnico"] as const).map((categoria) => (
            <section key={categoria}>
              <h3 className="mb-2 text-sm font-semibold">
                {categoria === "urgencia"
                  ? "Servicios de Urgencia"
                  : "Servicios Técnicos de Urgencia"}
              </h3>
              <ul className="flex flex-col divide-y rounded-lg border">
                {(contactosEmergencia ?? [])
                  .filter((c) => c.categoria === categoria)
                  .map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span>
                        {c.nombre}
                        <span className="block text-xs text-muted-foreground">
                          {c.sitioWeb ?? "—"}
                        </span>
                      </span>
                      <a
                        href={`tel:${c.telefono.replace(/\s/g, "")}`}
                        className="flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted"
                      >
                        <Badge variant="outline">{c.telefono}</Badge>
                        <IconExternalLink className="size-3" />
                      </a>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
