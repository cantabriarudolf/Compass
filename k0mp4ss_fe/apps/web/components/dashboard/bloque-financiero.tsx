"use client"

/**
 * BloqueFinanciero — T3 (S3): ingresos, egresos, caja total y caja por fondos.
 *
 * D4: los montos salen del agregado del servidor (`GET /api/fi` →
 * `totalesPorFondo`), no de la suma de las listas paginadas de `useIngresosFI`
 * y `useEgresosFI`, que traen solo la primera página del libro.
 */
import { useResumenFI } from "@/lib/api/use-resumen-fi"
import { IconWallet } from "@tabler/icons-react"
import { Aviso, CargandoPanel, Cifra, Panel } from "./piezas"
import { clp } from "./agregados"

export function BloqueFinanciero() {
  const resumen = useResumenFI()

  return (
    <Panel
      titulo="Finanzas de la comunidad"
      descripcion="Acumulado del libro financiero, servido por el servidor."
      icono={IconWallet}
      href="/finanzas"
      textoHref="Ir a Finanzas"
    >
      {resumen.isLoading ? (
        <CargandoPanel filas={5} />
      ) : resumen.error ? (
        <Aviso tono="error">
          No se pudo leer el estado financiero: {resumen.error.message}
        </Aviso>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Cifra
              etiqueta="Ingresos"
              valor={clp(resumen.montoIngresos)}
              detalle="Abonos a fondos en el libro"
              tono="positivo"
            />
            <Cifra
              etiqueta="Egresos"
              valor={clp(resumen.montoEgresos)}
              detalle="Gastos imputados a fondos"
              tono="negativo"
            />
            <Cifra
              etiqueta="Caja total"
              valor={resumen.saldoTotal === undefined ? "—" : clp(resumen.saldoTotal)}
              detalle="Saldo consolidado de todos los fondos"
            />
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
              Caja por fondos
            </p>
            {resumen.porFondo.length === 0 ? (
              <p className="text-xs text-muted-foreground">El servidor no informó saldos por fondo.</p>
            ) : (
              <ul className="divide-y divide-muted-foreground/10">
                {resumen.porFondo.map((fondo) => (
                  <li key={fondo.id} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="truncate text-xs text-muted-foreground">{fondo.nombre}</span>
                    <span className="text-xs font-semibold tabular-nums">{clp(fondo.saldo)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!resumen.completo && (
            <Aviso tono="info">
              El libro tiene más de 100 fondos: el desglose se calculó sobre los primeros 100 y la
              caja total puede quedar corta.
            </Aviso>
          )}
        </>
      )}
    </Panel>
  )
}
