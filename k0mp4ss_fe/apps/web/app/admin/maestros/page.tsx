"use client"

import * as React from "react"
import { useMaestros } from "@/lib/api/use-maestros"
import { hexDesdeId } from "@/lib/colors"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@workspace/ui/components/table"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter
} from "@workspace/ui/components/dialog"
import { 
  IconPalette, 
  IconTags, 
  IconPlus, 
  IconPencil, 
  IconUsers,
  IconReceipt2,
  IconPhoneCall,
  IconUserExclamation,
  IconBuildingBank,
  IconBuildingSkyscraper,
  IconBuildingCottage,
  IconHome,
  IconAlertTriangle,
  IconEye,
  IconEyeOff,
  IconTrash,
  IconFlag,
  IconPigMoney,
  IconHeartbeat,
  IconShieldHeart,
  IconCalendarEvent,
  IconTrendingUp,
  IconWallet,
  IconRuler
} from "@tabler/icons-react"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { esNacional, esTipoNacional } from "@/lib/maestros-nacionales"

const BADGE_OPTIONS = [
  { value: "bg-blue-500 text-white", label: "Azul" },
  { value: "bg-emerald-500 text-white", label: "Verde" },
  { value: "bg-amber-500 text-black", label: "Ámbar" },
  { value: "bg-purple-500 text-white", label: "Morado" },
  { value: "bg-rose-500 text-white", label: "Rojo" },
  { value: "bg-cyan-500 text-white", label: "Cian" },
  { value: "bg-zinc-500 text-white", label: "Gris" },
]

const DEFAULT_BADGE_COLOR = "bg-blue-500 text-white"

const BADGE_COLOR_VALUES = new Set(BADGE_OPTIONS.map(o => o.value))

function normalizeBadgeColor(color?: string): string {
  if (color && BADGE_COLOR_VALUES.has(color)) return color
  if (color) {
    const family = color.match(/bg-([a-z]+)-\d+/)?.[1]
    const canonical = family && BADGE_OPTIONS.find(o => o.value.startsWith(`bg-${family}-`))
    if (canonical) return canonical.value
  }
  return DEFAULT_BADGE_COLOR
}

interface RegistroMaestro {
  id: string
  nombre: string
  color?: string
  hex?: string
  telefono?: string
  /** F20 fase 1b: presente solo en catálogos nacionales (GET con incluirOcultos). */
  oculto?: boolean
  /** F20: campos extra de los catálogos del país (exactamente los del esquema de cada tipo). */
  tasaCotizacion?: number
  tipo?: string
  fecha?: string
  irrenunciable?: boolean
  codigo?: string
  abreviatura?: string
}

/** Acciones de una fila de maestro según si la fila es del catálogo nacional.
 *
 * F20 fase 1b: la fila nacional es de sólo lectura — sin editar ni borrar;
 * ofrece Ocultar, o Mostrar si la comunidad ya la ocultó. La fila propia
 * conserva el comportamiento de siempre: editar y borrar.
 */
function AccionesFila({
  tipo,
  item,
  onEditar,
  onBorrar,
  onOcultar,
}: {
  tipo: string
  item: RegistroMaestro
  onEditar: (item: RegistroMaestro) => void
  onBorrar: (item: RegistroMaestro) => void
  onOcultar: (item: RegistroMaestro) => void
}) {
  if (esNacional(tipo, item.id)) {
    return item.oculto ? (
      <Button variant="ghost" size="sm" onClick={() => onOcultar(item)}>
        <IconEye className="size-4" /> Mostrar
      </Button>
    ) : (
      <Button variant="ghost" size="sm" onClick={() => onOcultar(item)}>
        <IconEyeOff className="size-4" /> Ocultar
      </Button>
    )
  }
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`Editar ${item.nombre}`} onClick={() => onEditar(item)}>
        <IconPencil className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Borrar ${item.nombre}`} onClick={() => onBorrar(item)}>
        <IconTrash className="size-4" />
      </Button>
    </>
  )
}


/** F20: los siete catálogos del país que se ofrecen acá (bancos vive en Finanzas). */
const SUBTABS_NACIONAL: { subtab: string; etiqueta: string; icono: React.ComponentType<{ className?: string }> }[] = [
  { subtab: "afps", etiqueta: "AFP", icono: IconPigMoney },
  { subtab: "previsionesSalud", etiqueta: "Previsión de salud", icono: IconHeartbeat },
  { subtab: "mutualesCajas", etiqueta: "Mutuales y cajas de compensación", icono: IconShieldHeart },
  { subtab: "feriados", etiqueta: "Feriados", icono: IconCalendarEvent },
  { subtab: "indicesAjuste", etiqueta: "Índices de ajuste", icono: IconTrendingUp },
  { subtab: "cajasFondos", etiqueta: "Cajas de fondos", icono: IconWallet },
  { subtab: "unidadesMedida", etiqueta: "Unidades de medida", icono: IconRuler },
]

const ETIQUETA_POR_SUBTAB_NACIONAL: Record<string, string> = Object.fromEntries(
  SUBTABS_NACIONAL.map((s) => [s.subtab, s.etiqueta])
)

/** Etiquetas legibles del tipo de fondo del catálogo cajas de fondos. */
const ETIQUETAS_FONDO: Record<string, string> = {
  "gasto-comun": "Gasto común",
  reserva: "Reserva",
  especial: "Extraordinaria",
  amenities: "Amenities",
}

/** Columnas extra (además del nombre) que muestra cada catálogo del país. */
const COLUMNAS_NACIONAL: Record<
  string,
  { etiqueta: string; celda: (item: RegistroMaestro) => React.ReactNode }[]
> = {
  afps: [
    {
      etiqueta: "Tasa de cotización",
      celda: (item) =>
        item.tasaCotizacion == null ? "—" : `${item.tasaCotizacion.toLocaleString("es-CL")} %`,
    },
  ],
  previsionesSalud: [
    {
      etiqueta: "Tipo",
      celda: (item) => (item.tipo === "isapre" ? "ISAPRE" : "FONASA"),
    },
  ],
  feriados: [
    { etiqueta: "Fecha", celda: (item) => item.fecha ?? "—" },
    {
      etiqueta: "Irrenunciable",
      celda: (item) =>
        item.irrenunciable ? (
          <Badge variant="secondary" className="text-[10px] font-semibold">Sí</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">No</span>
        ),
    },
  ],
  indicesAjuste: [{ etiqueta: "Código", celda: (item) => item.codigo ?? "—" }],
  cajasFondos: [
    { etiqueta: "Tipo", celda: (item) => ETIQUETAS_FONDO[item.tipo ?? ""] ?? "—" },
  ],
  unidadesMedida: [{ etiqueta: "Abreviatura", celda: (item) => item.abreviatura ?? "—" }],
}

export default function MaestrosPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- item editable polimórfico según sub-tab (unión de 30+ maestros)
  const [editingItem, setEditingItem] = React.useState<any>(null)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState("inventario")
  const [subTab, setSubTab] = React.useState<string | null>(null)
  const [duplicateError, setDuplicateError] = React.useState<string | null>(null)
  // Mensaje de las acciones de fila (ocultar/borrar): texto exacto del servidor.
  const [errorAccion, setErrorAccion] = React.useState<string | null>(null)
  // F20: campos extra del diálogo para entradas propias de catálogos del país
  // (Select y Checkbox de Radix no viajan en FormData: se llevan por estado).
  const [tipoCatalogo, setTipoCatalogo] = React.useState("")
  const [irrenunciable, setIrrenunciable] = React.useState(false)

  const TAB_SUBTABS: Record<string, string[]> = {
    inventario: ["estados", "macros", "micros", "tipos"],
    personas: ["condiciones", "estadosInmobiliarios", "emergencias"],
    finanzas: ["bancos"],
    nacionales: ["afps", "previsionesSalud", "mutualesCajas", "feriados", "indicesAjuste", "cajasFondos", "unidadesMedida"],
  }
  const isValidSubTab = TAB_SUBTABS[activeTab]?.includes(subTab ?? "")

  // subTab → tipo kebab-case de la API /api/maestros/[tipo]
  const TIPO_POR_SUBTAB: Record<string, string> = {
    estados: "estados-ocupacion",
    macros: "categorias-macro",
    micros: "categorias-micro",
    tipos: "categorias-unidad",
    condiciones: "condiciones-especiales",
    estadosInmobiliarios: "estados-inmobiliarios",
    bancos: "bancos",
    emergencias: "contactos-emergencia",
    afps: "afps",
    previsionesSalud: "previsiones-salud",
    mutualesCajas: "mutuales-cajas",
    feriados: "feriados",
    indicesAjuste: "indices-ajuste",
    cajasFondos: "cajas-fondos",
    unidadesMedida: "unidades-medida",
  }
  const tipoActivo = subTab ? TIPO_POR_SUBTAB[subTab] ?? null : null

  const {
    data: registros,
    isLoading,
    error,
    create: crearRegistro,
    update: actualizarRegistro,
    remove: borrarRegistro,
    ocultar: ocultarRegistro,
  } = useMaestros<RegistroMaestro>(
    tipoActivo,
    // F20 fase 1b: en un catálogo nacional el listado de administración trae
    // también las filas ocultadas (con su booleano `oculto`).
    tipoActivo && esTipoNacional(tipoActivo) ? { incluirOcultos: true } : undefined
  )

  const filaNacional = (item: RegistroMaestro): boolean =>
    tipoActivo !== null && esNacional(tipoActivo, item.id)

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    setSubTab(null)
  }

  const handleSubTabChange = (tab: string) => {
    setSubTab(tab)
    setDuplicateError(null)
    setErrorAccion(null)
  }

  const handleEditar = (item: RegistroMaestro) => {
    setEditingItem(item)
    setDuplicateError(null)
    setErrorAccion(null)
    setTipoCatalogo(item.tipo ?? "")
    setIrrenunciable(item.irrenunciable === true)
    setIsDialogOpen(true)
  }

  /** F20: abre el diálogo para una entrada propia nueva del sub-tab activo. */
  const handleNuevo = () => {
    setEditingItem(null)
    setDuplicateError(null)
    setTipoCatalogo(subTab === "previsionesSalud" ? "fonasa" : subTab === "cajasFondos" ? "gasto-comun" : "")
    setIrrenunciable(false)
    setIsDialogOpen(true)
  }

  /** F20 fase 1b: alterna el ocultamiento de una fila nacional (PUT ocultar). */
  const handleOcultar = async (item: RegistroMaestro) => {
    setErrorAccion(null)
    const resultado = await ocultarRegistro(item.id, item.oculto !== true)
    if (!resultado.ok) {
      setErrorAccion(resultado.error ?? "No se pudo actualizar el catálogo.")
    }
  }

  const handleBorrar = async (item: RegistroMaestro) => {
    setErrorAccion(null)
    const resultado = await borrarRegistro(item.id)
    if (!resultado.ok) {
      setErrorAccion(resultado.error ?? "No se pudo borrar el registro.")
    }
  }

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const nombre = (formData.get("nombre") as string)?.trim()
    const valor = formData.get("telefono") as string
    const color = formData.get("color") as string

    if (!nombre || !subTab) return

    const duplicate = (registros ?? []).find(
      (item) => item.nombre.toLowerCase() === nombre.toLowerCase() && item.id !== editingItem?.id
    )
    if (duplicate) {
      setDuplicateError(`Ya existe un registro con el nombre "${nombre}".`)
      return
    }
    setDuplicateError(null)

    let resultado: { ok: boolean; error?: string }
    if (subTab === "estados") {
      const id = editingItem?.id ?? `est-${Date.now()}`
      resultado = editingItem
        ? await actualizarRegistro(id, { nombre })
        : await crearRegistro({ id, nombre, color, hex: hexDesdeId(id) })
    } else if (subTab === "macros") {
      resultado = editingItem
        ? await actualizarRegistro(editingItem.id, { nombre })
        : await crearRegistro({ id: Date.now().toString(), nombre })
    } else if (subTab === "micros") {
      resultado = editingItem
        ? await actualizarRegistro(editingItem.id, { nombre })
        : await crearRegistro({ id: Date.now().toString(), nombre })
    } else if (subTab === "tipos") {
      resultado = editingItem
        ? await actualizarRegistro(editingItem.id, { nombre })
        : await crearRegistro({ id: Date.now().toString(), nombre })
    } else if (subTab === "estadosInmobiliarios") {
      resultado = editingItem
        ? await actualizarRegistro(editingItem.id, { nombre, color })
        : await crearRegistro({ id: Date.now().toString(), nombre, color })
    } else if (subTab === "condiciones") {
      resultado = editingItem
        ? await actualizarRegistro(editingItem.id, { nombre, color })
        : await crearRegistro({ id: Date.now().toString(), nombre, color })
    } else if (subTab === "bancos") {
      resultado = editingItem
        ? await actualizarRegistro(editingItem.id, { nombre })
        : await crearRegistro({ id: Date.now().toString(), nombre })
    } else if (subTab === "emergencias") {
      resultado = editingItem
        ? await actualizarRegistro(editingItem.id, { nombre, telefono: valor })
        : await crearRegistro({ id: Date.now().toString(), nombre, telefono: valor })
    } else if (subTab === "afps") {
      // F20: entradas propias del catálogo del país (misma forma que la API).
      const tasa = Number(formData.get("tasaCotizacion"))
      if (Number.isNaN(tasa)) {
        setDuplicateError("La tasa de cotización debe ser un número.")
        return
      }
      resultado = editingItem
        ? await actualizarRegistro(editingItem.id, { nombre, tasaCotizacion: tasa })
        : await crearRegistro({ id: Date.now().toString(), nombre, tasaCotizacion: tasa })
    } else if (subTab === "previsionesSalud") {
      resultado = editingItem
        ? await actualizarRegistro(editingItem.id, { nombre, tipo: tipoCatalogo })
        : await crearRegistro({ id: Date.now().toString(), nombre, tipo: tipoCatalogo })
    } else if (subTab === "mutualesCajas") {
      resultado = editingItem
        ? await actualizarRegistro(editingItem.id, { nombre })
        : await crearRegistro({ id: Date.now().toString(), nombre })
    } else if (subTab === "feriados") {
      const fecha = (formData.get("fecha") as string)?.trim()
      if (!fecha) {
        setDuplicateError("La fecha del feriado es obligatoria.")
        return
      }
      resultado = editingItem
        ? await actualizarRegistro(editingItem.id, { nombre, fecha, irrenunciable })
        : await crearRegistro({ id: Date.now().toString(), nombre, fecha, irrenunciable })
    } else if (subTab === "indicesAjuste") {
      const codigo = (formData.get("codigo") as string)?.trim()
      if (!codigo) {
        setDuplicateError("El código del índice es obligatorio.")
        return
      }
      resultado = editingItem
        ? await actualizarRegistro(editingItem.id, { nombre, codigo })
        : await crearRegistro({ id: Date.now().toString(), nombre, codigo })
    } else if (subTab === "cajasFondos") {
      resultado = editingItem
        ? await actualizarRegistro(editingItem.id, { nombre, tipo: tipoCatalogo })
        : await crearRegistro({ id: Date.now().toString(), nombre, tipo: tipoCatalogo })
    } else if (subTab === "unidadesMedida") {
      const abreviatura = (formData.get("abreviatura") as string)?.trim()
      if (!abreviatura) {
        setDuplicateError("La abreviatura es obligatoria.")
        return
      }
      resultado = editingItem
        ? await actualizarRegistro(editingItem.id, { nombre, abreviatura })
        : await crearRegistro({ id: Date.now().toString(), nombre, abreviatura })
    } else {
      return
    }

    if (!resultado.ok) {
      setDuplicateError(resultado.error ?? "No se pudo guardar el registro.")
      return
    }
    setIsDialogOpen(false)
    setEditingItem(null)
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <h2 className="text-xl font-bold text-destructive">No se pudo cargar el maestro</h2>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    )
  }

  if (subTab && isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
        <div className="h-64 w-full rounded-lg bg-muted/30" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Maestros Administrativos</h1>
          <p className="text-muted-foreground">Acá se cargan las categorías que el sistema usa en toda la comunidad: tipos de sectores (Torre, Piso…), categorías de unidades, estados de ocupación, etc. Lo que crees acá aparece como opción en los formularios de Inventario, Estructura Física y demás módulos.</p>
        </div>
        <Button disabled={!isValidSubTab} onClick={handleNuevo} className="gap-2" title={!isValidSubTab ? "Seleccioná una categoría de la izquierda primero" : undefined}>
          <IconPlus className="size-4" /> Nuevo Registro
        </Button>
      </div>

      {errorAccion && (
        <div role="alert" className="flex items-center gap-1 text-sm text-destructive">
          <IconAlertTriangle className="size-3.5 shrink-0" /> {errorAccion}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="bg-muted/50 p-1 mb-8">
          <TabsTrigger value="inventario" className="gap-2">
            <IconTags className="size-4" /> Estructura e Inventario
          </TabsTrigger>
          <TabsTrigger value="personas" className="gap-2">
            <IconUsers className="size-4" /> Personas y Comunidad
          </TabsTrigger>
          <TabsTrigger value="finanzas" className="gap-2">
            <IconReceipt2 className="size-4" /> Finanzas y RRHH
          </TabsTrigger>
          <TabsTrigger value="nacionales" className="gap-2">
            <IconFlag className="size-4" /> Catálogos del país
          </TabsTrigger>
        </TabsList>

        {/* --- TABS DE INVENTARIO --- */}
        <TabsContent value="inventario">
          <div className="grid grid-cols-4 gap-6">
            <div className="flex flex-col gap-2">
              <Button variant={subTab === "estados" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("estados")}>
                <IconPalette className="size-4" /> Estados de Ocupación
              </Button>
              <Button variant={subTab === "macros" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("macros")}>
                <IconTags className="size-4" /> Categorías Macro Sectores
              </Button>
              <Button variant={subTab === "micros" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("micros")}>
                <IconBuildingSkyscraper className="size-4" /> Categorías Micro Sectores
              </Button>
              <Button variant={subTab === "tipos" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("tipos")}>
                <IconBuildingCottage className="size-4" /> Categorías de Unidad
              </Button>
            </div>
            
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>
                  {!subTab
                    ? "Seleccioná una categoría"
                    : subTab === "estados"
                      ? "Semántica de Estados"
                      : subTab === "macros"
                        ? "Categorías Macro Sectores"
                        : subTab === "micros"
                          ? "Categorías Micro Sectores"
                            : subTab === "tipos"
                              ? "Categorías de Unidad"
                              : "Jerarquía de Sectores"}
                </CardTitle>
                <CardDescription>
                  {!subTab
                    ? "Elegí una categoría del menú de la izquierda para ver y administrar sus registros."
                    : subTab === "estados"
                      ? <>Estos estados definen la condición de ocupación de cada unidad y se reflejan automáticamente en el mapa de departamentos y estacionamientos.</>
                        : subTab === "tipos"
                          ? <>Estas categorías alimentan el campo <strong>Categoría</strong> del módulo <strong>Tipos de Unidad (TU)</strong> y la etiqueta de las unidades en <strong>Estructura Física</strong>.</>
                          : subTab === "macros"
                            ? <>Son los distintos tipos de Macro-Sectores que puede tener la comunidad. El sector concreto (ej: Torre A) se crea luego en <strong>Inventario → Estructura Física</strong>.</>
                            : <>Son los distintos tipos de Micro-Sectores que puede tener un Macro-Sector. El sector concreto (ej: Piso 1) se crea luego en <strong>Inventario → Estructura Física</strong>.</>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      {subTab === "estados" && <TableHead>Badge Visual</TableHead>}
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!subTab ? (
                      <TableRow>
                        <TableCell colSpan={subTab === "estados" ? 3 : 2} className="text-center text-muted-foreground py-8">
                          Seleccioná una categoría de la izquierda para ver los registros.
                        </TableCell>
                      </TableRow>
                    ) : registros.map((item) => (
                      <TableRow key={item.id} className={filaNacional(item) && item.oculto ? "opacity-50" : undefined}>
                        <TableCell className="font-bold">
                          <span className="inline-flex items-center gap-2">
                            {item.nombre}
                            {filaNacional(item) && (
                              <Badge variant="outline" className="text-[10px] font-semibold">Catálogo nacional</Badge>
                            )}
                            {filaNacional(item) && item.oculto && (
                              <Badge variant="secondary" className="text-[10px] font-semibold">Oculto</Badge>
                            )}
                          </span>
                        </TableCell>
                        {subTab === "estados" && (
                          <TableCell>
                            <Badge className={`${"color" in item && item.color ? item.color : DEFAULT_BADGE_COLOR} font-bold uppercase text-[10px]`}>{item.nombre}</Badge>
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <AccionesFila tipo={tipoActivo ?? ""} item={item} onEditar={handleEditar} onBorrar={handleBorrar} onOcultar={handleOcultar} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* --- TABS DE PERSONAS --- */}
        <TabsContent value="personas">
          <div className="grid grid-cols-4 gap-6">
            <div className="flex flex-col gap-2">
              <Button variant={subTab === "condiciones" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("condiciones")}>
                <IconUserExclamation className="size-4" /> Condiciones Especiales
              </Button>
              <Button variant={subTab === "estadosInmobiliarios" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("estadosInmobiliarios")}>
                <IconHome className="size-4" /> Estados Inmobiliarios
              </Button>
              <Button variant={subTab === "emergencias" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("emergencias")}>
                <IconPhoneCall className="size-4" /> Directorio de Emergencia
              </Button>
            </div>
            
            <Card className="col-span-3 border-purple-100">
              <CardHeader>
                <CardTitle>
                  {!subTab
                    ? "Seleccioná una categoría"
                    : subTab === "condiciones" ? "Etiquetas de Vulnerabilidad" : subTab === "estadosInmobiliarios" ? "Estados Inmobiliarios" : "Números Críticos"}
                </CardTitle>
                <CardDescription>
                  {!subTab
                    ? "Elegí una categoría del menú de la izquierda para ver y administrar sus registros."
                    : subTab === "estadosInmobiliarios"
                      ? <>Estados de ocupación de la propiedad usados en el módulo <strong>Vinculación de Unidades (VU)</strong>.</>
                      : "Parámetros para la seguridad y bienestar de los residentes."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Identificador</TableHead>
                      <TableHead>{subTab === "condiciones" || subTab === "estadosInmobiliarios" ? "Badge Visual" : "Número / Contacto"}</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!subTab ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          Seleccioná una categoría de la izquierda para ver los registros.
                        </TableCell>
                      </TableRow>
                    ) : registros.map((item) => (
                      <TableRow key={item.id} className={filaNacional(item) && item.oculto ? "opacity-50" : undefined}>
                        <TableCell className="font-bold">
                          <span className="inline-flex items-center gap-2">
                            {item.nombre}
                            {filaNacional(item) && (
                              <Badge variant="outline" className="text-[10px] font-semibold">Catálogo nacional</Badge>
                            )}
                            {filaNacional(item) && item.oculto && (
                              <Badge variant="secondary" className="text-[10px] font-semibold">Oculto</Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          {subTab === "condiciones" || subTab === "estadosInmobiliarios" ? (
                            <Badge className={`${"color" in item ? item.color || DEFAULT_BADGE_COLOR : DEFAULT_BADGE_COLOR} font-black text-[9px]`}>{item.nombre.toUpperCase()}</Badge>
                          ) : subTab === "emergencias" ? (
                            <span className="text-sm font-mono text-blue-600">{(item as { telefono?: string }).telefono}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <AccionesFila tipo={tipoActivo ?? ""} item={item} onEditar={handleEditar} onBorrar={handleBorrar} onOcultar={handleOcultar} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* --- TABS DE FINANZAS --- */}
        <TabsContent value="finanzas">
          <div className="grid grid-cols-4 gap-6">
            <div className="flex flex-col gap-2">
              <Button variant={subTab === "bancos" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("bancos")}>
                <IconBuildingBank className="size-4" /> Instituciones Bancarias
              </Button>
            </div>
            
            <Card className="col-span-3 border-emerald-100">
              <CardHeader>
                <CardTitle>Bancos Permitidos</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre Banco</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!subTab ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                          Seleccioná una categoría de la izquierda para ver los registros.
                        </TableCell>
                      </TableRow>
                    ) : registros.map((item) => (
                      <TableRow key={item.id} className={filaNacional(item) && item.oculto ? "opacity-50" : undefined}>
                        <TableCell className="font-bold">
                          <span className="inline-flex items-center gap-2">
                            {item.nombre}
                            {filaNacional(item) && (
                              <Badge variant="outline" className="text-[10px] font-semibold">Catálogo nacional</Badge>
                            )}
                            {filaNacional(item) && item.oculto && (
                              <Badge variant="secondary" className="text-[10px] font-semibold">Oculto</Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <AccionesFila tipo={tipoActivo ?? ""} item={item} onEditar={handleEditar} onBorrar={handleBorrar} onOcultar={handleOcultar} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* --- TABS DE CATÁLOGOS DEL PAÍS (F20) --- */}
        <TabsContent value="nacionales">
          <div className="grid grid-cols-4 gap-6">
            <div className="flex flex-col gap-2">
              {SUBTABS_NACIONAL.map(({ subtab, etiqueta, icono: Icono }) => (
                <Button
                  key={subtab}
                  variant={subTab === subtab ? "default" : "ghost"}
                  className="justify-start gap-2"
                  onClick={() => handleSubTabChange(subtab)}
                >
                  <Icono className="size-4" /> {etiqueta}
                </Button>
              ))}
            </div>

            <Card className="col-span-3 border-emerald-100">
              <CardHeader>
                <CardTitle>
                  {!subTab ? "Seleccioná un catálogo del país" : ETIQUETA_POR_SUBTAB_NACIONAL[subTab] ?? "Catálogo del país"}
                </CardTitle>
                <CardDescription>
                  Catálogos nacionales: podés ocultar las entradas que la comunidad no usa o agregar entradas propias. Las filas del país se conservan intactas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      {!subTab
                        ? null
                        : (COLUMNAS_NACIONAL[subTab] ?? []).map((columna) => (
                            <TableHead key={columna.etiqueta}>{columna.etiqueta}</TableHead>
                          ))}
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!subTab ? (
                      <TableRow>
                        <TableCell colSpan={(COLUMNAS_NACIONAL[subTab ?? ""]?.length ?? 0) + 2} className="text-center text-muted-foreground py-8">
                          Seleccioná un catálogo del país para ver sus registros.
                        </TableCell>
                      </TableRow>
                    ) : registros.map((item) => (
                      <TableRow key={item.id} className={filaNacional(item) && item.oculto ? "opacity-50" : undefined}>
                        <TableCell className="font-bold">
                          <span className="inline-flex items-center gap-2">
                            {item.nombre}
                            {filaNacional(item) && (
                              <Badge variant="outline" className="text-[10px] font-semibold">Catálogo nacional</Badge>
                            )}
                            {filaNacional(item) && item.oculto && (
                              <Badge variant="secondary" className="text-[10px] font-semibold">Oculto</Badge>
                            )}
                          </span>
                        </TableCell>
                        {(COLUMNAS_NACIONAL[subTab] ?? []).map((columna) => (
                          <TableCell key={columna.etiqueta}>{columna.celda(item)}</TableCell>
                        ))}
                        <TableCell className="text-right">
                          <AccionesFila tipo={tipoActivo ?? ""} item={item} onEditar={handleEditar} onBorrar={handleBorrar} onOcultar={handleOcultar} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setDuplicateError(null); }}>
        <DialogContent>
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingItem ? "Editar Maestro" : "Añadir Nuevo Maestro"}</DialogTitle>
            </DialogHeader>
            {!editingItem && tipoActivo && esTipoNacional(tipoActivo) && (
              <p className="text-xs text-muted-foreground">
                Este catálogo es del país: lo que agregues acá es una entrada propia de la comunidad, que podés editar y borrar. El catálogo nacional no se modifica.
              </p>
            )}
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Nombre / Categoría</Label>
                <Input name="nombre" defaultValue={editingItem?.nombre} required />
                {duplicateError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <IconAlertTriangle className="size-3.5 shrink-0" /> {duplicateError}
                  </p>
                )}
              </div>
              
              {(subTab === "estados" || subTab === "condiciones" || subTab === "estadosInmobiliarios") && (
                <div className="space-y-2">
                  <Label>Badge Visual</Label>
                  <Select name="color" defaultValue={normalizeBadgeColor(editingItem?.color)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegí un estilo" />
                    </SelectTrigger>
                    <SelectContent>
                      {BADGE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <Badge className={`${option.value} font-bold text-[10px]`}>{option.label}</Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {subTab === "emergencias" && (
                <div className="space-y-2">
                  <Label>Número / Valor</Label>
                  <Input name="telefono" defaultValue={editingItem?.telefono} required />
                </div>
              )}

              {subTab === "afps" && (
                <div className="space-y-2">
                  <Label>Tasa de cotización (%)</Label>
                  <Input name="tasaCotizacion" type="number" step="0.01" min="0" defaultValue={editingItem?.tasaCotizacion} required />
                </div>
              )}

              {subTab === "previsionesSalud" && (
                <div className="space-y-2">
                  <Label>Tipo de previsión</Label>
                  <Select value={tipoCatalogo} onValueChange={setTipoCatalogo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegí el tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fonasa">FONASA</SelectItem>
                      <SelectItem value="isapre">ISAPRE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {subTab === "feriados" && (
                <>
                  <div className="space-y-2">
                    <Label>Fecha</Label>
                    <Input name="fecha" type="date" defaultValue={editingItem?.fecha} required />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={irrenunciable}
                      onCheckedChange={(checked) => setIrrenunciable(checked === true)}
                    />
                    <span className="text-sm">Feriado irrenunciable (no se puede trabajar)</span>
                  </div>
                </>
              )}

              {subTab === "indicesAjuste" && (
                <div className="space-y-2">
                  <Label>Código</Label>
                  <Input name="codigo" defaultValue={editingItem?.codigo} required />
                </div>
              )}

              {subTab === "cajasFondos" && (
                <div className="space-y-2">
                  <Label>Tipo de fondo</Label>
                  <Select value={tipoCatalogo} onValueChange={setTipoCatalogo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegí el tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gasto-comun">Gasto común</SelectItem>
                      <SelectItem value="reserva">Reserva</SelectItem>
                      <SelectItem value="amenities">Amenities</SelectItem>
                      <SelectItem value="especial">Cuota extraordinaria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {subTab === "unidadesMedida" && (
                <div className="space-y-2">
                  <Label>Abreviatura</Label>
                  <Input name="abreviatura" defaultValue={editingItem?.abreviatura} required />
                </div>
              )}
            </div>
            <DialogFooter><Button type="submit">Guardar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
