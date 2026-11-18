"use client"

/**
 * Cuentas y acceso — la pantalla que abre el sistema (F42 · T2 · S1/S4/S5).
 *
 * Qué hace:
 *
 *   · Lista las cuentas de la comunidad con su ROL DE ACCESO y el estado de su
 *     invitación tal como lo devolvió el servidor: pendiente, vencida o usada,
 *     con sus fechas. El navegador no deriva ninguno de esos estados.
 *   · Da de alta una cuenta eligiendo persona del padrón y rol de acceso: una
 *     sola llamada, porque en el servidor es un solo acto (S1/S3).
 *   · Reenvía la invitación sobre una cuenta con invitación pendiente o vencida.
 *     Reenviar VENCE la anterior en el mismo acto: dos enlaces vivos para la
 *     misma cuenta serían dos puertas. El botón se ofrece sólo donde el servidor
 *     lo acepta; sobre una invitación usada no hay nada que reenviar.
 *
 * Dos cosas que el texto de esta pantalla dice y no esconde:
 *
 *   1. El rol de la persona en la comunidad —propietario, arrendatario, personal—
 *      NO da acceso. El acceso es la cuenta con su rol, y la confusión nace justo
 *      acá, así que se deshace acá.
 *   2. La invitación queda emitida, pero el envío por correo todavía no existe
 *      (F43): la persona no fue avisada y esta pantalla no puede avisarla. Por eso
 *      el enlace se revela acá, UNA sola vez, en la respuesta que crea o reenvía
 *      (L4), con su botón de copiar y el aviso de que no se vuelve a mostrar: la
 *      administración invita sin conocer la contraseña, pero tiene que poder
 *      entregar el enlace o no está invitando a nadie.
 *
 * El enlace no entra al listado ni a ninguna caché: vive en el estado local que
 * esta pantalla borra al cerrar el aviso. Si se cierra sin copiarlo, se perdió y
 * la única salida es reenviar, que vence el anterior — y la pantalla lo dice.
 *
 * Honestidad de la UI: después de cada acto se vuelve a leer el listado —el
 * veredicto es del servidor— y un 403/409 se muestra con el texto de la ruta tal
 * cual, sin traducirlo ni declarar un éxito que no ocurrió.
 */
import * as React from "react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCopy,
  IconKey,
  IconLink,
  IconLoader2,
  IconRefresh,
  IconUserPlus,
} from "@tabler/icons-react"
import { ROLES, type Rol } from "@/lib/authz"
import { usePersonas } from "@/lib/api/use-personas"
import {
  crearCuentaDeAcceso,
  reenviarInvitacionDeAcceso,
  useComunidadesPropias,
  useCuentasDeComunidad,
  type CuentaDeComunidad,
  type InvitacionPublica,
} from "@/lib/api/use-admin-usuarios"

/** Etiqueta corta del rol DE ACCESO (no del rol de la persona en el padrón). */
const ETIQUETA_ROL: Record<Rol, string> = {
  administrador: "Administrador",
  comite: "Comité",
  conserjeria: "Conserjería",
  residente: "Residente",
  mantencion: "Mantención",
}

/**
 * El aviso que acompaña a toda invitación emitida. Es el hueco que hay que decir
 * en pantalla y no esconder: el correo de bienvenida es F43 y todavía no existe.
 */
const AVISO_SIN_CORREO =
  "El envío por correo todavía no existe (F43): la persona todavía no fue avisada."

/** Fecha corta de una marca ISO, sin depender de la zona del navegador. */
function fechaCorta(iso: string): string {
  const soloFecha = iso.split("T")[0] ?? iso
  const [anio = "", mes = "", dia = ""] = soloFecha.split("-")
  return `${dia}-${mes}-${anio}`
}

function EstadoInvitacion({ invitacion }: { invitacion: InvitacionPublica | null }) {
  if (!invitacion) {
    return <span className="text-sm text-muted-foreground">Sin invitación</span>
  }
  if (invitacion.estado === "pendiente") {
    return (
      <div className="flex flex-col gap-1">
        <Badge className="w-fit bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
          Pendiente
        </Badge>
        <span className="text-xs text-muted-foreground">
          {`Vence el ${fechaCorta(invitacion.expiraEn)}`}
        </span>
      </div>
    )
  }
  if (invitacion.estado === "vencida") {
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="secondary" className="w-fit text-muted-foreground">
          Vencida
        </Badge>
        <span className="text-xs text-muted-foreground">
          {`Venció el ${fechaCorta(invitacion.expiraEn)}`}
        </span>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <Badge className="w-fit bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
        Usada
      </Badge>
      <span className="text-xs text-muted-foreground">
        {invitacion.usadoEn
          ? `Usada el ${fechaCorta(invitacion.usadoEn)}`
          : "Usada"}
      </span>
    </div>
  )
}

/** Una invitación se reenvía sólo si todavía puede abrir algo (S4). */
function admiteReenvio(invitacion: InvitacionPublica | null): boolean {
  return invitacion?.estado === "pendiente" || invitacion?.estado === "vencida"
}

export function ConsolaUsuarios() {
  const {
    comunidades,
    isLoading: cargandoComunidades,
    error: errorComunidades,
  } = useComunidadesPropias()
  // La última es la membresía más reciente: el mismo alcance que resuelve el
  // servidor para el listado y para el padrón (`withComunidadScope`).
  const comunidad = comunidades.length > 0 ? comunidades[comunidades.length - 1]! : null
  const {
    cuentas,
    comunidadNombre,
    isLoading: cargandoCuentas,
    error: errorCuentas,
    refrescar,
  } = useCuentasDeComunidad(comunidad?.id ?? null)

  const {
    personas,
    isLoading: cargandoPersonas,
    error: errorPersonas,
  } = usePersonas(undefined, { todasLasPaginas: true })

  const [personaId, setPersonaId] = React.useState("")
  const [rol, setRol] = React.useState<"" | Rol>("")
  const [creando, setCreando] = React.useState(false)
  const [errorAlta, setErrorAlta] = React.useState<string | null>(null)
  const [aviso, setAviso] = React.useState<string | null>(null)

  const [reenviandoId, setReenviandoId] = React.useState<string | null>(null)
  const [errorReenvio, setErrorReenvio] = React.useState<string | null>(null)

  // L4: el enlace se revela una sola vez y vive sólo acá, hasta que se cierra el
  // aviso. No se guarda en el listado ni en la caché de SWR: el servidor no lo
  // persiste en claro y no puede volver a emitirlo. `para` nombra la cuenta a la
  // que pertenece: sin eso, el enlace sería un texto suelto que nadie puede
  // atribuir a quién invitar.
  const [entrega, setEntrega] = React.useState<{
    enlace: string
    para: string
  } | null>(null)
  const [copiado, setCopiado] = React.useState(false)
  const [errorCopia, setErrorCopia] = React.useState<string | null>(null)

  /** Cierra el aviso y olvida el enlace: no queda en ningún estado de la pantalla. */
  function olvidarEnlace(): void {
    setEntrega(null)
    setCopiado(false)
    setErrorCopia(null)
  }

  async function copiarEnlace(): Promise<void> {
    if (!entrega) return
    try {
      await navigator.clipboard.writeText(entrega.enlace)
      setCopiado(true)
      setErrorCopia(null)
    } catch {
      // El navegador puede negar el portapapeles. Se dice y no se declara
      // copiado: el enlace sigue a la vista para copiarlo a mano.
      setCopiado(false)
      setErrorCopia(
        "No se pudo copiar automáticamente: seleccioná el enlace y copialo a mano."
      )
    }
  }

  const puedeCrear = comunidad !== null && personaId !== "" && rol !== ""

  async function crear(): Promise<void> {
    if (!comunidad || !puedeCrear || creando) return
    const persona = personas.find((p) => p.id === personaId)
    setCreando(true)
    setErrorAlta(null)
    setAviso(null)
    olvidarEnlace()
    const resultado = await crearCuentaDeAcceso({
      comunidadId: comunidad.id,
      personaId,
      rol,
    })
    setCreando(false)

    // Sin éxito no se limpia el formulario ni se relee: el acto no ocurrió y el
    // texto del servidor se muestra tal cual.
    if (!resultado.ok) {
      setErrorAlta(resultado.error)
      return
    }

    setPersonaId("")
    setRol("")
    setAviso(
      `La invitación quedó emitida para ${
        persona?.email ?? "la persona elegida"
      } con rol ${ETIQUETA_ROL[rol]}. ${AVISO_SIN_CORREO}`
    )
    // El enlace existe sólo en esta respuesta: se muestra acá o se pierde.
    if (resultado.enlace) {
      setEntrega({
        enlace: resultado.enlace,
        para: persona?.email ?? "la persona elegida",
      })
    }
    await refrescar()
  }

  async function reenviar(cuenta: CuentaDeComunidad): Promise<void> {
    if (!comunidad || reenviandoId !== null) return
    setReenviandoId(cuenta.usuario.id)
    setErrorReenvio(null)
    setAviso(null)
    olvidarEnlace()
    const resultado = await reenviarInvitacionDeAcceso({
      comunidadId: comunidad.id,
      usuarioId: cuenta.usuario.id,
    })
    setReenviandoId(null)

    if (!resultado.ok) {
      setErrorReenvio(resultado.error)
      return
    }

    setAviso(
      `La invitación quedó emitida de nuevo para ${cuenta.usuario.email}. ${AVISO_SIN_CORREO}`
    )
    // El anterior quedó vencido en el servidor: este es el único enlace vivo.
    if (resultado.enlace) {
      setEntrega({ enlace: resultado.enlace, para: cuenta.usuario.email })
    }
    await refrescar()
  }

  const errorListado = errorComunidades ?? errorCuentas

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b pb-5">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <IconKey className="size-7 text-primary" /> Cuentas y acceso
        </h1>
        <p className="text-muted-foreground">
          El rol de la persona en la comunidad —propietario, arrendatario o
          personal— no da acceso por sí mismo. El acceso es la cuenta con su rol:
          es lo que define qué ve y qué puede hacer en el sistema.
        </p>
        <p className="text-sm text-muted-foreground">
          Cada alta emite una invitación de un solo uso y con vencimiento: la
          persona define su contraseña al abrir el enlace, y la administración
          nunca la conoce.{" "}
          <span className="font-medium text-foreground">
            El envío por correo todavía no existe (F43), así que la invitación no
            le llega sola a nadie.
          </span>
        </p>
      </div>

      {errorListado && (
        <p
          role="alert"
          className="flex items-center gap-2 text-sm text-destructive"
        >
          <IconAlertTriangle className="size-4" aria-hidden="true" />
          {errorListado}
        </p>
      )}

      {aviso && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"
        >
          <IconCircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {aviso}
        </p>
      )}

      {entrega && (
        <Card
          role="region"
          aria-label="Enlace de la invitación"
          className="border-sky-500/40 bg-sky-50/60 dark:border-sky-500/30 dark:bg-sky-950/20"
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <IconLink className="size-4 text-primary" aria-hidden="true" />
              Enlace para entregar
            </CardTitle>
            <CardDescription className="text-xs">
              Para {entrega.para}. El envío por correo todavía no existe (F43),
              así que este enlace es lo único que abre el acceso: entregalo por un
              canal seguro.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="enlace-invitacion">Enlace de un solo uso</Label>
              <Input
                id="enlace-invitacion"
                readOnly
                value={entrega.enlace}
                onFocus={(evento) => evento.currentTarget.select()}
              />
            </div>
            <p className="text-xs text-foreground">
              <span className="font-medium">No se vuelve a mostrar.</span> Si cerrás
              este aviso sin copiarlo, el enlace se perdió y la única salida es
              reenviar la invitación, que vence el anterior.
            </p>
            {errorCopia && (
              <p
                role="alert"
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <IconAlertTriangle className="size-4" aria-hidden="true" />
                {errorCopia}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void copiarEnlace()}
              >
                <IconCopy className="size-4" aria-hidden="true" />
                Copiar enlace
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={olvidarEnlace}
              >
                Cerrar
              </Button>
              {copiado && (
                <span className="text-xs text-emerald-700 dark:text-emerald-300">
                  Enlace copiado.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {errorReenvio && (
        <p
          role="alert"
          className="flex items-center gap-2 text-sm text-destructive"
        >
          <IconAlertTriangle className="size-4" aria-hidden="true" />
          {errorReenvio}
        </p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <IconUserPlus className="size-4 text-primary" /> Dar de alta una cuenta
          </CardTitle>
          <CardDescription className="text-xs">
            La cuenta se crea sin contraseña y atada a una persona del padrón: sólo
            entra quien abra la invitación. La persona primero —sin persona no hay
            a quién auditar—, y el rol de acceso en el mismo acto.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="persona-cuenta">Persona del padrón</Label>
              <Select value={personaId} onValueChange={setPersonaId}>
                <SelectTrigger
                  id="persona-cuenta"
                  aria-label="Persona del padrón"
                  className="w-full"
                  disabled={cargandoPersonas || personas.length === 0}
                >
                  <SelectValue
                    placeholder={
                      cargandoPersonas ? "Cargando el padrón…" : "Elegí una persona"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {personas.map((persona) => (
                    <SelectItem key={persona.id} value={persona.id}>
                      {`${persona.nombreCompleto} · ${persona.rut}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errorPersonas && (
                <p className="text-xs text-destructive">{errorPersonas.message}</p>
              )}
              {!cargandoPersonas && !errorPersonas && personas.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  El padrón de esta comunidad no tiene personas cargadas: sin
                  persona no hay cuenta que crear.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rol-cuenta">Rol de acceso</Label>
              <Select
                value={rol}
                onValueChange={(valor) => setRol(valor as Rol)}
              >
                <SelectTrigger
                  id="rol-cuenta"
                  aria-label="Rol de acceso"
                  className="w-full"
                >
                  <SelectValue placeholder="Elegí el rol de acceso" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((opcion) => (
                    <SelectItem key={opcion} value={opcion}>
                      {ETIQUETA_ROL[opcion]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Es el rol de la cuenta, no el de la persona en el padrón.
              </p>
            </div>
          </div>

          {errorAlta && (
            <p
              role="alert"
              className="flex items-center gap-2 text-sm text-destructive"
            >
              <IconAlertTriangle className="size-4" aria-hidden="true" />
              {errorAlta}
            </p>
          )}

          <div>
            <Button
              type="button"
              onClick={() => void crear()}
              disabled={!puedeCrear || creando}
            >
              {creando ? (
                <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <IconUserPlus className="size-4" aria-hidden="true" />
              )}
              Crear cuenta e invitación
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            {comunidadNombre
              ? `Cuentas de ${comunidadNombre}`
              : "Cuentas de la comunidad"}
          </CardTitle>
          <CardDescription className="text-xs">
            Una fila por cuenta con su rol de acceso y el estado de su invitación.
            Reenviar invalida el enlace anterior en el mismo acto: dos enlaces vivos
            para la misma cuenta son dos puertas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cargandoComunidades || cargandoCuentas ? (
            <p className="text-sm text-muted-foreground">Cargando cuentas…</p>
          ) : comunidades.length === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">
              Tu sesión no tiene una comunidad asignada, así que no hay cuentas que
              mostrar. La asignación de la membresía la resuelve la administración.
            </p>
          ) : cuentas.length === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">
              Esta comunidad todavía no tiene cuentas de acceso. La primera se crea
              con el alta de arriba.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Correo de la cuenta</TableHead>
                  <TableHead>Rol de acceso</TableHead>
                  <TableHead>Invitación</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cuentas.map((cuenta) => (
                  <TableRow key={cuenta.membresiaId}>
                    <TableCell className="font-medium">
                      {cuenta.usuario.email}
                    </TableCell>
                    <TableCell>
                      {ETIQUETA_ROL[cuenta.rol as Rol] ?? cuenta.rol}
                    </TableCell>
                    <TableCell>
                      <EstadoInvitacion invitacion={cuenta.invitacion} />
                    </TableCell>
                    <TableCell className="text-right">
                      {admiteReenvio(cuenta.invitacion) ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void reenviar(cuenta)}
                          disabled={reenviandoId !== null}
                          title="Emite una invitación nueva y vence la anterior en el mismo acto. El correo de bienvenida todavía no existe (F43)."
                        >
                          {reenviandoId === cuenta.usuario.id ? (
                            <IconLoader2
                              className="size-4 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <IconRefresh className="size-4" aria-hidden="true" />
                          )}
                          Reenviar invitación
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
