"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
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
import {
  IconShieldLock,
  IconDownload,
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconLock,
} from "@tabler/icons-react"

const FILAS_POR_PAGINA = 50
const CAMPOS_CSV = ["timestamp", "usuario", "categoria", "tipoAccion", "referenciaId", "descripcion"] as const

type EventoAuditoria = {
  id: string
  timestamp: string
  usuario: string
  categoria: string
  tipoAccion: string
  referenciaId: string
  descripcion: string
}

function escaparCsv(valor: string): string {
  if (/[";\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`
  return valor
}

export default function LogsPage() {
  const [busqueda, setBusqueda] = React.useState("")
  const [busquedaDebounced, setBusquedaDebounced] = React.useState("")
  const [categoria, setCategoria] = React.useState("todas")
  const [tipoAccion, setTipoAccion] = React.useState("todas")
  const [pagina, setPagina] = React.useState(1)

  const [eventos, setEventos] = React.useState<EventoAuditoria[]>([])
  const [total, setTotal] = React.useState(0)
  const [facetas, setFacetas] = React.useState<{ categorias: string[]; tiposAccion: string[] }>({
    categorias: [],
    tiposAccion: [],
  })
  const [cargando, setCargando] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 200)
    return () => clearTimeout(t)
  }, [busqueda])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset intencional de paginación al cambiar filtros (avance 2026-09-02)
    setPagina(1)
  }, [busquedaDebounced, categoria, tipoAccion])

  React.useEffect(() => {
    const controller = new AbortController()
    async function cargar() {
      setCargando(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (categoria !== "todas") params.set("categoria", categoria)
        if (tipoAccion !== "todas") params.set("tipoAccion", tipoAccion)
        const q = busquedaDebounced.trim()
        if (q) params.set("q", q)
        params.set("page", String(pagina))
        params.set("pageSize", String(FILAS_POR_PAGINA))
        const res = await fetch(`/api/auditoria?${params.toString()}`, {
          signal: controller.signal,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error ?? `Error ${res.status}`)
        }
        const data = (await res.json()) as {
          total: number
          page: number
          pageSize: number
          eventos: EventoAuditoria[]
          facetas?: { categorias: string[]; tiposAccion: string[] }
        }
        if (!controller.signal.aborted) {
          setEventos(data.eventos)
          setTotal(data.total)
          if (data.facetas) setFacetas(data.facetas)
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return
        if (!controller.signal.aborted) setError((e as Error).message)
      } finally {
        if (!controller.signal.aborted) setCargando(false)
      }
    }
    void cargar()
    return () => controller.abort()
  }, [busquedaDebounced, categoria, tipoAccion, pagina])

  const categorias = React.useMemo(() => [...facetas.categorias].sort(), [facetas])
  const tiposAccion = React.useMemo(() => [...facetas.tiposAccion].sort(), [facetas])

  const totalPaginas = Math.max(1, Math.ceil(total / FILAS_POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)

  function exportarCsv() {
    const filas = [CAMPOS_CSV.join(",")]
    for (const e of eventos) {
      filas.push(
        CAMPOS_CSV.map(c => escaparCsv(String(e[c as typeof CAMPOS_CSV[number]]))).join(","),
      )
    }
    const blob = new Blob(["\uFEFF" + filas.join("\n")], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (cargando && eventos.length === 0) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
        <div className="h-64 w-full rounded-lg bg-muted/30" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b pb-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <IconShieldLock className="size-7 text-primary" /> Logs de Auditoría
            </h1>
            <p className="text-muted-foreground">
              Pista de auditoría inmutable: consulta, filtra y exporta los eventos de todos los módulos.
            </p>
          </div>
          <Badge variant="outline" className="flex items-center gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
            <IconLock className="size-3" /> solo lectura · pista inmutable
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <IconSearch className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por descripción, referencia o acción…"
            className="pl-8"
            aria-label="Buscar eventos"
          />
        </div>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-[180px]" aria-label="Filtrar por categoría">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorías</SelectItem>
            {categorias.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tipoAccion} onValueChange={setTipoAccion}>
          <SelectTrigger className="w-[220px]" aria-label="Filtrar por tipo de acción">
            <SelectValue placeholder="Tipo de acción" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las acciones</SelectItem>
            {tiposAccion.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportarCsv} disabled={eventos.length === 0}>
          <IconDownload className="size-4 mr-1" /> Exportar CSV
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {eventos.length.toLocaleString("es-CL")} de {total.toLocaleString("es-CL")} eventos en BD
        </span>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Eventos de auditoría</CardTitle>
          <CardDescription className="text-xs">
            Ordenados por fecha descendente · {total.toLocaleString("es-CL")} eventos en BD (retención completa en capa de datos)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Fecha / hora</TableHead>
                <TableHead className="w-[90px]">Categoría</TableHead>
                <TableHead className="w-[190px]">Acción</TableHead>
                <TableHead className="w-[170px]">Referencia</TableHead>
                <TableHead>Descripción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargando ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                    Cargando eventos…
                  </TableCell>
                </TableRow>
              ) : eventos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                    Sin eventos para la búsqueda o filtros actuales.
                  </TableCell>
                </TableRow>
              ) : (
                eventos.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs whitespace-nowrap tabular-nums">
                      {new Date(e.timestamp).toLocaleString("es-CL", {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{e.categoria}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{e.tipoAccion}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-[170px]" title={e.referenciaId}>
                      {e.referenciaId}
                    </TableCell>
                    <TableCell className="text-xs">{e.descripcion}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {totalPaginas > 1 && (
            <div className="flex items-center justify-end gap-2 pt-3">
              <Button
                variant="outline"
                size="sm"
                disabled={paginaActual <= 1}
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                aria-label="Página anterior"
              >
                <IconChevronLeft className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {paginaActual} de {totalPaginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={paginaActual >= totalPaginas}
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                aria-label="Página siguiente"
              >
                <IconChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
