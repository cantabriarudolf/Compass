"use client"

/**
 * consola-archivo — ARCHIVO de documentos de la comunidad (F35 serie A, A2).
 *
 * Una sola entidad, dos naturalezas (S1, `lib/documento-archivo.ts`):
 *   · `legal`       ⊂ append-only (S2). No se edita ni se borra: las acciones de
 *                     la fila se muestran DESHABILITADAS con el motivo
 *                     (`MENSAJE_LEGAL_INMUTABLE`) y la corrección es una
 *                     versión nueva. Exige `referenciaAutentica` (S3).
 *   · `comunitario` ⊂ reemplazable (S4). PUT parcial y DELETE por la API.
 *
 * La API es la autoridad y acá solo se explica lo que decide: el 400 de
 * referencia, el 409 de inmutabilidad y el 403 de permisos se pintan tal como
 * llegan (`r.error`), sin traducirlos a otro texto que pueda divergir.
 *
 * D1/S6: el archivo se referencia por URL (metadatos + URL, nunca el binario).
 * Por eso el formulario no pide bytes: el MIME se deriva de la extensión y el
 * tamaño viaja en 0 («no medido en el navegador»).
 *
 * Los permisos salen de la matriz (`doc`): administración todo, comité ver+crear,
 * residente ver. La lista inicial de la pantalla la filtra el `page.tsx` en el
 * servidor con el mismo permiso.
 */
import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  IconArchive,
  IconExternalLink,
  IconPencil,
  IconSend,
  IconTrash,
} from "@tabler/icons-react"
import {
  ETIQUETAS_TIPO_DOCUMENTAL,
  MENSAJE_LEGAL_INMUTABLE,
  MENSAJE_REFERENCIA_AUTENTICA,
  NATURALEZAS_DOCUMENTO,
  TIPOS_DOCUMENTALES,
  esInmutable,
  requiereReferenciaAutentica,
  type NaturalezaDocumento,
  type TipoDocumental,
} from "@/lib/documento-archivo"
import { tienePermiso } from "@/lib/authz"
import { useDocumentos, type DocumentoArchivoEnLista } from "@/lib/api/use-documentos"
import { generarId } from "@/lib/id-utils"
import { hoyISO } from "@/lib/date-utils"
import { VerMas } from "@/components/ver-mas"
import { DialogoEnvioDocumento } from "./dialogo-envio-documento"

type FiltroNaturaleza = "todos" | NaturalezaDocumento
type FiltroTipo = "todos" | TipoDocumental

const NATURALEZA_LABEL: Record<NaturalezaDocumento, string> = {
  legal: "Legal",
  comunitario: "Comunitario",
}

/**
 * Motivo de una acción deshabilitada por permiso. El de lo legal es el mensaje
 * del dominio (el mismo que responde el 409), porque el motivo es la regla y no
 * el rol: quien lo intente igual recibe ese texto del servidor.
 */
const MOTIVO_SIN_PERMISO_EDITAR = "Tu rol no puede editar documentos (clave doc)."
const MOTIVO_SIN_PERMISO_ELIMINAR = "Tu rol no puede eliminar documentos (clave doc)."

/** D1: el MIME se deriva de la extensión; sin bytes, todo lo demás es binario. */
function tipoMimeDelArchivo(url: string, nombre: string): string {
  const referencia = `${url} ${nombre}`.toLowerCase()
  return /\.pdf(?:[?#\s]|$)/.test(referencia) ? "application/pdf" : "application/octet-stream"
}

interface FormularioArchivo {
  naturaleza: NaturalezaDocumento
  tipoDocumental: TipoDocumental
  glosa: string
  referenciaAutentica: string
  archivoNombre: string
  archivoUrl: string
  vigenteDesde: string
  hash: string
}

function formularioVacio(): FormularioArchivo {
  return {
    naturaleza: "legal",
    tipoDocumental: TIPOS_DOCUMENTALES[0],
    glosa: "",
    referenciaAutentica: "",
    archivoNombre: "",
    archivoUrl: "",
    vigenteDesde: hoyISO(),
    hash: "",
  }
}

function formularioDesdeFila(documento: DocumentoArchivoEnLista): FormularioArchivo {
  return {
    naturaleza: documento.naturaleza,
    tipoDocumental: documento.tipoDocumental,
    glosa: documento.glosa,
    referenciaAutentica: documento.referenciaAutentica ?? "",
    archivoNombre: documento.archivoNombre,
    archivoUrl: documento.archivoUrl,
    vigenteDesde: documento.vigenteDesde,
    hash: documento.hash ?? "",
  }
}

export function ConsolaArchivo({ roles }: { roles: string[] }) {
  const {
    items,
    total,
    isLoading,
    error: errorLectura,
    cargandoMas,
    cargarMas,
    create,
    update,
    remove,
  } = useDocumentos()

  const [formulario, setFormulario] = React.useState<FormularioArchivo>(formularioVacio)
  const [editandoId, setEditandoId] = React.useState<string | null>(null)
  const [filtroNaturaleza, setFiltroNaturaleza] = React.useState<FiltroNaturaleza>("todos")
  const [filtroTipo, setFiltroTipo] = React.useState<FiltroTipo>("todos")
  const [error, setError] = React.useState<string | null>(null)
  const [exito, setExito] = React.useState<string | null>(null)
  const [guardando, setGuardando] = React.useState(false)
  // A3 · documento legal cuyo diálogo de envío está abierto (null = cerrado).
  const [documentoEnvio, setDocumentoEnvio] = React.useState<DocumentoArchivoEnLista | null>(null)

  // ABAC/RP: la matriz decide; la API vuelve a validar cada escritura.
  const puedeCrear = tienePermiso(roles, "crear", "doc")
  const puedeEditar = tienePermiso(roles, "editar", "doc")
  const puedeEliminar = tienePermiso(roles, "eliminar", "doc")

  /**
   * S2/A2 · «los legales marcan si están vigentes».
   *
   * Un documento legal está VIGENTE cuando ningún otro legal del mismo
   * `tipoDocumental` tiene una `version` mayor. Se calcula sobre la lista
   * cargada y con la versión que asignó el servidor: la pantalla no inventa
   * versiones ni consulta otra verdad. Los comunitarios no llevan marca porque
   * se reemplazan en el lugar (no forman una serie de versiones).
   */
  const versionVigentePorTipo = React.useMemo(() => {
    const maximos = new Map<string, number>()
    for (const documento of items) {
      if (documento.naturaleza !== "legal") continue
      const actual = maximos.get(documento.tipoDocumental) ?? 0
      if (documento.version > actual) maximos.set(documento.tipoDocumental, documento.version)
    }
    return maximos
  }, [items])

  const esVigente = (documento: DocumentoArchivoEnLista): boolean =>
    documento.naturaleza === "legal" &&
    documento.version >= (versionVigentePorTipo.get(documento.tipoDocumental) ?? documento.version)

  const visibles = React.useMemo(
    () =>
      items.filter(
        (documento) =>
          (filtroNaturaleza === "todos" || documento.naturaleza === filtroNaturaleza) &&
          (filtroTipo === "todos" || documento.tipoDocumental === filtroTipo)
      ),
    [items, filtroNaturaleza, filtroTipo]
  )

  const editando = editandoId ? (items.find((d) => d.id === editandoId) ?? null) : null

  const motivoEditar = (documento: DocumentoArchivoEnLista): string | null => {
    if (esInmutable(documento.naturaleza)) return MENSAJE_LEGAL_INMUTABLE
    return puedeEditar ? null : MOTIVO_SIN_PERMISO_EDITAR
  }

  const motivoEliminar = (documento: DocumentoArchivoEnLista): string | null => {
    if (esInmutable(documento.naturaleza)) return MENSAJE_LEGAL_INMUTABLE
    return puedeEliminar ? null : MOTIVO_SIN_PERMISO_ELIMINAR
  }

  const comenzarEdicion = (documento: DocumentoArchivoEnLista): void => {
    setEditandoId(documento.id)
    setFormulario(formularioDesdeFila(documento))
    setError(null)
    setExito(null)
  }

  const cancelarEdicion = (): void => {
    setEditandoId(null)
    setFormulario(formularioVacio())
    setError(null)
  }

  const guardar = async (evento: React.FormEvent): Promise<void> => {
    evento.preventDefault()
    setError(null)
    setExito(null)

    const glosa = formulario.glosa.trim()
    const archivoNombre = formulario.archivoNombre.trim()
    const archivoUrl = formulario.archivoUrl.trim()
    const referencia = formulario.referenciaAutentica.trim()
    const hash = formulario.hash.trim()

    if (!glosa) {
      setError("La glosa es obligatoria: dice a qué corresponde el documento.")
      return
    }
    if (!archivoNombre) {
      setError("El nombre del archivo es obligatorio.")
      return
    }
    if (!archivoUrl) {
      setError("La URL del archivo es obligatoria.")
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formulario.vigenteDesde)) {
      setError("La fecha de vigencia debe tener formato AAAA-MM-DD.")
      return
    }
    // S3 · Mismo texto que la guardia de la ruta: la pantalla avisa antes de
    // viajar y la API sigue rechazando el 400 con `campo: "referenciaAutentica"`.
    if (requiereReferenciaAutentica(formulario.naturaleza) && !referencia) {
      setError(MENSAJE_REFERENCIA_AUTENTICA)
      return
    }
    if (hash && !/^[a-fA-F0-9]{64}$/.test(hash)) {
      setError("El hash debe ser SHA-256 en hexadecimal (64 caracteres).")
      return
    }

    const datos: Partial<DocumentoArchivoEnLista> = {
      naturaleza: formulario.naturaleza,
      tipoDocumental: formulario.tipoDocumental,
      glosa,
      archivoNombre,
      archivoTipoMime: tipoMimeDelArchivo(archivoUrl, archivoNombre),
      // D1: el navegador no mide bytes; 0 = tamaño no medido, no un dato falso.
      archivoTamanoKB: 0,
      archivoUrl,
      vigenteDesde: formulario.vigenteDesde,
      ...(requiereReferenciaAutentica(formulario.naturaleza)
        ? { referenciaAutentica: referencia }
        : {}),
      ...(hash ? { hash } : {}),
    }

    setGuardando(true)
    try {
      const resultado = editandoId
        ? await update(editandoId, datos)
        : await create({ ...datos, id: generarId("doc") })
      if (!resultado.ok) {
        setError(resultado.error ?? "No se pudo guardar el documento.")
        return
      }
      setExito(
        editandoId
          ? "Documento comunitario actualizado."
          : "Documento registrado en el archivo de la comunidad."
      )
      setEditandoId(null)
      setFormulario(formularioVacio())
    } finally {
      setGuardando(false)
    }
  }

  /**
   * Abrir un documento es una LECTURA AUDITADA (T11).
   *
   * La pestaña «Biblioteca» de Comunicación emitía `CO_DOC_DOWNLOAD` al abrir un
   * documento; al retirarla, esa observabilidad se muda acá y no se pierde:
   * primero se resuelve el detalle (`GET /api/documentos/[id]` — la ruta que emite
   * `AD_DOC_APERTURA` en el servidor) y solo después se abre `archivoUrl`.
   *
   * La pestaña se abre DENTRO del gesto del usuario porque, abierta después del
   * `await`, el navegador la trata como emergente y la bloquea. Si la lectura se
   * niega o falla, la pestaña se cierra sin navegar y se pinta el texto con que
   * la API explica el rechazo (mismo criterio que el resto de la pantalla: no se
   * traduce a un mensaje propio que pueda divergir del servidor).
   */
  const abrirDocumento = async (documento: DocumentoArchivoEnLista): Promise<void> => {
    setError(null)
    const ventana = window.open("", "_blank")
    try {
      const respuesta = await fetch(`/api/documentos/${encodeURIComponent(documento.id)}`, {
        headers: { accept: "application/json" },
      })
      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string }
        ventana?.close()
        setError(cuerpo.error ?? `No se pudo abrir el documento (${respuesta.status}).`)
        return
      }
      const detalle = (await respuesta.json()) as { archivoUrl?: string }
      const destino = detalle.archivoUrl ?? documento.archivoUrl
      if (!ventana) {
        // El navegador no dio la ventana preparada: se abre igual la referencia.
        window.open(destino, "_blank", "noopener,noreferrer")
        return
      }
      ventana.opener = null
      ventana.location.href = destino
    } catch {
      ventana?.close()
      setError("No se pudo abrir el documento: la lectura del detalle no se completó.")
    }
  }

  const borrar = async (documento: DocumentoArchivoEnLista): Promise<void> => {
    setError(null)
    setExito(null)
    const resultado = await remove(documento.id)
    if (!resultado.ok) {
      setError(resultado.error ?? "No se pudo eliminar el documento.")
      return
    }
    if (editandoId === documento.id) {
      setEditandoId(null)
      setFormulario(formularioVacio())
    }
    setExito("Documento comunitario eliminado.")
  }

  /**
   * A3 · abrir el diálogo de envío.
   *
   * Sólo existe para lo legal: un documento comunitario se publica al visor de
   * toda la comunidad y su constancia es "publicado", no una entrega por persona
   * (S8). Por eso la fila comunitaria no ofrece la acción — no está deshabilitada:
   * no aplica.
   */
  const abrirEnvio = (documento: DocumentoArchivoEnLista): void => {
    setError(null)
    setExito(null)
    setDocumentoEnvio(documento)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <IconArchive className="size-6" /> Archivo de Documentos
        </h1>
        <p className="text-sm text-muted-foreground">
          Los documentos que la comunidad debe conservar y poner a disposición (Ley 21.442, art. 9):
          los legales con su referencia auténtica y las versiones que los reemplazan, y los
          comunitarios que la Administración publica a todos los residentes.
        </p>
      </div>

      {errorLectura && (
        <Card>
          <CardContent className="py-3 text-sm text-destructive" role="alert">
            No se pudo leer el archivo: {errorLectura.message}
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {exito && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
          {exito}
        </p>
      )}

      {puedeCrear && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {editando ? "Editar documento comunitario" : "Cargar documento"}
            </CardTitle>
            <CardDescription className="leading-relaxed">
              El archivo se referencia por URL: el sistema guarda metadatos y nunca el binario (D1).
              Un documento legal exige referencia auténtica (fojas, fecha, notaría o Conservador) y
              no se edita ni se borra: se corrige con una versión nueva.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={guardar}>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="doc-naturaleza" className="text-xs">
                    Naturaleza
                  </Label>
                  <Select
                    value={formulario.naturaleza}
                    onValueChange={(valor) =>
                      setFormulario((previo) => ({
                        ...previo,
                        naturaleza: valor as NaturalezaDocumento,
                      }))
                    }
                    // La naturaleza no se cambia al editar: un comunitario no se
                    // convierte en legal (ni al revés) sobre la misma fila.
                    disabled={!!editandoId}
                  >
                    <SelectTrigger id="doc-naturaleza" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NATURALEZAS_DOCUMENTO.map((naturaleza) => (
                        <SelectItem key={naturaleza} value={naturaleza}>
                          {NATURALEZA_LABEL[naturaleza]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="doc-tipo" className="text-xs">
                    Tipo documental
                  </Label>
                  <Select
                    value={formulario.tipoDocumental}
                    onValueChange={(valor) =>
                      setFormulario((previo) => ({
                        ...previo,
                        tipoDocumental: valor as TipoDocumental,
                      }))
                    }
                    disabled={!!editandoId}
                  >
                    <SelectTrigger id="doc-tipo" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_DOCUMENTALES.map((tipo) => (
                        <SelectItem key={tipo} value={tipo}>
                          {ETIQUETAS_TIPO_DOCUMENTAL[tipo]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="doc-glosa" className="text-xs">
                  Glosa
                </Label>
                <Input
                  id="doc-glosa"
                  value={formulario.glosa}
                  onChange={(evento) =>
                    setFormulario((previo) => ({ ...previo, glosa: evento.target.value }))
                  }
                  placeholder="A qué corresponde el documento"
                />
              </div>

              {/* S3 · La referencia auténtica solo existe para lo legal. */}
              {requiereReferenciaAutentica(formulario.naturaleza) && (
                <div className="space-y-1">
                  <Label htmlFor="doc-referencia" className="text-xs">
                    Referencia auténtica
                  </Label>
                  <Input
                    id="doc-referencia"
                    value={formulario.referenciaAutentica}
                    onChange={(evento) =>
                      setFormulario((previo) => ({
                        ...previo,
                        referenciaAutentica: evento.target.value,
                      }))
                    }
                    placeholder="Notaría, fojas y fecha, o inscripción en el Conservador"
                  />
                  <p className="text-xs text-muted-foreground">
                    Obligatoria para lo legal: es lo que prueba que el papel es el auténtico.
                  </p>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="doc-archivo-nombre" className="text-xs">
                    Nombre del archivo
                  </Label>
                  <Input
                    id="doc-archivo-nombre"
                    value={formulario.archivoNombre}
                    onChange={(evento) =>
                      setFormulario((previo) => ({
                        ...previo,
                        archivoNombre: evento.target.value,
                      }))
                    }
                    placeholder="reglamento-copropiedad.pdf"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="doc-archivo-url" className="text-xs">
                    URL del archivo
                  </Label>
                  <Input
                    id="doc-archivo-url"
                    value={formulario.archivoUrl}
                    onChange={(evento) =>
                      setFormulario((previo) => ({ ...previo, archivoUrl: evento.target.value }))
                    }
                    placeholder="/archivo-documentos/reglamento-copropiedad.pdf"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="doc-vigente-desde" className="text-xs">
                    Vigente desde
                  </Label>
                  <Input
                    id="doc-vigente-desde"
                    type="date"
                    value={formulario.vigenteDesde}
                    onChange={(evento) =>
                      setFormulario((previo) => ({
                        ...previo,
                        vigenteDesde: evento.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="doc-hash" className="text-xs">
                    Hash SHA-256 (opcional)
                  </Label>
                  <Input
                    id="doc-hash"
                    value={formulario.hash}
                    onChange={(evento) =>
                      setFormulario((previo) => ({ ...previo, hash: evento.target.value }))
                    }
                    placeholder="64 caracteres hexadecimales"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={guardando}>
                  {editando ? "Guardar cambios" : "Registrar documento"}
                </Button>
                {editando && (
                  <Button type="button" variant="outline" onClick={cancelarEdicion}>
                    Cancelar edición
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  El tamaño y la versión los completa el sistema.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Documentos de la comunidad</CardTitle>
          <CardDescription>
            Los legales marcan si están vigentes (la versión más alta de su tipo). Un documento legal
            no se edita ni se borra: se corrige con una versión nueva, y se entrega con constancia
            por destinatario. Los comunitarios se publican al visor de toda la comunidad: no se
            envían por persona.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="filtro-naturaleza" className="text-xs">
                Filtrar por naturaleza
              </Label>
              <Select
                value={filtroNaturaleza}
                onValueChange={(valor) => setFiltroNaturaleza(valor as FiltroNaturaleza)}
              >
                <SelectTrigger id="filtro-naturaleza" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {NATURALEZAS_DOCUMENTO.map((naturaleza) => (
                    <SelectItem key={naturaleza} value={naturaleza}>
                      {NATURALEZA_LABEL[naturaleza]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-tipo" className="text-xs">
                Filtrar por tipo
              </Label>
              <Select value={filtroTipo} onValueChange={(valor) => setFiltroTipo(valor as FiltroTipo)}>
                <SelectTrigger id="filtro-tipo" className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los tipos</SelectItem>
                  {TIPOS_DOCUMENTALES.map((tipo) => (
                    <SelectItem key={tipo} value={tipo}>
                      {ETIQUETAS_TIPO_DOCUMENTAL[tipo]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-2 animate-pulse">
              <div className="h-8 rounded bg-muted/40" />
              <div className="h-8 rounded bg-muted/30" />
              <div className="h-8 rounded bg-muted/20" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Naturaleza</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Glosa</TableHead>
                    <TableHead>Versión</TableHead>
                    <TableHead>Vigente desde</TableHead>
                    <TableHead>Referencia auténtica</TableHead>
                    <TableHead>Archivo</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                        No hay documentos para este filtro.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibles.map((documento) => {
                      const bloqueoEditar = motivoEditar(documento)
                      const bloqueoEliminar = motivoEliminar(documento)
                      const vigente = esVigente(documento)
                      return (
                        <TableRow key={documento.id} className="hover:bg-muted/30">
                          <TableCell className="align-top">
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge
                                variant={documento.naturaleza === "legal" ? "default" : "secondary"}
                              >
                                {NATURALEZA_LABEL[documento.naturaleza]}
                              </Badge>
                              {documento.naturaleza === "legal" &&
                                (vigente ? (
                                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
                                    Vigente
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Reemplazado</Badge>
                                ))}
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-sm">
                            {ETIQUETAS_TIPO_DOCUMENTAL[documento.tipoDocumental] ??
                              documento.tipoDocumental}
                          </TableCell>
                          <TableCell className="max-w-[22ch] align-top text-sm">
                            {documento.glosa}
                          </TableCell>
                          <TableCell className="align-top text-sm tabular-nums">
                            v{documento.version}
                          </TableCell>
                          <TableCell className="align-top text-sm tabular-nums">
                            {documento.vigenteDesde}
                          </TableCell>
                          <TableCell className="max-w-[24ch] align-top text-xs text-muted-foreground">
                            {documento.naturaleza === "legal"
                              ? (documento.referenciaAutentica ?? "—")
                              : "—"}
                          </TableCell>
                          <TableCell className="align-top">
                            <Button variant="link" size="sm" asChild className="h-auto p-0">
                              <a
                                href={documento.archivoUrl}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Abrir ${documento.glosa} en una pestaña nueva`}
                                onClick={(evento) => {
                                  // Ctrl/Cmd/Shift o clic medio: el navegador decide,
                                  // sin abrir dos veces la misma pestaña.
                                  if (
                                    evento.metaKey ||
                                    evento.ctrlKey ||
                                    evento.shiftKey ||
                                    evento.button !== 0
                                  ) {
                                    return
                                  }
                                  evento.preventDefault()
                                  void abrirDocumento(documento)
                                }}
                              >
                                <IconExternalLink className="size-3.5" /> Abrir
                              </a>
                            </Button>
                          </TableCell>
                          <TableCell className="text-right align-top">
                            <div className="flex items-center justify-end gap-1">
                              {/* A3/S8 · sólo lo legal se entrega por persona. */}
                              {puedeCrear && documento.naturaleza === "legal" && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Enviar ${documento.glosa}`}
                                  title="Enviar el documento legal con constancia por destinatario"
                                  onClick={() => abrirEnvio(documento)}
                                >
                                  <IconSend className="size-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Editar ${documento.glosa}`}
                                title={bloqueoEditar ?? "Editar documento"}
                                disabled={!!bloqueoEditar}
                                onClick={() => comenzarEdicion(documento)}
                              >
                                <IconPencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Eliminar ${documento.glosa}`}
                                title={bloqueoEliminar ?? "Eliminar documento"}
                                disabled={!!bloqueoEliminar}
                                onClick={() => void borrar(documento)}
                              >
                                <IconTrash className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <VerMas
            mostrados={items.length}
            total={total}
            cargando={cargandoMas}
            onCargarMas={cargarMas}
          />
        </CardContent>
      </Card>

      {/* A3 · el diálogo se monta sólo con un documento legal elegido: el padrón
          de destinatarios se resuelve cuando hace falta, no al pintar la lista. */}
      {documentoEnvio && (
        <DialogoEnvioDocumento
          documento={documentoEnvio}
          onCerrar={() => setDocumentoEnvio(null)}
        />
      )}
    </div>
  )
}
