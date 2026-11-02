"use client"

/**
 * FotoDelDia — T2 (S1): la foto rápida del día del módulo Operaciones.
 *
 * Pregunta que responde: «¿qué pasó hoy en la puerta de la comunidad?».
 * - Visitas de la bitácora PE (pre-agendadas y sin aviso) del día.
 * - Encomiendas que siguen en portería esperando retiro (sin importar el día).
 * - Ingresos de contratistas del día (el maestro de contratistas de la puerta).
 *
 * S8: esto es el día a día de la COMUNIDAD. La actividad del día a día del
 * EDIFICIO (proveedores y técnicos) está en `VisitasTecnicas`, aparte y sin
 * mezclarse. No se duplica: una visita de un vecino no es una visita técnica.
 *
 * D5: si la puerta no registró nada hoy, se dice «sin movimiento» en vez de
 * dejar el panel en esqueletos o en ceros sin explicación.
 */
import * as React from "react"
import { hoyISO } from "@/lib/date-utils"
import {
  useBitacoraVisitasPE,
  useEncomiendasPE,
  useIngresosContratistasPE,
} from "@/lib/api/use-pe"
import { IconDoorEnter } from "@tabler/icons-react"
import { Aviso, CargandoPanel, Cifra, Panel, SinMovimiento } from "./piezas"
import { fotoAccesosDelDia } from "./agregados"

export function FotoDelDia() {
  const hoy = React.useMemo(() => hoyISO(), [])
  const visitas = useBitacoraVisitasPE()
  const encomiendas = useEncomiendasPE()
  const contratistas = useIngresosContratistasPE()

  const cargando = visitas.isLoading || encomiendas.isLoading || contratistas.isLoading
  const foto = fotoAccesosDelDia({
    visitas: visitas.items,
    encomiendas: encomiendas.items,
    contratistas: contratistas.items,
    dia: hoy,
  })

  const errores = [
    visitas.error ? `visitas: ${visitas.error.message}` : null,
    encomiendas.error ? `encomiendas: ${encomiendas.error.message}` : null,
    contratistas.error ? `contratistas: ${contratistas.error.message}` : null,
  ].filter((mensaje): mensaje is string => mensaje !== null)

  return (
    <Panel
      titulo="Foto del día · Operaciones"
      descripcion="La puerta de la comunidad, hoy: visitas, paquetes en portería y accesos registrados."
      icono={IconDoorEnter}
      href="/operaciones/accesos"
      textoHref="Ir a Accesos"
    >
      {cargando ? (
        <CargandoPanel filas={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Cifra
              etiqueta="Visitas de hoy"
              valor={visitas.error ? "—" : foto.visitas}
              detalle={
                visitas.error
                  ? "Registro de visitas no disponible"
                  : `${foto.visitasIngresadas} ya ingresaron`
              }
            />
            <Cifra
              etiqueta="Paquetes por retirar"
              valor={encomiendas.error ? "—" : foto.paquetesPendientes}
              detalle={
                encomiendas.error
                  ? "Registro de encomiendas no disponible"
                  : `${foto.paquetesDelDia} recibidos hoy`
              }
              tono={foto.paquetesPendientes > 0 ? "atencion" : "neutro"}
            />
            <Cifra
              etiqueta="Contratistas hoy"
              valor={contratistas.error ? "—" : foto.contratistas}
              detalle={
                contratistas.error
                  ? "Registro de contratistas no disponible"
                  : `${foto.contratistasIngresados} con ingreso registrado`
              }
            />
            <Cifra
              etiqueta="Accesos del día"
              valor={foto.accesos}
              detalle="Visitas y contratistas que ingresaron"
              tono={foto.accesos > 0 ? "positivo" : "neutro"}
            />
          </div>

          {foto.movimientos === 0 && (
            <SinMovimiento>
              Sin movimiento registrado hoy en la puerta. Cuando la conserjería registre una visita,
              un paquete o un contratista, aparece acá.
            </SinMovimiento>
          )}

          {errores.length > 0 && (
            <Aviso>
              <p className="font-medium">No se pudo leer parte de la operación del día.</p>
              <ul className="mt-1 list-inside list-disc">
                {errores.map((mensaje) => (
                  <li key={mensaje}>{mensaje}</li>
                ))}
              </ul>
            </Aviso>
          )}
        </>
      )}
    </Panel>
  )
}
