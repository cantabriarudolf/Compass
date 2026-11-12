import { redirect } from "next/navigation"
import { Card, CardContent } from "@workspace/ui/components/card"
import { IconLock } from "@tabler/icons-react"
import { auth } from "@/lib/auth"
import { ConsolaAcuerdos } from "./consola-acuerdos"
import { puedeRegistrarAcuerdos, puedeVerRegistroAcuerdos } from "./alcance"

/**
 * /comunidad/directiva/acuerdos — el registro de acuerdos de gobernanza con sus
 * votos (U3b · requirement «Registro de Acuerdos con Votos Inmutables»).
 *
 * Vive como sub-ruta de `/comunidad/directiva` porque es el espacio de gobernanza
 * del comité: la directiva administra sus actas ahí y el acuerdo es la otra mitad
 * del mismo libro (folio, cuerpo, materia y la sesión que lo respalda). El
 * `page.tsx` de la directiva ya no podía crecer más sin mezclar dos registros, y
 * una ruta propia deja la pantalla del registro donde se la busca.
 *
 * El portón se declara acá, en el servidor, con los roles de la sesión (Auth.js),
 * igual que `/comunidad/archivo` y `/admin/gestion/vigencia-registro`, y se
 * decide por el PERMISO (`gd` con `ver`, la misma clave que exige la lectura de la
 * API) y no por una lista de roles copiada: cualquier rol que la matriz habilite
 * mañana entra sin tocar este archivo.
 *
 * El permiso del alta (`gd` con `crear`) viaja como prop para que la consola no
 * ofrezca un formulario que la API va a rechazar; la API sigue validando cada
 * escritura. La elegibilidad para VOTAR no se resuelve acá: el servidor la deriva
 * de la sesión y de los vínculos (ver `consola-acuerdos.tsx`).
 */
export default async function AcuerdosPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : []
  if (roles.length === 0) redirect("/ingresar")

  if (!puedeVerRegistroAcuerdos(roles)) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <div className="flex flex-col gap-2 border-b pb-5">
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <IconLock className="size-7 text-muted-foreground" /> Registro de
            Acuerdos
          </h1>
          <p className="text-muted-foreground">
            Los acuerdos del comité y de la asamblea se leen por la clave de
            gobernanza.
          </p>
        </div>

        <Card className="border-dashed bg-muted/20">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <p role="status">
              Sin permiso para abrir el registro de acuerdos.
            </p>
            <p className="mt-2 text-xs">
              La pantalla exige la clave <code className="font-mono">gd</code>{" "}
              con acción <code className="font-mono">ver</code>, que es la misma
              que valida la API al leer el registro: la administración, el comité
              y el residente la tienen en la matriz. Pedile a la administración
              que revise los permisos de tu membresía.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <ConsolaAcuerdos puedeRegistrar={puedeRegistrarAcuerdos(roles)} />
}
