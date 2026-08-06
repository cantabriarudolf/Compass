"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { personas } from "@/data/comunidad/personas"
import { ESTADOS_OCUPACION } from "@/data/maestros"

// Simulación de Condiciones Especiales (Idealmente vienen de MA)
const CONDICIONES_ESPECIALES: Record<string, { nombre: string, color: string }> = {
  "c-1": { nombre: "Electrodependiente", color: "bg-blue-500 text-white" },
  "c-2": { nombre: "Movilidad Reducida", color: "bg-amber-500 text-black" },
  "c-3": { nombre: "Adulto Mayor Solo", color: "bg-purple-500 text-white" }
}

import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { 
  IconArrowLeft, 
  IconUserCircle, 
  IconAlertTriangleFilled,
  IconBriefcase,
  IconBuildingSkyscraper,
  IconGavel,
  IconKey,
  IconShieldLock
} from "@tabler/icons-react"

export default function PersonaPerfilPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const persona = personas.find(p => p.id === id)

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
                      const c = CONDICIONES_ESPECIALES[id]
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
          <div className="grid gap-4">
            {persona.vinculosUnidad?.map(v => (
              <Card key={v.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`size-12 rounded-lg flex items-center justify-center text-white ${v.rol === 'propietario' ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
                      <IconKey className="size-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Unidad {v.unidadId}</h3>
                      <p className="text-sm text-muted-foreground uppercase font-semibold">Rol: {v.rol}</p>
                    </div>
                  </div>
                  
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
                </CardContent>
              </Card>
            ))}
            {(!persona.vinculosUnidad || persona.vinculosUnidad.length === 0) && (
              <p className="text-muted-foreground text-sm text-center p-8 border border-dashed rounded-lg">
                Esta persona no posee vínculos activos con el inventario físico.
              </p>
            )}
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
    </div>
  )
}
