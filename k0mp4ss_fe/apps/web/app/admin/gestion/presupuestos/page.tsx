import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Card, CardContent } from "@workspace/ui/components/card"
import { IconLock } from "@tabler/icons-react"
import { puedeCrearPresupuestos, puedeVerPresupuestos } from "./alcance"
import { ConsolaPresupuestos } from "./_componentes/presupuestos"

/**
 * /admin/gestion/presupuestos — la cara visible del presupuesto por partidas
 * (F31 · U3 del plan «saldar-v2-pantallas-y-barrido», S1 y S2).
 *
 * El contrato existe por API desde F31 (Ley 21.442 arts. 15 y 17: el cuerpo que
 * aprueba el presupuesto lo define el reglamento de cada comunidad y el sistema
 * lo COPIA del acuerdo) y nadie podía aprobar un presupuesto anual sin curl.
 * Esta pantalla sigue el molde de `/admin/gestion/vigencia-registro`.
 *
 * El portón se declara acá, en el servidor, con los roles de la sesión (Auth.js):
 * se decide por el PERMISO (`fi:gasto_comun` con `ver`, el mismo que exige la
 * lectura de la API) y no por una lista de roles copiada, así que un rol que la
 * matriz habilite mañana entra sin tocar este archivo.
 *
 * Si el rol no alcanza, se renderiza el «sin permiso» ANTES de montar la consola
 * —no una tabla vacía que se leería como «la comunidad no tiene presupuesto»— y
 * sin redirigir: quien tiene sesión pero no la clave merece saber cuál le falta.
 *
 * El alta no la decide esta página por su cuenta: viaja como prop (`crear`), que
 * es la acción que exige el POST. El cuerpo del presupuesto NO es un permiso ni
 * una elección: lo lee el servidor del acuerdo.
 */
export default async function PresupuestosPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : []
  if (roles.length === 0) redirect("/ingresar")

  if (!puedeVerPresupuestos(roles)) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <div className="flex flex-col gap-2 border-b pb-5">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconLock className="size-7 text-muted-foreground" /> Presupuesto
            por partidas
          </h1>
          <p className="text-muted-foreground">
            El presupuesto anual de gastos comunes lo aprueba el cuerpo que
            defina el reglamento de la comunidad.
          </p>
        </div>

        <Card className="border-dashed bg-muted/20">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <p role="status">
              Sin permiso para abrir el presupuesto por partidas.
            </p>
            <p className="mt-2 text-xs">
              La pantalla exige la clave{" "}
              <code className="font-mono">fi:gasto_comun</code> con acción{" "}
              <code className="font-mono">ver</code>, que es la misma que valida
              la API al leer el presupuesto de la comunidad. Registrar uno pide{" "}
              <code className="font-mono">crear</code>. Pedile a la
              administración que revise los permisos de tu membresía.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <ConsolaPresupuestos puedeCrear={puedeCrearPresupuestos(roles)} />
}
