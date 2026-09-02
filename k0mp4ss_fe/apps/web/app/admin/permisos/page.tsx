"use client"

import * as React from "react"
import { matrizPermisos, reglasContextuales, ROLES, type EntradaABAC, type EntradaMatriz, type Rol } from "@/lib/authz"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
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
import { IconShieldCheck, IconLock, IconUsers, IconGripHorizontal } from "@tabler/icons-react"

const ETIQUETAS_ROL: Record<Rol, string> = {
  administrador: "Administrador Maestro",
  comite: "Miembro del Comité",
  conserjeria: "Conserjería / Seguridad",
  residente: "Propietario / Residente",
  mantencion: "Personal de Mantención",
}

interface ComunidadPropia {
  id: string
  nombre: string
  rol: string
}

interface Membresia {
  id: string
  rol: string
  usuario: { email: string; activo: boolean }
}

const COLOR_ACCION: Record<string, string> = {
  ver: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  crear: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  editar: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  eliminar: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  ejecutar: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
}

function MatrizRol({ rol, entradas }: { rol: Rol; entradas: EntradaMatriz[] }) {
  const esAdmin = rol === "administrador"
  return (
    <Card className={esAdmin ? "border-primary/40" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <IconShieldCheck className="size-4 text-primary" /> {ETIQUETAS_ROL[rol]}
          {esAdmin && <Badge className="bg-primary text-[10px] text-primary-foreground">wildcard</Badge>}
        </CardTitle>
        {esAdmin && (
          <CardDescription className="text-xs">
            Acceso completo a todos los recursos (recurso <code className="font-mono">*</code>).
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-1.5">
        {esAdmin ? (
          <div className="flex flex-wrap gap-1">
            {entradas.find(e => e.recurso === "*")?.acciones.map(a => (
              <Badge key={a} variant="secondary" className={`text-[10px] ${COLOR_ACCION[a]}`}>{a}</Badge>
            ))}
          </div>
        ) : (
          entradas.map(e => (
            <div key={e.recurso} className="flex items-center gap-2 text-xs">
              <code className="font-mono w-40 shrink-0 truncate text-muted-foreground" title={e.recurso}>{e.recurso}</code>
              {e.acciones.length === 0 ? (
                <Badge variant="secondary" className="text-[10px] text-muted-foreground">sin acciones (bloqueado)</Badge>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {e.acciones.map(a => (
                    <Badge key={a} variant="secondary" className={`text-[10px] ${COLOR_ACCION[a]}`}>{a}</Badge>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function SeccionABAC({ reglas }: { reglas: EntradaABAC[] }) {
  const porRol = React.useMemo(() => {
    const m = new Map<Rol, EntradaABAC[]>()
    for (const r of reglas) {
      if (!m.has(r.rol)) m.set(r.rol, [])
      m.get(r.rol)!.push(r)
    }
    return m
  }, [reglas])
  const rolesConReglas = ROLES.filter((rol) => porRol.has(rol))
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {rolesConReglas.map((rol) => (
        <Card key={rol}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <IconShieldCheck className="size-4 text-primary" /> {ETIQUETAS_ROL[rol]}
            </CardTitle>
            <CardDescription className="text-xs">
              {porRol.get(rol)!.length} regla(s) ABAC
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {porRol.get(rol)!.map((e) => (
              <div key={`${e.rol}:${e.recurso}`} className="flex flex-col gap-1 rounded-md border p-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <code className="font-mono text-muted-foreground" title={e.recurso}>{e.recurso}</code>
                  <Badge variant="secondary" className="text-[10px] bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">{e.condicion}</Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${e.donde === "motor" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400" : "border-amber-500/40 text-amber-700 dark:text-amber-400"}`}
                  >
                    {e.donde}
                  </Badge>
                </div>
                <span className="text-muted-foreground leading-tight">{e.descripcion}</span>
                {e.detalle && <span className="font-mono text-[10px] text-muted-foreground/70 truncate" title={e.detalle}>{e.detalle}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function PermisosPage() {
  const matriz = React.useMemo(() => matrizPermisos(), [])
  const abac = React.useMemo(() => reglasContextuales(), [])
  const [comunidades, setComunidades] = React.useState<ComunidadPropia[] | null>(null)
  const [comunidadId, setComunidadId] = React.useState<string>("")
  const [membresias, setMembresias] = React.useState<Membresia[] | null>(null)
  const [comunidadNombre, setComunidadNombre] = React.useState<string>("")
  const [error, setError] = React.useState<string | null>(null)
  const [cargando, setCargando] = React.useState(false)

  React.useEffect(() => {
    let cancelado = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/usuarios", { credentials: "same-origin" })
        const j = await res.json()
        if (cancelado) return
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
        setComunidades(j.comunidades ?? [])
      } catch (e) {
        if (!cancelado) setError(String(e instanceof Error ? e.message : e))
      }
    })()
    return () => {
      cancelado = true
    }
  }, [])

  React.useEffect(() => {
    if (!comunidadId) return
    let cancelado = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset intencional de paginación al cambiar filtros (avance 2026-09-02)
    setCargando(true)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/usuarios?comunidadId=${encodeURIComponent(comunidadId)}`, {
          credentials: "same-origin",
        })
        const j = await res.json()
        if (cancelado) return
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
        setMembresias(j.membresias ?? [])
        setComunidadNombre(j.comunidadNombre ?? "")
      } catch (e) {
        if (!cancelado) {
          setError(String(e instanceof Error ? e.message : e))
          setMembresias(null)
        }
      } finally {
        if (!cancelado) setCargando(false)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [comunidadId])

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b pb-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <IconShieldCheck className="size-7 text-primary" /> Permisos y Roles
            </h1>
            <p className="text-muted-foreground">
              Matriz de permisos por rol y membresías de tu comunidad — todo en modo consulta.
            </p>
          </div>
          <Badge variant="outline" className="flex items-center gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
            <IconLock className="size-3" /> solo lectura
          </Badge>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground px-1">
          Matriz de permisos (RP)
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ROLES.map(rol => (
            <MatrizRol key={rol} rol={rol} entradas={matriz[rol]} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground px-1">
          Permisos contextuales (ABAC)
        </h2>
        <p className="text-xs text-muted-foreground px-1">
          Reglas ABAC derivadas de <code className="font-mono">puedeContextual()</code> — snapshot read-only — condición legible + dónde se aplica (motor / check local).
        </p>
        <SeccionABAC reglas={abac} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <IconUsers className="size-4" /> Membresías de la comunidad
          </h2>
          {comunidades && comunidades.length > 0 && (
            <Select value={comunidadId} onValueChange={setComunidadId}>
              <SelectTrigger className="w-[280px]" aria-label="Elegir comunidad">
                <SelectValue placeholder="Elige una comunidad…" />
              </SelectTrigger>
              <SelectContent>
                {comunidades.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre} · tu rol: {c.rol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {comunidades && comunidades.length === 0 && (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Tu usuario no tiene membresías registradas. Crea los usuarios TEST desde el{" "}
              <a href="/admin/qa-lab" className="text-primary underline">Laboratorio QA</a> (👥 Crear usuarios TEST).
            </CardContent>
          </Card>
        )}

        {cargando && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground animate-pulse">
              Cargando membresías…
            </CardContent>
          </Card>
        )}

        {!cargando && membresias && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{comunidadNombre || comunidadId}</CardTitle>
              <CardDescription className="text-xs">
                {membresias.length} membresía(s) · scoping por comunidad (D3) · roles según matriz RP
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead className="w-[200px]">Rol</TableHead>
                    <TableHead className="w-[120px]">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {membresias.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-8">
                        Sin membresías en esta comunidad.
                      </TableCell>
                    </TableRow>
                  ) : (
                    membresias.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs">{m.usuario.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] flex items-center gap-1 w-fit">
                            <IconGripHorizontal className="size-3" /> {m.rol}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {m.usuario.activo ? (
                            <Badge className="bg-emerald-600 text-white text-[10px]">activo</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">inactivo</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
