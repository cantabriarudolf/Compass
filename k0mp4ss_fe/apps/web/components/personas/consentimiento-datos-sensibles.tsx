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

  // Un solo lugar para el texto de ayuda: sin ternarios anidados.
  let ayuda = "Los campos de la ficha médica se habilitan al autorizar."
  if (revoca) {
    ayuda = "Al guardar la ficha se borrarán los datos médicos registrados."
  } else if (otorgado) {
    ayuda = `Los campos de la ficha médica están habilitados (política de privacidad v${VERSION_POLITICA_PRIVACIDAD}).`
  }

  return (
    <div className="rounded-lg border p-3" data-otorgado={otorgado ? "true" : "false"}>
      <div className="flex items-start gap-2">
        <Checkbox
          id="f-consentimiento-sensible"
          checked={otorgado}
          onCheckedChange={v => cambiar(v === true)}
        />
        <Label htmlFor="f-consentimiento-sensible" className="font-normal leading-snug">
          Autorizo el registro de mi ficha médica (medicamentos, alergias y condiciones). Puedo revocarlo cuando quiera.
        </Label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{ayuda}</p>
    </div>
  )
}
