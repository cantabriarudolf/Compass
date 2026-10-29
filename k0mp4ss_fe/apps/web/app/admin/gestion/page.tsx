"use client"

/**
 * Gestión Administrativa — directorio de personas y privacidad por unidad.
 *
 * La vista anterior mezclaba dos trabajos en un solo eje: cuatro pestañas por rol
 * (que se solapan: la misma persona puede ser propietaria y directiva) que además
 * contenían, anidadas, la única configuración editable de la pantalla. Ver
 * openspec/changes/gestion-administrativa-usabilidad/proposal.md.
 *
 * Forma actual: dos tareas, dos pestañas.
 *   1. Directorio — tabla única con búsqueda server-side (`?q=`) y roles como
 *      filtros multi-selección.
 *   2. Privacidad por unidad — matriz de una fila por unidad, porque la unidad es
 *      el sujeto real del control.
 *
 * Paridad de contrato: `actualizarControl` conserva el upsert idempotente y los
 * defaults (morosidad y actas ocultas, alertas activas). No cambia qué se guarda
 * ni quién lo ve.
 */
import * as React from "react"
import { mutate as mutateGlobal } from "swr"
import { nombresDePersonas, usePersonas } from "@/lib/api/use-personas"
import { useVinculos } from "@/lib/api/use-vinculos"
import { useUnidades } from "@/lib/api/use-unidades"
import { useControlesPropiedad } from "@/lib/api/use-controles-propiedad"
import { AvisoTruncamiento } from "@/components/pe/aviso-truncamiento"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Switch } from "@workspace/ui/components/switch"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  IconPhotoOff,
  IconPencil,
  IconSearch,
  IconX,
  IconUsers,
  IconHome,
  IconGavel,
  IconBriefcase,
  IconCheck,
  IconLoader2,
  IconLock,
} from "@tabler/icons-react"
import type { Persona, ControlPropiedad, ExtensionGobernanza } from "@/lib/schemas"

const CARGO_LABEL: Record<string, string> = {
  presidente: "Presidente",
  tesorero: "Tesorero",
  secretario: "Secretario",
  director: "Director",
}

type RolDirectorio = "propietario" | "residente" | "directiva" | "personal"

const ROLES_DIRECTORIO: { id: RolDirectorio; etiqueta: string; icono: React.ElementType }[] = [
  { id: "propietario", etiqueta: "Propietario", icono: IconHome },
  { id: "residente", etiqueta: "Residente", icono: IconUsers },
  { id: "directiva", etiqueta: "Directiva", icono: IconGavel },
  { id: "personal", etiqueta: "Personal", icono: IconBriefcase },
]

type Vinculo = ReturnType<typeof useVinculos>["vinculos"][number]
type Unidad = ReturnType<typeof useUnidades>["items"][number]

/** Retrasa el valor para no disparar una consulta por tecla. */
function useDebounce<T>(valor: T, ms: number): T {
  const [diferido, setDiferido] = React.useState(valor)
  React.useEffect(() => {
    const t = setTimeout(() => setDiferido(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return diferido
}

function FotoReferencia({
  url,
  nombre,
  className = "size-12",
}: {
  url?: string
  nombre: string
  className?: string
}) {
  if (!url || !url.startsWith("http")) {
    return (
      <div
        className={`${className} flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground`}
      >
        <IconPhotoOff className="size-4" aria-hidden="true" />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={nombre} className={`${className} shrink-0 rounded-full object-cover`} />
  )
}

function etiquetaUnidad(u?: Unidad): string {
  if (!u) return ""
  return `${u.etiqueta} ${u.numero}`
}

/**
 * Ficha de detalle en panel lateral.
 *
 * La edición de firma vive acá adentro, inline, y no en un `Dialog`: abrir un
 * diálogo modal sobre un `Sheet` modal encadena dos trampas de foco. El guardado
 * es la misma llamada de antes (`updatePersona` con `ExtensionGobernanza`).
 */
function FichaDetalle({
  persona,
  roles,
  unidadesNombres,
  onGuardarFirma,
}: {
  persona: Persona
  roles: RolDirectorio[]
  unidadesNombres: string[]
  onGuardarFirma: (url: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const gob = persona.datosGobernanza
  const lab = persona.datosLaborales
  const [editando, setEditando] = React.useState(false)
  const [url, setUrl] = React.useState(gob?.firmaDigital ?? "")
  const [error, setError] = React.useState<string | null>(null)
  const [guardando, setGuardando] = React.useState(false)

  const puedePrevisualizar = /^https?:\/\//.test(url.trim())

  const guardar = async () => {
    setGuardando(true)
    const r = await onGuardarFirma(url.trim())
    setGuardando(false)
    if (!r.ok) {
      setError(r.error ?? "No se pudo guardar la firma.")
      return
    }
    setError(null)
    setEditando(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <FotoReferencia url={persona.fotografiaUrl} nombre={persona.nombreCompleto} />
        <div className="min-w-0">
          <p className="truncate text-base font-medium">
            {persona.nombres} {persona.apellidos}
          </p>
          <p className="text-xs text-muted-foreground">{persona.rut}</p>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Teléfono</dt>
        <dd className="truncate">{persona.telefonoMovil || "—"}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd className="truncate">{persona.email || "—"}</dd>
        <dt className="text-muted-foreground">Roles</dt>
        <dd className="flex flex-wrap gap-1">
          {roles.length === 0 ? (
            <span className="text-muted-foreground">Sin rol asignado</span>
          ) : (
            roles.map(r => (
              <Badge key={r} variant="secondary">
                {ROLES_DIRECTORIO.find(x => x.id === r)?.etiqueta ?? r}
              </Badge>
            ))
          )}
        </dd>
        <dt className="text-muted-foreground">Unidades</dt>
        <dd>{unidadesNombres.length === 0 ? "Sin unidad vigente" : unidadesNombres.join(", ")}</dd>
      </dl>

      {gob && (
        <section className="flex flex-col gap-3 border-t pt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gobernanza</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Cargo</dt>
            <dd>{CARGO_LABEL[gob.cargoDirectiva] ?? gob.cargoDirectiva}</dd>
            <dt className="text-muted-foreground">Asunción</dt>
            <dd>{gob.fechaAsuncion}</dd>
          </dl>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Firma digitalizada</p>
              {!editando && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditando(true)
                    setError(null)
                  }}
                >
                  <IconPencil className="size-4 mr-1" aria-hidden="true" />
                  {gob.firmaDigital ? "Reemplazar firma" : "Cargar firma"}
                </Button>
              )}
            </div>

            {editando ? (
              <div className="flex flex-col gap-2">
                <Label className="text-xs" htmlFor="firma-url">
                  URL de la imagen de firma
                </Label>
                <Input
                  id="firma-url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://…/firma.png"
                />
                {puedePrevisualizar && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url.trim()}
                    alt={`Firma de ${persona.nombreCompleto}`}
                    className="max-h-24 w-fit rounded-sm border bg-white object-contain p-1"
                  />
                )}
                {error && (
                  <p role="alert" className="text-xs text-destructive">
                    {error}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={guardar} disabled={guardando}>
                    {guardando ? (
                      <IconLoader2 className="size-4 mr-1 animate-spin" aria-hidden="true" />
                    ) : (
                      <IconCheck className="size-4 mr-1" aria-hidden="true" />
                    )}
                    Guardar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditando(false)
                      setUrl(gob.firmaDigital ?? "")
                      setError(null)
                    }}
                    disabled={guardando}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : gob.firmaDigital ? (
              /^https?:\/\//.test(gob.firmaDigital) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={gob.firmaDigital}
                  alt={`Firma de ${persona.nombreCompleto}`}
                  className="max-h-24 w-fit rounded-sm border bg-white object-contain p-1"
                />
              ) : (
                <p className="text-xs text-muted-foreground">Referencia cargada: {gob.firmaDigital}</p>
              )
            ) : (
              <p className="text-xs text-muted-foreground">Sin cargar.</p>
            )}
          </div>
        </section>
      )}

      {lab && (
        <section className="flex flex-col gap-3 border-t pt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Datos laborales</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Cargo</dt>
            <dd>{lab.cargo}</dd>
            <dt className="text-muted-foreground">AFP</dt>
            <dd>{lab.afp}</dd>
            <dt className="text-muted-foreground">Previsión</dt>
            <dd>{lab.prevision}</dd>
            <dt className="text-muted-foreground">Ingreso</dt>
            <dd>{lab.fechaIngreso}</dd>
          </dl>
        </section>
      )}
    </div>
  )
}

export default function GestionAdministrativaPage() {
  const [busqueda, setBusqueda] = React.useState("")
  const busquedaDiferida = useDebounce(busqueda, 250)
  const hayBusqueda = busquedaDiferida.trim().length > 0

  // Dos claves SWR: la base sin filtro (nombres para la matriz y conteos) y la
  // del buscador. Sin búsqueda apuntan a la misma URL y SWR deduplica.
  const { personas: personasBase, total: totalBase, isLoading: cBase } = usePersonas()
  const {
    personas: personasBusqueda,
    total: totalBusqueda,
    isLoading: cBusqueda,
    update: updatePersona,
  } = usePersonas(busquedaDiferida)
  const { vinculos, isLoading: cVinculos } = useVinculos()
  const { items: unidades, total: totalUnidades, isLoading: cUnidades } = useUnidades()
  const { controles, isLoading: cControles, save: guardarControlApi } = useControlesPropiedad()

  const isLoading = cBase || cBusqueda || cVinculos || cUnidades || cControles

  const [rolesFiltro, setRolesFiltro] = React.useState<RolDirectorio[]>([])
  const [ficha, setFicha] = React.useState<Persona | null>(null)
  const [filtroUnidad, setFiltroUnidad] = React.useState("")
  const [soloExplicitas, setSoloExplicitas] = React.useState(false)
  const [pendientes, setPendientes] = React.useState<Record<string, boolean>>({})
  const [erroresFila, setErroresFila] = React.useState<Record<string, string>>({})
  const [overrideControles, setOverrideControles] = React.useState<Record<string, Partial<ControlPropiedad>>>({})
  const [errorFirma, setErrorFirma] = React.useState<string | null>(null)
  const [nombresFueraDePagina, setNombresFueraDePagina] = React.useState<Record<string, string>>({})

  /* ---------- índices ---------- */

  const vinculosPorPersona = React.useMemo(() => {
    const m = new Map<string, Vinculo[]>()
    for (const v of vinculos) {
      const lista = m.get(v.personaId)
      if (lista) lista.push(v)
      else m.set(v.personaId, [v])
    }
    return m
  }, [vinculos])

  const vinculosPorUnidad = React.useMemo(() => {
    const m = new Map<string, Vinculo[]>()
    for (const v of vinculos) {
      const lista = m.get(v.unidadId)
      if (lista) lista.push(v)
      else m.set(v.unidadId, [v])
    }
    return m
  }, [vinculos])

  const personasPorId = React.useMemo(() => new Map(personasBase.map(p => [p.id, p])), [personasBase])
  const unidadesPorId = React.useMemo(() => new Map(unidades.map(u => [u.id, u])), [unidades])

  const personasDirectorio = hayBusqueda ? personasBusqueda : personasBase
  const totalDirectorio = hayBusqueda ? totalBusqueda : totalBase

  /**
   * Predicados idénticos a la versión anterior, ahora como función: la búsqueda
   * server-side puede devolver personas que no están en la primera página de la
   * lista base, así que el rol se calcula por persona y no desde un mapa.
   */
  const rolesDe = React.useCallback(
    (p: Persona): Set<RolDirectorio> => {
      const vs = vinculosPorPersona.get(p.id) ?? []
      const roles = new Set<RolDirectorio>()
      if (p.roles.includes("propietario") || vs.some(v => v.rol === "propietario")) roles.add("propietario")
      if (
        vs.some(v => v.rol === "arrendatario" && !v.fechaFin) ||
        (p.roles.includes("residente") && !p.roles.includes("propietario"))
      ) {
        roles.add("residente")
      }
      if (p.datosGobernanza != null) roles.add("directiva")
      if (p.datosLaborales != null) roles.add("personal")
      return roles
    },
    [vinculosPorPersona]
  )

  const unidadesDePropietario = React.useCallback(
    (personaId: string) =>
      (vinculosPorPersona.get(personaId) ?? [])
        .filter(v => v.rol === "propietario" && !v.fechaFin)
        .map(v => v.unidadId),
    [vinculosPorPersona]
  )

  const unidadesDeResidente = React.useCallback(
    (personaId: string) =>
      (vinculosPorPersona.get(personaId) ?? [])
        .filter(v => v.rol === "arrendatario" && !v.fechaFin)
        .map(v => v.unidadId),
    [vinculosPorPersona]
  )

  const filtradas = React.useMemo(() => {
    if (rolesFiltro.length === 0) return personasDirectorio
    return personasDirectorio.filter(p => {
      const roles = rolesDe(p)
      return rolesFiltro.some(r => roles.has(r))
    })
  }, [personasDirectorio, rolesFiltro, rolesDe])

  const conteoPorRol = React.useMemo(() => {
    const m = new Map<RolDirectorio, number>()
    for (const r of ROLES_DIRECTORIO) m.set(r.id, 0)
    for (const p of personasDirectorio) {
      for (const r of rolesDe(p)) m.set(r, (m.get(r) ?? 0) + 1)
    }
    return m
  }, [personasDirectorio, rolesDe])

  const alternarRol = (rol: RolDirectorio) =>
    setRolesFiltro(prev => (prev.includes(rol) ? prev.filter(r => r !== rol) : [...prev, rol]))

  /* ---------- privacidad por unidad ---------- */

  const controlDeUnidad = (unidadId: string): ControlPropiedad | undefined => {
    const base = controles.find(c => c.unidadId === unidadId)
    const over = overrideControles[unidadId]
    if (!over) return base
    return {
      ...(base ?? {
        id: `ctrl-${unidadId}`,
        unidadId,
        residenteVeMorosidad: false,
        residenteVeActas: false,
        alertasResidentesActivas: true,
      }),
      ...over,
    }
  }

  const actualizarControl = async (unidadId: string, cambios: Partial<ControlPropiedad>) => {
    const existente = controlDeUnidad(unidadId)
    const base: ControlPropiedad = existente ?? {
      id: `ctrl-${unidadId}`,
      unidadId,
      residenteVeMorosidad: false,
      residenteVeActas: false,
      alertasResidentesActivas: true,
    }
    setOverrideControles(prev => ({ ...prev, [unidadId]: { ...prev[unidadId], ...cambios } }))
    setPendientes(prev => ({ ...prev, [unidadId]: true }))
    setErroresFila(prev => {
      const resto = { ...prev }
      delete resto[unidadId]
      return resto
    })

    // Servidor como única fuente: el hook revalida al guardar y acá se espera esa
    // revalidación antes de soltar el override, para que el switch no rebote con
    // el valor viejo mientras el GET está en vuelo bajo carga dev.
    const r = await guardarControlApi({ ...base, ...cambios })
    if (!r.ok) {
      setErroresFila(prev => ({ ...prev, [unidadId]: r.error ?? "No se pudo guardar el control." }))
    } else {
      await mutateGlobal("/api/controles-propiedad?pageSize=100")
    }

    setPendientes(prev => {
      const resto = { ...prev }
      delete resto[unidadId]
      return resto
    })
    setOverrideControles(prev => {
      const resto = { ...prev }
      delete resto[unidadId]
      return resto
    })
  }

  const propietarioDe = React.useCallback(
    (unidadId: string) => {
      const v = (vinculosPorUnidad.get(unidadId) ?? []).find(
        x => x.rol === "propietario" && !x.fechaFin
      )
      if (!v) return null
      const p = personasPorId.get(v.personaId)
      if (p) return `${p.nombres} ${p.apellidos}`
      // El dueño existe pero no está en la primera página del padrón: se resuelve
      // el nombre con el lote abierto de ids (ver efecto de nombresFueraDePagina)
      // y mientras tanto la columna muestra el fallback, no un falso «sin dueño».
      return nombresFueraDePagina[v.personaId] ?? null
    },
    [vinculosPorUnidad, personasPorId, nombresFueraDePagina]
  )

  const unidadesOrdenadas = React.useMemo(
    () =>
      [...unidades].sort((a, b) =>
        etiquetaUnidad(a).localeCompare(etiquetaUnidad(b), "es", { numeric: true })
      ),
    [unidades]
  )

  const unidadesVisibles = React.useMemo(() => {
    const t = filtroUnidad.trim().toLowerCase()
    return unidadesOrdenadas.filter(u => {
      if (soloExplicitas && !controles.some(c => c.unidadId === u.id)) return false
      if (!t) return true
      const nombre = etiquetaUnidad(u).toLowerCase()
      const prop = (propietarioDe(u.id) ?? "").toLowerCase()
      return nombre.includes(t) || prop.includes(t)
    })
  }, [unidadesOrdenadas, filtroUnidad, soloExplicitas, controles, propietarioDe])

  // Dueños que la primera página del padrón no resuelve: se piden en una sola
  // llamada (loteda) en vez de una petición por unidad. Sin spinner: el nombre
  // aparece cuando llega y la fila conserva el fallback mientras tanto.
  const idsFaltantes = React.useMemo(() => {
    const ids = new Set<string>()
    for (const u of unidadesVisibles) {
      const v = (vinculosPorUnidad.get(u.id) ?? []).find(x => x.rol === "propietario" && !x.fechaFin)
      if (v && !personasPorId.has(v.personaId)) ids.add(v.personaId)
    }
    return ids
  }, [unidadesVisibles, vinculosPorUnidad, personasPorId])
  const claveIdsFaltantes = React.useMemo(
    () => [...idsFaltantes].sort().join(","),
    [idsFaltantes]
  )

  React.useEffect(() => {
    if (!claveIdsFaltantes) return
    let vigente = true
    void nombresDePersonas(claveIdsFaltantes.split(",")).then(nombres => {
      if (vigente && Object.keys(nombres).length > 0) {
        setNombresFueraDePagina(prev => ({ ...prev, ...nombres }))
      }
      // Con fallo ({}) se conserva lo ya resuelto y el efecto no se re-dispara:
      // la clave de ids no cambia.
    })
    return () => {
      vigente = false
    }
  }, [claveIdsFaltantes])

  const guardarFirma = React.useCallback(
    async (url: string): Promise<{ ok: boolean; error?: string }> => {
      if (!ficha || !ficha.datosGobernanza) return { ok: false, error: "La persona no tiene datos de gobernanza." }
      const extension: ExtensionGobernanza = {
        ...ficha.datosGobernanza,
        firmaDigital: url || undefined,
      }
      const r = await updatePersona(ficha.id, { datosGobernanza: extension })
      if (!r.ok) {
        setErrorFirma(r.error ?? "No se pudo guardar la firma.")
        return { ok: false, error: r.error }
      }
      setErrorFirma(null)
      setFicha(null)
      return { ok: true }
    },
    [ficha, updatePersona]
  )

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-9 w-80 rounded bg-muted/40" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
        <div className="h-10 w-full rounded-md bg-muted/30" />
        <div className="h-64 rounded-lg bg-muted/30" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gestión Administrativa</h1>
        <p className="text-sm text-muted-foreground">
          Directorio de personas de la comunidad y privacidad de cada unidad.
        </p>
      </div>

      {errorFirma && (
        <p role="alert" className="text-sm text-destructive">
          {errorFirma}
        </p>
      )}

      <Tabs defaultValue="directorio">
        <TabsList>
          <TabsTrigger value="directorio">
            <IconUsers className="size-4 mr-1" aria-hidden="true" /> Directorio ({filtradas.length})
          </TabsTrigger>
          <TabsTrigger value="privacidad">
            <IconLock className="size-4 mr-1" aria-hidden="true" /> Privacidad por unidad ({unidades.length})
          </TabsTrigger>
        </TabsList>

        {/* ---------------- Directorio ---------------- */}
        <TabsContent value="directorio" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="relative max-w-sm">
              <IconSearch
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="pl-8 pr-8"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, RUT o email…"
                aria-label="Buscar personas"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Limpiar búsqueda"
                >
                  <IconX className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {ROLES_DIRECTORIO.map(r => {
                const activo = rolesFiltro.includes(r.id)
                const Icono = r.icono
                return (
                  <Button
                    key={r.id}
                    type="button"
                    size="sm"
                    variant={activo ? "default" : "outline"}
                    aria-pressed={activo}
                    onClick={() => alternarRol(r.id)}
                  >
                    <Icono className="size-3.5 mr-1" aria-hidden="true" />
                    {r.etiqueta} ({conteoPorRol.get(r.id) ?? 0})
                  </Button>
                )
              })}
              {rolesFiltro.length > 0 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setRolesFiltro([])}>
                  Limpiar filtros
                </Button>
              )}
            </div>

            <AvisoTruncamiento mostrados={personasDirectorio.length} total={totalDirectorio} />
          </div>

          <Card>
            <CardContent className="pt-6">
              {filtradas.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {hayBusqueda || rolesFiltro.length > 0
                    ? "Ninguna persona coincide con la búsqueda o los filtros."
                    : "Sin personas registradas."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Persona</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Unidades</TableHead>
                      <TableHead className="text-right">Ficha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtradas.map(p => {
                      const roles = [...rolesDe(p)]
                      const susUnidades = [
                        ...unidadesDePropietario(p.id),
                        ...unidadesDeResidente(p.id),
                      ].map(id => etiquetaUnidad(unidadesPorId.get(id)) || id)
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <FotoReferencia
                                url={p.fotografiaUrl}
                                nombre={p.nombreCompleto}
                                className="size-8"
                              />
                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  {p.nombres} {p.apellidos}
                                </p>
                                <p className="text-xs text-muted-foreground">{p.rut}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="truncate text-xs">{p.telefonoMovil || "—"}</p>
                            <p className="truncate text-xs text-muted-foreground">{p.email || "—"}</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {roles.length === 0 ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                roles.map(r => (
                                  <Badge key={r} variant="secondary">
                                    {ROLES_DIRECTORIO.find(x => x.id === r)?.etiqueta ?? r}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {susUnidades.length === 0 ? "—" : susUnidades.join(", ")}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => setFicha(p)}>
                              Ver ficha
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Privacidad por unidad ---------------- */}
        <TabsContent value="privacidad" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative max-w-xs">
                <IconSearch
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  className="pl-8"
                  value={filtroUnidad}
                  onChange={e => setFiltroUnidad(e.target.value)}
                  placeholder="Filtrar por unidad o propietario…"
                  aria-label="Filtrar unidades"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={soloExplicitas} onCheckedChange={setSoloExplicitas} />
                Solo con configuración explícita
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Valores por defecto: el residente <strong>no</strong> ve morosidad ni actas, y las alertas
              están activas. Cambiar un switch guarda la configuración de esa unidad.
            </p>
            <AvisoTruncamiento mostrados={unidades.length} total={totalUnidades} />
          <p className="text-xs text-muted-foreground">
            La columna Propietario se resuelve contra la primera página de vínculos cargados: si el
            vínculo del dueño está fuera de ella, se muestra «—» aunque la unidad sí tenga dueño.
          </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              {unidadesVisibles.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {soloExplicitas || filtroUnidad
                    ? "Ninguna unidad coincide con el filtro."
                    : "Sin unidades registradas."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Propietario</TableHead>
                      <TableHead className="text-center">Ve morosidad</TableHead>
                      <TableHead className="text-center">Ve actas</TableHead>
                      <TableHead className="text-center">Recibe alertas</TableHead>
                      <TableHead>Origen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unidadesVisibles.map(u => {
                      const c = controlDeUnidad(u.id)
                      const esExplicito = controles.some(x => x.unidadId === u.id)
                      const guardando = Boolean(pendientes[u.id])
                      const nombre = etiquetaUnidad(u)
                      const error = erroresFila[u.id]
                      return (
                        <React.Fragment key={u.id}>
                          <TableRow>
                            <TableCell className="font-medium">{nombre}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {propietarioDe(u.id) ?? "—"}
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={c?.residenteVeMorosidad ?? false}
                                disabled={guardando}
                                aria-label={`Residente ve morosidad · ${nombre}`}
                                onCheckedChange={v =>
                                  actualizarControl(u.id, { residenteVeMorosidad: v })
                                }
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={c?.residenteVeActas ?? false}
                                disabled={guardando}
                                aria-label={`Residente ve actas · ${nombre}`}
                                onCheckedChange={v => actualizarControl(u.id, { residenteVeActas: v })}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={c?.alertasResidentesActivas ?? true}
                                disabled={guardando}
                                aria-label={`Alertas al residente activas · ${nombre}`}
                                onCheckedChange={v =>
                                  actualizarControl(u.id, { alertasResidentesActivas: v })
                                }
                              />
                            </TableCell>
                            <TableCell>
                              {guardando ? (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <IconLoader2 className="size-3.5 animate-spin" aria-hidden="true" />
                                  Guardando…
                                </span>
                              ) : (
                                <Badge variant={esExplicito ? "default" : "outline"}>
                                  {esExplicito ? "explícito" : "defaults"}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                          {error && (
                            <TableRow>
                              <TableCell colSpan={6} className="py-1">
                                <p role="alert" className="text-xs text-destructive">
                                  {nombre}: {error}
                                </p>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={ficha !== null} onOpenChange={v => { if (!v) setFicha(null) }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {ficha && (
            <>
              <SheetHeader>
                <SheetTitle>Ficha de persona</SheetTitle>
                <SheetDescription>Datos de contacto, roles y gobernanza.</SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                <FichaDetalle
                  key={ficha.id}
                  persona={ficha}
                  roles={[...rolesDe(ficha)]}
                  unidadesNombres={[
                    ...unidadesDePropietario(ficha.id),
                    ...unidadesDeResidente(ficha.id),
                  ].map(id => etiquetaUnidad(unidadesPorId.get(id)) || id)}
                  onGuardarFirma={guardarFirma}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
