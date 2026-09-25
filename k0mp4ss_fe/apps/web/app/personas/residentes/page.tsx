"use client"

import * as React from "react"
import Link from "next/link"
// Datos de dominio vía API REST (BD fuente de verdad); store legacy deprecado.
import { usePersonas } from "@/lib/api/use-personas"
import { useVinculos } from "@/lib/api/use-vinculos"
import { useUnidades } from "@/lib/api/use-unidades"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { IconSearch, IconUserCircle, IconBuildingSkyscraper, IconUsers } from "@tabler/icons-react"

const getRoleBadgeColor = (rol: string) => {
  switch (rol) {
    case "propietario": return "bg-indigo-600 text-white"
    case "residente": return "bg-emerald-600 text-white"
    case "personal": return "bg-slate-600 text-white"
    case "directiva": return "bg-amber-600 text-white"
    case "contratista": return "bg-gray-600 text-white"
    default: return "bg-gray-200 text-gray-800"
  }
}

const getVinculoBadgeColor = (rol: string) => {
  switch (rol) {
    case "propietario": return "bg-indigo-600 text-white"
    case "arrendatario": return "bg-sky-600 text-white"
    default: return "bg-gray-200 text-gray-800"
  }
}

export default function ResidentesPage() {
  const { personas, isLoading: cPersonas } = usePersonas()
  const { vinculos, isLoading: cVinculos } = useVinculos()
  const { items: unidades, isLoading: cUnidades } = useUnidades()
  const isLoading = cPersonas || cVinculos || cUnidades

  const [searchTerm, setSearchTerm] = React.useState("")

  const vinculosVigentes = React.useMemo(
    () => vinculos.filter(v => !v.fechaFin && (v.rol === "propietario" || v.rol === "arrendatario")),
    [vinculos]
  )

  const residentes = React.useMemo(() => {
    const idsConVinculoVigente = new Set(vinculosVigentes.map(v => v.personaId))
    let result = personas.filter(p => idsConVinculoVigente.has(p.id))
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      result = result.filter(p =>
        p.nombreCompleto.toLowerCase().includes(q) ||
        p.rut.includes(searchTerm)
      )
    }
    return result
  }, [personas, vinculosVigentes, searchTerm])

  const getUnidadesDePersona = React.useCallback((personaId: string) => {
    return vinculosVigentes.filter(v => v.personaId === personaId)
  }, [vinculosVigentes])

  const etiquetaUnidad = React.useCallback((unidadId: string) => {
    const u = unidades.find(x => x.id === unidadId)
    return u ? `${u.etiqueta} ${u.numero}` : unidadId
  }, [unidades])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
        <div className="h-10 w-full rounded-md bg-muted/30" />
        <div className="h-96 rounded-lg bg-muted/30" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Residentes</h1>
          <p className="text-muted-foreground">
            Directorio filtrado de residentes y propietarios — vínculos vigentes con unidad.
          </p>
        </div>
        <Badge variant="secondary" className="text-xs font-bold">
          {residentes.length} residentes
        </Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconUsers className="size-5" />
              Residentes con vínculo vigente
            </CardTitle>
            <CardDescription>
              {residentes.length} personas con vínculo vigente como propietario o arrendatario. Solo lectura — la edición vive en el Directorio de Comunidad.
            </CardDescription>
          </div>
          <div className="relative w-64">
            <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar por nombre o RUT..."
              className="pl-8 h-9 text-xs"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Identidad</TableHead>
                <TableHead>Unidad vinculada</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {residentes.map(persona => {
                const vincs = getUnidadesDePersona(persona.id)
                return (
                  <TableRow key={persona.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-full bg-muted flex items-center justify-center border-2 border-transparent group-hover:border-primary/20 transition-colors">
                          <IconUserCircle className="size-6 text-muted-foreground" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold">{persona.nombreCompleto}</span>
                          <span className="text-xs font-mono text-muted-foreground">{persona.rut}</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {persona.roles.map(rol => (
                              <Badge key={rol} className={`${getRoleBadgeColor(rol)} text-[9px] uppercase font-bold px-1.5 py-0`}>
                                {rol}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {vincs.map(v => (
                          <div key={v.id} className="flex items-center gap-1.5">
                            <IconBuildingSkyscraper className="size-3.5 text-muted-foreground" />
                            <span className="text-xs font-mono font-medium">{etiquetaUnidad(v.unidadId)}</span>
                            <Badge className={`${getVinculoBadgeColor(v.rol)} text-[9px] uppercase font-bold px-1.5 py-0`}>
                              {v.rol}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">{persona.telefonoMovil}</span>
                        <span className="text-[10px] text-muted-foreground">{persona.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={persona.estadoCuenta === "activa" ? "outline" : "destructive"} className="text-[10px] uppercase font-bold">
                        {persona.estadoCuenta}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="secondary" size="sm" asChild className="text-xs font-bold">
                        <Link href={`/comunidad/personas/${persona.id}`}>
                          Ver Ficha
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}

              {residentes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <div className="py-12 text-center border border-dashed rounded-md bg-muted/20 space-y-3">
                      <IconUsers className="size-10 mx-auto text-muted-foreground/40" />
                      <div>
                        <p className="font-semibold text-sm">Sin residentes con vínculo vigente</p>
                        <p className="text-xs text-muted-foreground max-w-md mx-auto">
                          No se encontraron personas con vínculo vigente como propietario o arrendatario. Verificá los vínculos en el Directorio de Comunidad.
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
