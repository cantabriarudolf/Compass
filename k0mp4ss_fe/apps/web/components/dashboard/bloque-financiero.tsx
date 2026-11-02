"use client"

/**
 * BloqueFinanciero — T3 (S3): ingresos, egresos, caja total y caja por fondos.
 *
 * D4: los montos salen del agregado del servidor (`GET /api/fi` →
 * `totalesPorFondo`), no de la suma de las listas paginadas de `useIngresosFI`
 * y `useEgresosFI`, que traen solo la primera página del libro.
 *
 * Contador de cajas (hallazgo de auditoría): una caja dada de baja no se cuenta
 * ni se lista, y el rótulo declara cuántas quedaron fuera. Antes el KPI de la
 * portada vieja mostraba el total registrado con el texto "activas", así que el
 * número y el rótulo se contradecían en cuanto un fondo se daba de baja.
 * `ResumenFondoFI` solo trae montos, así que el estado de cada caja se resuelve
 * con `FondoFI.activo` (`prisma/schema.prisma:889`; contrato del cliente en
 * `lib/schemas.ts:1154`). Solo se descarta lo que el servidor informa
 * explícitamente como `activo: false`: un fondo que no está en la página de
 * `useFondosFI` no se esconde por ignorancia.
 */
import * as React from "react"
import { useResumenFI } from "@/lib/api/use-resumen-fi"
import { useFondosFI } from "@/lib/api/use-fondos-fi"
import { IconWallet } from "@tabler/icons-react"
import { Aviso, CargandoPanel, Cifra, Panel } from "./piezas"
import { clp } from "./agregados"

export function BloqueFinanciero() {
  const resumen = useResumenFI()
  const fondos = useFondosFI()

  // `GET /api/fi` devuelve el desglose de todos los fondos, dados de baja
  // incluidos: el estado de cada caja no viaja en el saldo, viaja en `activo`.
  const { cajas, declaracion } = React.useMemo(() => {
    const activoPorFondo = new Map(fondos.items.map((fondo) => [fondo.id, fondo.activo]))
    const vigentes = resumen.porFondo.filter((fondo) => activoPorFondo.get(fondo.id) !== false)
    const dadasDeBaja = resumen.porFondo.length - vigentes.length
    return {
      cajas: vigentes,
      declaracion:
        dadasDeBaja === 0
          ? "Cajas financieras activas"
          : `Cajas financieras activas · ${dadasDeBaja} dadas de baja`,
    }
  }, [resumen.porFondo, fondos.items])

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
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                Caja por fondos
              </p>
              <p className="flex items-baseline gap-1.5">
                <span className="text-sm font-black tabular-nums">{cajas.length}</span>
                <span className="text-[11px] text-muted-foreground">{declaracion}</span>
              </p>
            </div>
            {cajas.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {resumen.porFondo.length === 0
                  ? "El servidor no informó saldos por fondo."
                  : "Todas las cajas están dadas de baja: no hay saldo activo que mostrar."}
              </p>
            ) : (
              <ul className="divide-y divide-muted-foreground/10">
                {cajas.map((fondo) => (
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
