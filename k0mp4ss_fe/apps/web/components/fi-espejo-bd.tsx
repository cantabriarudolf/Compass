"use client"

import * as React from "react"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { IconDatabase, IconRefresh } from "@tabler/icons-react"

interface TotalesFondoBD {
  fondoId: string
  nombre: string
  saldoInicial: number
  egresos: number
  montoEgresos: number
  ingresos: number
  montoIngresos: number
  saldo: number
}

interface RespuestaFI {
  egresos: { total: number }
  ingresos: { total: number }
  totalesPorFondo: TotalesFondoBD[]
}

interface TotalesStore {
  fondoId: string
  nombre: string
  saldoInicial: number
  egresos: number
  montoEgresos: number
  ingresos: number
  montoIngresos: number
  saldo: number
}

const fmt = new Intl.NumberFormat("es-CL")
const monto = (n: number) => `$${fmt.format(Math.round(n))}`

export function FIEspejoBD() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore((s) => s.hasHydrated)
  const fondosFI = useCompassStore((s) => s.fondosFI)
  const egresosFI = useCompassStore((s) => s.egresosFI)
  const ingresosFI = useCompassStore((s) => s.ingresosFI)

  const [data, setData] = React.useState<RespuestaFI | null>(null)
  const [cargando, setCargando] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const cargar = React.useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch("/api/fi?pageSize=1")
      if (!res.ok) {
        setError(res.status === 401 ? "Sin sesión activa — el espejo requiere autenticación." : `Error ${res.status} consultando el espejo BD.`)
        setData(null)
        return
      }
      setData((await res.json()) as RespuestaFI)
    } catch {
      setError("No se pudo consultar el espejo BD.")
      setData(null)
    } finally {
      setCargando(false)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial del espejo al hidratar (patrón fetch-on-mount, avance fi-sync-bd)
    if (hasHydrated) void cargar()
  }, [hasHydrated, cargar])

  const storePorFondo: TotalesStore[] = React.useMemo(() => {
    return fondosFI.map((f) => {
      const eg = egresosFI.filter((e) => e.fondoId === f.id)
      const ing = ingresosFI.filter((i) => i.fondoId === f.id)
      const saldoInicial = f.saldoInicial ?? 0
      const montoEgresos = eg.reduce((a, e) => a + e.monto, 0)
      const montoIngresos = ing.reduce((a, i) => a + i.monto, 0)
      return {
        fondoId: f.id,
        nombre: f.nombre,
        saldoInicial,
        egresos: eg.length,
        montoEgresos,
        ingresos: ing.length,
        montoIngresos,
        saldo: saldoInicial + montoIngresos - montoEgresos,
      }
    })
  }, [fondosFI, egresosFI, ingresosFI])

  const mapaBD = new Map((data?.totalesPorFondo ?? []).map((t) => [t.fondoId, t]))
  const mapaStore = new Map(storePorFondo.map((t) => [t.fondoId, t]))
  const fondoIds = Array.from(new Set([...mapaBD.keys(), ...mapaStore.keys()]))

  const cuadrado = (id: string): boolean => {
    const bd = mapaBD.get(id)
    const st = mapaStore.get(id)
    if (!bd || !st) return false
    return (
      bd.saldoInicial === st.saldoInicial &&
      bd.egresos === st.egresos &&
      bd.montoEgresos === st.montoEgresos &&
      bd.ingresos === st.ingresos &&
      bd.montoIngresos === st.montoIngresos
    )
  }

  const totalesCuadrados = fondoIds.filter(cuadrado).length
  const sinSesion = error?.includes("401") || error?.includes("Sin sesión")

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <IconDatabase className="h-5 w-5 text-muted-foreground" aria-hidden />
            <CardTitle>Espejo BD (ST)</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={() => void cargar()} disabled={cargando}>
            <IconRefresh className="h-4 w-4" aria-hidden />
            {cargando ? "Actualizando…" : "Refrescar"}
          </Button>
        </div>
        <CardDescription>
          Verificación read-only del espejo en BD (ST): fondos, egresos e ingresos sincronizados desde el store.
          {data ? (
            <>
              {" "}
              BD: {data.egresos.total} egresos · {data.ingresos.total} ingresos · {totalesCuadrados}/{fondoIds.length} fondos cuadrados.
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-muted-foreground" data-testid="fi-espejo-error">
            {error}
            {sinSesion ? " Inicia sesión y recarga: el primer cambio FI dispara la sincronización." : ""}
          </p>
        ) : null}
        {!error && !data ? (
          <p className="text-sm text-muted-foreground" data-testid="fi-espejo-cargando">
            {cargando ? "Consultando espejo BD…" : "Sin datos del espejo aún."}
          </p>
        ) : null}
        {data ? (
          <div className="overflow-x-auto" data-testid="fi-espejo-tabla">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fondo</TableHead>
                  <TableHead className="text-right">Saldo inicial</TableHead>
                  <TableHead className="text-right">Egresos BD/Store</TableHead>
                  <TableHead className="text-right">Monto egresos</TableHead>
                  <TableHead className="text-right">Ingresos BD/Store</TableHead>
                  <TableHead className="text-right">Monto ingresos</TableHead>
                  <TableHead className="text-right">Saldo BD</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fondoIds.map((id) => {
                  const bd = mapaBD.get(id)
                  const st = mapaStore.get(id)
                  const nombre = bd?.nombre ?? st?.nombre ?? id
                  const ok = cuadrado(id)
                  return (
                    <TableRow key={id} data-testid={`fi-espejo-fila-${id}`}>
                      <TableCell className="font-medium">{nombre}</TableCell>
                      <TableCell className="text-right">{monto(bd?.saldoInicial ?? st?.saldoInicial ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {bd?.egresos ?? 0}/{st?.egresos ?? 0}
                      </TableCell>
                      <TableCell className="text-right">{monto(bd?.montoEgresos ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {bd?.ingresos ?? 0}/{st?.ingresos ?? 0}
                      </TableCell>
                      <TableCell className="text-right">{monto(bd?.montoIngresos ?? 0)}</TableCell>
                      <TableCell className="text-right">{monto(bd?.saldo ?? 0)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={ok ? "outline" : "destructive"} className={ok ? "border-green-600 text-green-700" : ""}>
                          {ok ? "Cuadrado" : "Pendiente/Divergente"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
