import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Card, CardContent } from "@workspace/ui/components/card"
import { IconLock } from "@tabler/icons-react"
import {
  puedeCrearRepartosSector,
  puedeVerRepartosSector,
} from "./alcance"
import { ConsolaRepartosSector } from "./_componentes/repartos-sector"

/**
 * /admin/gestion/repartos-sector — la cara visible del reparto de un gasto entre las
 * unidades de un sector, en proporción al avalúo fiscal (F32 · U4 del plan
 * «saldar-v2-pantallas-y-barrido», S1 y S2).
 *
 * El reglamento de la comunidad manda que el gasto de un bien o servicio que sirve
 * SÓLO a un sector se cargue sólo a ese sector, en proporción al avalúo fiscal de sus
 * unidades (Ley 21.442). La emisión general reparte entre todas las unidades de la
 * comunidad y no puede expresar esa carga diferenciada: el contrato existe por API
 * desde F32 y nadie podía emitir un reparto sin curl. Esta pantalla sigue el molde
 * de `/admin/gestion/vigencia-registro`.
 *
 * El portón se declara acá, en el servidor, con los roles de la sesión (Auth.js): se
 * decide por el PERMISO (`fi:gasto_comun` con `ver`, el mismo que exige la lectura
 * de la API) y no por una lista de roles copiada, así que un rol que la matriz
 * habilite mañana entra sin tocar este archivo.
 *
 * Si el rol no alcanza, se renderiza el «sin permiso» ANTES de montar la consola
 * —no una tabla vacía que se leería como «la comunidad no repartió nada»— y sin
 * redirigir: quien tiene sesión pero no la clave merece saber cuál le falta.
 *
 * La emisión no la decide esta página por su cuenta: viaja como prop (`crear`), que
 * es la acción que exige el POST. El avalúo de cada unidad NO viaja desde acá: lo
 * lee el servidor de la base.
 */
export default async function RepartosSectorPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : []
  if (roles.length === 0) redirect("/ingresar")

  if (!puedeVerRepartosSector(roles)) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <div className="flex flex-col gap-2 border-b pb-5">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconLock className="size-7 text-muted-foreground" /> Reparto de
            gasto por sector
          </h1>
          <p className="text-muted-foreground">
            El gasto de un bien o servicio que sirve a un solo sector se carga a
            ese sector, en proporción al avalúo fiscal de sus unidades.
          </p>
        </div>

        <Card className="border-dashed bg-muted/20">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <p role="status">
              Sin permiso para abrir el reparto de gasto por sector.
            </p>
            <p className="mt-2 text-xs">
              La pantalla exige la clave{" "}
              <code className="font-mono">fi:gasto_comun</code> con acción{" "}
              <code className="font-mono">ver</code>, que es la misma que valida
              la API al leer los repartos de la comunidad. Emitir uno pide{" "}
              <code className="font-mono">crear</code>. Pedile a la
              administración que revise los permisos de tu membresía.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <ConsolaRepartosSector puedeCrear={puedeCrearRepartosSector(roles)} />
}
