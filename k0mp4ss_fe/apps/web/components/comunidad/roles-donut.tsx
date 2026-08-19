"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { IconChartDonut } from "@tabler/icons-react"

const ROLE_HEX: Record<string, string> = {
  propietario: "#4f46e5",
  residente: "#059669",
  personal: "#475569",
  directiva: "#d97706",
  contratista: "#6b7280",
}

const ROLE_LABELS: Record<string, string> = {
  propietario: "Propietarios",
  residente: "Residentes",
  personal: "Personal",
  directiva: "Directiva",
  contratista: "Contratistas",
}

interface RolesDonutProps {
  roles: string[]
  scopeLabel?: string
  selectedId?: string
  onSelect?: (id: string) => void
}

export function RolesDonut({ roles, scopeLabel, selectedId, onSelect }: RolesDonutProps) {
  const total = roles.length

  const data = Object.entries(
    roles.reduce<Record<string, number>>((acc, r) => {
      acc[r] = (acc[r] || 0) + 1
      return acc
    }, {})
  ).map(([id, count]) => ({
    id,
    nombre: ROLE_LABELS[id] || id,
    count,
    color: ROLE_HEX[id] || "#6b7280",
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
            Distribución por Rol
          </CardTitle>
          <CardDescription>
            {scopeLabel || "Vista Global"} · {total} personas
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="py-10 text-center bg-muted/20 border border-dashed rounded-md">
            <p className="text-xs font-bold uppercase tracking-tighter text-muted-foreground">
              Sin personas registradas
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
                {segments.map(d => {
                  const isActive = selectedId === d.id
                  const isDimmed = !!selectedId && !isActive
                  return (
                    <circle
                      key={d.id}
                      cx={size / 2}
                      cy={size / 2}
                      r={r}
                      fill="none"
                      stroke={d.color}
                      strokeWidth={isActive ? stroke + 4 : stroke}
                      strokeDasharray={`${d.len} ${c - d.len}`}
                      strokeDashoffset={d.offset}
                      className={`transition-all duration-200 ${onSelect ? "cursor-pointer" : ""} ${isDimmed ? "opacity-30" : ""}`}
                      onClick={() => onSelect?.(d.id)}
                    >
                      <title>
                        {d.nombre}: {d.count} ({total > 0 ? Math.round((d.count / total) * 100) : 0}%)
                        {onSelect ? " · Clic para filtrar" : ""}
                      </title>
                    </circle>
                  )
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-black leading-none">{total}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                  Personas
                </span>
              </div>
            </div>

            <ul className="grid grid-cols-1 gap-2 w-full max-w-xs">
              {segments.map(d => {
                const isActive = selectedId === d.id
                const isDimmed = !!selectedId && !isActive
                return (
                  <li
                    key={d.id}
                    className={`flex items-center gap-2 text-xs rounded-md px-2 py-1 transition-colors ${onSelect ? "cursor-pointer hover:bg-muted" : ""} ${isActive ? "bg-muted ring-1 ring-border" : ""} ${isDimmed ? "opacity-40" : ""}`}
                    onClick={() => onSelect?.(d.id)}
                  >
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
                )
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
