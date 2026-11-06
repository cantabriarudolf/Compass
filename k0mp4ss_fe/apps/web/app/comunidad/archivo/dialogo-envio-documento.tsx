"use client"

/**
 * dialogo-envio-documento — la acción «Enviar» del Archivo (F35 serie A, A3 · T14).
 *
 * Sólo se monta para documentos LEGALES: un documento comunitario se publica al
 * visor de toda la comunidad y no se entrega por persona (S8), así que su fila
 * no ofrece la acción. La API vuelve a decidir (409) si algo se desincroniza.
 *
 * Lo que hace, en una sola corrida (S7):
 *   1. resuelve los destinatarios con `useDestinatariosArchivo` — propietarios y
 *      arrendatarios del directorio de residentes del servidor, y la nómina
 *      vigente del comité del libro de gobernanza;
 *   2. deja elegir grupos (propietarios / arrendatarios / comité) o personas
 *      sueltas; la selección es UNA lista de `personaId` (los grupos agregan o
 *      quitan a sus miembros, nunca una segunda fuente de verdad);
 *   3. manda UN `POST /api/documentos/[id]/envio` con todas las personas y el
 *      canal (visor o correo), y opcionalmente el reenvío explícito;
 *   4. muestra el estado por destinatario con su motivo, tal como lo registró el
 *      servidor: `entregado` sólo con la notificación del visor o la aceptación
 *      real del servidor de correo; `pendiente` y `fallido` con su porqué.
 *
 * Los textos de error son los de la API (`error`), sin traducirlos: la pantalla
 * no inventa una explicación que pueda divergir de la regla del servidor.
 */
import * as React from "react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import type {
  CanalEnvioDocumento,
  EstadoEnvioDocumento,
} from "@/app/api/documentos/_lib/envio-documento"
import {
  ETIQUETAS_GRUPO_DESTINATARIO,
  GRUPOS_DESTINATARIO,
  useDestinatariosArchivo,
  type GrupoDestinatario,
} from "./use-destinatarios-archivo"

/** Documento de la fila que se va a enviar: lo mínimo para el título y la URL. */
export interface DocumentoParaEnviar {
  id: string
  glosa: string
}

/**
 * Canales con su etiqueta humana. El tipo viene del módulo del servidor
 * (`import type`: no arrastra Prisma al navegador); la lista de opciones es de
 * la pantalla.
 */
const CANALES_ENVIO: ReadonlyArray<{ valor: CanalEnvioDocumento; etiqueta: string }> = [
  { valor: "visor", etiqueta: "Visor de la comunidad" },
  { valor: "email", etiqueta: "Correo electrónico" },
]

/** Etiqueta de cada estado registrado; `duplicado` es la respuesta idempotente. */
const ETIQUETA_ESTADO: Record<string, string> = {
  entregado: "Entregado",
  pendiente: "Pendiente",
  fallido: "Fallido",
  duplicado: "Ya registrado",
}

/** Resultado por destinatario tal como lo devuelve la ruta. */
interface ResultadoEnvio {
  personaId: string
  canal: string
  estado: EstadoEnvioDocumento | "duplicado" | string
  motivo?: string
  fecha?: string
}

interface RespuestaEnvio {
  ok?: boolean
  error?: string
  mensaje?: string
  resultados?: ResultadoEnvio[]
}

export function DialogoEnvioDocumento({
  documento,
  onCerrar,
}: {
  documento: DocumentoParaEnviar
  onCerrar: () => void
}) {
  const { destinatarios, isLoading, error: errorDestinatarios } = useDestinatariosArchivo()

  const [canal, setCanal] = React.useState<CanalEnvioDocumento>("visor")
  const [seleccionados, setSeleccionados] = React.useState<string[]>([])
  const [busqueda, setBusqueda] = React.useState("")
  const [reenviar, setReenviar] = React.useState(false)
  const [enviando, setEnviando] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [resultado, setResultado] = React.useState<{
    mensaje: string
    resultados: ResultadoEnvio[]
  } | null>(null)

  const miembrosDelGrupo = React.useCallback(
    (grupo: GrupoDestinatario): string[] =>
      destinatarios.filter((d) => d.grupos.includes(grupo)).map((d) => d.personaId),
    [destinatarios]
  )

  const grupoCompleto = (grupo: GrupoDestinatario): boolean => {
    const miembros = miembrosDelGrupo(grupo)
    return miembros.length > 0 && miembros.every((id) => seleccionados.includes(id))
  }

  /**
   * Marcar un grupo agrega a TODOS sus miembros; desmarcarlo los quita. La
   * selección sigue siendo una sola lista de personas, así que marcar un grupo y
   * después destildar a una persona deja a esa persona fuera, sin ambigüedad.
   */
  const alternarGrupo = (grupo: GrupoDestinatario): void => {
    const miembros = miembrosDelGrupo(grupo)
    const completo = grupoCompleto(grupo)
    setSeleccionados((previos) =>
      completo
        ? previos.filter((id) => !miembros.includes(id))
        : [...new Set([...previos, ...miembros])]
    )
  }

  const alternarPersona = (personaId: string): void => {
    setSeleccionados((previos) =>
      previos.includes(personaId)
        ? previos.filter((id) => id !== personaId)
        : [...previos, personaId]
    )
  }

  const visibles = React.useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    if (!termino) return destinatarios
    return destinatarios.filter(
      (destinatario) =>
        destinatario.nombre.toLowerCase().includes(termino) ||
        (destinatario.unidadEtiqueta ?? "").toLowerCase().includes(termino)
    )
  }, [destinatarios, busqueda])

  const nombreDe = (personaId: string): string =>
    destinatarios.find((destinatario) => destinatario.personaId === personaId)?.nombre ?? personaId

  const enviar = async (evento: React.FormEvent): Promise<void> => {
    evento.preventDefault()
    setError(null)
    setResultado(null)
    if (seleccionados.length === 0) {
      setError("Elegí al menos un destinatario: sin destinatario no hay entrega.")
      return
    }

    setEnviando(true)
    try {
      const respuesta = await fetch(
        `/api/documentos/${encodeURIComponent(documento.id)}/envio`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            personasIds: seleccionados,
            canal,
            reenviar,
          }),
        }
      )
      const cuerpo = (await respuesta.json().catch(() => ({}))) as RespuestaEnvio
      if (!respuesta.ok) {
        setError(cuerpo.error ?? `No se pudo enviar el documento (${respuesta.status}).`)
        return
      }
      setResultado({
        mensaje: cuerpo.mensaje ?? "Envío registrado.",
        resultados: cuerpo.resultados ?? [],
      })
    } catch {
      setError("No se pudo enviar el documento: la petición no se completó.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar()
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enviar documento legal</DialogTitle>
          <DialogDescription className="leading-relaxed">
            «{documento.glosa}» se entrega en UNA corrida a los destinatarios elegidos, con constancia
            por persona. Una segunda corrida idéntica no duplica el registro: para volver a entregar
            hay que marcar el reenvío explícito.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={enviar}>
          <div className="space-y-1">
            <Label htmlFor="envio-canal" className="text-xs">
              Canal
            </Label>
            <Select
              value={canal}
              onValueChange={(valor) => setCanal(valor as CanalEnvioDocumento)}
            >
              <SelectTrigger id="envio-canal" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANALES_ENVIO.map((opcion) => (
                  <SelectItem key={opcion.valor} value={opcion.valor}>
                    {opcion.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              El visor deja la notificación que prueba la entrega. El correo sale por el emisor de la
              comunidad y sólo queda entregado si el servidor lo acepta.
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium">Grupos</legend>
            <div className="flex flex-wrap gap-4 text-xs">
              {GRUPOS_DESTINATARIO.map((grupo) => {
                const miembros = miembrosDelGrupo(grupo)
                return (
                  <label key={grupo} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={grupoCompleto(grupo)}
                      disabled={miembros.length === 0}
                      onChange={() => alternarGrupo(grupo)}
                    />
                    {ETIQUETAS_GRUPO_DESTINATARIO[grupo]} ({miembros.length})
                  </label>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium">Personas</legend>
            <Input
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Buscar por nombre o unidad"
              aria-label="Buscar destinatario"
            />
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Cargando el padrón de residentes…</p>
            ) : errorDestinatarios ? (
              <p className="text-xs text-destructive" role="alert">
                No se pudo resolver el padrón de destinatarios: {errorDestinatarios.message}
              </p>
            ) : visibles.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hay destinatarios para esa búsqueda.</p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {visibles.map((destinatario) => (
                  <li key={destinatario.personaId}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={seleccionados.includes(destinatario.personaId)}
                        onChange={() => alternarPersona(destinatario.personaId)}
                      />
                      {destinatario.nombre}
                      {destinatario.unidadEtiqueta ? ` · ${destinatario.unidadEtiqueta}` : ""}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={reenviar}
              onChange={(evento) => setReenviar(evento.target.checked)}
            />
            Reenviar a quienes ya lo recibieron (agrega una constancia nueva)
          </label>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {resultado && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
                {resultado.mensaje}
              </p>
              <ul aria-label="Resultado del envío" className="flex flex-col gap-1">
                {resultado.resultados.map((fila) => (
                  <li
                    key={`${fila.personaId}-${fila.canal}-${fila.fecha ?? ""}-${fila.estado}`}
                    className="flex flex-wrap items-center gap-2 text-xs"
                  >
                    <span className="font-medium">{nombreDe(fila.personaId)}</span>
                    <Badge
                      variant={
                        fila.estado === "fallido"
                          ? "destructive"
                          : fila.estado === "entregado"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {ETIQUETA_ESTADO[fila.estado] ?? fila.estado}
                    </Badge>
                    {fila.motivo && (
                      <span className="text-muted-foreground">{fila.motivo}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cerrar
            </Button>
            <Button type="submit" disabled={enviando || seleccionados.length === 0}>
              {`Enviar a ${seleccionados.length} destinatario(s)`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
