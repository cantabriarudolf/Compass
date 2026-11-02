"use client"

/**
 * piezas — átomos compartidos del dashboard operativo.
 *
 * El lenguaje visual sigue la portada anterior y `app/finanzas/`: `Card` de
 * `@workspace/ui` sin sombra, borde tenue, títulos con icono de Tabler y cifras
 * en `font-black`. Los estados de carga y de error son explícitos (D5): nunca
 * un esqueleto infinito ni un cero silencioso cuando el dato no llegó.
 */
import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import { IconAlertTriangle, IconArrowRight, IconInfoCircle } from "@tabler/icons-react"
import type { CrudCollection } from "@/lib/api/use-crud-collection"

/** Página por defecto de `useCrudCollection` (`pageSize=100`). */
const FILA_POR_PAGINA = 100

export function Panel({
  titulo,
  descripcion,
  icono: Icono,
  href,
  textoHref = "Ver detalle",
  children,
  className,
}: {
  titulo: string
  descripcion?: string
  icono: React.ElementType
  href?: string
  textoHref?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("shadow-none border-muted-foreground/10 h-full flex flex-col", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icono className="size-5 text-primary shrink-0" />
              {titulo}
            </CardTitle>
            {descripcion && <CardDescription className="mt-1">{descripcion}</CardDescription>}
          </div>
          {href && (
            <Link
              href={href}
              className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {textoHref}
              <IconArrowRight className="size-3" />
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">{children}</CardContent>
    </Card>
  )
}

/** Cifra grande de un panel: rótulo chico arriba, número abajo, detalle al pie. */
export function Cifra({
  etiqueta,
  valor,
  detalle,
  tono = "neutro",
}: {
  etiqueta: string
  valor: React.ReactNode
  detalle?: React.ReactNode
  tono?: "neutro" | "positivo" | "negativo" | "atencion"
}) {
  const color =
    tono === "positivo"
      ? "text-emerald-600 dark:text-emerald-400"
      : tono === "negativo"
        ? "text-destructive"
        : tono === "atencion"
          ? "text-amber-600 dark:text-amber-400"
          : ""
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
        {etiqueta}
      </p>
      <p className={cn("text-xl font-black tracking-tight tabular-nums", color)}>{valor}</p>
      {detalle && <p className="text-[11px] text-muted-foreground">{detalle}</p>}
    </div>
  )
}

/** Estado vacío explícito (D5): el panel existe, simplemente no hay movimiento. */
export function SinMovimiento({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-muted-foreground/30 px-3 py-2 text-xs text-muted-foreground">
      {children}
    </p>
  )
}

/** Aviso inline (misma convención ámbar/roja que usa el resto del repo). */
export function Aviso({
  children,
  tono = "atencion",
}: {
  children: React.ReactNode
  tono?: "atencion" | "error" | "info"
}) {
  const Icono = tono === "info" ? IconInfoCircle : IconAlertTriangle
  const color =
    tono === "error"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : tono === "info"
        ? "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
        : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border p-2.5 text-xs", color)}>
      <Icono className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Esqueleto del panel mientras SWR resuelve (mismo pulso que la portada vieja). */
export function CargandoPanel({ filas = 3 }: { filas?: number }) {
  return (
    <div className="space-y-2 animate-pulse" aria-hidden>
      {Array.from({ length: filas }).map((_, indice) => (
        <div key={indice} className="h-6 rounded bg-muted/50" />
      ))}
    </div>
  )
}

/**
 * useColeccionCompleta — pagina la colección hasta el final antes de agregarla.
 *
 * `useCrudCollection` trae `pageSize=100`: con 501 cobros o 182 egresos, sumar
 * `items` sin completar las páginas daría un total falso (D4). El efecto pide la
 * página siguiente mientras `hasMore`; el tope de pedidos evita un bucle si una
 * página falla de forma persistente (`cargarMas` no propaga el error).
 */
export function useColeccionCompleta<T extends { id: string }>(
  coleccion: CrudCollection<T>
): { items: T[]; total: number; completa: boolean; isLoading: boolean; error: Error | null } {
  const { items, total, hasMore, cargandoMas, cargarMas, isLoading, error } = coleccion
  const pedidos = React.useRef(0)
  const maximoPedidos = Math.ceil(total / FILA_POR_PAGINA) + 1

  React.useEffect(() => {
    if (!hasMore || cargandoMas) return
    if (pedidos.current >= maximoPedidos) return
    pedidos.current += 1
    void cargarMas()
  }, [hasMore, cargandoMas, maximoPedidos, cargarMas])

  return { items, total, completa: !hasMore, isLoading, error }
}
