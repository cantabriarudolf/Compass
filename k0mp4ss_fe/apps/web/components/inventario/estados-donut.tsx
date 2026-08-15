"use client"

import * as React from "react"
import { ESTADOS_OCUPACION } from "@/data/maestros"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { IconChartDonut } from "@tabler/icons-react"

const COLOR_HEX: Record<string, string> = {
  vacante: "#10b981",
  "en-uso": "#2563eb",
  "en-arriendo": "#a855f7",
  "en-venta": "#0891b2",
  "en-mantencion": "#f59e0b",
}

interface EstadosDonutProps {
  estados: string[]
  scopeLabel?: string
}

export function EstadosDonut({ estados, scopeLabel }: EstadosDonutProps) {
  const total = estados.length

  const data = ESTADOS_OCUPACION.map(est => ({
    ...est,
    count: estados.filter(e => e === est.nombre).length,
    color: COLOR_HEX[est.id] ?? "#71717a",
  })).filter(d => d.count > 0)

  const size = 168
  const stroke = 22
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r

  const segments = data.reduce<Array<(typeof data)[number] & { len: number; offset: number }>>(
    (acc, d) => {
      const len = total > 0 ? (d.count / total) * c : 0
      const prev = acc[acc.length - 1]
      const offset = prev ? prev.offset - prev.len : 0
      acc.push({ ...d, len, offset })
      return acc
    },
    []
  )
  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <IconChartDonut className="size-4" />
            Distribución por Estado
          </CardTitle>
          <CardDescription>
            {scopeLabel || "Vista Global"} · {total} unidades
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="py-10 text-center bg-muted/20 border border-dashed rounded-md">
            <p className="text-xs font-bold uppercase tracking-tighter text-muted-foreground">
              Sin unidades en este sector
            </p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
            <div className="relative shrink-0">
              <svg viewBox={`0 0 ${size} ${size}`} className="h-40 w-40 -rotate-90">
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth={stroke}
                />
                {segments.map(d => (
                  <circle
                    key={d.id}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={d.color}
                    strokeWidth={stroke}
                    strokeDasharray={`${d.len} ${c - d.len}`}
                    strokeDashoffset={d.offset}
                  >
                    <title>
                      {d.nombre}: {d.count} ({total > 0 ? Math.round((d.count / total) * 100) : 0}%)
                    </title>
                  </circle>
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-black leading-none">{total}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                  Unidades
                </span>
              </div>
            </div>

            <ul className="grid grid-cols-1 gap-2 w-full max-w-xs">
              {segments.map(d => (
                <li key={d.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="font-medium uppercase text-[10px] tracking-wide">
                    {d.nombre}
                  </span>
                  <span className="ml-auto font-bold tabular-nums">{d.count}</span>
                  <span className="text-muted-foreground w-10 text-right tabular-nums">
                    {total > 0 ? Math.round((d.count / total) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
