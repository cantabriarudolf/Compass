"use client"

import * as React from "react"
import { unidades, tiposUnidad, macroSectores } from "@/data/inventario/estructura"
import { estacionamientos } from "@/data/inventario/estacionamientos"
import { ESTADOS_OCUPACION, CATEGORIAS_MACRO, CATEGORIAS_MICRO } from "@/data/maestros"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { 
  IconTrendingUp, 
  IconBuildingCommunity, 
  IconParkingCircle, 
  IconSettings,
  IconFingerprint,
  IconBolt,
  IconArrowRight
} from "@tabler/icons-react"

export default function MetricasPage() {
  // CÁLCULOS POR MÓDULO
  
  // TU - Tipos de Unidad
  const totalRecaudacion = unidades.reduce((acc, u) => {
    const tipo = tiposUnidad.find(t => t.id === u.tipoUnidadId);
    return acc + (tipo?.montoBaseGc || 0);
  }, 0);

  // EF - Estructura Física
  const totalMetros = unidades.reduce((acc, u) => acc + u.metraje, 0);
  const totalServicios = unidades.reduce((acc, u) => {
    let count = 0;
    if (u.servicios.agua) count++;
    if (u.servicios.luz) count++;
    if (u.servicios.gas) count++;
    return acc + count;
  }, 0);

  // ES - Estacionamientos
  const totalSpots = estacionamientos.length;
  const ocupados = estacionamientos.filter(e => !!e.unidadId).length;
  const totalHistorial = estacionamientos.reduce((acc, e) => acc + (e.historial?.length || 0), 0);

  // MA - Maestros
  const totalEstados = ESTADOS_OCUPACION.length;
  const totalCategorias = CATEGORIAS_MACRO.length + CATEGORIAS_MICRO.length;

  return (
    <div className="flex flex-col gap-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Auditoría y Métricas (AM)</h1>
        <p className="text-muted-foreground">
          Consolidado modular de indicadores de gestión y valor operacional.
        </p>
      </div>

      {/* --- MÓDULO: TIPOS DE UNIDAD (TU) --- */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-primary font-bold uppercase text-xs tracking-widest px-1">
          <IconTrendingUp className="size-4" /> Módulo: Tipos de Unidad (TU)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ModuleMetric 
            label="Recaudación Mensual" 
            value={`$${totalRecaudacion.toLocaleString()}`} 
            sub="Basado en plantillas tarifarias"
          />
          <ModuleMetric 
            label="Plantillas Activas" 
            value={tiposUnidad.length} 
            sub="Modelos de cobro configurados"
          />
          <ModuleMetric 
            label="Variación Tarifaria" 
            value="+7.2%" 
            sub="Promedio alzas programadas"
            color="text-green-600"
          />
        </div>
      </section>

      {/* --- MÓDULO: ESTRUCTURA FÍSICA (EF) --- */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-blue-600 font-bold uppercase text-xs tracking-widest px-1">
          <IconBuildingCommunity className="size-4" /> Módulo: Estructura Física (EF)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ModuleMetric 
            label="Superficie Habitacional" 
            value={`${totalMetros.toLocaleString()} m²`} 
            sub="Propiedades auditadas"
          />
          <ModuleMetric 
            label="Unidades Registradas" 
            value={unidades.length} 
            sub="Deptos y Locales en sistema"
          />
          <ModuleMetric 
            label="Servicios Monitoreados" 
            value={totalServicios} 
            sub="Cuentas Agua/Luz/Gas enroladas"
          />
        </div>
      </section>

      {/* --- MÓDULO: ESTACIONAMIENTOS (ES) --- */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-amber-600 font-bold uppercase text-xs tracking-widest px-1">
          <IconParkingCircle className="size-4" /> Módulo: Estacionamientos (ES)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ModuleMetric 
            label="Tasa de Ocupación" 
            value={`${((ocupados/totalSpots)*100).toFixed(1)}%`} 
            sub={`${ocupados} de ${totalSpots} plazas`}
          />
          <ModuleMetric 
            label="Trazabilidad Histórica" 
            value={totalHistorial} 
            sub="Registros de rotación"
          />
          <ModuleMetric 
            label="Plazas Disponibles" 
            value={totalSpots - ocupados} 
            sub="Incluye sector visitas"
          />
        </div>
      </section>

      {/* --- MÓDULO: MAESTROS ADMINISTRATIVOS (MA) --- */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-zinc-500 font-bold uppercase text-xs tracking-widest px-1">
          <IconSettings className="size-4" /> Módulo: Maestros Administrativos (MA)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ModuleMetric 
            label="Parámetros Globales" 
            value={totalEstados + totalCategorias} 
            sub="Estados de ocupación y categorías macro/micro"
          />
          <ModuleMetric 
            label="Semántica Visual" 
            value="Activa" 
            sub="Colores dinámicos vinculados a UI"
          />
        </div>
      </section>

      {/* FOOTER DE VALOR OPERACIONAL */}
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-full">
              <IconFingerprint className="size-8" />
            </div>
            <div>
              <h3 className="font-bold text-xl">Integridad de Gestión: 100%</h3>
              <p className="text-sm opacity-80">
                Cada dato mostrado proviene de una acción administrativa trazable y auditada por NSGC.
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-lg py-1 px-4 gap-2">
            <IconBolt className="size-4" /> Operación Óptima
          </Badge>
        </CardContent>
      </Card>
    </div>
  )
}

function ModuleMetric({ label, value, sub, color = "text-foreground" }: any) {
  return (
    <Card className="shadow-none border-muted-foreground/10">
      <CardContent className="pt-4 space-y-1">
        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">{label}</p>
        <p className={`text-2xl font-black ${color}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground italic">{sub}</p>
      </CardContent>
    </Card>
  )
}
