"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { Persona } from "@/data/comunidad/personas"
import { VinculoUnidad, RolVinculo } from "@/data/comunidad/vinculos"
import { useCompassStore, useStoreRehydrated, StoreResult } from "@/lib/store"

const NOMBRE_ROL: Record<RolVinculo, string> = {
  propietario: "Propietario",
  arrendatario: "Arrendatario",
  copropietario: "Copropietario / Familiar",
  ocupante: "Ocupante",
}

const COLOR_ROL_VINCULO: Record<RolVinculo, string> = {
  propietario: "bg-indigo-600 text-white",
  arrendatario: "bg-sky-600 text-white",
  copropietario: "bg-purple-600 text-white",
  ocupante: "bg-emerald-600 text-white",
}

import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { FormularioVinculoUnidad } from "@/components/comunidad/formulario-vinculo"
import {
  IconArrowLeft,
  IconUserCircle,
  IconAlertTriangleFilled,
  IconBriefcase,
  IconBuildingSkyscraper,
  IconGavel,
  IconKey,
  IconShieldLock,
  IconPlus,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react"

export default function PersonaPerfilPage() {
  useStoreRehydrated()
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const personas = useCompassStore(s => s.personas)
  const vinculosStore = useCompassStore(s => s.vinculos)
  const unidades = useCompassStore(s => s.unidades)
  const condicionesEspeciales = useCompassStore(s => s.maestros.condicionesEspeciales)
  const savePersona = useCompassStore(s => s.savePersona)
  const saveVinculo = useCompassStore(s => s.saveVinculo)
  const removeVinculo = useCompassStore(s => s.removeVinculo)

  const persona = personas.find(p => p.id === id)

  // Vínculos de la persona leídos del store
  const vinculosUnidad = vinculosStore.filter(v => v.personaId === id)
  const [dialogoAbierto, setDialogoAbierto] = React.useState(false)
  const [vinculoEditando, setVinculoEditando] = React.useState<VinculoUnidad | null>(null)

  // Unidades con vínculo activo (excluyendo la unidad del vínculo que se está editando)
  const unidadesExcluidas = React.useMemo(() => {
    const activas = vinculosUnidad.filter(v => !v.fechaFin).map(v => v.unidadId)
    return vinculoEditando ? activas.filter(u => u !== vinculoEditando.unidadId) : activas
  }, [vinculosUnidad, vinculoEditando])

  // SIMULACIÓN TAREA 4.3: Auditoría y Métricas
  React.useEffect(() => {
    if (persona) {
      console.log(`[AUDITORÍA AM] Evento: MP_VIEW_FICHA | UsuarioID: ${persona.id} | Timestamp: ${new Date().toISOString()}`)
    }
  }, [persona])

  if (!persona) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <h2 className="text-xl font-bold">Persona no encontrada</h2>
        <Button onClick={() => router.push("/comunidad/personas")}>Volver al Directorio</Button>
      </div>
    )
  }

  const getRoleBadgeColor = (rol: string) => {
    switch(rol) {
      case "propietario": return "bg-indigo-600 text-white";
      case "residente": return "bg-emerald-600 text-white";
      case "personal": return "bg-slate-600 text-white";
      case "directiva": return "bg-amber-600 text-white";
      default: return "bg-gray-200 text-gray-800";
    }
  }

  const abrirCrearVinculo = () => {
    setVinculoEditando(null)
    setDialogoAbierto(true)
  }

  const abrirEditarVinculo = (vinculo: VinculoUnidad) => {
    setVinculoEditando(vinculo)
    setDialogoAbierto(true)
  }

  // Sincroniza roles derivados de vínculos (propietario/residente) con la lista de roles de la Persona
  const sincronizarRoles = (vinculos: VinculoUnidad[], rolesActuales: Persona["roles"]): Persona["roles"] => {
    const activos = vinculos.filter(v => !v.fechaFin)
    const nuevos = new Set(rolesActuales)
    if (activos.some(v => v.rol === "propietario")) nuevos.add("propietario")
    else nuevos.delete("propietario")
    if (activos.some(v => v.rol !== "propietario")) nuevos.add("residente")
    else nuevos.delete("residente")
    return [...nuevos] as Persona["roles"]
  }

  const actualizarRolesPersona = (vinculos: VinculoUnidad[]) => {
    savePersona({ ...persona, roles: sincronizarRoles(vinculos, persona.roles) })
  }

  const guardarVinculo = (data: Omit<VinculoUnidad, "id" | "personaId">): StoreResult => {
    const vinculoGuardado: VinculoUnidad = vinculoEditando
      ? { ...vinculoEditando, ...data }
      : { id: `v-${Date.now()}`, personaId: persona.id, ...data }
    const resultado = saveVinculo(vinculoGuardado)
    if (!resultado.ok) return resultado
    const nuevos = vinculoEditando
      ? vinculosUnidad.map(v => v.id === vinculoEditando.id ? vinculoGuardado : v)
      : [...vinculosUnidad, vinculoGuardado]
    actualizarRolesPersona(nuevos)
    setDialogoAbierto(false)
    setVinculoEditando(null)
    return resultado
  }

  const eliminarVinculo = (vinculoId: string) => {
    const nuevos = vinculosUnidad.filter(v => v.id !== vinculoId)
    removeVinculo(vinculoId)
    actualizarRolesPersona(nuevos)
  }

  const etiquetaUnidad = (unidadId: string) => {
    const u = unidades.find(un => un.id === unidadId)
    return u ? `${u.etiqueta} ${u.numero}` : unidadId
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.push("/comunidad/personas")}>
          <IconArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ficha de Identidad</h1>
          <p className="text-sm text-muted-foreground">ID del Sistema: {persona.id}</p>
        </div>
      </div>

      {/* TAREA 3.2: Contenedor Base (Datos Civiles) */}
      <Card className="border-t-4 border-t-primary">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="size-32 rounded-2xl bg-muted flex flex-col items-center justify-center border shadow-sm shrink-0">
              <IconUserCircle className="size-16 text-muted-foreground/50" />
            </div>
            
            <div className="flex-1 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-black">{persona.nombreCompleto}</h2>
                  <p className="text-lg font-mono text-muted-foreground">RUT: {persona.rut}</p>
                </div>
                <Badge variant={persona.estadoCuenta === "activa" ? "default" : "destructive"} className="uppercase font-bold">
                  Cuenta {persona.estadoCuenta}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                {persona.roles.map(rol => (
                  <Badge key={rol} className={`${getRoleBadgeColor(rol)} uppercase font-bold`}>
                    {rol}
                  </Badge>
                ))}
              </div>

              {/* TAREA 2.2: Alertas de Vulnerabilidad */}
              {persona.condicionesEspecialesIds.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-amber-600 font-bold text-sm uppercase tracking-wider">
                    <IconAlertTriangleFilled className="size-4" />
                    Condiciones Especiales de Seguridad
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {persona.condicionesEspecialesIds.map(id => {
                      const c = condicionesEspeciales.find(c => c.id === id)
                      return c ? (
                        <Badge key={id} className={`${c.color} font-bold`}>{c.nombre}</Badge>
                      ) : null
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-4">
                <div>
                  <span className="text-muted-foreground block text-xs font-bold uppercase">Móvil</span>
                  <span className="font-medium">{persona.telefonoMovil}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs font-bold uppercase">Correo Oficial</span>
                  <span className="font-medium">{persona.email}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TAREA 3.3 y 3.4: Estructura de Tabs Extensibles */}
      <Tabs defaultValue="unidades" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
          {persona.roles.some(r => r === "propietario" || r === "residente") && (
            <TabsTrigger value="unidades" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 font-semibold flex gap-2">
              <IconBuildingSkyscraper className="size-4" /> Unidades Vinculadas
            </TabsTrigger>
          )}
          {persona.roles.includes("personal") && (
            <TabsTrigger value="laboral" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 font-semibold flex gap-2">
              <IconBriefcase className="size-4" /> Datos Laborales (RRHH)
            </TabsTrigger>
          )}
          {persona.roles.includes("directiva") && (
            <TabsTrigger value="gobernanza" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 font-semibold flex gap-2">
              <IconGavel className="size-4" /> Gobernanza
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="unidades" className="mt-6">
          <div className="flex flex-col gap-4">
            {/* TAREA 4.1: Acción Vincular Unidad */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {persona.estadoCuenta === "inactiva"
                  ? "Cuenta inactiva: no se pueden registrar nuevos vínculos."
                  : "Vínculos legales y operativos con el inventario físico."}
              </p>
              <Button className="gap-2" onClick={abrirCrearVinculo} disabled={persona.estadoCuenta === "inactiva"}>
                <IconPlus className="size-4" /> Vincular Unidad
              </Button>
            </div>

            {vinculosUnidad.length === 0 && (
              /* TAREA 4.7: Empty State */
              <Card className="border-dashed">
                <CardContent className="p-8 flex flex-col items-center gap-2 text-center">
                  <IconBuildingSkyscraper className="size-10 text-muted-foreground/40" />
                  <p className="font-semibold">Sin unidades vinculadas</p>
                  <p className="text-sm text-muted-foreground">
                    Esta persona no posee vínculos activos con el inventario físico.
                  </p>
                </CardContent>
              </Card>
            )}

            {vinculosUnidad.map(v => (
              <Card key={v.id}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`size-12 rounded-lg flex items-center justify-center text-white shrink-0 ${COLOR_ROL_VINCULO[v.rol]}`}>
                      <IconKey className="size-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-lg">{etiquetaUnidad(v.unidadId)}</h3>
                        <Badge className={`${COLOR_ROL_VINCULO[v.rol]} uppercase font-bold`}>
                          {NOMBRE_ROL[v.rol]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        {v.unidadId} · Desde {v.fechaInicio}
                        {v.fechaFin ? ` · Hasta ${v.fechaFin}` : " · Vigente"}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex flex-col items-end gap-2">
                      {/* TAREA 4.2: Selector Inmobiliario (Trigger PI) */}
                      {v.rol === "propietario" && v.estadoOcupacionPropiedad && (
                        <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                          Estado Inmobiliario: {v.estadoOcupacionPropiedad.replace("_", " ")}
                        </Badge>
                      )}

                      {/* TAREA 4.1: Privacidad Delegada */}
                      {v.rol === "propietario" && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold bg-slate-100 px-2 py-1 rounded-md">
                          <IconShieldLock className="size-3.5" />
                          Privacidad Financiera: 
                          <span className={v.permiteVerFinanzas ? "text-emerald-600" : "text-destructive"}>
                            {v.permiteVerFinanzas ? "COMPARTIDA CON RESIDENTE" : "OCULTA AL RESIDENTE"}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      {/* TAREA 4.3: Editar Vínculo */}
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => abrirEditarVinculo(v)}>
                        <IconPencil className="size-3.5" /> Editar
                      </Button>

                      {/* TAREA 4.4: Eliminar / Desvincular */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1.5 text-destructive">
                            <IconTrash className="size-3.5" /> Desvincular
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Desvincular unidad?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se eliminará el vínculo de {etiquetaUnidad(v.unidadId)} ({NOMBRE_ROL[v.rol]}) para {persona.nombreCompleto}. Esta acción no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => eliminarVinculo(v.id)}>
                              Desvincular
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {persona.roles.includes("personal") && (
          <TabsContent value="laboral" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Ficha de Empleado</CardTitle>
                <CardDescription>Esta extensión solo es visible porque el usuario tiene el rol "Personal".</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-bold text-muted-foreground uppercase">Cargo</p>
                    <p className="font-medium">{persona.datosLaborales?.cargo}</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-muted-foreground uppercase">Ingreso</p>
                    <p className="font-medium">{persona.datosLaborales?.fechaIngreso}</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-muted-foreground uppercase">AFP</p>
                    <p className="font-medium">{persona.datosLaborales?.afp}</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-muted-foreground uppercase">Previsión</p>
                    <p className="font-medium">{persona.datosLaborales?.prevision}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {persona.roles.includes("directiva") && (
          <TabsContent value="gobernanza" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Comité de Administración</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-bold text-muted-foreground uppercase">Cargo Directivo</p>
                    <p className="font-medium capitalize">{persona.datosGobernanza?.cargoDirectiva}</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-muted-foreground uppercase">Fecha de Asunción</p>
                    <p className="font-medium">{persona.datosGobernanza?.fechaAsuncion}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* TAREA 4.2: Dialog modal Creación/Edición de Vínculo */}
      <Dialog open={dialogoAbierto} onOpenChange={(open) => {
        setDialogoAbierto(open)
        if (!open) setVinculoEditando(null)
      }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{vinculoEditando ? "Editar Vínculo de Unidad" : "Nuevo Vínculo de Unidad"}</DialogTitle>
            <DialogDescription>
              {vinculoEditando
                ? "Modifica el vínculo existente de esta persona con el inventario físico."
                : "Vincula a esta persona con una unidad del inventario físico y define su rol."}
            </DialogDescription>
          </DialogHeader>
          <FormularioVinculoUnidad
            key={vinculoEditando?.id ?? "nuevo"}
            vinculo={vinculoEditando ?? undefined}
            unidadesVinculadasIds={unidadesExcluidas}
            onSave={guardarVinculo}
            onCancel={() => setDialogoAbierto(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
