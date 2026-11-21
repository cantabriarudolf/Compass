import Link from "next/link"
import { redirect } from "next/navigation"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconListCheck,
  IconLock,
} from "@tabler/icons-react"
import { puede } from "@/lib/authz"
import { withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { calcularArranque, type PasoArranque } from "@/lib/onboarding-arranque"

/**
 * /admin/arranque — qué le falta a la comunidad para operar (F47 · S3).
 *
 * La pantalla NO decide nada: pide al servidor los doce pasos ya medidos
 * (`lib/onboarding-arranque.ts`, la misma función que sirve `GET /api/onboarding`)
 * y los pinta. No hay botones que ejecuten un paso: cada uno se carga en su propia
 * pantalla, y el enlace lleva ahí. El único acto que podría tentar —asegurar el
 * catálogo del país— vive en `/admin/maestros` (F46) y acá sólo se enlaza, para no
 * tener dos copias del mismo asegurado.
 *
 * El portón se declara en el servidor por PERMISO (`cf` ver, el recurso de
 * administración de la comunidad, el mismo que exige la API) y no por una lista de
 * roles copiada: si la matriz habilita otro rol mañana, entra sin tocar el archivo.
 */
export default async function ArranquePage() {
  const resultado = await withComunidadScope().catch(() => null)
  if (!resultado) {
    return (
      <SinPermiso mensaje="No pudimos resolver la comunidad de la sesión, así que no hay arranque que medir." />
    )
  }
  if (!resultado.ok) {
    if (resultado.response.status === 401) redirect("/ingresar")
    return (
      <SinPermiso mensaje="La cuenta no tiene una comunidad asignada, así que no hay arranque que medir." />
    )
  }

  const { scope } = resultado
  if (!puede(scope.rol, "ver", "cf")) {
    return (
      <SinPermiso mensaje="El arranque de la comunidad exige el permiso de configuración con la acción ver, que la matriz reconoce a administración y comité." />
    )
  }

  const { pasos, faltantes } = await calcularArranque(scope.comunidadId, scope.usuarioId)
  // Los pendientes primero, y cada grupo en el orden del manual (S2): el sort de
  // JS es estable, así que el orden dentro de cada estado no cambia. El número que
  // muestra cada fila es el del manual, no el de la lista reordenada.
  const numeroEnElManual = new Map(pasos.map((p, indice) => [p.id, indice + 1]))
  const ordenados = [...pasos].sort(
    (a, b) => Number(a.estado === "hecho") - Number(b.estado === "hecho")
  )

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b pb-5">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <IconListCheck className="size-7 text-primary" /> Arranque de la comunidad
        </h1>
        <Link
          href="/admin/arranque/pauta"
          className="w-fit text-sm font-medium text-primary underline underline-offset-2"
        >
          Ver la pauta de migración paso a paso
        </Link>
        <p className="text-muted-foreground" role="status">
          {faltantes === 0
            ? "No falta ningún paso: la comunidad tiene todo lo que necesita para operar."
            : `Faltan ${faltantes} de ${pasos.length} pasos. Abajo está cada uno con lo que mide hoy y la pantalla donde se carga.`}
        </p>
      </div>

      <ol className="flex flex-col gap-3" aria-label="Pasos del arranque">
        {ordenados.map((paso) => (
          <FilaPaso
            key={paso.id}
            paso={paso}
            numero={numeroEnElManual.get(paso.id) ?? 0}
            total={pasos.length}
          />
        ))}
      </ol>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="py-4 text-xs text-muted-foreground">
          <p>
            Esta pantalla sólo mide: cada paso se carga en la suya. El catálogo del
            país es la excepción — se asegura desde{" "}
            <Link href="/admin/maestros" className="font-medium underline underline-offset-2">
              Maestros Administrativos
            </Link>
            , con el botón que ya existe ahí.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function FilaPaso({
  paso,
  numero,
  total,
}: {
  paso: PasoArranque
  numero: number
  total: number
}) {
  const hecho = paso.estado === "hecho"
  return (
    <li>
      <Card className={hecho ? "shadow-none" : "border-amber-500/30 shadow-none"}>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 font-mono text-xs text-muted-foreground">
              {numero}/{total}
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{paso.titulo}</span>
                <Badge
                  variant="secondary"
                  className={
                    hecho
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  }
                >
                  {hecho ? (
                    <IconCircleCheck className="size-3" aria-hidden />
                  ) : (
                    <IconAlertTriangle className="size-3" aria-hidden />
                  )}
                  {hecho ? "Hecho" : "Pendiente"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{paso.detalle}</p>
            </div>
          </div>
          <Link
            href={paso.href}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Abrir pantalla <IconArrowRight className="size-4" aria-hidden />
          </Link>
        </CardContent>
      </Card>
    </li>
  )
}

function SinPermiso({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b pb-5">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <IconLock className="size-7 text-muted-foreground" /> Arranque de la comunidad
        </h1>
        <p className="text-muted-foreground">
          El estado del arranque es una lectura de administración.
        </p>
      </div>
      <Card className="border-dashed bg-muted/20">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <p role="status">{mensaje}</p>
        </CardContent>
      </Card>
    </div>
  )
}
