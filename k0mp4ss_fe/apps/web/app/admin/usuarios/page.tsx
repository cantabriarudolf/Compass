import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { puede } from "@/lib/authz"
import { Card, CardContent } from "@workspace/ui/components/card"
import { IconLock } from "@tabler/icons-react"
import { ConsolaUsuarios } from "./_componentes/consola-usuarios"

/**
 * /admin/usuarios — la pantalla que abre el sistema (F42 · T2 · S1).
 *
 * El portón se declara acá, en el servidor, con los roles de la sesión, igual que
 * `/admin/gestion/vigencia-registro` y `/admin/mantenciones`: se decide por el
 * PERMISO (`admin:usuarios` con `ver`, la misma clave que exigen el listado, el
 * alta y el reenvío) y no por una lista de roles copiada, así que un rol que la
 * matriz habilite mañana entra sin tocar este archivo.
 *
 * A diferencia de las pantallas que redirigen al dashboard, acá se muestra un
 * estado de «sin permiso» que explica por qué: `admin:usuarios` es la capacidad
 * de emitir credenciales de acceso, y una tabla vacía se leería como «la
 * comunidad no tiene cuentas».
 */
export default async function UsuariosPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : []
  if (roles.length === 0) redirect("/ingresar")

  const puedeAdministrar = roles.some((rol) => puede(rol, "ver", "admin:usuarios"))

  if (!puedeAdministrar) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <div className="flex flex-col gap-2 border-b pb-5">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconLock className="size-7 text-muted-foreground" /> Cuentas y acceso
          </h1>
          <p className="text-muted-foreground">
            Las cuentas de acceso y sus invitaciones se administran desde la
            administración de la comunidad.
          </p>
        </div>

        <Card className="border-dashed bg-muted/20">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <p role="status">Sin permiso para abrir Cuentas y acceso.</p>
            <p className="mt-2 text-xs">
              La pantalla exige la clave{" "}
              <code className="font-mono">admin:usuarios</code> con acción{" "}
              <code className="font-mono">ver</code>, que es la misma que validan el
              listado, el alta y el reenvío. Es la capacidad de emitir credenciales
              de acceso, así que la matriz sólo se la reconoce al rol
              administrador de la comunidad.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <ConsolaUsuarios />
}
