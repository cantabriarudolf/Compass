import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Card, CardContent } from "@workspace/ui/components/card"
import { IconLock } from "@tabler/icons-react"
import { puedeAdministrarVigencia, puedeRequerirVigencia } from "./alcance"
import { ConsolaVigenciaRegistro } from "./_componentes/vigencia-registro"

/**
 * /admin/gestion/vigencia-registro — la cara visible del Registro de
 * Copropietarios (serie «Vigencia del Registro», T6 · S2 y S8).
 *
 * El portón se declara acá, en el servidor, con los roles de la sesión (Auth.js),
 * igual que `/admin/mantenciones` y `/comunidad/aviso-de-cobro`: se decide por el
 * PERMISO (`ad` con `editar`, la misma clave que exige la lectura de la API) y no
 * por una lista de roles copiada, así que un rol que la matriz habilite mañana
 * entra sin tocar este archivo.
 *
 * A diferencia de sus hermanas, la pantalla NO redirige cuando el rol existe pero
 * no alcanza: muestra un estado de «sin permiso» que explica por qué, en vez de
 * mandar al dashboard sin decir nada ni pintar una tabla vacía que se leería como
 * «la comunidad no tiene unidades».
 *
 * Las acciones por fila no se deciden acá: el `estado` derivado viaja desde la
 * API y la consola ofrece sólo el acto que ese estado admite. El permiso de
 * requerir sí es una decisión del servidor que viaja como prop (`ad` con `crear`);
 * leer, revalidar y emitir avisos comparten `ad:editar`, que es este portón.
 */
export default async function VigenciaRegistroPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : []
  if (roles.length === 0) redirect("/ingresar")

  if (!puedeAdministrarVigencia(roles)) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <div className="flex flex-col gap-2 border-b pb-5">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconLock className="size-7 text-muted-foreground" /> Vigencia del
            Registro de Copropietarios
          </h1>
          <p className="text-muted-foreground">
            El estado del registro se administra por unidad.
          </p>
        </div>

        <Card className="border-dashed bg-muted/20">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <p role="status">
              Sin permiso para abrir la vigencia del Registro de Copropietarios.
            </p>
            <p className="mt-2 text-xs">
              La pantalla exige la clave <code className="font-mono">ad</code> con
              acción <code className="font-mono">editar</code>, que es la misma que
              valida la API al leer el registro completo. La acción{" "}
              <code className="font-mono">ver</code> no alcanza: la tiene el rol
              residente y con ella vería el registro de todas las unidades. Pedile
              a la administración que revise los permisos de tu membresía.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <ConsolaVigenciaRegistro puedeRequerir={puedeRequerirVigencia(roles)} />
  )
}
