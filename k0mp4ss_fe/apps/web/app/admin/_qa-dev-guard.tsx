/**
 * Guard de servidor del módulo QA/dev (F9 — pe-paneles-bd, unidad N2).
 *
 * Componente de servidor (sin "use client"): resuelve la sesión real con
 * `auth()`, arma el objeto que consume la función pura `puedeVerModuloQaDev`
 * (lib/qa-dev-acceso.ts) y, si no hay acceso, corta con `notFound()` (404,
 * sin filtrar la existencia de la ruta).
 *
 * Qué NO protege: sólo es la cortina de UI. Las rutas API del módulo
 * (`/api/qa-lab/**`, `/api/dev-dashboard`) llevan su propio candado de entorno
 * (`isWriteApiEnabled` en lib/env-guard.ts) más sesión y permisos; saltarse
 * este guard no da acceso a datos. El opt-in de la lane e2e reusa la misma
 * semántica de env-guard (`E2E_ALLOW_WRITE_APIS === "1"`).
 *
 * Se consume desde los layout.tsx de app/admin/qa-lab, app/admin/dev-dashboard
 * y app/admin/mantenimiento. No se tocan las páginas existentes.
 */
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { isProduction } from "@/lib/env-guard"
import { puedeVerModuloQaDev } from "@/lib/qa-dev-acceso"

export async function QaDevGuard({ children }: { children: React.ReactNode }) {
  // Igual que app/layout.tsx: auth() puede fallar en el borde; sesión ausente
  // es equivalente a roles vacíos y termina en 404.
  const sesion = await auth().catch(() => null)
  const roles: string[] = Array.isArray(sesion?.user?.roles) ? sesion.user.roles : []
  const optInE2E = process.env.E2E_ALLOW_WRITE_APIS === "1"

  if (!puedeVerModuloQaDev({ roles, esProduccion: isProduction(), optInE2E })) {
    notFound()
  }

  return <>{children}</>
}
