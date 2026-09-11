import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Términos de uso",
  description: "Condiciones de uso de la plataforma Compass.",
}

/**
 * SERIE-PRODUCCION-FASE2 P6 — scaffold mínimo de términos de uso.
 * NO es texto legal definitivo: el owner debe revisarlo con un abogado.
 */
export default function PaginaTerminos() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Términos de uso</h1>
        <p className="text-sm text-muted-foreground">
          Última actualización: septiembre de 2026 · Documento borrador sujeto a revisión legal.
        </p>
      </div>
      <section className="space-y-2 rounded-lg border bg-card p-4 shadow-sm">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>El acceso requiere una cuenta autorizada por la administración de su comunidad.</li>
          <li>Usted es responsable de mantener la confidencialidad de su contraseña y de su segundo factor.</li>
          <li>Queda prohibido el uso con fines ilícitos, la extracción masiva de datos y el acceso a comunidades ajenas.</li>
          <li>La administración puede suspender cuentas ante incumplimientos o riesgos de seguridad.</li>
          <li>El tratamiento de datos personales se rige por la <Link className="underline" href="/privacidad">política de privacidad</Link> y la Ley 21.719.</li>
        </ul>
      </section>
    </main>
  )
}
