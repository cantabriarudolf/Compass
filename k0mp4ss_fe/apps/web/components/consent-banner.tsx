"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"

/**
 * SERIE-PRODUCCION-FASE2 P6 — banner de consentimiento de cookies/datos.
 * Se muestra hasta que el usuario acepta (flag en localStorage; no es secreto).
 * Incluido en app/layout.tsx para toda la plataforma.
 */
const CLAVE_CONSENTIMIENTO = "compass-consentimiento-privacidad"

export function ConsentBanner() {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    let vivo = true
    void Promise.resolve().then(() => {
      if (!vivo) return
      try {
        setVisible(window.localStorage.getItem(CLAVE_CONSENTIMIENTO) !== "aceptado")
      } catch {
        setVisible(true)
      }
    })
    return () => {
      vivo = false
    }
  }, [])

  function aceptar() {
    try {
      window.localStorage.setItem(CLAVE_CONSENTIMIENTO, "aceptado")
    } catch {
      // intencional: si no hay storage, el banner reaparece (fail-closed)
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="region"
      aria-label="Aviso de privacidad"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-muted-foreground">
          Utilizamos cookies y procesamos datos personales según nuestra{" "}
          <Link className="underline" href="/privacidad">política de privacidad</Link>.
          Al continuar, acepta estos términos.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/privacidad">Ver política</Link>
          </Button>
          <Button onClick={aceptar}>Aceptar</Button>
        </div>
      </div>
    </div>
  )
}
