"use client"

/**
 * Panel de elementos reservables — superficie de gestión del administrador.
 *
 * Los amenities (quinchos, salón de eventos, piscina, mobiliario) se creaban
 * dentro de la pestaña "Elementos" de `/operaciones/reservas`. El owner pidió
 * que esa opción también esté en el menú del administrador, así que el catálogo
 * se administra acá y la operación diaria (reservar, cancelar, retener
 * garantía) se queda en Operaciones.
 *
 * La lectura y las mutaciones son las mismas del módulo RA (`lib/api/use-ra.ts`
 * → `/api/ra/elementos`): acá no hay capa de fetch nueva ni cambio de esquema.
 *
 * Reglas que se conservan de la superficie original:
 * - El nombre se normaliza con `aTituloCaso`, igual que al crear un elemento en
 *   Operaciones: los dos caminos escriben el mismo campo.
 * - Los bloques horarios exigen duración de bloque (misma regla que el refine
 *   de `ElementoRASchema`), y las franjas opcionales solo se envían cuando
 *   tienen valor: la API hace merge parcial y valida el documento completo.
 * - Desactivar un elemento no borra reservas históricas: solo deja de aceptar
 *   reservas nuevas, así que el panel nunca elimina el catálogo en uso.
 * - `requiereAutorizacion` se envía SIEMPRE, en creación y en edición. Los
 *   campos opcionales vacíos se omiten porque el `PUT` de la API hace merge
 *   parcial, pero un booleano nunca está «vacío»: si se omitiera al apagarlo,
 *   el merge conservaría el `true` anterior y el flag no se podría desactivar
 *   desde la interfaz. Al encenderse, la reserva del elemento nace
 *   «solicitada» y espera la aprobación del administrador.
 */
import * as React from "react"
import { generarId } from "@/lib/id-utils"
import { aTituloCaso } from "@/lib/normalizacion"
import { useElementosRA } from "@/lib/api/use-ra"
import type { ElementoRA, FranjaRA, TipoElementoRA } from "@/lib/schemas"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Switch } from "@workspace/ui/components/switch"
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
import { IconArmchair, IconPencil, IconPlus, IconPower } from "@tabler/icons-react"

const TIPO_LABEL: Record<TipoElementoRA, string> = {
  espacio_fisico: "Espacio físico",
  activo_mobiliario: "Activo mobiliario",
}

const FRANJA_LABEL: Record<FranjaRA, string> = {
  bloques_horas: "Bloques de horas",
  dia_completo: "Día completo",
}

interface FormElemento {
  nombre: string
  tipo: TipoElementoRA
  franja: FranjaRA
  duracionBloqueHoras: string
  tarifaUso: string
  garantiaRequerida: string
  aforo: string
  stock: string
  anticipacionMinimaDias: string
  cancelacionTardiaDias: string
  penalizacionTardiaMonto: string
  activo: boolean
  requiereAutorizacion: boolean
}

const FORM_ELEMENTO: FormElemento = {
  nombre: "",
  tipo: "espacio_fisico",
  franja: "bloques_horas",
  duracionBloqueHoras: "3",
  tarifaUso: "0",
  garantiaRequerida: "0",
  aforo: "",
  stock: "",
  anticipacionMinimaDias: "",
  cancelacionTardiaDias: "",
  penalizacionTardiaMonto: "",
  activo: true,
  requiereAutorizacion: false,
}

/** Entero opcional: `undefined` cuando el campo está vacío o no es numérico. */
function numeroOpcional(texto: string): number | undefined {
  const limpio = texto.trim()
  if (limpio === "") return undefined
  const valor = Math.trunc(Number(limpio))
  return Number.isFinite(valor) ? valor : undefined
}

function monto(valor: number): string {
  return `$${valor.toLocaleString("es-CL")}`
}

export function PanelElementos() {
  const {
    items: elementos,
    total,
    isLoading: cargando,
    error: errorElementos,
    create: crearElemento,
    update: actualizarElemento,
  } = useElementosRA()

  const [form, setForm] = React.useState<FormElemento | null>(null)
  const [editandoId, setEditandoId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)

  const ordenados = React.useMemo(
    () => [...elementos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [elementos]
  )

  const activos = elementos.filter((e) => e.activo).length

  const abrirNuevo = () => {
    setEditandoId(null)
    setError(null)
    setOkMsg(null)
    setForm({ ...FORM_ELEMENTO })
  }

  const abrirEdicion = (id: string) => {
    const elemento = elementos.find((e) => e.id === id)
    if (!elemento) return
    setEditandoId(id)
    setError(null)
    setOkMsg(null)
    setForm({
      nombre: elemento.nombre,
      tipo: elemento.tipo,
      franja: elemento.franja,
      duracionBloqueHoras: elemento.duracionBloqueHoras?.toString() ?? "3",
      tarifaUso: String(elemento.tarifaUso),
      garantiaRequerida: String(elemento.garantiaRequerida),
      aforo: elemento.aforo?.toString() ?? "",
      stock: elemento.stock?.toString() ?? "",
      anticipacionMinimaDias: elemento.anticipacionMinimaDias?.toString() ?? "",
      cancelacionTardiaDias: elemento.cancelacionTardiaDias?.toString() ?? "",
      penalizacionTardiaMonto: elemento.penalizacionTardiaMonto?.toString() ?? "",
      activo: elemento.activo,
      requiereAutorizacion: elemento.requiereAutorizacion === true,
    })
  }

  const cerrarFormulario = () => {
    setForm(null)
    setEditandoId(null)
  }

  /**
   * Valida las reglas del elemento y arma el payload parcial. Devuelve el
   * mensaje de error a mostrar, o `null` cuando el formulario es válido.
   */
  const construirDatos = (
    datosForm: FormElemento
  ): { error: string } | { datos: Partial<ElementoRA> } => {
    const nombre = datosForm.nombre.trim()
    if (nombre === "") return { error: "El nombre del elemento es obligatorio." }

    const duracion = numeroOpcional(datosForm.duracionBloqueHoras)
    if (
      datosForm.franja === "bloques_horas" &&
      (duracion === undefined || duracion < 1 || duracion > 24)
    ) {
      return { error: "Los bloques horarios exigen una duración de bloque entre 1 y 24 horas." }
    }

    const tarifaUso = numeroOpcional(datosForm.tarifaUso) ?? 0
    if (tarifaUso < 0) return { error: "La tarifa no puede ser negativa." }
    const garantiaRequerida = numeroOpcional(datosForm.garantiaRequerida) ?? 0
    if (garantiaRequerida < 0) return { error: "La garantía no puede ser negativa." }

    const aforo = numeroOpcional(datosForm.aforo)
    if (datosForm.aforo.trim() !== "" && (aforo === undefined || aforo < 1)) {
      return { error: "El aforo debe ser un número entero mayor a cero." }
    }
    const stock = numeroOpcional(datosForm.stock)
    if (datosForm.stock.trim() !== "" && (stock === undefined || stock < 1)) {
      return { error: "El stock debe ser de al menos 1 unidad." }
    }
    const anticipacion = numeroOpcional(datosForm.anticipacionMinimaDias)
    if (anticipacion !== undefined && anticipacion < 0) {
      return { error: "La anticipación mínima no puede ser negativa." }
    }
    const cancelacion = numeroOpcional(datosForm.cancelacionTardiaDias)
    if (cancelacion !== undefined && cancelacion < 0) {
      return { error: "La ventana de cancelación tardía no puede ser negativa." }
    }
    const penalizacion = numeroOpcional(datosForm.penalizacionTardiaMonto)
    if (datosForm.penalizacionTardiaMonto.trim() !== "" && (penalizacion ?? 0) < 1) {
      return { error: "La penalización tardía debe ser mayor a cero." }
    }

    return {
      datos: {
        nombre: aTituloCaso(nombre),
        tipo: datosForm.tipo,
        franja: datosForm.franja,
        tarifaUso,
        garantiaRequerida,
        activo: datosForm.activo,
        // Booleano, nunca «vacío»: viaja siempre para que apagarlo lo borre.
        requiereAutorizacion: datosForm.requiereAutorizacion,
        ...(datosForm.franja === "bloques_horas" && duracion !== undefined
          ? { duracionBloqueHoras: duracion }
          : {}),
        ...(aforo !== undefined && aforo >= 1 ? { aforo } : {}),
        ...(stock !== undefined && stock >= 1 ? { stock } : {}),
        ...(anticipacion !== undefined && anticipacion >= 0
          ? { anticipacionMinimaDias: anticipacion }
          : {}),
        ...(cancelacion !== undefined && cancelacion >= 0
          ? { cancelacionTardiaDias: cancelacion }
          : {}),
        ...(penalizacion !== undefined && penalizacion >= 1
          ? { penalizacionTardiaMonto: penalizacion }
          : {}),
      },
    }
  }

  const guardar = async () => {
    if (!form) return
    const armado = construirDatos(form)
    if ("error" in armado) {
      setError(armado.error)
      return
    }
    const resultado = editandoId
      ? await actualizarElemento(editandoId, armado.datos)
      : await crearElemento({ id: generarId("ra-el"), ...armado.datos })
    if (!resultado.ok) {
      setError(resultado.error ?? "No se pudo guardar el elemento.")
      return
    }
    setForm(null)
    setEditandoId(null)
    setError(null)
    setOkMsg(
      editandoId
        ? "Elemento actualizado."
        : `Elemento «${armado.datos.nombre}» agregado al catálogo de amenities.`
    )
  }

  const alternarActivo = async (id: string, activo: boolean) => {
    const resultado = await actualizarElemento(id, { activo: !activo })
    if (!resultado.ok) {
      setError(resultado.error ?? "No se pudo cambiar el estado del elemento.")
      return
    }
    setError(null)
    setOkMsg(
      activo
        ? "Elemento desactivado: deja de aceptar reservas nuevas."
        : "Elemento activado: vuelve a aceptar reservas."
    )
  }

  if (cargando) {
    return (
      <div className="flex min-h-[60vh] animate-pulse flex-col gap-4">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-64 w-full rounded-lg bg-muted" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <IconArmchair className="size-7" /> Elementos
          </h1>
          <p className="text-muted-foreground">
            Catálogo de elementos reservables de la comunidad: modalidad de uso,
            tarifa, garantía y reglas de anticipación y cancelación.
          </p>
        </div>
        <Button onClick={abrirNuevo}>
          <IconPlus className="mr-1 size-4" /> Nuevo elemento
        </Button>
      </header>

      {errorElementos && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          No se pudo leer el catálogo de elementos: {errorElementos.message}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {okMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {okMsg}
        </div>
      )}

      {/* El formulario aparece al crear/editar: con el panel cerrado la tabla
          ocupa el ancho completo (sin una columna vacía de 400px). */}
      <div className={form ? "grid gap-4 lg:grid-cols-[400px_1fr]" : "grid gap-4"}>
        {form && (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>
                {editandoId ? "Editar elemento" : "Nuevo elemento reservable"}
              </CardTitle>
              <CardDescription>
                Tarifa $0 = gratis. La garantía se retiene si el activo vuelve
                dañado.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="el-nombre">Nombre *</Label>
                <Input
                  id="el-nombre"
                  value={form.nombre}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, nombre: e.target.value } : f))
                  }
                  placeholder="Ej.: Quincho central"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Tipo *</Label>
                  <Select
                    value={form.tipo}
                    onValueChange={(v) =>
                      setForm((f) => (f ? { ...f, tipo: v as TipoElementoRA } : f))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TIPO_LABEL) as TipoElementoRA[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {TIPO_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Franja horaria *</Label>
                  <Select
                    value={form.franja}
                    onValueChange={(v) =>
                      setForm((f) => (f ? { ...f, franja: v as FranjaRA } : f))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FRANJA_LABEL) as FranjaRA[]).map((fr) => (
                        <SelectItem key={fr} value={fr}>
                          {FRANJA_LABEL[fr]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.franja === "bloques_horas" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="el-duracion">Duración del bloque (horas) *</Label>
                  <Input
                    id="el-duracion"
                    type="number"
                    min={1}
                    max={24}
                    value={form.duracionBloqueHoras}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, duracionBloqueHoras: e.target.value } : f
                      )
                    }
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="el-tarifa">Tarifa por uso ($) *</Label>
                  <Input
                    id="el-tarifa"
                    type="number"
                    min={0}
                    value={form.tarifaUso}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, tarifaUso: e.target.value } : f))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="el-garantia">Garantía requerida ($)</Label>
                  <Input
                    id="el-garantia"
                    type="number"
                    min={0}
                    value={form.garantiaRequerida}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, garantiaRequerida: e.target.value } : f
                      )
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {form.tipo === "espacio_fisico" ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="el-aforo">Aforo máximo</Label>
                    <Input
                      id="el-aforo"
                      type="number"
                      min={1}
                      value={form.aforo}
                      onChange={(e) =>
                        setForm((f) => (f ? { ...f, aforo: e.target.value } : f))
                      }
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="el-stock">Stock (unidades)</Label>
                    <Input
                      id="el-stock"
                      type="number"
                      min={1}
                      value={form.stock}
                      onChange={(e) =>
                        setForm((f) => (f ? { ...f, stock: e.target.value } : f))
                      }
                      placeholder="2 quinchos iguales → 2"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="el-anticipacion">Anticipación mínima (días)</Label>
                  <Input
                    id="el-anticipacion"
                    type="number"
                    min={0}
                    value={form.anticipacionMinimaDias}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, anticipacionMinimaDias: e.target.value } : f
                      )
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="el-cancelacion">Cancelación tardía (días)</Label>
                  <Input
                    id="el-cancelacion"
                    type="number"
                    min={0}
                    value={form.cancelacionTardiaDias}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, cancelacionTardiaDias: e.target.value } : f
                      )
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="el-penalizacion">Penalización tardía ($)</Label>
                  <Input
                    id="el-penalizacion"
                    type="number"
                    min={0}
                    value={form.penalizacionTardiaMonto}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, penalizacionTardiaMonto: e.target.value } : f
                      )
                    }
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.activo}
                  onCheckedChange={(v) => setForm((f) => (f ? { ...f, activo: v } : f))}
                />
                Habilitado para reservas
              </label>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.requiereAutorizacion}
                    onCheckedChange={(v) =>
                      setForm((f) =>
                        f ? { ...f, requiereAutorizacion: v } : f
                      )
                    }
                  />
                  Requiere autorización del administrador
                </label>
                <p className="text-xs text-muted-foreground">
                  Las reservas de este elemento nacen «solicitada» y esperan tu
                  aprobación antes de confirmarse.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={cerrarFormulario}>
                  Cancelar
                </Button>
                <Button onClick={guardar}>Guardar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Elementos reservables</CardTitle>
            <CardDescription>
              {total} elemento(s) en el catálogo, {activos} habilitado(s) para
              reservas.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {elementos.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Sin elementos configurados. Crea el primero para que los residentes
                puedan reservar.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Elemento</TableHead>
                    <TableHead>Modalidad</TableHead>
                    <TableHead>Tarifa</TableHead>
                    <TableHead>Garantía</TableHead>
                    <TableHead>Aforo / stock</TableHead>
                    <TableHead>Reglas de reserva</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordenados.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">
                        {e.nombre}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {TIPO_LABEL[e.tipo]}
                        </span>
                      </TableCell>
                      <TableCell>
                        {FRANJA_LABEL[e.franja]}
                        {e.franja === "bloques_horas" && e.duracionBloqueHoras
                          ? ` · bloques de ${e.duracionBloqueHoras} h`
                          : ""}
                      </TableCell>
                      <TableCell>{e.tarifaUso === 0 ? "Gratis" : monto(e.tarifaUso)}</TableCell>
                      <TableCell>
                        {e.garantiaRequerida === 0 ? "—" : monto(e.garantiaRequerida)}
                      </TableCell>
                      <TableCell>
                        {e.tipo === "espacio_fisico"
                          ? e.aforo !== undefined
                            ? `${e.aforo} persona(s)`
                            : "Sin aforo definido"
                          : e.stock !== undefined
                            ? `${e.stock} unidad(es)`
                            : "Sin stock definido"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="block">
                          {e.anticipacionMinimaDias !== undefined
                            ? `Anticipación ${e.anticipacionMinimaDias} día(s)`
                            : "Sin anticipación mínima"}
                        </span>
                        <span className="block">
                          {e.cancelacionTardiaDias !== undefined
                            ? `Cancelación tardía ${e.cancelacionTardiaDias} día(s)`
                            : "Sin ventana de cancelación tardía"}
                          {e.penalizacionTardiaMonto
                            ? ` · ${monto(e.penalizacionTardiaMonto)}`
                            : ""}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant={e.activo ? "secondary" : "outline"}>
                            {e.activo ? "Habilitado" : "Deshabilitado"}
                          </Badge>
                          {e.requiereAutorizacion && (
                            <Badge variant="outline">Requiere autorización</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Editar ${e.nombre}`}
                            onClick={() => abrirEdicion(e.id)}
                          >
                            <IconPencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={
                              e.activo
                                ? `Deshabilitar ${e.nombre} para reservas`
                                : `Habilitar ${e.nombre} para reservas`
                            }
                            onClick={() => alternarActivo(e.id, e.activo)}
                          >
                            <IconPower className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
