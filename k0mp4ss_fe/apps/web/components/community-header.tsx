"use client"

import Image from "next/image"
import { IconCommand } from "@tabler/icons-react"

import { useCompassStore, useStoreRehydrated } from "@/lib/store"

export function CommunityHeader() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore((s) => s.hasHydrated)
  const configuracion = useCompassStore((s) => s.configuracion)

  if (!hasHydrated) {
    return (
      <div className="flex items-center gap-2">
        <div className="size-6 animate-pulse rounded-md bg-muted/40" />
        <div className="h-4 w-32 animate-pulse rounded-md bg-muted/40" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {configuracion.logoUrl ? (
        <Image
          src={configuracion.logoUrl}
          alt={configuracion.nombreComunidad}
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
      <h2 className="text-sm font-medium">{configuracion.nombreComunidad}</h2>
    </div>
  )
}
