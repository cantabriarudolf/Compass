"use client"

import * as React from "react"
import { ConfiguracionGlobal } from "@/data/admin/configuracion"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { IconBuilding, IconMail, IconCalculator, IconBell, IconShield } from "@tabler/icons-react"
import { LogoUploader } from "@/components/admin/logo-uploader"

export default function ConfiguracionPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const configuracion = useCompassStore(s => s.configuracion)
  const saveConfiguracion = useCompassStore(s => s.saveConfiguracion)
  const [config, setConfig] = React.useState<ConfiguracionGlobal>(configuracion)

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset intencional del mensaje al cambiar inputs (avance 2026-09-02)
    setConfig(configuracion)
  }, [configuracion])

  const updateField = <K extends keyof ConfiguracionGlobal>(field: K, value: ConfiguracionGlobal[K]) => {
    setConfig(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const resultado = saveConfiguracion(config)
    if (!resultado.ok) {
      alert(`No se pudo guardar la configuración: ${resultado.error}`)
      return
    }
    console.log("[AM] CF_UPDATE_PARAM", config)
    alert("Configuración guardada (persistida en el store)")
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
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configuración Global</h1>
          <p className="text-muted-foreground">Parámetros base que rigen el comportamiento del sistema.</p>
        </div>
        <Button type="submit" form="config-form">Guardar Cambios</Button>
      </div>

      <form id="config-form" onSubmit={handleSave}>
        <Tabs defaultValue="identidad" className="w-full">
          <TabsList className="bg-muted/50 p-1 mb-6 flex flex-wrap h-auto">
            <TabsTrigger value="identidad" className="gap-2"><IconBuilding className="size-4" /> Identidad Legal</TabsTrigger>
            <TabsTrigger value="gc" className="gap-2"><IconCalculator className="size-4" /> Gasto Común</TabsTrigger>
            <TabsTrigger value="smtp" className="gap-2"><IconMail className="size-4" /> Correo SMTP</TabsTrigger>
            <TabsTrigger value="notificaciones" className="gap-2"><IconBell className="size-4" /> Notificaciones</TabsTrigger>
            <TabsTrigger value="operacion" className="gap-2"><IconShield className="size-4" /> Operación y Seguridad</TabsTrigger>
          </TabsList>

          <TabsContent value="identidad">
            <Card>
              <CardHeader>
                <CardTitle>Identidad y Representación Legal</CardTitle>
                <CardDescription>Datos oficiales de la comunidad para documentos y comunicaciones.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <LogoUploader
                    value={config.logoUrl}
                    onChange={(value) => updateField("logoUrl", value)}
                  />
                </div>
                <div className="space-y-2"><Label>Nombre de la Comunidad *</Label><Input value={config.nombreComunidad} onChange={e => updateField("nombreComunidad", e.target.value)} required /></div>
                <div className="space-y-2"><Label>RUT del Condominio *</Label><Input value={config.rutCondominio} onChange={e => updateField("rutCondominio", e.target.value)} required /></div>
                <div className="space-y-2 md:col-span-2"><Label>Dirección Oficial *</Label><Input value={config.direccionOficial} onChange={e => updateField("direccionOficial", e.target.value)} required /></div>
                <div className="space-y-2"><Label>Administrador Responsable *</Label><Input value={config.administradorResponsable} onChange={e => updateField("administradorResponsable", e.target.value)} required /></div>
                <div className="space-y-2"><Label>RUT Administrador *</Label><Input value={config.rutAdministrador} onChange={e => updateField("rutAdministrador", e.target.value)} required /></div>
                <div className="space-y-2"><Label>Teléfono Admin *</Label><Input value={config.telefonoAdmin} onChange={e => updateField("telefonoAdmin", e.target.value)} required /></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gc">
            <Card>
              <CardHeader>
                <CardTitle>Parametrización del Gasto Común</CardTitle>
                <CardDescription>Define cómo se calcula el cobro base y las reglas de morosidad.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Modo de Cálculo *</Label>
                  <Select value={config.modoCalculoGC} onValueChange={v => updateField("modoCalculoGC", v as ConfiguracionGlobal["modoCalculoGC"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fijo">Monto Fijo por Tipo de Unidad</SelectItem>
                      <SelectItem value="variable">Variable por Prorrateo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Día de Corte de Pago (1-31) *</Label><Input type="number" min={1} max={31} value={config.diaCortePago} onChange={e => updateField("diaCortePago", Number(e.target.value))} required /></div>
                <div className="space-y-2"><Label>Límite de Meses para Aviso de Corte *</Label><Input type="number" min={1} value={config.limiteMesesAvisoCorte} onChange={e => updateField("limiteMesesAvisoCorte", Number(e.target.value))} required /></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="smtp">
            <Card>
              <CardHeader>
                <CardTitle>Configuración de Correo Electrónico (SMTP)</CardTitle>
                <CardDescription>Parámetros críticos para comunicaciones y cobranza.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Servidor SMTP *</Label><Input value={config.smtpHost} onChange={e => updateField("smtpHost", e.target.value)} required /></div>
                <div className="space-y-2"><Label>Puerto *</Label><Input type="number" value={config.smtpPort} onChange={e => updateField("smtpPort", Number(e.target.value))} required /></div>
                <div className="space-y-2"><Label>Usuario *</Label><Input value={config.smtpUser} onChange={e => updateField("smtpUser", e.target.value)} required /></div>
                <div className="space-y-2 rounded-md border border-dashed bg-muted/20 p-3">
                  <Label className="text-xs font-bold uppercase tracking-widest">Contraseña / Token</Label>
                  <p className="text-xs text-muted-foreground mt-1">Gestionado por el servidor (variable de entorno <code className="font-mono bg-muted px-1 rounded">SMTP_PASSWORD</code>) — no se edita en el cliente (C2-final).</p>
                </div>
                <div className="space-y-2">
                  <Label>Seguridad *</Label>
                  <Select value={config.smtpSecurity} onValueChange={v => updateField("smtpSecurity", v as ConfiguracionGlobal["smtpSecurity"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tls">TLS</SelectItem>
                      <SelectItem value="ssl">SSL</SelectItem>
                      <SelectItem value="none">Sin seguridad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Correo Remitente *</Label><Input value={config.smtpFrom} onChange={e => updateField("smtpFrom", e.target.value)} required /></div>
                <div className="space-y-2"><Label>Nombre Remitente *</Label><Input value={config.smtpFromName} onChange={e => updateField("smtpFromName", e.target.value)} required /></div>
                <div className="space-y-2"><Label>Correo BCC (Auditoría)</Label><Input value={config.smtpBcc} onChange={e => updateField("smtpBcc", e.target.value)} /></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notificaciones">
            <Card>
              <CardHeader>
                <CardTitle>Reglas y Opt-in de Módulos</CardTitle>
                <CardDescription>Activa o desactiva los envíos automáticos de correo.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {[
                  { key: "notificarEmisionGC", label: "Emisión de Gastos Comunes" },
                  { key: "notificarRegistroVisitas", label: "Registro de Visitas" },
                  { key: "notificarEncomiendas", label: "Recepción de Encomiendas" },
                  { key: "notificarReservas", label: "Confirmación de Reservas" },
                  { key: "notificarAvisosSistema", label: "Avisos de Sistema" },
                  { key: "notificarSugerenciasReclamos", label: "Sugerencias y Reclamos" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border p-4">
                    <span className="font-medium">{label}</span>
                    <Switch
                      checked={config[key as keyof ConfiguracionGlobal] as boolean}
                      onCheckedChange={v => updateField(key as keyof ConfiguracionGlobal, v as never)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="operacion">
            <Card>
              <CardHeader>
                <CardTitle>Parámetros Operativos y Seguridad</CardTitle>
                <CardDescription>Valores base para cálculos de sueldos, prorrateos y seguridad.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Días Mes Comercial (28-31) *</Label><Input type="number" min={28} max={31} value={config.diasMesComercial} onChange={e => updateField("diasMesComercial", Number(e.target.value))} required /></div>
                <div className="space-y-2"><Label>Días Vacaciones / Mes *</Label><Input type="number" step={0.01} value={config.diasVacacionesMes} onChange={e => updateField("diasVacacionesMes", Number(e.target.value))} required /></div>
                <div className="space-y-2"><Label>Jornada Semanal Estándar (35-48 hrs) *</Label><Input type="number" min={35} max={48} value={config.jornadaSemanalEstandar} onChange={e => updateField("jornadaSemanalEstandar", Number(e.target.value))} required /></div>
                <div className="space-y-2 rounded-md border border-dashed bg-muted/20 p-3">
                  <Label className="text-xs font-bold uppercase tracking-widest">Clave de Eliminación Maestro</Label>
                  <p className="text-xs text-muted-foreground mt-1">Gestionado por el servidor (variable de entorno <code className="font-mono bg-muted px-1 rounded">CLAVE_ELIMINACION_MAESTRO</code>) — no se edita en el cliente (C2-final).</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </form>
    </div>
  )
}
