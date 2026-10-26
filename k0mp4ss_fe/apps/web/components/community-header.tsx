"use client"

import Image from "next/image"
import { IconCommand } from "@tabler/icons-react"

import { useComunidadActual } from "@/lib/api/use-configuracion"

export function CommunityHeader({ logueado = true }: { logueado?: boolean }) {
  // Marca desde la proyección /api/comunidad-actual (cualquier rol la consulta):
  // mientras carga o si falla, el skeleton y el fallback del ícono siguen en pie.
  // Sin sesión no hay comunidad que pedir: clave null y el encabezado muestra la
  // marca de la plataforma (el layout monta este header también en /ingresar y
  // /privacidad).
  const { nombre: nombreComunidad, logoUrl, isLoading } = useComunidadActual(logueado)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="size-6 animate-pulse rounded-md bg-muted/40" />
        <div className="h-4 w-32 animate-pulse rounded-md bg-muted/40" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={nombreComunidad}
          width={24}
          height={24}
          unoptimized
          className="size-6 object-contain"
        />
      ) : (
        <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <IconCommand className="size-4" />
        </div>
      )}
      <h2 className="text-sm font-medium">{nombreComunidad || "GECOS"}</h2>
    </div>
  )
}
