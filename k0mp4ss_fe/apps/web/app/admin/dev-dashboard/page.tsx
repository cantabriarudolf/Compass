"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  IconListCheck,
  IconStack2,
  IconCheck,
  IconClipboardCopy,
  IconInfoSmall,
  IconRefresh,
  IconAlertTriangle,
  IconFileCode2,
  IconArchive,
  IconArrowLeft,
  IconSearch,
  IconDownload,
  IconUpload,
  IconChevronDown,
} from "@tabler/icons-react"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@workspace/ui/components/collapsible"
import type {
  DashboardData,
  ModuleInfo,
  TaskItem,
  ChangeInfo,
} from "@/lib/dev-dashboard"
import {
  useCompassStore,
  STORE_VERSION,
  seedData,
} from "@/lib/store"
import {
  STORE_KEY,
  validateStoreBackup,
  type BackupValidation,
} from "@/lib/store-backup"
import { diffCompassData, type CompassDataDiff } from "@/lib/store-diff"

const STATUS_BADGE: Record<
  ModuleInfo["status"],
  { label: string; className: string }
> = {
  completado: {
    label: "🟢 Completado",
    className: "bg-emerald-600 hover:bg-emerald-700",
  },
  en_proceso: {
    label: "🔵 En Proceso",
    className: "bg-primary hover:bg-primary",
  },
  documentado: {
    label: "📘 Documentado",
    className: "bg-sky-600 hover:bg-sky-700",
  },
  pendiente: { label: "⏳ Pendiente", className: "" },
}

const STATUS_LEVEL: Record<ModuleInfo["status"], number> = {
  pendiente: 0,
  documentado: 1,
  en_proceso: 2,
  completado: 4,
}

const STATUS_BAR_COLOR: Record<ModuleInfo["status"], string> = {
  pendiente: "bg-muted-foreground/40",
  documentado: "bg-sky-500",
  en_proceso: "bg-primary",
  completado: "bg-emerald-500",
}

function buildHermesPrompt(
  changeId: string | undefined,
  task: TaskItem
): string {
  return `hermes run "Ejecuta la tarea ${task.id} del change ${changeId ?? ""}: ${task.title}"`
}

interface BackupSummaryItem {
  label: string
  count: number
  type: "main" | "maestro"
}

function DiffSection({
  title,
  diffs,
}: {
  title: string
  diffs: import("@/lib/store-diff").CollectionDiff[]
}) {
  const withChanges = diffs.filter(
    (d) => d.added.length + d.removed.length + d.modified.length > 0
  )
  if (withChanges.length === 0) return null
  return (
    <div className="mt-1.5 space-y-2 border-t pt-1.5">
      <p className="font-medium text-muted-foreground">{title}</p>
      {withChanges.map((d) => (
        <div key={d.label} className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{d.label}</span>
            <span className="text-muted-foreground">
              ({d.seedCount} → {d.currentCount})
            </span>
            {d.added.length > 0 && (
              <Badge
                variant="secondary"
                className="bg-emerald-100 px-1 py-0 text-[10px] text-emerald-700"
              >
                +{d.added.length}
              </Badge>
            )}
            {d.removed.length > 0 && (
              <Badge
                variant="secondary"
                className="bg-destructive/10 px-1 py-0 text-[10px] text-destructive"
              >
                -{d.removed.length}
              </Badge>
            )}
            {d.modified.length > 0 && (
              <Badge
                variant="secondary"
                className="bg-amber-100 px-1 py-0 text-[10px] text-amber-700"
              >
                ~{d.modified.length}
              </Badge>
            )}
          </div>
          <div className="space-y-1 pl-2">
            {d.added.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] font-medium text-emerald-700">
                  Agregados:
                </span>
                {d.added.map((item) => (
                  <span
                    key={item.id}
                    className="rounded border border-emerald-200 bg-emerald-50 px-1 text-[10px] text-emerald-700"
                  >
                    {item.name}
                  </span>
                ))}
              </div>
            )}
            {d.removed.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] font-medium text-destructive">
                  Eliminados:
                </span>
                {d.removed.map((item) => (
                  <span
                    key={item.id}
                    className="rounded border border-destructive/20 bg-destructive/5 px-1 text-[10px] text-destructive line-through"
                  >
                    {item.name}
                  </span>
                ))}
              </div>
            )}
            {d.modified.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] font-medium text-amber-700">
                  Modificados:
                </span>
                {d.modified.map((item) => (
                  <span
                    key={item.id}
                    className="rounded border border-amber-200 bg-amber-50 px-1 text-[10px] text-amber-700"
                  >
                    {item.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DevDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedModuleCode, setSelectedModuleCode] = useState<string | null>(
    null
  )
  const [showTasks, setShowTasks] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
  const [fileView, setFileView] = useState<{
    file: string
    content: string
    loading: boolean
  } | null>(null)
  const [notesDraft, setNotesDraft] = useState("")
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [moduleSearch, setModuleSearch] = useState("")
  const [modulePhases, setModulePhases] = useState<string[]>([])
  const [moduleStatuses, setModuleStatuses] = useState<string[]>([])
  const [moduleCierres, setModuleCierres] = useState<string[]>([])
  const [moduleSort, setModuleSort] = useState<{
    key: keyof ModuleInfo
    dir: 1 | -1
  } | null>(null)
  const [showComparative, setShowComparative] = useState(false)
  const [storeBackupMsg, setStoreBackupMsg] = useState<{
    type: "ok" | "error"
    text: string
  } | null>(null)
  const [storeImportPending, setStoreImportPending] = useState<{
    json: string
    fileName: string
  } | null>(null)
  const [storeImportValidation, setStoreImportValidation] =
    useState<BackupValidation | null>(null)
  const [storeImportDialogOpen, setStoreImportDialogOpen] = useState(false)
  const [backupSummary, setBackupSummary] = useState<
    BackupSummaryItem[] | null
  >(null)
  const [backupDetailOpen, setBackupDetailOpen] = useState(false)
  const [backupDiff, setBackupDiff] = useState<CompassDataDiff | null>(null)
  const storeFileInputRef = useRef<HTMLInputElement>(null)

  const exportStore = useCallback(async () => {
    try {
      const s = useCompassStore.getState()
      const items: BackupSummaryItem[] = [
        { label: "Tipos de Unidad", count: s.tiposUnidad.length, type: "main" },
        {
          label: "Macro Sectores",
          count: s.macroSectores.length,
          type: "main",
        },
        {
          label: "Micro Sectores",
          count: s.microSectores.length,
          type: "main",
        },
        { label: "Unidades", count: s.unidades.length, type: "main" },
        { label: "Personas", count: s.personas.length, type: "main" },
        { label: "Vínculos", count: s.vinculos.length, type: "main" },
      ]
      const m = s.maestros
      const maestroEntries: [string, unknown[]][] = [
        ["AFP", m.afps],
        ["Previsión Salud", m.previsionesSalud],
        ["Mutuales/Cajas", m.mutualesCajas],
        ["Feriados", m.feriados],
        ["Bancos", m.bancos],
        ["Índices Ajuste", m.indicesAjuste],
        ["Cajas Fondos", m.cajasFondos],
        ["Categorías Insumos", m.categoriasInsumos],
        ["Unidades Medida", m.unidadesMedida],
        ["Contactos Emergencia", m.contactosEmergencia],
        ["Condiciones Especiales", m.condicionesEspeciales],
        ["Estados Ocupación", m.estadosOcupacion],
        ["Categorías Macro", m.categoriasMacro],
        ["Categorías Micro", m.categoriasMicro],
        ["Categorías Unidad", m.categoriasUnidad],
        ["Estados Inmobiliarios", m.estadosInmobiliarios],
      ]
      for (const [label, arr] of maestroEntries) {
        items.push({
          label,
          count: Array.isArray(arr) ? arr.length : 0,
          type: "maestro",
        })
      }

      const totalRecords = items.reduce((sum, it) => sum + it.count, 0)
      const withData = items.filter((it) => it.count > 0).length

      const payload = {
        _summary: {
          exportDate: new Date().toISOString(),
          totalRecords,
          collectionsWithData: withData,
          details: items,
        },
        state: {
          tiposUnidad: s.tiposUnidad,
          macroSectores: s.macroSectores,
          microSectores: s.microSectores,
          unidades: s.unidades,
          personas: s.personas,
          vinculos: s.vinculos,
          configuracion: s.configuracion,
          maestros: s.maestros,
        },
        version: STORE_VERSION,
      }
      const jsonStr = JSON.stringify(payload, null, 2)

      // El respaldo lo entrega la API como descarga: el servidor fija el nombre
      // (fechado) y no escribe nada en su disco, que en producción es efímero.
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: jsonStr }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(data?.error ?? `El servidor respondió ${res.status}`)
      }
      const disposicion = res.headers.get("content-disposition")
      const fileName =
        disposicion?.match(/filename="([^"]+)"/)?.[1] ?? "compass-backup.json"
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)

      setBackupSummary(items)
      setBackupDiff(diffCompassData(s, seedData()))
      setBackupDetailOpen(false)
      setStoreBackupMsg({
        type: "ok",
        text: `Backup descargado: ${fileName} — ${totalRecords} registros en ${withData} colecciones`,
      })
    } catch (e) {
      setStoreBackupMsg({
        type: "error",
        text: e instanceof Error ? e.message : String(e),
      })
    }
  }, [])

  const onStoreFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result))
          const validation = validateStoreBackup(parsed)
          setStoreImportValidation(validation)
          setStoreImportPending({
            json: JSON.stringify(parsed),
            fileName: file.name,
          })
          setStoreImportDialogOpen(true)
        } catch {
          setStoreBackupMsg({
            type: "error",
            text: "El archivo no es un JSON válido.",
          })
        }
      }
      reader.readAsText(file)
      e.target.value = ""
    },
    []
  )

  const confirmStoreImport = useCallback(() => {
    if (!storeImportPending || !storeImportValidation) return
    if (!storeImportValidation.ok) {
      setStoreBackupMsg({
        type: "error",
        text: `Importación bloqueada: ${storeImportValidation.errors[0]}`,
      })
      return
    }
    try {
      const parsed = JSON.parse(storeImportPending.json)
      const envelope =
        parsed && typeof parsed === "object" && "state" in parsed
          ? parsed
          : { state: parsed, version: STORE_VERSION }
      localStorage.setItem(STORE_KEY, JSON.stringify(envelope))
      setStoreImportDialogOpen(false)
      setStoreImportPending(null)
      setStoreImportValidation(null)
      setStoreBackupMsg({
        type: "ok",
        text: "Importación exitosa. Recargando...",
      })
      window.setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      setStoreBackupMsg({
        type: "error",
        text: e instanceof Error ? e.message : String(e),
      })
      setStoreImportDialogOpen(false)
    }
  }, [storeImportPending, storeImportValidation])

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/dev-dashboard")
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
      const json: DashboardData = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset intencional de filtros derivados (avance 2026-09-02)
    refresh()
  }, [refresh])

  const selectedModule = useMemo(
    () => data?.modules.find((m) => m.code === selectedModuleCode) ?? null,
    [data, selectedModuleCode]
  )

  const activeChange = useMemo(() => {
    if (!data || !selectedModule?.change) return null
    return (
      data.changes.find((c) => c.id === selectedModule.change) ??
      data.archived.find((c) => c.id === selectedModule.change) ??
      null
    )
  }, [data, selectedModule])

  const comparative = useMemo(() => {
    if (!data) return null
    const specCodes = new Set(data.specs.map((s) => s.code).filter(Boolean))
    const covered = data.modules.filter(
      (m) => m.code && specCodes.has(m.code)
    ).length
    return {
      total: data.modules.length,
      covered,
      active: data.changes.length,
      archived: data.archived.length,
    }
  }, [data])

  const capabilities = useMemo(() => {
    if (!data) return []
    // `archived` y `dirty` ya vienen calculados server-side con isSpecDirtyAfterArchive
    return data.specs.map((s) => ({
      ...s,
      // SAFETY: server-side `isSpecDirtyAfterArchive` injects `archived`/`dirty` boolean flags
      archived: (s as unknown as { archived?: boolean }).archived ?? false,
      // SAFETY: server-side `isSpecDirtyAfterArchive` injects `archived`/`dirty` boolean flags
      dirty: (s as unknown as { dirty?: boolean }).dirty ?? false,
    }))
  }, [data])

  const moduleByArchivedChange = useMemo(() => {
    const map = new Map<string, string[]>()
    data?.modules.forEach((m) => {
      if (m.status === "completado" && m.change) {
        const arr = map.get(m.change) ?? []
        arr.push(`${m.code} · ${m.name}`)
        map.set(m.change, arr)
      }
    })
    return map
  }, [data])

  const changeMap = useMemo(() => {
    const map = new Map<
      string,
      { done: number; total: number; pct: number; archived: boolean }
    >()
    const add = (items: ChangeInfo[] | undefined, archived: boolean) => {
      items?.forEach((c) => {
        const done = c.tasks.filter((t) => t.completed).length
        const total = c.tasks.length
        map.set(c.id, {
          done,
          total,
          pct: total ? Math.round((done / total) * 100) : 0,
          archived,
        })
      })
    }
    add(data?.changes, false)
    add(data?.archived, true)
    return map
  }, [data])

  const changeTone = (info: {
    pct: number
    total: number
  }): { tone: "green" | "yellow" | "red"; label: string } => {
    if (info.total === 0 || info.pct === 0)
      return { tone: "red", label: "Sin ejecutar" }
    if (info.pct === 100) return { tone: "green", label: "Listo" }
    return { tone: "yellow", label: "En progreso" }
  }

  const phases = useMemo(() => {
    const set = new Set(data?.modules.map((m) => m.phase).filter(Boolean) ?? [])
    return [...set].sort((a, b) => {
      const num = (p: string) => Number(p.match(/\d+/)?.[0] ?? 99)
      return num(a) - num(b)
    })
  }, [data])

  const filteredModules = useMemo(() => {
    if (!data) return []
    const term = moduleSearch.trim().toLowerCase()
    let rows = data.modules.filter((m) => {
      const matchesSearch =
        !term ||
        (m.code ?? "").toLowerCase().includes(term) ||
        m.name.toLowerCase().includes(term) ||
        (m.route ?? "").toLowerCase().includes(term) ||
        (m.mockData ? "mock" : "").includes(term) ||
        (m.documented ? "spec" : "").includes(term) ||
        (m.hasManual ? "manual" : "").includes(term) ||
        (m.change ?? "").toLowerCase().includes(term) ||
        (m.cierre ?? "").includes(term) ||
        (m.notesStatus ? `nota ${m.notesStatus}` : "").includes(term)
      const matchesPhase =
        modulePhases.length === 0 || modulePhases.includes(m.phase)
      const matchesStatus =
        moduleStatuses.length === 0 || moduleStatuses.includes(m.status)
      const matchesCierre =
        moduleCierres.length === 0 || moduleCierres.includes(m.cierre)
      return matchesSearch && matchesPhase && matchesStatus && matchesCierre
    })
    if (moduleSort) {
      const { key, dir } = moduleSort
      rows = [...rows].sort((a, b) => {
        const va = String(a[key] ?? "")
        const vb = String(b[key] ?? "")
        return va.localeCompare(vb, "es", { numeric: true }) * dir
      })
    }
    return rows
  }, [
    data,
    moduleSearch,
    modulePhases,
    moduleStatuses,
    moduleCierres,
    moduleSort,
  ])

  const completedCount =
    activeChange?.tasks.filter((t) => t.completed).length ?? 0
  const totalCount = activeChange?.tasks.length ?? 0
  const progressPercent = totalCount
    ? Math.round((completedCount / totalCount) * 100)
    : 0
  const nextTask = activeChange?.tasks.find((t) => !t.completed) ?? null

  const toggleTask = useCallback(
    async (task: TaskItem) => {
      if (!activeChange) return
      const inArchived =
        data?.archived.some((c) => c.id === activeChange.id) ?? false
      setSavingId(task.id)
      const patchTasks = (c: ChangeInfo) =>
        c.id === activeChange.id
          ? {
              ...c,
              tasks: c.tasks.map((t) =>
                t.id === task.id ? { ...t, completed: !t.completed } : t
              ),
            }
          : c
      setData((prev) =>
        prev
          ? {
              ...prev,
              changes: inArchived ? prev.changes : prev.changes.map(patchTasks),
              archived: inArchived
                ? prev.archived.map(patchTasks)
                : prev.archived,
            }
          : prev
      )
      try {
        const res = await fetch("/api/dev-dashboard", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changeId: activeChange.id, taskId: task.id }),
        })
        if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
        const json = await res.json()
        setData((prev) =>
          prev
            ? {
                ...prev,
                changes: inArchived
                  ? prev.changes
                  : prev.changes.map((c) =>
                      c.id === activeChange.id ? json.change : c
                    ),
                archived: inArchived
                  ? prev.archived.map((c) =>
                      c.id === activeChange.id ? json.change : c
                    )
                  : prev.archived,
              }
            : prev
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        refresh()
      } finally {
        setSavingId(null)
      }
    },
    [activeChange, data, refresh]
  )

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const openFile = useCallback(async (file: string) => {
    try {
      setFileView({ file, content: "", loading: true })
      const res = await fetch("/api/dev-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file }),
      })
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
      const json = await res.json()
      setFileView({ file, content: json.content, loading: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setFileView(null)
    }
  }, [])

  const saveNotes = useCallback(
    async (
      file: string,
      content: string,
      status?: "pendientes" | "atendidas"
    ) => {
      setNotesSaving(true)
      setNotesSaved(false)
      try {
        const res = await fetch("/api/dev-dashboard", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file, content, status }),
        })
        if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
        setNotesSaved(true)
        setData((prev) =>
          prev
            ? {
                ...prev,
                modules: prev.modules.map((m) =>
                  m.file === file
                    ? {
                        ...m,
                        notes: content,
                        notesFile: `openspec/notes/${file.replace(/\.md$/, "")}.md`,
                        notesStatus: status ?? "pendientes",
                      }
                    : m
                ),
              }
            : prev
        )
        setTimeout(() => setNotesSaved(false), 2000)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setNotesSaving(false)
      }
    },
    []
  )

  const setNotesStatus = useCallback(
    async (file: string, status: "pendientes" | "atendidas") => {
      setNotesSaving(true)
      try {
        const res = await fetch("/api/dev-dashboard", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file, status }),
        })
        if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
        setData((prev) =>
          prev
            ? {
                ...prev,
                modules: prev.modules.map((m) =>
                  m.file === file ? { ...m, notesStatus: status } : m
                ),
              }
            : prev
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setNotesSaving(false)
      }
    },
    []
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronización intencional con datos del repo (avance 2026-09-02)
    setNotesDraft(
      selectedModule?.notes
        ?.replace(/^\s*<!--\s*estado:.*?-->\s*/, "")
        .trim() ?? ""
    )
  }, [selectedModule])

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-96 w-full animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <IconAlertTriangle className="size-10 text-destructive" />
          <div>
            <p className="font-semibold">
              No se pudo leer el dashboard desde el filesystem.
            </p>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              {error}
            </p>
          </div>
          <Button onClick={refresh}>
            <IconRefresh className="mr-2 size-4" /> Reintentar
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-4 border-b pb-5 md:flex-row md:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">
              Control OpenSpec
            </h1>
            <Badge variant="outline" className="border-primary/30 text-primary">
              Ambiente Activo
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Lectura en vivo de{" "}
            <code className="font-mono text-xs">openspec/</code> y{" "}
            <code className="font-mono text-xs">
              Data/NSGC/docs/especificaciones/
            </code>
            . Estado derivado del repositorio, sin datos manuales.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <input
                ref={storeFileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={onStoreFileChange}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={exportStore}
                title="Descargar los datos del store local (localStorage) como JSON"
              >
                <IconDownload className="mr-1 size-4" /> Exportar datos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => storeFileInputRef.current?.click()}
                title="Restaurar un backup JSON del store local"
              >
                <IconUpload className="mr-1 size-4" /> Importar datos
              </Button>
            </div>
            {storeBackupMsg && (
              <span
                className={`text-xs font-medium ${storeBackupMsg.type === "ok" ? "text-emerald-600" : "text-destructive"}`}
              >
                {storeBackupMsg.text}
              </span>
            )}
            {backupSummary && backupDiff && (
              <Collapsible
                open={backupDetailOpen}
                onOpenChange={setBackupDetailOpen}
              >
                <div className="mt-1 space-y-1.5 rounded-lg border bg-muted/40 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {backupDiff.main
                        .filter(
                          (d) =>
                            d.added.length +
                              d.removed.length +
                              d.modified.length >
                            0
                        )
                        .map((d) => (
                          <Badge
                            key={d.label}
                            variant="secondary"
                            className="px-1.5 py-0 font-mono text-[10px]"
                          >
                            {d.label}: {d.seedCount}→{d.currentCount}
                            {d.added.length > 0 && (
                              <span className="ml-1 text-emerald-600">
                                +{d.added.length}
                              </span>
                            )}
                            {d.removed.length > 0 && (
                              <span className="ml-1 text-destructive">
                                -{d.removed.length}
                              </span>
                            )}
                            {d.modified.length > 0 && (
                              <span className="ml-1 text-amber-600">
                                ~{d.modified.length}
                              </span>
                            )}
                          </Badge>
                        ))}
                      {(() => {
                        const maestroAdded = backupDiff.maestros.reduce(
                          (s, d) => s + d.added.length,
                          0
                        )
                        const maestroRemoved = backupDiff.maestros.reduce(
                          (s, d) => s + d.removed.length,
                          0
                        )
                        const maestroModified = backupDiff.maestros.reduce(
                          (s, d) => s + d.modified.length,
                          0
                        )
                        const totalChanges =
                          maestroAdded + maestroRemoved + maestroModified
                        return totalChanges > 0 ? (
                          <Badge
                            variant="outline"
                            className="px-1.5 py-0 font-mono text-[10px]"
                          >
                            Maestros
                            {maestroAdded > 0 && (
                              <span className="ml-1 text-emerald-600">
                                +{maestroAdded}
                              </span>
                            )}
                            {maestroRemoved > 0 && (
                              <span className="ml-1 text-destructive">
                                -{maestroRemoved}
                              </span>
                            )}
                            {maestroModified > 0 && (
                              <span className="ml-1 text-amber-600">
                                ~{maestroModified}
                              </span>
                            )}
                          </Badge>
                        ) : null
                      })()}
                    </div>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 gap-0.5 px-1.5 text-[10px]"
                      >
                        Detalle
                        <IconChevronDown
                          className={`size-3 transition-transform ${backupDetailOpen ? "rotate-180" : ""}`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <DiffSection
                      title="Colecciones principales"
                      diffs={backupDiff.main}
                    />
                    <DiffSection title="Maestros" diffs={backupDiff.maestros} />
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-primary">
              {progressPercent}%
            </div>
            <div className="text-xs font-medium text-muted-foreground">
              Progreso Change Activo
            </div>
          </div>
          <div className="h-3 w-32 overflow-hidden rounded-full border bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            disabled={loading}
            title="Recargar desde el repositorio"
          >
            <IconRefresh
              className={`size-4 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      <Dialog
        open={storeImportDialogOpen}
        onOpenChange={setStoreImportDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Importar datos del store</DialogTitle>
            <DialogDescription>
              Se reemplazará el contenido actual del store local (
              <code className="font-mono text-xs">compass-store</code>) con el
              archivo{" "}
              <code className="font-mono text-xs">
                {storeImportPending?.fileName ?? ""}
              </code>
              . La página se recargará al confirmar.
            </DialogDescription>
          </DialogHeader>

          {storeImportValidation && (
            <div className="space-y-3 text-sm">
              {storeImportValidation.exportSummary && (
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-sky-500/40 bg-sky-500/5 p-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Fecha de exportación
                    </p>
                    <p className="font-mono font-bold">
                      {storeImportValidation.exportSummary.exportDate
                        ? new Date(
                            storeImportValidation.exportSummary.exportDate
                          ).toLocaleString()
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Total registros
                    </p>
                    <p className="font-mono font-bold">
                      {storeImportValidation.exportSummary.totalRecords ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Colecciones con datos
                    </p>
                    <p className="font-mono font-bold">
                      {storeImportValidation.exportSummary
                        .collectionsWithData ?? "—"}
                    </p>
                  </div>
                </div>
              )}

              {storeImportValidation.summary && (
                <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Versión
                    </p>
                    <p className="font-mono font-bold">
                      v{storeImportValidation.summary.version}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Personas
                    </p>
                    <p className="font-mono font-bold">
                      {storeImportValidation.summary.personas}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Vínculos
                    </p>
                    <p className="font-mono font-bold">
                      {storeImportValidation.summary.vinculos}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Unidades
                    </p>
                    <p className="font-mono font-bold">
                      {storeImportValidation.summary.unidades}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Maestros
                    </p>
                    <p className="font-mono font-bold">
                      {storeImportValidation.summary.maestros} colecciones
                    </p>
                  </div>
                </div>
              )}

              {storeImportValidation.errors.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="mb-1 font-semibold text-destructive">
                    Errores de validación:
                  </p>
                  <ul className="space-y-1">
                    {storeImportValidation.errors.map((err, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-1 text-xs text-destructive"
                      >
                        <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />{" "}
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {storeImportValidation.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="mb-1 font-semibold text-amber-600">
                    Advertencias:
                  </p>
                  <ul className="space-y-1">
                    {storeImportValidation.warnings.map((w, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-1 text-xs text-amber-600"
                      >
                        <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />{" "}
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStoreImportDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmStoreImport}
              disabled={!storeImportValidation?.ok}
            >
              <IconCheck className="mr-1 size-4" /> Confirmar importación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Comparativa de Cobertura</CardTitle>
          <CardDescription>
            Especificaciones del catálogo vs capabilities en OpenSpec vs changes
            archivados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs font-bold text-muted-foreground uppercase">
                Especificaciones
              </p>
              <p className="text-2xl font-black text-primary">
                {comparative?.total ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Data/NSGC/docs/especificaciones/
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs font-bold text-muted-foreground uppercase">
                Cubiertas en Specs
              </p>
              <p className="text-2xl font-black text-sky-600">
                {comparative?.covered ?? 0}{" "}
                <span className="text-sm text-muted-foreground">
                  / {comparative?.total ?? 0}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {(comparative?.total ?? 0) - (comparative?.covered ?? 0)} sin
                capability en openspec/specs/
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs font-bold text-muted-foreground uppercase">
                Changes Archivados
              </p>
              <p className="text-2xl font-black text-emerald-600">
                {comparative?.archived ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                openspec/changes/archive/
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs font-bold text-muted-foreground uppercase">
                Changes Activos
              </p>
              <p className="text-2xl font-black text-amber-600">
                {comparative?.active ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                en desarrollo
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-start gap-4 border-t pt-6">
            <div className="flex w-full flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-bold">
                  <IconFileCode2 className="size-5 text-primary" /> Detalle
                  Specs OpenSpec
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Capabilities consolidadas en{" "}
                  <code className="font-mono text-[10px]">openspec/specs/</code>{" "}
                  y el historial en{" "}
                  <code className="font-mono text-[10px]">
                    openspec/changes/archive/
                  </code>
                  .
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowComparative((v) => !v)}
              >
                {showComparative ? (
                  <>
                    <IconArrowLeft className="mr-1 size-4" /> Ocultar
                  </>
                ) : (
                  <>
                    <IconListCheck className="mr-1 size-4" /> Ver
                  </>
                )}
              </Button>
            </div>

            {showComparative && (
              <div className="w-full">
                <div className="mt-6 border-t pt-6">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
                    <IconFileCode2 className="size-5 text-primary" />{" "}
                    Capabilities en openspec/specs/
                  </h3>
                  <p className="mb-4 text-xs text-muted-foreground">
                    La fuente de verdad consolidada: las capabilities aceptadas
                    del sistema. Se acumulan al archivar changes.{" "}
                    <span className="font-medium">🟢 Archivada</span> ·{" "}
                    <span className="font-medium">
                      🟠 Pendiente (change activo)
                    </span>{" "}
                    ·{" "}
                    <span className="font-medium">
                      🟡 Sucio (spec modificado post-archivo)
                    </span>
                  </p>
                  {data && capabilities.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {capabilities.map((spec) => {
                        // SAFETY: server-side `isSpecDirtyAfterArchive` injects `dirty`/`archived` boolean flags
                        const dirty = (spec as unknown as { dirty?: boolean })
                          .dirty
                        const isArchived = (
                          spec as unknown as { archived?: boolean }
                        ).archived
                        const tone = dirty
                          ? "dirty"
                          : isArchived
                            ? "archived"
                            : "pending"
                        return (
                          <div
                            key={spec.name}
                            className={`flex flex-col gap-2 rounded-lg border p-4 ${
                              tone === "archived"
                                ? "border-emerald-500/40 bg-emerald-500/5"
                                : tone === "dirty"
                                  ? "border-sky-500/40 bg-sky-500/5"
                                  : "border-orange-500/50 bg-orange-500/5"
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <IconFileCode2 className="size-4 text-primary" />
                              <code className="font-mono text-sm font-bold">
                                {spec.name}
                              </code>
                              {spec.code && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  {spec.code}
                                </Badge>
                              )}
                              <Badge
                                variant={
                                  tone === "archived" ? "default" : "outline"
                                }
                                className={`text-[10px] ${
                                  tone === "archived"
                                    ? "bg-emerald-600 hover:bg-emerald-700"
                                    : tone === "dirty"
                                      ? "bg-sky-600 text-white hover:bg-sky-700"
                                      : "bg-orange-500 hover:bg-orange-600"
                                }`}
                                title={
                                  tone === "archived"
                                    ? "Archivada: spec sincronizado con el último archive en openspec/changes/archive/"
                                    : tone === "dirty"
                                      ? "Sucio: spec modificado después de archivar — el sistema lo detecta solo (spec mtime > archive mtime), ejecuta /cierra-modulo para re-archivar y volver a verde"
                                      : "Pendiente: capability con spec pero sin archive, o con change activo en openspec/changes/"
                                }
                              >
                                {tone === "archived"
                                  ? "🟢 Archivada"
                                  : tone === "dirty"
                                    ? "🟡 Sucio"
                                    : "🟠 Pendiente"}
                              </Badge>
                            </div>
                            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
                              {spec.files.map((f) => (
                                <li key={f}>
                                  • {spec.name}/{f}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-muted-foreground">
                      No hay capabilities definidas en{" "}
                      <code className="font-mono text-xs">openspec/specs/</code>
                      .
                    </div>
                  )}
                </div>

                <div className="mt-6 border-t pt-6">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
                    <IconArchive className="size-5 text-muted-foreground" />
                    Changes Archivados
                  </h3>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Historial en{" "}
                    <code className="font-mono text-xs">
                      openspec/changes/archive/
                    </code>{" "}
                    y los módulos que completaron.
                  </p>
                  {data && data.archived.length > 0 ? (
                    <div className="space-y-3">
                      {data.archived.map((c) => {
                        const relatedModules =
                          moduleByArchivedChange.get(c.id) ?? []
                        const done = c.tasks.filter((t) => t.completed).length
                        return (
                          <div
                            key={c.id}
                            className="flex flex-col justify-between gap-3 rounded-lg border p-4 md:flex-row"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <IconArchive className="size-4 text-muted-foreground" />
                                <span className="font-mono text-sm font-semibold">
                                  {c.id}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Creado: {c.created ?? "—"} · {done}/
                                {c.tasks.length} tareas completadas
                              </p>
                            </div>
                            <div className="flex flex-wrap items-start gap-1 md:justify-end">
                              {relatedModules.length > 0 ? (
                                relatedModules.map((m) => (
                                  <Badge
                                    key={m}
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    {m}
                                  </Badge>
                                ))
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  Sin módulo de negocio
                                </Badge>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-muted-foreground">
                      No hay changes archivados todavía.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 space-y-6">
        {selectedModule && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedModuleCode(null)
                      setShowTasks(false)
                    }}
                  >
                    <IconArrowLeft className="mr-1 size-4" /> Cerrar detalle
                  </Button>
                  <CardTitle className="text-xl">
                    {selectedModule.code || "—"} · {selectedModule.name}
                  </CardTitle>
                  <Badge
                    variant={
                      selectedModule.status === "pendiente"
                        ? "outline"
                        : "default"
                    }
                    className={STATUS_BADGE[selectedModule.status].className}
                  >
                    {STATUS_BADGE[selectedModule.status].label}
                  </Badge>
                </div>
                <CardDescription>
                  Fase {selectedModule.phase.replace("Fase ", "")} · Ruta{" "}
                  <code className="font-mono text-xs">
                    {selectedModule.route || "—"}
                  </code>{" "}
                  · Spec NSGC{" "}
                  <code className="font-mono text-xs">
                    {selectedModule.file}
                  </code>
                </CardDescription>
              </div>
              {showTasks && activeChange && (
                <Badge variant="secondary">
                  {completedCount} de {totalCount} Completadas
                </Badge>
              )}
            </CardHeader>

            <CardContent className="space-y-4 p-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div
                  className={`flex flex-col gap-2 rounded-lg border p-4 ${selectedModule.mockData ? "border-amber-500/40 bg-amber-500/5" : "bg-muted/20"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">🧪 Mock</span>
                      <Badge variant="outline" className="text-[10px]">
                        {selectedModule.mockData ? "Disponible" : "Sin mock"}
                      </Badge>
                    </div>
                    {selectedModule.mockData && selectedModule.mockFile && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openFile(selectedModule.mockFile!)}
                      >
                        <IconFileCode2 className="mr-1 size-3.5" /> Ver
                      </Button>
                    )}
                  </div>
                  {selectedModule.mockData && selectedModule.mockFile ? (
                    <code className="font-mono text-[11px] break-all text-muted-foreground">
                      {selectedModule.mockFile}
                    </code>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Módulo aún sin datos mockeados.
                    </span>
                  )}
                </div>
                <div
                  className={`flex flex-col gap-2 rounded-lg border p-4 ${selectedModule.documented ? "border-emerald-500/40 bg-emerald-500/5" : "bg-muted/20"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">✓ Spec</span>
                      <Badge variant="outline" className="text-[10px]">
                        {selectedModule.documented ? "Documentada" : "Sin spec"}
                      </Badge>
                    </div>
                    {selectedModule.documented && selectedModule.specFile && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openFile(selectedModule.specFile!)}
                      >
                        <IconFileCode2 className="mr-1 size-3.5" /> Ver
                      </Button>
                    )}
                  </div>
                  {selectedModule.documented && selectedModule.specFile ? (
                    <code className="font-mono text-[11px] break-all text-muted-foreground">
                      {selectedModule.specFile}
                    </code>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Sin capability en openspec/specs/.
                    </span>
                  )}
                </div>
                <div
                  className={`flex flex-col gap-2 rounded-lg border p-4 ${selectedModule.hasManual ? "border-blue-500/40 bg-blue-500/5" : "bg-muted/20"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">📘 Manual</span>
                      <Badge variant="outline" className="text-[10px]">
                        {selectedModule.hasManual ? "Disponible" : "Sin manual"}
                      </Badge>
                    </div>
                    {selectedModule.hasManual && selectedModule.manualFile && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openFile(selectedModule.manualFile!)}
                      >
                        <IconFileCode2 className="mr-1 size-3.5" /> Ver
                      </Button>
                    )}
                  </div>
                  {selectedModule.hasManual && selectedModule.manualFile ? (
                    <code className="font-mono text-[11px] break-all text-muted-foreground">
                      {selectedModule.manualFile}
                    </code>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Módulo aún sin manual.
                    </span>
                  )}
                </div>
              </div>

              {selectedModule.change && (
                <div className="flex flex-col items-start justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">
                      Change asociado
                    </p>
                    <code className="font-mono text-sm font-semibold">
                      {selectedModule.change}
                    </code>
                  </div>
                  {activeChange && (
                    <Button
                      size="sm"
                      variant={showTasks ? "outline" : "default"}
                      onClick={() => setShowTasks((v) => !v)}
                    >
                      <IconListCheck className="mr-2 size-4" />
                      {showTasks
                        ? "Ocultar tareas"
                        : `Ver tareas (${activeChange.tasks.length})`}
                    </Button>
                  )}
                </div>
              )}

              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-bold">
                      <IconClipboardCopy className="size-4 text-muted-foreground" />{" "}
                      Notas del módulo
                      {selectedModule.notesStatus === "atendidas" && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-600"
                        >
                          ✓ Atendidas
                        </Badge>
                      )}
                      {selectedModule.notesStatus === "pendientes" && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600"
                        >
                          ⏳ Pendientes
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Pendientes y control de avance. Se guardan en{" "}
                      <code className="font-mono text-[10px]">
                        {selectedModule.notesFile ??
                          `openspec/notes/${selectedModule.file.replace(/\.md$/, "")}.md`}
                      </code>
                      .
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {notesSaved && (
                      <span className="text-xs font-medium text-emerald-600">
                        ✓ Guardado
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setNotesDraft(selectedModule?.notes ?? "")}
                      disabled={notesSaving}
                      title="Descartar cambios sin guardar"
                    >
                      Revertir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setNotesStatus(
                          selectedModule.file,
                          selectedModule.notesStatus === "atendidas"
                            ? "pendientes"
                            : "atendidas"
                        )
                      }
                      disabled={notesSaving || !selectedModule.notesStatus}
                      title={
                        selectedModule.notesStatus === "atendidas"
                          ? "Quitar la marca de atendidas (volver a pendientes)"
                          : "Marcar las notas como revisadas y atendidas"
                      }
                    >
                      {selectedModule.notesStatus === "atendidas"
                        ? "Quitar marca"
                        : "Marcar atendidas"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        saveNotes(
                          selectedModule.file,
                          notesDraft,
                          selectedModule.notesStatus
                        )
                      }
                      disabled={notesSaving}
                    >
                      {notesSaving ? "Guardando..." : "Guardar notas"}
                    </Button>
                  </div>
                </div>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Ej. Falta definir el calculador de prorrateo, revisar herencia de metraje con EF, etc."
                  className="min-h-[96px] w-full rounded-lg border bg-muted/30 px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-primary/30 focus:outline-none"
                />
              </div>

              {showTasks && activeChange && (
                <div className="border-t pt-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-bold">
                      <IconListCheck className="size-4 text-amber-600" /> Tareas
                      - {activeChange.id}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      <code className="font-mono text-[10px]">
                        openspec/changes/{activeChange.id}/tasks.md
                      </code>
                    </span>
                  </div>
                  {activeChange.tasks.length > 0 ? (
                    <div className="space-y-4">
                      {activeChange.tasks.map((task) => (
                        <div
                          key={task.id}
                          className={`flex flex-col items-start justify-between gap-4 rounded-lg border p-4 transition-all sm:flex-row sm:items-center ${
                            task.completed
                              ? "border-border bg-muted/40 opacity-70"
                              : "border-border bg-card hover:border-primary/40"
                          }`}
                        >
                          <div className="flex flex-1 items-start gap-3">
                            <Checkbox
                              id={`task-${activeChange.id}-${task.id}`}
                              checked={task.completed}
                              disabled={savingId === task.id}
                              onCheckedChange={() => toggleTask(task)}
                              className="mt-1"
                            />
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <label
                                  htmlFor={`task-${activeChange.id}-${task.id}`}
                                  className={`cursor-pointer text-sm font-semibold ${
                                    task.completed
                                      ? "text-muted-foreground line-through"
                                      : "text-foreground"
                                  }`}
                                >
                                  {task.title}
                                </label>
                                {nextTask?.id === task.id && (
                                  <Badge
                                    variant="default"
                                    className="text-[10px]"
                                  >
                                    SIGUIENTE A EJECUTAR
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {task.section}
                              </p>
                              <div className="flex flex-wrap gap-2 pt-1">
                                <Badge
                                  variant="outline"
                                  className="font-mono text-[10px]"
                                >
                                  Tarea {task.id}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <Sheet>
                              <SheetTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedTask(task)}
                                >
                                  <IconInfoSmall className="mr-1 size-4" />{" "}
                                  Contexto
                                </Button>
                              </SheetTrigger>
                              <SheetContent className="sm:max-w-xl">
                                {selectedTask && (
                                  <div className="mt-4 space-y-6">
                                    <SheetHeader>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="default">
                                          Tarea {selectedTask.id}
                                        </Badge>
                                        <Badge variant="outline">
                                          {selectedTask.section}
                                        </Badge>
                                      </div>
                                      <SheetTitle className="mt-2 text-xl font-bold">
                                        {selectedTask.title}
                                      </SheetTitle>
                                      <SheetDescription>
                                        Contexto técnico e instrucciones para el
                                        agente, generados desde OpenSpec.
                                      </SheetDescription>
                                    </SheetHeader>

                                    <div className="space-y-4 text-sm">
                                      <div>
                                        <h4 className="mb-1 font-semibold text-primary">
                                          Change y Fuente:
                                        </h4>
                                        <p className="rounded-lg border bg-muted p-3 font-mono text-xs text-muted-foreground">
                                          openspec/changes/{activeChange?.id}
                                          /tasks.md · Tarea {selectedTask.id}
                                        </p>
                                      </div>

                                      <div>
                                        <h4 className="mb-1 font-semibold text-primary">
                                          Prompt Recomendado para Hermes:
                                        </h4>
                                        <div className="relative rounded-lg border bg-muted p-3 font-mono text-xs">
                                          <p className="break-words text-foreground">
                                            {buildHermesPrompt(
                                              activeChange?.id,
                                              selectedTask
                                            )}
                                          </p>
                                          <Button
                                            size="sm"
                                            onClick={() =>
                                              copyToClipboard(
                                                buildHermesPrompt(
                                                  activeChange?.id,
                                                  selectedTask
                                                ),
                                                selectedTask.id
                                              )
                                            }
                                            className="mt-3 w-full"
                                          >
                                            {copiedId === selectedTask.id ? (
                                              <>
                                                <IconCheck className="mr-1 size-4 text-green-400" />{" "}
                                                ¡Copiado al portapapeles!
                                              </>
                                            ) : (
                                              <>
                                                <IconClipboardCopy className="mr-1 size-4" />{" "}
                                                Copiar Prompt para Hermes
                                              </>
                                            )}
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </SheetContent>
                            </Sheet>

                            <Button
                              size="sm"
                              variant={task.completed ? "outline" : "default"}
                              disabled={savingId === task.id}
                              onClick={() => toggleTask(task)}
                            >
                              {task.completed ? "Desmarcar" : "Completar ✓"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-muted-foreground">
                      El change no tiene tareas en{" "}
                      <code className="font-mono text-xs">tasks.md</code>.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Sheet
          open={!!fileView}
          onOpenChange={(open) => {
            if (!open) setFileView(null)
          }}
        >
          <SheetContent className="flex flex-col sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle className="font-mono text-lg text-sm font-bold break-all">
                {fileView?.file}
              </SheetTitle>
              <SheetDescription>
                Lectura del archivo directamente desde el repositorio.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-auto rounded-lg border bg-muted/20 p-4">
              {fileView?.loading ? (
                <div className="h-40 animate-pulse rounded bg-muted" />
              ) : (
                <pre className="font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
                  {fileView?.content}
                </pre>
              )}
            </div>
          </SheetContent>
        </Sheet>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              Mapa Global de Fases y Módulos
            </CardTitle>
            <CardDescription>
              Estado derivado de{" "}
              <code className="font-mono text-xs">
                Data/NSGC/docs/especificaciones/
              </code>{" "}
              + OpenSpec. <span className="font-medium">🧪 Mock</span> ·{" "}
              <span className="font-medium">✓ Spec</span> ·{" "}
              <span className="font-medium">📘 Manual</span> ·{" "}
              <span className="font-medium">📝 Notas</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por código, módulo o ruta..."
                  value={moduleSearch}
                  onChange={(e) => setModuleSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="md:w-auto">
                    <IconStack2 className="mr-2 size-4" /> Fases
                    {modulePhases.length > 0 && (
                      <Badge variant="default" className="ml-2 text-[10px]">
                        {modulePhases.length}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Filtrar por fase
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {phases.map((p) => (
                    <DropdownMenuCheckboxItem
                      key={p}
                      checked={modulePhases.includes(p)}
                      onCheckedChange={(checked) => {
                        setModulePhases((prev) =>
                          checked ? [...prev, p] : prev.filter((x) => x !== p)
                        )
                      }}
                    >
                      {p}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {modulePhases.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault()
                          setModulePhases([])
                        }}
                        className="text-xs text-destructive focus:text-destructive"
                      >
                        Limpiar fases
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="md:w-auto">
                    <IconListCheck className="mr-2 size-4" /> Estados
                    {moduleStatuses.length > 0 && (
                      <Badge variant="default" className="ml-2 text-[10px]">
                        {moduleStatuses.length}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Filtrar por estado
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {Object.entries(STATUS_BADGE).map(([k, v]) => (
                    <DropdownMenuCheckboxItem
                      key={k}
                      checked={moduleStatuses.includes(k)}
                      onCheckedChange={(checked) => {
                        setModuleStatuses((prev) =>
                          checked ? [...prev, k] : prev.filter((x) => x !== k)
                        )
                      }}
                    >
                      {v.label.replace(/^\S+\s+/, "")}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {moduleStatuses.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault()
                          setModuleStatuses([])
                        }}
                        className="text-xs text-destructive focus:text-destructive"
                      >
                        Limpiar estados
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="md:w-auto">
                    <IconArchive className="mr-2 size-4" /> Cierre
                    {moduleCierres.length > 0 && (
                      <Badge variant="default" className="ml-2 text-[10px]">
                        {moduleCierres.length}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Filtrar por cierre (/cierra-modulo)
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(
                    [
                      ["pendiente", "🔵 Falta cierre"],
                      ["cerrado", "🟢 Cerrado"],
                      ["no_aplica", "— No aplica"],
                    ] as const
                  ).map(([k, label]) => (
                    <DropdownMenuCheckboxItem
                      key={k}
                      checked={moduleCierres.includes(k)}
                      onCheckedChange={(checked) => {
                        setModuleCierres((prev) =>
                          checked ? [...prev, k] : prev.filter((x) => x !== k)
                        )
                      }}
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {moduleCierres.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault()
                          setModuleCierres([])
                        }}
                        className="text-xs text-destructive focus:text-destructive"
                      >
                        Limpiar cierres
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {data && data.modules.length > 0 ? (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted font-semibold text-muted-foreground">
                    <tr>
                      {(
                        [
                          ["code", "Código"],
                          ["phase", "Fase"],
                          ["name", "Módulo"],
                          ["route", "Ruta"],
                          ["mockData", "Mock"],
                          ["documented", "Spec"],
                          ["hasManual", "Manual"],
                          ["notesStatus", "Notas"],
                          ["change", "Change"],
                          ["cierre", "Cierre"],
                        ] as [keyof ModuleInfo, string][]
                      ).map(([key, label]) => (
                        <th
                          key={key}
                          className="cursor-pointer p-3 transition-colors select-none hover:text-foreground"
                          onClick={() =>
                            setModuleSort((prev) =>
                              prev?.key === key
                                ? { key, dir: prev.dir === 1 ? -1 : 1 }
                                : { key, dir: 1 }
                            )
                          }
                        >
                          <span className="inline-flex items-center gap-1">
                            {label}
                            <span className="text-[10px]">
                              {moduleSort?.key === key
                                ? moduleSort.dir === 1
                                  ? "▲"
                                  : "▼"
                                : "↕"}
                            </span>
                          </span>
                        </th>
                      ))}
                      <th className="p-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredModules.map((m, idx) => {
                      const info = m.change
                        ? changeMap.get(m.change)
                        : undefined
                      return (
                        <tr
                          key={idx}
                          className="cursor-pointer transition-colors hover:bg-primary/5"
                          onClick={() => {
                            setSelectedModuleCode(m.code)
                            setShowTasks(false)
                          }}
                          title={
                            m.code
                              ? `Ver detalle del módulo ${m.code}`
                              : undefined
                          }
                        >
                          <td className="p-3 font-mono font-bold text-primary">
                            {m.code || "—"}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {m.phase}
                          </td>
                          <td className="p-3 font-semibold">{m.name}</td>
                          <td className="p-3 font-mono text-xs text-muted-foreground">
                            {m.route || "—"}
                          </td>
                          <td className="p-3">
                            {m.mockData ? (
                              <Badge
                                variant="outline"
                                className="border-amber-500/40 bg-amber-500/10 text-amber-600"
                              >
                                🧪 Mock
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {m.documented ? (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                              >
                                ✓ Spec
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {m.hasManual ? (
                              <Badge
                                variant="outline"
                                className="border-blue-500/40 bg-blue-500/10 text-blue-600"
                              >
                                📘 Manual
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {m.notesStatus === "atendidas" ? (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                                title="Notas marcadas como atendidas"
                              >
                                ✓ Atendidas
                              </Badge>
                            ) : m.notesStatus === "pendientes" ? (
                              <Badge
                                variant="outline"
                                className="border-amber-500/40 bg-amber-500/10 text-amber-600"
                                title="Tiene notas pendientes de revisión"
                              >
                                📝 Pendientes
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {m.change ? (
                              <span
                                className="flex flex-wrap items-center gap-2"
                                title={`${m.change} · ${info?.done ?? 0} de ${info?.total ?? 0} tareas`}
                              >
                                <Badge
                                  variant="outline"
                                  className="border-orange-500/40 bg-orange-500/10 font-mono text-[10px] text-orange-600"
                                >
                                  {m.change}
                                </Badge>
                                {info && (
                                  <Badge
                                    variant="outline"
                                    className="gap-1 text-[10px]"
                                  >
                                    <span
                                      className={`size-2 rounded-full ${changeTone(info).tone === "green" ? "bg-emerald-500" : changeTone(info).tone === "yellow" ? "bg-amber-500" : "bg-red-500"}`}
                                    />
                                    {changeTone(info).label}
                                  </Badge>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {m.cierre === "cerrado" ? (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                                title="Módulo cerrado (change archivado)"
                              >
                                🟢 Cerrado
                              </Badge>
                            ) : m.cierre === "pendiente" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 border-orange-500/40 bg-orange-500/10 px-2 text-[10px] text-orange-600 hover:bg-orange-500/20"
                                title={`Copiar comando: /cierra-modulo ${m.change ?? ""}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyToClipboard(
                                    `/cierra-modulo ${m.change ?? ""}`,
                                    `cierre-${m.code}`
                                  )
                                }}
                              >
                                {copiedId === `cierre-${m.code}` ? (
                                  <>
                                    <IconCheck className="mr-1 size-3 text-green-500" />{" "}
                                    ¡Copiado!
                                  </>
                                ) : (
                                  <>🔵 Falta cierre</>
                                )}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <div
                              className="flex items-center gap-2"
                              title={`${STATUS_BADGE[m.status].label}`}
                            >
                              <div
                                className="flex items-end gap-0.5"
                                aria-hidden
                              >
                                {[0, 1, 2, 3].map((i) => (
                                  <span
                                    key={i}
                                    className={`w-1.5 rounded-sm transition-colors ${
                                      i < STATUS_LEVEL[m.status]
                                        ? STATUS_BAR_COLOR[m.status]
                                        : "bg-muted"
                                    }`}
                                    style={{ height: `${7 + i * 3}px` }}
                                  />
                                ))}
                              </div>
                              <span className="text-[10px] font-medium text-muted-foreground">
                                {STATUS_BADGE[m.status].label
                                  .split(" ")
                                  .slice(1)
                                  .join(" ")}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filteredModules.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Sin resultados para los filtros aplicados.
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                No se encontraron especificaciones en{" "}
                <code className="font-mono text-xs">
                  Data/NSGC/docs/especificaciones/
                </code>
                .
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
