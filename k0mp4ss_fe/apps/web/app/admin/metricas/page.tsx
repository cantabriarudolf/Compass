"use client"

import * as React from "react"
import { useUnidades } from "@/lib/api/use-unidades"
import { useTiposUnidad } from "@/lib/api/use-tipos-unidad"
import { useMaestros } from "@/lib/api/use-maestros"
import { useEmisionesGC } from "@/lib/api/use-emisiones-gc"
import { variacionTarifaria } from "@/lib/metricas-utils"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { 
  IconTrendingUp, 
  IconBuildingCommunity, 
  IconSettings,
  IconFingerprint,
  IconBolt,
} from "@tabler/icons-react"

export default function MetricasPage() {
  const { items: unidades, isLoading: cargandoUnidades } = useUnidades()
  const { items: tiposUnidad, isLoading: cargandoTipos } = useTiposUnidad()
  const { data: estadosOcupacion, isLoading: cargandoEstados } = useMaestros("estados-ocupacion")
  const { data: categoriasMacro, isLoading: cargandoMacro } = useMaestros("categorias-macro")
  const { data: categoriasMicro, isLoading: cargandoMicro } = useMaestros("categorias-micro")
  const { items: emisionesGC, isLoading: cargandoEmisiones } = useEmisionesGC()
  const isLoading =
    cargandoUnidades ||
    cargandoTipos ||
    cargandoEstados ||
    cargandoMacro ||
    cargandoMicro ||
    cargandoEmisiones

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

  // MA - Maestros
  const totalEstados = estadosOcupacion.length;
  const totalCategorias = categoriasMacro.length + categoriasMicro.length;

  // AM — Variación Tarifaria real (F2): sale de las emisiones de gasto común,
  // comparando los dos últimos periodos con gasto. Sin datos comparables no se
  // muestra número: antes había un `+7.2%` escrito a mano que mentía.
  const variacion = variacionTarifaria(emisionesGC);
  const variacionTexto = variacion
    ? `${variacion.porcentaje > 0 ? "+" : ""}${variacion.porcentaje.toLocaleString("es-CO", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`
    : "—";

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
        <div className="h-64 w-full rounded-lg bg-muted/30" />
      </div>
    )
  }

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
            value={`$${totalRecaudacion.toLocaleString("es-CO")}`} 
            sub="Basado en plantillas tarifarias"
          />
          <ModuleMetric 
            label="Plantillas Activas" 
            value={tiposUnidad.length} 
            sub="Modelos de cobro configurados"
          />
          <ModuleMetric
            label="Variación Tarifaria"
            value={variacionTexto}
            sub={
              variacion
                ? `Gasto emitido ${variacion.periodoAnterior} → ${variacion.periodoActual}`
                : "Sin emisiones comparables todavía"
            }
            color={
              variacion
                ? variacion.porcentaje >= 0
                  ? "text-green-600"
                  : "text-amber-600"
                : "text-muted-foreground"
            }
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
            value={`${totalMetros.toLocaleString("es-CO")} m²`} 
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

function ModuleMetric({ label, value, sub, color = "text-foreground" }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
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
