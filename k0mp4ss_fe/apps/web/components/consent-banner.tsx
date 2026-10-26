"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import {
  FINALIDADES_PRIVACIDAD,
  VERSION_POLITICA_PRIVACIDAD,
  type AcusePrivacidad,
  acuseVigente,
  leerAcuse,
  registrarAcuse,
  retirarAcuse,
} from "@/lib/politica-privacidad"

/**
 * F16 — banner de información + acuse de la política de privacidad.
 *
 * Ya no es un «acepto» global: la mayor parte del tratamiento se apoya en
 * contrato u obligación legal (no en consentimiento), así que el banner
 * informa qué datos se tratan, con qué finalidades, quién es el responsable
 * (la comunidad) y registra un acuse versionado («Entendido»). La
 * finalidad opcional de comunicaciones no operativas hoy no está activa, así
 * que no se pide ningún checkbox: sin casillas premarcadas ni modales
 * bloqueantes.
 *
 * Si hay un acuse de una versión anterior de la política, el banner ofrece
 * «Retirar mi aceptación»: la revocación cuesta lo mismo que otorgar.
 *
 * Incluido en `app/layout.tsx` para toda la plataforma.
 */

const FINALIDADES_ACTIVAS = FINALIDADES_PRIVACIDAD.filter((f) => f.activa)

export function ConsentBanner() {
  const [visible, setVisible] = React.useState(false)
  const [acusePrevio, setAcusePrevio] = React.useState<AcusePrivacidad | null>(null)

  React.useEffect(() => {
    let vivo = true
    void Promise.resolve().then(() => {
      if (!vivo) return
      try {
        const acuse = leerAcuse(window.localStorage)
        setAcusePrevio(acuse)
        setVisible(!acuseVigente(acuse))
      } catch {
        // intencional: sin storage, el aviso se muestra (fail-closed)
        setVisible(true)
      }
    })
    return () => {
      vivo = false
    }
  }, [])

  function entender() {
    try {
      registrarAcuse(window.localStorage, {
        version: VERSION_POLITICA_PRIVACIDAD,
        fecha: new Date().toISOString(),
      })
    } catch {
      // intencional: si no hay storage, el banner reaparece (fail-closed)
    }
    setVisible(false)
  }

  function retirar() {
    try {
      retirarAcuse(window.localStorage)
    } catch {
      // intencional: sin storage no hay nada que retirar
    }
    setAcusePrevio(null)
    setVisible(true)
  }

  if (!visible) return null

  return (
    <div
      role="region"
      aria-label="Aviso de privacidad"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">
            Cómo tratamos tus datos personales{" "}
            <span className="font-normal text-muted-foreground">
              (política versión {VERSION_POLITICA_PRIVACIDAD})
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            La plataforma trata datos de cuenta, de personas asociadas y
            registros de uso. El responsable es <strong>la comunidad</strong>.
            Esto es un aviso informativo, no un consentimiento: la mayoría del
            tratamiento se apoya en el contrato de copropiedad o en obligaciones
            legales y no depende de tu consentimiento.
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
            {FINALIDADES_ACTIVAS.map((f) => (
              <li key={f.id}>
                <strong className="font-medium">{f.nombre}</strong>: {f.baseLegal}.
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Detalle completo en la{" "}
            <Link className="underline" href="/privacidad">
              política de privacidad
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={entender}>Entendido</Button>
          {acusePrevio !== null ? (
            <Button variant="ghost" onClick={retirar}>
              Retirar mi aceptación
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
