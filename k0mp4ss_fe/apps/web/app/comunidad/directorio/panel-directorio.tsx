"use client"

/**
 * panel-directorio — directorio de emergencias y utilidad pública.
 *
 * Es el MISMO bloque que era la pestaña `emergencias` de
 * `components/pe/proveedores-panel.tsx`: mismas dos secciones (`urgencia` y
 * `tecnico`), mismo diccionario de campos (nombre, sitio web, teléfono marcable)
 * y misma copia de los contactos. Lo que cambió al hacerse página propia es el
 * encabezado (el título y la descripción vivían en la `Card`) y la fuente del
 * dato, no el contenido de cada fila.
 *
 * Fuente de datos: `useDirectorioEmergencias` → `/api/comunidad/directorio`
 * (`pe:directorio` ver, el permiso que tienen los cinco roles). Antes leía el
 * maestro administrativo, gateado con `mp`: residente, conserjería y mantención
 * recibían 403 y el directorio se pintaba vacío sin decir nada.
 *
 * Estados explícitos (decisión del owner): si la lectura falla o no trae filas,
 * el panel LO DICE. Nunca una tarjeta en blanco — un directorio de emergencias
 * vacío y mudo se lee como "la comunidad no tiene contactos", que es lo contrario
 * de lo que hay que comunicar.
 *
 * El portón de la ruta lo pone `app/comunidad/directorio/page.tsx` en el
 * servidor; la API valida el permiso en cada lectura.
 */
import * as React from "react"
import { useDirectorioEmergencias } from "@/lib/api/use-directorio-emergencias"
import type { ContactoEmergencia } from "@/lib/schemas"
import {
  Card,
  CardContent,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { IconPhoneCall, IconExternalLink, IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react"

/** Secciones del directorio, en el orden en que se pintan. */
const CATEGORIAS = [
  { clave: "urgencia", titulo: "Servicios de Urgencia" },
  { clave: "tecnico", titulo: "Servicios Técnicos de Urgencia" },
] as const

/**
 * Aviso de estado: ocupa el lugar de la tarjeta, nunca la deja vacía. `tono`
 * elige entre error (algo falló) y vacío (la lectura funcionó y no hay filas).
 */
function AvisoEstado({
  tono,
  titulo,
  detalle,
  children,
}: {
  tono: "error" | "vacio"
  titulo: string
  detalle: string
  children?: React.ReactNode
}) {
  const Icono = tono === "error" ? IconAlertTriangle : IconInfoCircle
  return (
    <Card>
      <CardContent
        role={tono === "error" ? "alert" : "status"}
        className="flex flex-col items-start gap-2 py-8"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icono className="size-4" /> {titulo}
        </h2>
        <p className="text-sm text-muted-foreground">{detalle}</p>
        {children}
      </CardContent>
    </Card>
  )
}

export function DirectorioPanel() {
  const { data: contactosEmergencia, isLoading, error, refetch } = useDirectorioEmergencias()

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] animate-pulse flex-col gap-4">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-64 w-full rounded-lg bg-muted" />
      </div>
    )
  }

  // Secciones con al menos un contacto: una categoría sin filas no se pinta
  // como lista vacía debajo de un título.
  const secciones = CATEGORIAS.map((categoria) => ({
    ...categoria,
    contactos: contactosEmergencia.filter((c) => c.categoria === categoria.clave),
  })).filter((seccion) => seccion.contactos.length > 0)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <IconPhoneCall className="size-6" /> Directorio de Emergencias y
          Utilidad Pública
        </h1>
        <p className="text-sm text-muted-foreground">
          Contactos de emergencia de la comunidad · disponible para todos los
          roles.
        </p>
      </header>

      {error ? (
        <AvisoEstado
          tono="error"
          titulo="No se pudieron cargar los contactos de emergencia"
          detalle="La lectura del directorio falló. Vuelva a intentarlo; si el problema sigue, avise a la administración."
        >
          <p className="text-xs text-muted-foreground">{error.message}</p>
          <Button variant="outline" size="sm" onClick={refetch}>
            Reintentar
          </Button>
        </AvisoEstado>
      ) : secciones.length === 0 ? (
        <AvisoEstado
          tono="vacio"
          titulo="No hay contactos de emergencia cargados"
          detalle="La administración todavía no cargó el directorio de emergencias de esta comunidad. Los contactos se administran en los maestros administrativos."
        />
      ) : (
        <Card>
          <CardContent className="grid gap-6 md:grid-cols-2">
            {secciones.map((seccion) => (
              <section key={seccion.clave}>
                <h3 className="mb-2 text-sm font-semibold">{seccion.titulo}</h3>
                <ul className="flex flex-col divide-y rounded-lg border">
                  {seccion.contactos.map((c: ContactoEmergencia) => (
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
      )}
    </div>
  )
}
