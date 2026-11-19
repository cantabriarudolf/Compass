"use client"

/**
 * DashboardOperativo — portada de `conserjeria`, `mantencion` y `residente`
 * (T1, D1/S2).
 *
 * El recorte es por permiso, no por gusto:
 * - `conserjeria` y `mantencion` tienen `pe`: ven la foto del día de la puerta
 *   (S1) y el día a día del edificio — mantenciones preventivas (S7) y visitas
 *   técnicas (S8) —, que es lo que operan.
 * - `residente` no tiene `pe` ni `fi`: ve su estado de cuenta y sus reservas.
 *   Montarle los paneles de Operaciones devolvería 403, así que la portada
 *   cambia de composición, no de permisos.
 *
 * Ninguno de los dos perfiles ve los totales financieros de la comunidad: esa es
 * la frontera de D1 y la garantiza el servidor, no la UI.
 */
import { Badge } from "@workspace/ui/components/badge"
import { IconLayoutDashboard } from "@tabler/icons-react"
import { AccesosRapidos } from "./accesos-rapidos"
import { FotoDelDia } from "./foto-del-dia"
import { MantencionesPreventivas } from "./mantenciones-preventivas"
import { MiEstadoDeCuenta, MisReservas } from "./mi-cuenta"
import { VisitasTecnicas } from "./visitas-tecnicas"
import { puedeVer } from "./perfiles"
import { etiquetaRol, type Rol } from "@/lib/authz"

/**
 * Roles que este panel nombra. No es una tabla de etiquetas: es la lista de
 * quién aporta nombre a la cabecera. Las etiquetas viven en `lib/authz.ts`, una
 * sola vez, para que el panel y el resto del sistema no puedan discrepar.
 */
const ROLES_CON_ETIQUETA: Rol[] = ["conserjeria", "mantencion", "residente"]

export function DashboardOperativo({ roles }: { roles: string[] }) {
  const verOperaciones = puedeVer(roles, "ver", "pe")
  const etiqueta = roles
    .filter((rol) => (ROLES_CON_ETIQUETA as string[]).includes(rol))
    .map(etiquetaRol)[0]

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <IconLayoutDashboard className="size-7" />
            {verOperaciones ? "Panel operativo" : "Mi resumen"}
          </h1>
          <p className="text-muted-foreground">
            {verOperaciones
              ? "La foto del día de la comunidad y el calendario del edificio."
              : "Tu cuenta con la comunidad: cobros pendientes y reservas."}
          </p>
        </div>
        {etiqueta && (
          <Badge variant="secondary" className="text-xs">
            {etiqueta} · operativo
          </Badge>
        )}
      </header>

      {verOperaciones ? (
        <>
          <FotoDelDia />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MantencionesPreventivas />
            <VisitasTecnicas />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MiEstadoDeCuenta />
          <MisReservas />
        </div>
      )}

      <AccesosRapidos roles={roles} />
    </div>
  )
}
