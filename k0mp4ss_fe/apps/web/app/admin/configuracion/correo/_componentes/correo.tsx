"use client"

/**
 * Consola de la credencial de correo por comunidad (F33 · U5 del plan
 * «saldar-v2-pantallas-y-barrido», S1 y S2).
 *
 * `GET`/`PUT /api/configuracion/correo` y `POST /api/configuracion/correo/probar`
 * existen desde F33 y la credencial no tenía cara visible: el servidor, el puerto, el
 * usuario y la contraseña del buzón de cada comunidad sólo se podían cargar con curl.
 * Esta pantalla les pone la cara y no decide nada que sea del servidor:
 *
 *   · el ESTADO viene de `GET /api/configuracion/correo`, cuya respuesta es angosta a
 *     propósito: `{ configurada, host, puerto, usuario, actualizadoEn,
 *     actualizadoPor }`. No hay campo para el secreto ni para el paquete cifrado, y el
 *     `select` de la ruta ni siquiera pide las columnas del cifrado: acá no se pinta
 *     un secreto porque no llega. `credencialDe` lee el contrato campo por campo en
 *     vez de volcar la respuesta, así que un campo de más tampoco se pintaría;
 *   · el campo de la CONTRASEÑA arranca vacío y se vacía después de guardar. La
 *     credencial guardada no se muestra nunca (ni completa, ni enmascarada, ni su
 *     largo): fingir una máscara diría que hay un valor en pantalla que el servidor
 *     jamás devolvió. El formulario tampoco se prellena en host, puerto ni usuario,
 *     para que lo que se guarde sea exactamente lo que se escribió y nadie confunda
 *     «lo que muestra la pantalla» con «lo que hay guardado»;
 *   · el GUARDADO manda sólo `{ host, puerto, usuario, secreto }`, el cuerpo de
 *     `CredencialCorreoComunidadSchema`. El `comunidadId` sale del scope del servidor,
 *     y la auditoría la escribe la ruta en la misma transacción que la escritura;
 *   · la PRUEBA es una operación con resultado: la ruta responde 200 con
 *     `{ enviado: true, messageId }` o `{ enviado: false, motivo }`. La pantalla repite
 *     ese veredicto —el `motivo` es el texto exacto del proveedor, ya redactado por
 *     `lib/smtp.ts`— y no lo completa con un «llegó» que la API no puede afirmar:
 *     aceptado no es entregado. Los 403/500 sí son errores y se pintan verbatim;
 *   · el 500 de la CLAVE MAESTRA ausente se muestra tal cual, y la pantalla ya explicó
 *     antes que ese 500 es el guardado fallando cerrado (no se escribe nada y no hay
 *     texto plano de respaldo): quien lo ve sabe que no es un bug ni algo que se
 *     arregle recargando;
 *   · el ÉXITO sólo se declara después del 2xx, con los valores que devolvió la
 *     respuesta. Sin 2xx no se limpia el formulario ni se afirma que quedó guardado.
 *
 * Frontera deliberada: la única guardia del cliente es de FORMA —los cuatro campos
 * escritos y un puerto entero en rango—, no una copia de las reglas del servidor. Que
 * la clave maestra exista, que el secreto se cifre y que el SMTP acepte la conexión lo
 * deciden `lib/cifrado-secretos.ts` y `lib/smtp.ts`, y sus mensajes se muestran tal
 * cual: bloquear acá una combinación que el servidor acepte sería una segunda verdad.
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
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconLoader2,
  IconMail,
  IconSend,
} from "@tabler/icons-react"

const RUTA = {
  credencial: "/api/configuracion/correo",
  prueba: "/api/configuracion/correo/probar",
} as const

/**
 * Por qué la contraseña se puede guardar acá sin que la comunidad entregue su clave
 * maestra. Se muestra siempre, no sólo cuando algo falla: el 500 del guardado cerrado
 * se entiende antes de verlo.
 */
const EXPLICACION_CIFRADO =
  "La contraseña se guarda cifrada en la base (AES-256-GCM) con una clave maestra que vive sólo en el entorno del servidor: no está en la base, no viaja al navegador y no vuelve en ninguna respuesta. Si esa clave falta o es inválida el guardado falla cerrado —responde 500 nombrando CLAVE_MAESTRA_SECRETOS y no escribe nada—, así que ese 500 no es un defecto de la pantalla."

/** El estado vacío, dicho con todas las letras. */
const TEXTO_SIN_CREDENCIAL =
  "La comunidad no tiene una credencial de correo guardada."

/**
 * Lo que se puede afirmar sin credencial: la prueba de envío no abre conexión y
 * responde que no hay nada que probar (`app/api/configuracion/correo/probar/route.ts`).
 */
const TEXTO_SIN_CREDENCIAL_PRUEBA =
  "Mientras no haya una credencial guardada, la prueba de envío responde que no hay nada que probar."

/**
 * El techo de lo que la pantalla puede decir de un envío aceptado. El módulo de
 * envíos distingue `enviado` (el servidor aceptó) de `entregado` (hay constancia), y
 * esa constancia no la tiene la API.
 */
const NOTA_ACEPTADO =
  "Que el correo llegue a la bandeja lo confirma quien lo recibe: la pantalla sólo repite lo que respondió el servidor."

/** Lo que se pinta cuando el servidor no informó un campo del estado. */
const NO_INFORMADO = "El servidor no lo informó"

/** La lectura no trajo el estado: no se puede afirmar ni «configurada» ni «sin». */
const TEXTO_SIN_ESTADO =
  "La respuesta del servidor no trae el estado de la credencial de correo: no se puede afirmar si está configurada."

/** La prueba respondió algo que no es ninguno de los dos desenlaces del contrato. */
const TEXTO_PRUEBA_ILEGIBLE =
  "La respuesta del servidor no dice si el envío de prueba salió: no se puede afirmar nada."

/** El guardado respondió 2xx sin la credencial: no se declara guardada. */
const TEXTO_GUARDADO_ILEGIBLE =
  "El servidor respondió sin la credencial guardada: no se puede afirmar que quedó guardada."

/** La forma EXACTA de la respuesta del GET/PUT. No hay campo para el secreto. */
interface CredencialLeida {
  configurada: boolean
  host: string | null
  puerto: number | null
  usuario: string | null
  actualizadoEn: string | null
  actualizadoPor: string | null
}

/** El error del guardado: el texto de la API y los motivos por campo que lo acompañan. */
interface ErrorDelGuardado {
  mensaje: string
  motivos: string[]
}

/** El desenlace de la prueba, tal como lo dijo el servidor. */
type ResultadoPrueba =
  | { tipo: "enviado"; messageId: string | null }
  | { tipo: "rechazado"; motivo: string }
  | { tipo: "error"; mensaje: string }

/**
 * Cuándo se guardó la credencial: la fecha y la hora del ISO, marcadas UTC. No se
 * reinterpreta con la zona del navegador —igual que `fechaDe` en conciliación y
 * convenios—: un acto registrado no cambia de hora según dónde se abra la pantalla.
 */
function fechaHoraDe(iso: string): string {
  const fecha = iso.slice(0, 10)
  const hora = iso.slice(11, 16)
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) && /^\d{2}:\d{2}$/.test(hora)
    ? `${fecha} ${hora} UTC`
    : iso
}

function textoDe(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null
}

function enteroDe(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null
}

/**
 * Lee la credencial del contrato campo por campo. Un cuerpo sin `configurada` no es
 * «sin credencial»: es una respuesta que no se entiende, y la pantalla no inventa el
 * estado. Los campos del cifrado no se leen nunca, así que no pueden llegar al DOM.
 */
function credencialDe(
  cuerpo: Record<string, unknown> | null
): CredencialLeida | null {
  if (cuerpo === null || typeof cuerpo.configurada !== "boolean") return null
  if (!cuerpo.configurada) {
    return {
      configurada: false,
      host: null,
      puerto: null,
      usuario: null,
      actualizadoEn: null,
      actualizadoPor: null,
    }
  }
  return {
    configurada: true,
    host: textoDe(cuerpo.host),
    puerto: enteroDe(cuerpo.puerto),
    usuario: textoDe(cuerpo.usuario),
    actualizadoEn: textoDe(cuerpo.actualizadoEn),
    actualizadoPor: textoDe(cuerpo.actualizadoPor),
  }
}

interface RespuestaLeida {
  ok: boolean
  cuerpo: Record<string, unknown> | null
  /** El mensaje de error de la API, tal cual; vacío cuando la respuesta fue buena. */
  mensaje: string
}

/**
 * Lee una respuesta como JSON y separa lo que el servidor dijo de lo que la pantalla
 * puede inventar. El error de la API se devuelve textual: es la regla, y reescribirlo
 * en el cliente crearía una segunda versión capaz de divergir.
 */
async function leerJson(
  url: string,
  init?: RequestInit
): Promise<RespuestaLeida> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, init)
  } catch {
    return {
      ok: false,
      cuerpo: null,
      mensaje:
        "No se pudo contactar al servidor. Revisá la conexión e intentá de nuevo.",
    }
  }

  let cuerpo: unknown = null
  try {
    cuerpo = await respuesta.json()
  } catch {
    cuerpo = null
  }
  const objeto =
    typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo)
      ? (cuerpo as Record<string, unknown>)
      : null

  if (!respuesta.ok) {
    const errorServidor =
      objeto && typeof objeto.error === "string" ? objeto.error : null
    return {
      ok: false,
      cuerpo: objeto,
      mensaje:
        errorServidor ??
        `El servidor respondió ${respuesta.status} sin un mensaje de error.`,
    }
  }

  return { ok: true, cuerpo: objeto, mensaje: "" }
}

/**
 * Los motivos por campo de un 400 de contrato, tal como los escribió el servidor.
 *
 * La ruta devuelve `detalles` con el `flatten()` del esquema: los mensajes son los del
 * esquema y esta pantalla los pinta sin traducirlos. Cuando el 400 no trae `detalles`
 * —el 500 de la clave maestra, por ejemplo— la lista queda vacía y el `error` textual
 * es todo lo que hay.
 */
function motivosDeCampo(detalles: unknown): string[] {
  if (typeof detalles !== "object" || detalles === null) return []
  const objeto = detalles as Record<string, unknown>
  const motivos: string[] = []

  function agregar(campo: string, lista: unknown): void {
    if (!Array.isArray(lista)) return
    for (const motivo of lista) {
      if (typeof motivo !== "string") continue
      motivos.push(campo === "" ? motivo : `${campo}: ${motivo}`)
    }
  }

  agregar("", objeto.formErrors)
  const porCampo = objeto.fieldErrors
  if (typeof porCampo === "object" && porCampo !== null) {
    for (const [campo, lista] of Object.entries(
      porCampo as Record<string, unknown>
    )) {
      agregar(campo, lista)
    }
  }
  return motivos
}

/** El texto del veredicto aceptado, sin prometer una entrega que la API no constata. */
function textoAceptado(messageId: string | null): string {
  return messageId === null
    ? "El servidor aceptó el envío de prueba."
    : `El servidor aceptó el envío de prueba (messageId: ${messageId}).`
}

export interface ConsolaCredencialCorreoProps {
  /** `cf` con `editar`: habilita el formulario y la prueba de envío. */
  puedeEditar: boolean
}

export function ConsolaCredencialCorreo({
  puedeEditar,
}: ConsolaCredencialCorreoProps) {
  /** `null` = todavía no se pudo leer; no es lo mismo que «no configurada». */
  const [credencial, setCredencial] = React.useState<CredencialLeida | null>(null)
  const [cargando, setCargando] = React.useState(true)
  const [errorCarga, setErrorCarga] = React.useState<string | null>(null)

  const [host, setHost] = React.useState("")
  const [puerto, setPuerto] = React.useState("")
  const [usuario, setUsuario] = React.useState("")
  const [secreto, setSecreto] = React.useState("")
  const [guardando, setGuardando] = React.useState(false)
  const [errorGuardado, setErrorGuardado] =
    React.useState<ErrorDelGuardado | null>(null)
  const [exitoGuardado, setExitoGuardado] = React.useState<string | null>(null)

  const [probando, setProbando] = React.useState(false)
  const [prueba, setPrueba] = React.useState<ResultadoPrueba | null>(null)

  const cargar = React.useCallback(async (): Promise<void> => {
    setCargando(true)
    const respuesta = await leerJson(RUTA.credencial)
    setCargando(false)

    if (!respuesta.ok) {
      setErrorCarga(respuesta.mensaje)
      setCredencial(null)
      return
    }

    const leida = credencialDe(respuesta.cuerpo)
    if (leida === null) {
      setErrorCarga(TEXTO_SIN_ESTADO)
      setCredencial(null)
      return
    }

    setErrorCarga(null)
    setCredencial(leida)
  }, [])

  React.useEffect(() => {
    void cargar()
  }, [cargar])

  // Guardia de FORMA, no de negocio: los cuatro campos escritos y un puerto entero en
  // rango, que es lo mismo que exige el esquema. Que la clave maestra exista y que el
  // SMTP acepte la conexión lo decide el servidor, y su mensaje se lee tal cual.
  const puertoNumero = Number(puerto)
  const puertoValido =
    puerto.trim() !== "" &&
    Number.isInteger(puertoNumero) &&
    puertoNumero >= 1 &&
    puertoNumero <= 65535
  const formularioCompleto =
    host.trim() !== "" &&
    puertoValido &&
    usuario.trim() !== "" &&
    secreto.trim() !== ""

  async function guardar(
    evento: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    evento.preventDefault()
    if (!formularioCompleto || guardando) return

    // El cuerpo es exactamente el de `CredencialCorreoComunidadSchema`. El secreto no
    // se recorta: una contraseña puede tener espacios y el esquema sólo exige que no
    // sea vacía.
    const cuerpo: Record<string, unknown> = {
      host: host.trim(),
      puerto: puertoNumero,
      usuario: usuario.trim(),
      secreto,
    }

    setGuardando(true)
    setErrorGuardado(null)
    setExitoGuardado(null)
    const respuesta = await leerJson(RUTA.credencial, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    })
    setGuardando(false)

    // Sin 2xx no se limpia ni se afirma nada: la pantalla no declara un guardado que
    // el servidor no registró. El 500 de la clave maestra ausente cae acá.
    if (!respuesta.ok) {
      setErrorGuardado({
        mensaje: respuesta.mensaje,
        motivos: motivosDeCampo(respuesta.cuerpo?.detalles),
      })
      return
    }

    const guardada = credencialDe(respuesta.cuerpo)
    if (guardada === null || !guardada.configurada) {
      setErrorGuardado({ mensaje: TEXTO_GUARDADO_ILEGIBLE, motivos: [] })
      return
    }

    setCredencial(guardada)
    // La contraseña no se queda en el formulario: lo que hay guardado se lee arriba y
    // en un campo de contraseña nunca se muestra.
    setSecreto("")
    setExitoGuardado(
      `El servidor guardó la credencial de correo de la comunidad: ${String(
        guardada.host
      )}:${String(guardada.puerto)} como ${String(guardada.usuario)}.`
    )
  }

  async function probar(): Promise<void> {
    if (probando) return

    setProbando(true)
    setPrueba(null)
    // Sin cuerpo: el destinatario es el correo de la sesión y lo resuelve el servidor.
    const respuesta = await leerJson(RUTA.prueba, { method: "POST" })
    setProbando(false)

    // 403/500: la prueba no se pudo hacer y el motivo es el de la API, verbatim.
    if (!respuesta.ok) {
      setPrueba({ tipo: "error", mensaje: respuesta.mensaje })
      return
    }

    if (respuesta.cuerpo?.enviado === true) {
      setPrueba({
        tipo: "enviado",
        messageId: textoDe(respuesta.cuerpo.messageId),
      })
      return
    }

    const motivo = textoDe(respuesta.cuerpo?.motivo)
    if (respuesta.cuerpo?.enviado === false && motivo !== null) {
      setPrueba({ tipo: "rechazado", motivo })
      return
    }

    setPrueba({ tipo: "error", mensaje: TEXTO_PRUEBA_ILEGIBLE })
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b pb-5">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <IconMail className="size-7 text-primary" /> Credencial de correo de la
          comunidad
        </h1>
        <p className="text-muted-foreground">
          Cada comunidad guarda la credencial de su propio buzón SMTP, así que dos
          comunidades con dos buzones pueden autenticar por separado. La contraseña
          se cifra en la base y no vuelve al navegador.
        </p>
      </div>

      {errorCarga && (
        <Card className="border-destructive/50">
          <CardContent className="py-3">
            <p role="alert" className="text-sm text-destructive">
              {errorCarga}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            Estado de la credencial
            {credencial?.configurada === true && (
              <Badge
                variant="secondary"
                className="bg-emerald-100 text-[11px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                Configurada
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs">
            Lo que el servidor devuelve de la credencial de la comunidad. El valor de
            la contraseña no está en ninguna respuesta: la base ni siquiera lee las
            columnas del cifrado cuando este dato se pide.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cargando && credencial === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Leyendo la credencial de correo de la comunidad…
            </p>
          ) : credencial === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No se pudo leer el estado de la credencial: el error de arriba es lo
              único que el servidor respondió.
            </p>
          ) : credencial.configurada ? (
            <div className="flex flex-col gap-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">
                    Servidor SMTP
                  </dt>
                  <dd className="font-medium">
                    {credencial.host ?? NO_INFORMADO}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Puerto</dt>
                  <dd className="font-medium tabular-nums">
                    {credencial.puerto === null
                      ? NO_INFORMADO
                      : String(credencial.puerto)}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Usuario SMTP</dt>
                  <dd className="font-medium">
                    {credencial.usuario ?? NO_INFORMADO}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Actualizada</dt>
                  <dd className="font-medium tabular-nums">
                    {credencial.actualizadoEn === null
                      ? NO_INFORMADO
                      : fechaHoraDe(credencial.actualizadoEn)}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">
                    Actualizada por
                  </dt>
                  <dd className="font-medium">
                    {credencial.actualizadoPor ?? NO_INFORMADO}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                La contraseña guardada no se muestra nunca —ni completa, ni
                enmascarada, ni su largo—: el servidor no la devuelve.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <IconAlertTriangle
                  className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                {TEXTO_SIN_CREDENCIAL}
              </p>
              <p className="text-xs text-muted-foreground">
                {TEXTO_SIN_CREDENCIAL_PRUEBA}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cómo se guarda la contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <IconInfoCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{EXPLICACION_CIFRADO}</span>
          </p>
        </CardContent>
      </Card>

      {puedeEditar && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Guardar la credencial de correo
            </CardTitle>
            <CardDescription className="text-xs">
              Se guarda una credencial nueva o se rota la que ya está. El formulario
              arranca vacío a propósito: lo que se escribe acá es lo que queda, y la
              contraseña guardada no se prellena nunca.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form className="flex flex-col gap-4" onSubmit={(e) => void guardar(e)}>
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="credencial-host">Servidor SMTP</Label>
                  <Input
                    id="credencial-host"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="smtp.tu-proveedor.cl"
                    maxLength={255}
                    autoComplete="off"
                    disabled={guardando}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="credencial-puerto">Puerto</Label>
                  <Input
                    id="credencial-puerto"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={65535}
                    value={puerto}
                    onChange={(e) => setPuerto(e.target.value)}
                    placeholder="587"
                    disabled={guardando}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="credencial-usuario">Usuario SMTP</Label>
                  <Input
                    id="credencial-usuario"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    placeholder="notificaciones@tu-comunidad.cl"
                    maxLength={255}
                    autoComplete="off"
                    disabled={guardando}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="credencial-secreto">Contraseña SMTP</Label>
                  <Input
                    id="credencial-secreto"
                    type="password"
                    value={secreto}
                    onChange={(e) => setSecreto(e.target.value)}
                    placeholder="Escribí la contraseña del buzón"
                    autoComplete="new-password"
                    disabled={guardando}
                  />
                </div>
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground">
                La contraseña guardada no se puede mostrar, así que este campo está
                siempre vacío: escribila entera para guardarla o para rotarla. Si
                queda vacía no se envía nada, y los otros campos tampoco se rellenan
                con lo guardado.
              </p>

              {errorGuardado && (
                <div className="flex flex-col gap-1">
                  <p
                    role="alert"
                    className="flex items-center gap-2 text-sm text-destructive"
                  >
                    <IconAlertTriangle className="size-4" aria-hidden="true" />
                    {errorGuardado.mensaje}
                  </p>
                  {errorGuardado.motivos.length > 0 && (
                    <ul className="list-inside list-disc text-xs text-destructive">
                      {errorGuardado.motivos.map((motivo) => (
                        <li key={motivo}>{motivo}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {exitoGuardado && (
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <IconCircleCheck className="size-4" aria-hidden="true" />
                  {exitoGuardado}
                </p>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={guardando || !formularioCompleto}>
                  {guardando ? (
                    <IconLoader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <IconMail className="size-4" aria-hidden="true" />
                  )}
                  Guardar credencial
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {puedeEditar && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Probar el envío</CardTitle>
            <CardDescription className="text-xs">
              El servidor descifra la credencial guardada y manda un correo de prueba
              al correo de tu sesión, no a un destinatario elegido acá. La pantalla
              repite su veredicto; no lo decide.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void probar()}
                disabled={probando}
              >
                {probando ? (
                  <IconLoader2
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <IconSend className="size-4" aria-hidden="true" />
                )}
                Probar envío
              </Button>
            </div>

            {prueba?.tipo === "enviado" && (
              <>
                <div
                  role="status"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <IconCircleCheck className="size-4" aria-hidden="true" />
                  <span>{textoAceptado(prueba.messageId)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{NOTA_ACEPTADO}</p>
              </>
            )}

            {prueba?.tipo === "rechazado" && (
              <p
                role="alert"
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <IconAlertTriangle className="size-4" aria-hidden="true" />
                {prueba.motivo}
              </p>
            )}

            {prueba?.tipo === "error" && (
              <p
                role="alert"
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <IconAlertTriangle className="size-4" aria-hidden="true" />
                {prueba.mensaje}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
