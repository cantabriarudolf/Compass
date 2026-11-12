"use client"

/**
 * Consola de la conciliación bancaria (F30 · U2 del plan
 * «saldar-v2-pantallas-y-barrido», S1 y S2).
 *
 * `POST /api/conciliacion/importar` y `POST /api/conciliacion/resolver` existían y
 * nadie podía usarlos sin curl — pero el problema real era la cola: la regla pura
 * deja en `no_conciliado` todo lo que no puede enlazar con certeza y ese trabajo
 * no tenía dónde hacerse. Esta pantalla le pone la cara y no decide nada que sea
 * del servidor:
 *
 *   · la CARGA de la cartola manda el TEXTO del archivo que el banco exporta
 *     (`{ nombreArchivo, contenido }`) y nada más. No hay parseo, ni columnas, ni
 *     fechas, ni montos en el cliente: `parsearCartola` y `enlazarMovimiento`
 *     viven en `lib/conciliacion.ts` y corren en el servidor, que es el único que
 *     puede comparar el movimiento contra los candidatos de la comunidad de la
 *     sesión;
 *   · lo que el servidor NO pudo importar se pinta **verbatim**: el mensaje del
 *     `error` y la lista de `errores` por fila tal como los escribió el lector del
 *     CSV, con la constancia de que no se importó nada. Una cartola a medias es
 *     un número que no cuadra y nadie sabe por qué; la importación es todo o
 *     nada y la pantalla lo dice;
 *   · los CONTADORES de cada cartola (`filas`, `conciliadas`, `noConciliadas`) se
 *     pintan como vienen de `GET /api/conciliacion`: no se restan ni se recalculan
 *     en el navegador. Serían una segunda verdad capaz de separarse de las filas;
 *   · la COLA es la razón de ser del módulo: sólo los `no_conciliado`, cada uno
 *     con el campo de la referencia que lo resuelve. El cuerpo es exactamente
 *     `{ movimientoId, cargoReferencia }`; la identidad, la fecha y el rastro de
 *     quién resolvió los pone el servidor. Con el 2xx la fila sale de la cola y la
 *     cartola pasa a los contadores que devolvió ESA respuesta —los del servidor,
 *     no una suma local—;
 *   · el ÉXITO sólo se declara después del 2xx del servidor, con los valores que
 *     devolvió. Sin éxito no se limpia el formulario, no se relee la lista y no se
 *     saca ninguna fila: la pantalla no puede afirmar un acto que no se registró.
 *
 * Frontera deliberada: resolver un movimiento NO crea el asiento contable. Queda
 * atado a la referencia que la persona escribió (`cargoReferencia`), y el enlace
 * es un hecho con autor y fecha. Imputarlo a un fondo es trabajo del trámite que
 * hace ese asiento.
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  IconAlertTriangle,
  IconBuildingBank,
  IconCircleCheck,
  IconLoader2,
  IconUpload,
} from "@tabler/icons-react"

const RUTA = {
  cartolas: "/api/conciliacion",
  importar: "/api/conciliacion/importar",
  resolver: "/api/conciliacion/resolver",
} as const

/** Un movimiento de la cartola tal como lo devuelve `app/api/conciliacion/_vista.ts`. */
interface MovimientoLeido {
  id: string
  cartolaId: string
  /** Día del banco en `AAAA-MM-DD`: no se reinterpreta con la zona del navegador. */
  fecha: string
  descripcion: string
  referencia: string | null
  contraparte: string | null
  monto: number
  tipo: string
  estado: string
  origen: string | null
  resueltoPor: string | null
  resueltoEn: string | null
  cargoReferencia: string | null
}

/** Una cartola con sus movimientos y sus contadores, tal como llega de la vista. */
interface CartolaLeida {
  id: string
  nombreArchivo: string
  importadaPor: string
  filas: number
  conciliadas: number
  noConciliadas: number
  createdAt: string
  movimientos: MovimientoLeido[]
}

/** Los contadores que devuelve la resolución, con el id de la cartola que los cambió. */
interface ContadoresDeCartola {
  id: string
  filas: number
  conciliadas: number
  noConciliadas: number
}

/** El estado del movimiento en palabras; el servidor sólo escribe estos tres. */
const ETIQUETA_ESTADO: Record<string, string> = {
  conciliado: "Conciliado",
  resuelto_manual: "Resuelto a mano",
  no_conciliado: "No conciliado",
}

const COLOR_ESTADO: Record<string, string> = {
  conciliado:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  resuelto_manual:
    "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  no_conciliado:
    "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
}

/** El signo del movimiento: `cargo` sale plata, `abono` entra. */
const ETIQUETA_TIPO: Record<string, string> = {
  cargo: "Cargo",
  abono: "Abono",
}

/** Pesos en formato chileno, igual que el resto de las pantallas de finanzas. */
function pesos(monto: number): string {
  return `$${monto.toLocaleString("es-CL")}`
}

/**
 * La fecha del movimiento, tal como la entrega la vista (`AAAA-MM-DD`). No se
 * reinterpreta con la zona del navegador: un día de banco no cambia de día según
 * dónde se abra la pantalla.
 */
function fechaDe(iso: string): string {
  return iso.slice(0, 10)
}

interface RespuestaLeida {
  ok: boolean
  cuerpo: Record<string, unknown> | null
  /** El mensaje de error de la API, tal cual; vacío cuando la respuesta fue buena. */
  mensaje: string
  /**
   * `false` sólo cuando `fetch` no obtuvo respuesta. Distingue «el servidor
   * rechazó la cartola» (nada se guardó) de «no se pudo hablar con el servidor»
   * (no hay constancia de nada), que no es lo mismo para quien acaba de importar.
   */
  respondio: boolean
}

/**
 * Lee una respuesta como JSON y separa lo que el servidor dijo de lo que la
 * pantalla puede inventar. El error de la API se devuelve textual: es la regla, y
 * reescribirlo en el cliente crearía una segunda versión capaz de divergir.
 */
async function leerJson(url: string, init?: RequestInit): Promise<RespuestaLeida> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, init)
  } catch {
    return {
      ok: false,
      cuerpo: null,
      mensaje:
        "No se pudo contactar al servidor. Revisá la conexión e intentá de nuevo.",
      respondio: false,
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
      respondio: true,
    }
  }

  return { ok: true, cuerpo: objeto, mensaje: "", respondio: true }
}

/** Manda un cuerpo JSON a una ruta de acción. */
function enviarJson(
  url: string,
  cuerpo: Record<string, unknown>
): Promise<RespuestaLeida> {
  return leerJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  })
}

/** Los errores por fila que devolvió el lector del CSV, sin inventar ninguno. */
function leerErrores(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []
  return valor.filter((fila): fila is string => typeof fila === "string")
}

/** El movimiento actualizado que devuelve `POST /api/conciliacion/resolver`. */
function leerMovimiento(valor: unknown): MovimientoLeido | null {
  if (typeof valor !== "object" || valor === null) return null
  const objeto = valor as Record<string, unknown>
  if (
    typeof objeto.id !== "string" ||
    typeof objeto.cartolaId !== "string" ||
    typeof objeto.estado !== "string" ||
    typeof objeto.descripcion !== "string" ||
    typeof objeto.tipo !== "string" ||
    typeof objeto.fecha !== "string" ||
    typeof objeto.monto !== "number"
  ) {
    return null
  }
  return objeto as unknown as MovimientoLeido
}

/** Los contadores que la resolución recalculó en el servidor. */
function leerContadores(valor: unknown): ContadoresDeCartola | null {
  if (typeof valor !== "object" || valor === null) return null
  const objeto = valor as Record<string, unknown>
  if (
    typeof objeto.id !== "string" ||
    typeof objeto.filas !== "number" ||
    typeof objeto.conciliadas !== "number" ||
    typeof objeto.noConciliadas !== "number"
  ) {
    return null
  }
  return {
    id: objeto.id,
    filas: objeto.filas,
    conciliadas: objeto.conciliadas,
    noConciliadas: objeto.noConciliadas,
  }
}

/** El mensaje de una colección que no vino como lista. */
function sinLista(que: string): string {
  return `La respuesta del servidor no trae la lista de ${que}: no se puede mostrar el registro.`
}

/** Un movimiento en la cola, con la cartola de la que salió. */
interface MovimientoEnCola {
  cartola: CartolaLeida
  movimiento: MovimientoLeido
}

export interface ConsolaConciliacionProps {
  /** `fi:cobranza` con `crear`: habilita el formulario de importación. */
  puedeImportar: boolean
  /** `fi:cobranza` con `editar`: habilita resolver los movimientos de la cola. */
  puedeResolver: boolean
}

export function ConsolaConciliacion({
  puedeImportar,
  puedeResolver,
}: ConsolaConciliacionProps) {
  const [cartolas, setCartolas] = React.useState<CartolaLeida[]>([])
  const [cargando, setCargando] = React.useState(true)
  const [errorCarga, setErrorCarga] = React.useState<string | null>(null)

  const [nombreArchivo, setNombreArchivo] = React.useState("")
  const [contenido, setContenido] = React.useState("")
  const [importando, setImportando] = React.useState(false)
  const [errorImportacion, setErrorImportacion] = React.useState<{
    mensaje: string
    errores: string[]
    respondio: boolean
  } | null>(null)
  const [exitoImportacion, setExitoImportacion] = React.useState<string | null>(
    null
  )

  // La referencia que se está escribiendo, por movimiento. Vive en un mapa y no
  // en un estado por fila porque la cola la dicta el servidor: una fila que sale
  // de la cola se lleva su borrador.
  const [referencias, setReferencias] = React.useState<Record<string, string>>(
    {}
  )
  const [resolviendoId, setResolviendoId] = React.useState<string | null>(null)
  const [errorResolucion, setErrorResolucion] = React.useState<string | null>(
    null
  )
  const [avisoResolucion, setAvisoResolucion] = React.useState<string | null>(
    null
  )

  const cargar = React.useCallback(async (): Promise<void> => {
    setCargando(true)
    const respuesta = await leerJson(RUTA.cartolas)
    const lista = respuesta.cuerpo?.data

    if (!respuesta.ok) {
      setErrorCarga(respuesta.mensaje)
      setCartolas([])
      setCargando(false)
      return
    }
    if (!Array.isArray(lista)) {
      setErrorCarga(sinLista("cartolas"))
      setCartolas([])
      setCargando(false)
      return
    }

    setErrorCarga(null)
    setCartolas(lista as CartolaLeida[])
    setCargando(false)
  }, [])

  React.useEffect(() => {
    void cargar()
  }, [cargar])

  /**
   * La cola se DERIVA del listado: sólo `no_conciliado`. Los conciliados por la
   * regla y los resueltos a mano ya tienen su enlace y no se vuelven a resolver
   * —la ruta responde 409—, así que ofrecerlos sería un botón condenado.
   */
  const cola = React.useMemo<MovimientoEnCola[]>(() => {
    const filas: MovimientoEnCola[] = []
    for (const cartola of cartolas) {
      for (const movimiento of cartola.movimientos) {
        if (movimiento.estado === "no_conciliado") {
          filas.push({ cartola, movimiento })
        }
      }
    }
    return filas
  }, [cartolas])

  const formularioCompleto =
    nombreArchivo.trim() !== "" && contenido.trim() !== ""

  async function importar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    if (!formularioCompleto || importando) return

    // El cuerpo es exactamente el de `ConciliacionImportacionSchema`: el texto de
    // la cartola, no una ruta ni un archivo del navegador. El parseo y el enlace
    // los hace el servidor.
    const cuerpo = {
      nombreArchivo: nombreArchivo.trim(),
      contenido,
    }

    setImportando(true)
    setErrorImportacion(null)
    setExitoImportacion(null)
    const respuesta = await enviarJson(RUTA.importar, cuerpo)
    setImportando(false)

    // Sin 2xx no se limpia, no se relee y no se declara nada: la pantalla no
    // puede afirmar una importación que el servidor no confirmó.
    if (!respuesta.ok) {
      setErrorImportacion({
        mensaje: respuesta.mensaje,
        errores: leerErrores(respuesta.cuerpo?.errores),
        respondio: respuesta.respondio,
      })
      return
    }

    const importados = respuesta.cuerpo?.importados
    const conciliados = respuesta.cuerpo?.conciliados
    const noConciliados = respuesta.cuerpo?.noConciliados
    setExitoImportacion(
      typeof importados === "number" &&
        typeof conciliados === "number" &&
        typeof noConciliados === "number"
        ? `Cartola importada: ${importados} movimiento(s), ${conciliados} conciliado(s) automáticamente y ${noConciliados} en la cola de conciliación.`
        : "El servidor confirmó la importación de la cartola."
    )

    setNombreArchivo("")
    setContenido("")
    await cargar()
  }

  function escribirReferencia(movimientoId: string, valor: string): void {
    setReferencias((previas) => ({ ...previas, [movimientoId]: valor }))
  }

  async function resolver(
    cartolaId: string,
    movimientoId: string
  ): Promise<void> {
    const referencia = (referencias[movimientoId] ?? "").trim()
    if (referencia === "" || resolviendoId !== null) return

    // El cuerpo es exactamente el de `ConciliacionResolucionSchema`. La fecha, el
    // autor y el estado nuevo los pone el servidor.
    setResolviendoId(movimientoId)
    setErrorResolucion(null)
    setAvisoResolucion(null)
    const respuesta = await enviarJson(RUTA.resolver, {
      movimientoId,
      cargoReferencia: referencia,
    })
    setResolviendoId(null)

    if (!respuesta.ok) {
      setErrorResolucion(respuesta.mensaje)
      return
    }

    setReferencias((previas) => {
      const copia = { ...previas }
      delete copia[movimientoId]
      return copia
    })

    const movimiento = leerMovimiento(respuesta.cuerpo?.movimiento)
    const contadores = leerContadores(respuesta.cuerpo?.cartola)

    // La fila que sale de la cola y los contadores son los que escribió el
    // servidor en la misma transacción: se aplican tal cual, sin sumar acá.
    if (movimiento && contadores) {
      setCartolas((previas) =>
        previas.map((cartola) => {
          if (cartola.id !== cartolaId) return cartola
          return {
            ...cartola,
            filas: contadores.filas,
            conciliadas: contadores.conciliadas,
            noConciliadas: contadores.noConciliadas,
            movimientos: cartola.movimientos.map((fila) =>
              fila.id === movimiento.id ? movimiento : fila
            ),
          }
        })
      )
      setAvisoResolucion(
        `El movimiento «${movimiento.descripcion}» quedó conciliado contra la referencia ${referencia}.`
      )
      return
    }

    // El servidor confirmó pero la respuesta no trae la fila: se declara lo
    // confirmado y se relee, en vez de adivinar el estado nuevo.
    setAvisoResolucion(
      `El servidor confirmó la resolución del movimiento contra la referencia ${referencia}.`
    )
    await cargar()
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b pb-5">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <IconBuildingBank className="size-7 text-primary" /> Conciliación
          bancaria
        </h1>
        <p className="text-muted-foreground">
          La cartola que exporta el banco se importa y el servidor enlaza cada
          movimiento con lo que ya está registrado; lo que no puede enlazar con
          certeza queda en la cola para que lo resuelva una persona (Ley 21.442
          art. 24: las cuentas se llevan debidamente conciliadas). Acá no se
          parsea ni se concilia nada: el veredicto es del servidor.
        </p>
      </div>

      {avisoResolucion && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <IconCircleCheck className="size-4" aria-hidden="true" />
          {avisoResolucion}
        </p>
      )}

      {errorCarga && (
        <Card className="border-destructive/50">
          <CardContent className="py-3">
            <p role="alert" className="text-sm text-destructive">
              {errorCarga}
            </p>
          </CardContent>
        </Card>
      )}

      {puedeImportar && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Importar la cartola del banco
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Pegá el contenido del archivo que exporta el banco (CSV con fecha,
              descripción y monto). El servidor lo lee, lo enlaza contra los
              cargos y pagos de la comunidad y deja en la cola lo que no pueda
              enlazar con certeza. Si una sola fila es ilegible, no se importa
              ninguna: la cartola entra completa o no entra.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form
              className="flex flex-col gap-4"
              onSubmit={(evento) => void importar(evento)}
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor="conciliacion-nombre-archivo">
                  Nombre del archivo
                </Label>
                <Input
                  id="conciliacion-nombre-archivo"
                  value={nombreArchivo}
                  onChange={(evento) => setNombreArchivo(evento.target.value)}
                  placeholder="cartola-noviembre-2026.csv"
                  maxLength={200}
                  disabled={importando}
                />
                <p className="text-xs text-muted-foreground">
                  Es el nombre con el que la cartola va a quedar registrada.
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="conciliacion-contenido">
                  Contenido de la cartola (CSV)
                </Label>
                <textarea
                  id="conciliacion-contenido"
                  rows={8}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={contenido}
                  onChange={(evento) => setContenido(evento.target.value)}
                  placeholder={
                    "fecha,descripcion,monto,tipo,referencia,contraparte\n2026-11-03,Transferencia unidad 101,150000,abono,AV-2026-0031,101"
                  }
                  spellCheck={false}
                  disabled={importando}
                />
                <p className="text-xs text-muted-foreground">
                  El texto del archivo, no su ruta: la pantalla no lee el disco
                  del equipo ni interpreta el CSV.
                </p>
              </div>

              {errorImportacion && (
                <div className="flex flex-col gap-1 rounded-md border border-destructive/50 px-3 py-2">
                  <p
                    role="alert"
                    className="flex items-center gap-2 text-sm text-destructive"
                  >
                    <IconAlertTriangle className="size-4" aria-hidden="true" />
                    {errorImportacion.mensaje}
                  </p>
                  {errorImportacion.errores.length > 0 && (
                    <ul className="list-disc pl-5 text-xs text-destructive">
                      {errorImportacion.errores.map((detalle) => (
                        <li key={detalle}>{detalle}</li>
                      ))}
                    </ul>
                  )}
                  {errorImportacion.respondio && (
                    <p className="text-xs text-muted-foreground">
                      No se importó nada: la cartola entra completa o no entra.
                    </p>
                  )}
                </div>
              )}

              {exitoImportacion && (
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <IconCircleCheck className="size-4" aria-hidden="true" />
                  {exitoImportacion}
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={importando || !formularioCompleto}
                >
                  {importando ? (
                    <IconLoader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <IconUpload className="size-4" aria-hidden="true" />
                  )}
                  Importar cartola
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {cola.length === 0
              ? "Cola de no conciliados"
              : `Cola de no conciliados (${cola.length})`}
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Los movimientos que la regla no pudo enlazar con certeza: dos
            candidatos con el mismo monto, un cargo sin egreso registrado o una
            transferencia sin referencia. Escribí la referencia con la que se
            resuelve —un folio, el id de un egreso o el dato que el banco no
            trajo— y el enlace queda con autor y fecha.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!puedeResolver && cola.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Tu rol puede ver la cola pero no resolverla: resolver exige{" "}
              <code className="font-mono">fi:cobranza</code> con acción{" "}
              <code className="font-mono">editar</code>.
            </p>
          )}

          {errorResolucion && (
            <p
              role="alert"
              className="flex items-center gap-2 text-sm text-destructive"
            >
              <IconAlertTriangle className="size-4" aria-hidden="true" />
              {errorResolucion}
            </p>
          )}

          {cargando && cartolas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Leyendo las cartolas de la comunidad…
            </p>
          ) : cola.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              La cola está vacía: no hay movimientos sin conciliar.
            </p>
          ) : (
            <Table aria-label="Cola de no conciliados">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="w-[110px] text-right">Monto</TableHead>
                  <TableHead className="w-[80px]">Tipo</TableHead>
                  <TableHead className="w-[200px]">Cartola</TableHead>
                  {puedeResolver && (
                    <>
                      <TableHead className="w-[220px]">
                        Referencia del cargo
                      </TableHead>
                      <TableHead className="w-[110px]" />
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cola.map(({ cartola, movimiento }) => {
                  const resolviendo = resolviendoId === movimiento.id
                  return (
                    <TableRow key={movimiento.id}>
                      <TableCell className="tabular-nums">
                        {fechaDe(movimiento.fecha)}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{movimiento.descripcion}</p>
                        {movimiento.contraparte && (
                          <p className="text-xs text-muted-foreground">
                            {movimiento.contraparte}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pesos(movimiento.monto)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[11px]">
                          {ETIQUETA_TIPO[movimiento.tipo] ?? movimiento.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {cartola.nombreArchivo}
                      </TableCell>
                      {puedeResolver && (
                        <>
                          <TableCell>
                            <Input
                              aria-label="Referencia del cargo"
                              value={referencias[movimiento.id] ?? ""}
                              onChange={(evento) =>
                                escribirReferencia(
                                  movimiento.id,
                                  evento.target.value
                                )
                              }
                              placeholder="Folio, id del egreso o dato del banco"
                              maxLength={200}
                              disabled={resolviendo}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void resolver(cartola.id, movimiento.id)
                              }
                              disabled={
                                resolviendo ||
                                resolviendoId !== null ||
                                (referencias[movimiento.id] ?? "").trim() === ""
                              }
                            >
                              {resolviendo && (
                                <IconLoader2
                                  className="size-4 animate-spin"
                                  aria-hidden="true"
                                />
                              )}
                              Resolver
                            </Button>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {cartolas.length === 0
              ? "Cartolas importadas"
              : `Cartolas importadas (${cartolas.length})`}
          </CardTitle>
          <CardDescription className="text-xs">
            Una cartola por archivo, con los contadores que calculó el servidor
            —filas, conciliadas y en la cola— y cada movimiento con su fecha,
            monto, tipo, estado y el enlace que quedó.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {cargando && cartolas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Leyendo las cartolas de la comunidad…
            </p>
          ) : cartolas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              La comunidad todavía no importó ninguna cartola.
            </p>
          ) : (
            cartolas.map((cartola) => (
              <div
                key={cartola.id}
                role="region"
                aria-label={`Cartola ${cartola.nombreArchivo}`}
                className="flex flex-col gap-3 rounded-md border px-3 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <p className="text-sm font-medium">{cartola.nombreArchivo}</p>
                    <p className="text-xs text-muted-foreground">
                      {`Importada el ${fechaDe(cartola.createdAt)} por ${cartola.importadaPor}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{`${cartola.filas} fila(s)`}</span>
                    <span>{`${cartola.conciliadas} conciliada(s)`}</span>
                    <span>{`${cartola.noConciliadas} en la cola`}</span>
                  </div>
                </div>

                {cartola.movimientos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    El servidor no devolvió movimientos para esta cartola.
                  </p>
                ) : (
                  <Table
                    aria-label={`Movimientos de la cartola ${cartola.nombreArchivo}`}
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[110px]">Fecha</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="w-[110px] text-right">
                          Monto
                        </TableHead>
                        <TableHead className="w-[80px]">Tipo</TableHead>
                        <TableHead className="w-[130px]">Estado</TableHead>
                        <TableHead className="w-[220px]">Enlace</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cartola.movimientos.map((movimiento) => (
                        <TableRow key={movimiento.id}>
                          <TableCell className="tabular-nums">
                            {fechaDe(movimiento.fecha)}
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">
                              {movimiento.descripcion}
                            </p>
                            {movimiento.contraparte && (
                              <p className="text-xs text-muted-foreground">
                                {movimiento.contraparte}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {pesos(movimiento.monto)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {ETIQUETA_TIPO[movimiento.tipo] ?? movimiento.tipo}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`text-[11px] ${
                                COLOR_ESTADO[movimiento.estado] ?? ""
                              }`}
                            >
                              {ETIQUETA_ESTADO[movimiento.estado] ??
                                movimiento.estado}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {movimiento.estado === "no_conciliado" ? (
                              <span className="text-muted-foreground">
                                En la cola de conciliación
                              </span>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span>
                                  {movimiento.origen === "manual"
                                    ? `Resuelto a mano por ${
                                        movimiento.resueltoPor ?? "—"
                                      }`
                                    : "Enlazado automáticamente"}
                                </span>
                                {movimiento.cargoReferencia && (
                                  <code className="font-mono text-muted-foreground">
                                    {movimiento.cargoReferencia}
                                  </code>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
