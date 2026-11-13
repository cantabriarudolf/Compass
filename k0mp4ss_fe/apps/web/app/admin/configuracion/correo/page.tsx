import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Card, CardContent } from "@workspace/ui/components/card"
import { IconLock } from "@tabler/icons-react"
import { puedeEditarCredencialCorreo, puedeVerCredencialCorreo } from "./alcance"
import { ConsolaCredencialCorreo } from "./_componentes/correo"

/**
 * /admin/configuracion/correo — la cara visible de la credencial SMTP POR COMUNIDAD
 * (F33 · U5 del plan «saldar-v2-pantallas-y-barrido», S1 y S2).
 *
 * Hasta F33 la contraseña del buzón vivía en UNA sola variable de entorno
 * (`SMTP_PASSWORD`): un despliegue con dos comunidades y dos buzones no podía
 * autenticar en la segunda. El contrato por comunidad existe por API y nadie podía
 * cargar una credencial sin curl. Esta pantalla sigue el molde de
 * `/admin/gestion/vigencia-registro`.
 *
 * El portón se declara acá, en el servidor, con los roles de la sesión (Auth.js): se
 * decide por el PERMISO (`cf` con `ver`, el mismo que exige la lectura de la API) y
 * no por una lista de roles copiada, así que un rol que la matriz habilite mañana
 * entra sin tocar este archivo.
 *
 * Si el rol no alcanza, se renderiza el «sin permiso» ANTES de montar la consola
 * —no un formulario vacío que se leería como «la comunidad no tiene credencial»— y
 * sin redirigir: quien tiene sesión pero no la clave merece saber cuál le falta.
 *
 * Guardar y probar no los decide esta página por su cuenta: viajan como prop
 * (`puedeEditar`), que es la acción que exigen el `PUT` y el `POST …/probar`. El
 * `comunidadId` no viaja desde acá: lo resuelve el servidor desde la sesión.
 */
export default async function CredencialCorreoPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : []
  if (roles.length === 0) redirect("/ingresar")

  if (!puedeVerCredencialCorreo(roles)) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <div className="flex flex-col gap-2 border-b pb-5">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconLock className="size-7 text-muted-foreground" /> Credencial de
            correo de la comunidad
          </h1>
          <p className="text-muted-foreground">
            Cada comunidad guarda la credencial de su propio buzón SMTP: servidor,
            puerto, usuario y contraseña. La contraseña se cifra en la base.
          </p>
        </div>

        <Card className="border-dashed bg-muted/20">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <p role="status">
              Sin permiso para abrir la credencial de correo de la comunidad.
            </p>
            <p className="mt-2 text-xs">
              La pantalla exige la clave <code className="font-mono">cf</code> con
              acción <code className="font-mono">ver</code>, que es la misma que
              valida la API al leer la credencial. Guardarla o rotarla y probar el
              envío piden <code className="font-mono">editar</code>. Pedile a la
              administración que revise los permisos de tu membresía.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <ConsolaCredencialCorreo
      puedeEditar={puedeEditarCredencialCorreo(roles)}
    />
  )
}
