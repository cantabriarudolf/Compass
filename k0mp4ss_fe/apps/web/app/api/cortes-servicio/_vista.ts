/**
 * `_vista.ts` — la forma en que se devuelve un corte de servicios (F28).
 *
 * Las cuatro rutas de `/api/cortes-servicio` (preaviso, ejecución, revocación y
 * lectura) tienen que devolver lo mismo: la fila del trámite con su estado, sus
 * fechas y el nombre de lo que referencia (la unidad y el folio del acuerdo que lo
 * autoriza). El nombre se resuelve en la ruta con UNA consulta para todo el
 * listado —nunca una por corte— y entra acá como dato ya leído.
 *
 * Las fechas viajan como ISO: el corte es un acto administrativo con plazos y la
 * hora del servidor es la que manda, no la del navegador.
 */

/** Fila persistida, en la forma mínima que la vista necesita. */
export interface CortePersistido {
  readonly id: string
  readonly unidadId: string
  readonly servicio: string
  readonly acuerdoId: string
  readonly cuotasImpagas: number
  readonly montoAdeudado: number
  readonly fechaPreaviso: Date
  readonly fechaHabilitada: Date
  readonly estado: string
  readonly ejecutadoPor: string | null
  readonly ejecutadoEn: Date | null
  readonly revocadoPor: string | null
  readonly revocadoEn: Date | null
  readonly motivo: string | null
  readonly creadoPor: string
  readonly createdAt: Date
}

/** Nombres de las filas que el corte referencia, leídos por la ruta. */
export interface NombresDelCorte {
  readonly unidadNumero: string | null
  readonly acuerdoFolio: string | null
}

/** Corte tal como viaja al cliente. */
export interface CorteEnLaVista {
  readonly id: string
  readonly unidadId: string
  readonly unidadNumero: string | null
  readonly servicio: string
  readonly acuerdoId: string
  readonly acuerdoFolio: string | null
  readonly cuotasImpagas: number
  readonly montoAdeudado: number
  readonly fechaPreaviso: string
  readonly fechaHabilitada: string
  readonly estado: string
  readonly ejecutadoPor: string | null
  readonly ejecutadoEn: string | null
  readonly revocadoPor: string | null
  readonly revocadoEn: string | null
  readonly motivo: string | null
  readonly creadoPor: string
  readonly createdAt: string
}

export function vistaDeCorte(
  corte: CortePersistido,
  nombres: NombresDelCorte
): CorteEnLaVista {
  return {
    id: corte.id,
    unidadId: corte.unidadId,
    unidadNumero: nombres.unidadNumero,
    servicio: corte.servicio,
    acuerdoId: corte.acuerdoId,
    acuerdoFolio: nombres.acuerdoFolio,
    cuotasImpagas: corte.cuotasImpagas,
    montoAdeudado: corte.montoAdeudado,
    fechaPreaviso: corte.fechaPreaviso.toISOString(),
    fechaHabilitada: corte.fechaHabilitada.toISOString(),
    estado: corte.estado,
    ejecutadoPor: corte.ejecutadoPor,
    ejecutadoEn: corte.ejecutadoEn?.toISOString() ?? null,
    revocadoPor: corte.revocadoPor,
    revocadoEn: corte.revocadoEn?.toISOString() ?? null,
    motivo: corte.motivo,
    creadoPor: corte.creadoPor,
    createdAt: corte.createdAt.toISOString(),
  }
}
