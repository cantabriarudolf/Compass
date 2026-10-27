"use client"

/**
 * F18 — consentimiento expreso para los datos sensibles de la ficha laboral
 * (previsionales, bancarios y de salud).
 *
 * El servidor (`app/api/personas/route.ts`) ya descarta esos campos cuando el
 * consentimiento no está otorgado; este bloque es la cara visible: sin tilde
 * los campos quedan deshabilitados y al destildar (revocar) avisa que al
 * guardar se borrarán.
 *
 * Componente controlado: el estado del consentimiento vive en la página (la
 * necesita para armar `consentimientoDatosSensibles` en el guardado y para
 * habilitar/deshabilitar los campos), acá sólo se muestra y se reporta.
 */
import * as React from "react"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"
import { VERSION_POLITICA_PRIVACIDAD } from "@/lib/politica-privacidad"

export interface ConsentimientoDatosSensiblesProps {
  /** Estado actual del consentimiento (controlado por la página). */
  otorgado: boolean
  /** Consentimiento que traía la ficha al abrirse: `true` hace que destildar sea revocar. */
  otorgadoInicial: boolean
  onOtorgado: (otorgado: boolean) => void
}

export function ConsentimientoDatosSensibles({ otorgado, otorgadoInicial, onOtorgado }: ConsentimientoDatosSensiblesProps) {
  // Hubo otorgamiento en esta sesión o venía de la ficha cargada: destildar
  // desde ahí es una revocación y el usuario debe saber que al guardar se
  // borran los datos.
  const [activadoAlgunaVez, setActivadoAlgunaVez] = React.useState(otorgadoInicial)

  const cambiar = (valor: boolean) => {
    if (valor) setActivadoAlgunaVez(true)
    onOtorgado(valor)
  }

  const revoca = !otorgado && activadoAlgunaVez

  return (
    <div className="rounded-lg border p-3" data-otorgado={otorgado ? "true" : "false"}>
      <div className="flex items-start gap-2">
        <Checkbox
          id="f-consentimiento-sensible"
          checked={otorgado}
          onCheckedChange={v => cambiar(v === true)}
        />
        <Label htmlFor="f-consentimiento-sensible" className="font-normal leading-snug">
          Autorizo el registro de mis datos previsionales y de salud, necesarios para liquidaciones y cumplimiento laboral. Puedo revocarlo cuando quiera.
        </Label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {revoca
          ? "Al guardar la ficha se borrarán los datos previsionales, bancarios y de salud registrados."
          : otorgado
            ? `Los campos previsionales, bancarios y de salud están habilitados (política de privacidad v${VERSION_POLITICA_PRIVACIDAD}).`
            : "Los campos previsionales, bancarios y de salud se habilitan al autorizar."}
      </p>
    </div>
  )
}
