import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { puedeVerAvisosCobro } from "./alcance"
import { ConsolaAvisosCobro } from "./consola-avisos-cobro"

/**
 * /comunidad/avisos-cobro — el aviso de cobro del residente (F27).
 *
 * El portón se declara en el servidor con los roles de la sesión (Auth.js),
 * igual que `/comunidad/archivo`: se decide por el PERMISO y no por una lista de
 * roles copiada. El par de claves es el MISMO que decide la API
 * (`fi:gasto_comun` ver para la gestión, `fi:aviso:propio` ver para el
 * residente), declarado una sola vez en `alcance.ts`, así que un rol que la
 * matriz habilite mañana entra sin tocar este archivo.
 *
 * Qué avisos ve cada uno NO se decide acá ni en la pantalla: el alcance por
 * fila vive en el `where` de la ruta (`alcanceAvisosCobro`) y el residente
 * recibe solo los de las unidades donde tiene vínculo vigente. La pantalla no
 * filtra: repetir la regla en el cliente sería una segunda copia capaz de
 * divergir de la que protege los datos.
 *
 * Los roles viajan a la consola para que el texto del vacío diga la verdad de
 * quien lee —«tu unidad» no es cierto para quien ve la comunidad completa— y
 * para nada más.
 */
export default async function AvisosCobroPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : []
  if (roles.length === 0) redirect("/ingresar")
  if (!puedeVerAvisosCobro(roles)) redirect("/dashboard")

  return <ConsolaAvisosCobro roles={roles} />
}
