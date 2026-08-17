"use client"

import * as React from "react"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@workspace/ui/components/table"
import { 
  IconSearch, 
  IconPlus, 
  IconAlertTriangleFilled,
  IconUserCircle,
  IconBuildingCommunity
} from "@tabler/icons-react"
import Link from "next/link"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { FormularioPersona } from "@/components/comunidad/formulario-persona"

import { Persona } from "@/data/comunidad/personas"

export default function DirectorioPersonasPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const listaPersonas = useCompassStore(s => s.personas)
  const savePersona = useCompassStore(s => s.savePersona)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [isModalOpen, setIsModalOpen] = React.useState(false)

  // Filtro reactivo básico
  const personasFiltradas = listaPersonas.filter(p => 
    p.nombreCompleto.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.rut.includes(searchTerm)
  )

  const getRoleBadgeColor = (rol: string) => {
    switch(rol) {
      case "propietario": return "bg-indigo-600 text-white";
      case "residente": return "bg-emerald-600 text-white";
      case "personal": return "bg-slate-600 text-white";
      case "directiva": return "bg-amber-600 text-white";
      default: return "bg-gray-200 text-gray-800";
    }
  }

  if (!hasHydrated) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
        <div className="h-64 w-full rounded-lg bg-muted/30" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Directorio de Comunidad</h1>
          <p className="text-muted-foreground">
            Gestión centralizada de propietarios, residentes y personal del condominio.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setIsModalOpen(true)}>
          <IconPlus className="size-4" /> Nuevo Registro
        </Button>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Nueva Identidad</DialogTitle>
            <DialogDescription>
              Registra una nueva persona en el sistema y asígnale sus roles correspondientes.
            </DialogDescription>
          </DialogHeader>
          <FormularioPersona 
            onSave={(nuevaPersona) => {
              savePersona(nuevaPersona as Persona)
              setIsModalOpen(false)
            }} 
            onCancel={() => setIsModalOpen(false)} 
          />
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <IconBuildingCommunity className="size-4" />
              Listado Central de Identidades
            </CardTitle>
            <div className="relative w-64">
              <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar por nombre o RUT..."
                className="pl-8 h-9 text-xs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Identidad</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personasFiltradas.map((persona) => (
                <TableRow key={persona.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-full bg-muted flex items-center justify-center border-2 border-transparent group-hover:border-primary/20 transition-colors">
                        <IconUserCircle className="size-6 text-muted-foreground" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold flex items-center gap-1.5">
                          {persona.nombreCompleto}
                          {/* ALERTA DE VULNERABILIDAD - Atomic UI */}
                          {persona.condicionesEspecialesIds.length > 0 && (
                            <IconAlertTriangleFilled className="size-4 text-amber-500" title="Condición Especial Registrada" />
                          )}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">{persona.rut}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {persona.roles.map(rol => (
                        <Badge key={rol} className={`${getRoleBadgeColor(rol)} text-[9px] uppercase font-bold px-1.5 py-0`}>
                          {rol}
                        </Badge>
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
                        Ver Ficha Completa
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              
              {personasFiltradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No se encontraron personas con esos criterios.
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
