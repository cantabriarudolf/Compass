import * as React from "react"
import Link from "next/link"
import { IconInfoCircle } from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"

/**
 * aviso-privacidad-conserjeria — aviso de privacidad visible en la operación
 * de conserjería (F14, asesoría normativa 2026-10-25).
 *
 * La bitácora registra a un tercero (el visitante: nombre, documento, patente,
 * unidad destino, jornada y hora) y la Ley 19.628 exige que el tratamiento sea
 * «debidamente informado»; la 21.719 suma un deber de transparencia. Este bloque
 * declara en lenguaje llano qué se registra, para qué, quién es el responsable
 * (la comunidad, no el administrador ni el software), cómo se conserva y cómo
 * ejercer los derechos ARCO. Es sólo información: no pide consentimiento ni
 * persiste nada.
 *
 * Tono: mismo aviso inline ámbar que `components/pe/aviso-truncamiento.tsx`.
 * El plazo de conservación queda pendiente de decisión (F15), así que se remite
 * a la política de retención de la comunidad sin inventar un número.
 */
export function AvisoPrivacidadConserjeria({ className }: { className?: string }) {
  return (
    <section
      aria-label="Aviso de privacidad para visitantes"
      className={cn(
        "flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
        className
      )}
    >
      <IconInfoCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold">Aviso de privacidad para visitantes</p>
        <p>
          Al registrar un ingreso o una encomienda, conserjería anota: nombre,
          documento de identidad (RUT o pasaporte), patente del vehículo si la
          hay, unidad destino, jornada y hora del ingreso.
        </p>
        <p>
          Esta información se usa sólo para el control de acceso y la seguridad
          de la comunidad. El responsable de estos datos es la comunidad, no el
          administrador ni el software de gestión. Los datos se conservan según
          la política de retención de la comunidad.
        </p>
        <p>
          Para ejercer tus derechos de acceso, rectificación, cancelación y
          oposición (ARCO), revisa la{" "}
          <Link href="/privacidad" className="underline underline-offset-2">
            política de privacidad
          </Link>{" "}
          y solicítalo a la administración de la comunidad. No necesitas cuenta:
          el visitante es un tercero, no un usuario del sistema.
        </p>
        <p>
          Este aviso se le muestra al visitante al registrar su ingreso.
        </p>
      </div>
    </section>
  )
}
