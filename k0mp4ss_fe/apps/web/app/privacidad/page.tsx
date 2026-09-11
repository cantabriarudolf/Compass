import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Cómo recolectamos, usamos y protegemos sus datos personales (Ley 21.719).",
}

/**
 * SERIE-PRODUCCION-FASE2 P6 — scaffold de política de privacidad.
 * NO es texto legal definitivo: el owner debe revisarlo con un abogado antes
 * de producción. Cubre: datos, fines, protección, derechos ARCO y contacto.
 */
const SECCIONES: Array<{ titulo: string; cuerpo: string[] }> = [
  {
    titulo: "1. Qué datos recolectamos",
    cuerpo: [
      "Datos de cuenta: correo electrónico y credenciales de acceso (la contraseña se almacena solo como hash irreversible).",
      "Datos de persona asociada: nombre, RUT, teléfonos y datos laborales necesarios para la gestión de la comunidad.",
      "Datos de uso: registros de actividad dentro de la plataforma con fines de auditoría y seguridad.",
    ],
  },
  {
    titulo: "2. Para qué los usamos",
    cuerpo: [
      "Autenticar su acceso y mantener la seguridad de su cuenta (incluido segundo factor si lo activa).",
      "Gestionar su pertenencia a comunidades, roles y permisos.",
      "Generar liquidaciones, comunicaciones y reportes propios de la administración.",
      "Nunca vendemos ni cedemos sus datos a terceros con fines publicitarios.",
    ],
  },
  {
    titulo: "3. Cómo los protegemos",
    cuerpo: [
      "Cifrado de datos sensibles en reposo (AES-256-GCM) y conexiones cifradas (HTTPS).",
      "Contraseñas con política de robustez y sesiones de 24 horas con invalidación remota.",
      "Segundo factor de autenticación (TOTP) disponible para todas las cuentas.",
      "Acceso interno por roles con mínimo privilegio y registros de auditoría.",
    ],
  },
  {
    titulo: "4. Sus derechos (Ley 21.719)",
    cuerpo: [
      "Acceso y portabilidad: puede ver y descargar todos sus datos desde “Mis datos personales”.",
      "Rectificación: puede corregir su correo y teléfonos desde la misma sección.",
      "Oposición y eliminación (derecho a olvido): puede solicitar la eliminación; se procesa en un plazo máximo de 30 días, salvo obligaciones legales de conservación.",
    ],
  },
  {
    titulo: "5. Contacto",
    cuerpo: [
      "Para ejercer sus derechos o consultas de privacidad, escriba al correo de contacto de su comunidad o a administración.",
      "Este documento es un borrador funcional y será validado legalmente antes de su publicación definitiva.",
    ],
  },
]

export default function PaginaPrivacidad() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Política de privacidad</h1>
        <p className="text-sm text-muted-foreground">
          Última actualización: septiembre de 2026 · Documento borrador sujeto a revisión legal.
        </p>
      </div>
      {SECCIONES.map((s) => (
        <section key={s.titulo} className="space-y-2 rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-medium">{s.titulo}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {s.cuerpo.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-sm">
        <Link className="underline" href="/terminos">Ver términos de uso</Link>
        {" · "}
        <Link className="underline" href="/admin/mis-datos">Mis datos personales</Link>
      </p>
    </main>
  )
}
