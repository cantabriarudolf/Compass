/**
 * requerimiento-corte — el REQUERIMIENTO ESCRITO del preaviso de corte (F28 · S8,
 * Ley 21.442 art. 20 N°9).
 *
 * Por qué existe: el trámite registraba que la orden se cursó y no producía el
 * escrito que la ley manda —aviso al deudor con cinco días corridos de
 * anticipación—, así que el sistema podía ejecutar un corte sobre un aviso que
 * nadie podía probar. Este módulo arma ese papel y los metadatos de su archivo,
 * para que el preaviso lo emita como `Documento` legal en la misma transacción.
 *
 * ── Las reglas que están codificadas acá (no reinterpretar) ──────────────────
 *
 * 1. **El papel NO recalcula nada.** Cada cifra y cada fecha salen de la fila del
 *    corte que se acaba de escribir (unidad, servicio, cuotas, monto, fecha del
 *    preaviso y fecha habilitada). El documento es la constancia del acto, no un
 *    segundo cálculo que pueda contradecirlo.
 * 2. **El archivo son metadatos + una URL que responde** (D1: media por
 *    referencia, el sistema no guarda binarios). El PDF se compila de verdad al
 *    emitir —de ahí salen el tamaño y el hash que se guardan— y se vuelve a servir
 *    por `/api/cortes-servicio/requerimiento` desde la fila congelada: el mismo
 *    documento, byte por byte, porque la definición no lleva la hora de
 *    compilación (ver `info` abajo).
 * 3. **Una sola definición.** El alta del preaviso y la ruta de descarga llaman a
 *    `definicionDelRequerimiento`, así que el papel archivado y el que se descarga
 *    no pueden decir cosas distintas.
 *
 * ── Tipo documental: `otros` ────────────────────────────────────────────────
 *
 * Los doce tipos de la lista cerrada (`lib/documento-archivo.ts`) son los papeles
 * que la ley manda conservar y poner a disposición (art. 9): actas, registro,
 * planos, pólizas, contabilidad… El requerimiento de un corte no es ninguno de
 * esos —no es un acta del Comité (el acuerdo que lo autoriza sí, y va aparte), ni
 * contabilidad, ni un permiso— y forzarlo dentro de un tipo ajeno ensuciaría ese
 * tipo con papeles que no le corresponden. `otros` es la entrada honesta: el
 * archivo de la comunidad también guarda lo que la lista no nombra.
 *
 * Módulo de SERVIDOR: usa `node:crypto` para el hash y trabaja sobre `Date`, no
 * sobre el DOM. El compilador es el que ya tiene el repo
 * (`lib/api/pdf-servidor.ts`), no se agrega ninguna dependencia.
 */
import { createHash } from "node:crypto"

/** Tipo documental de la lista cerrada: ver el encabezado (ninguno de los doce aplica). */
export const TIPO_DOCUMENTAL_REQUERIMIENTO = "otros" as const

/** MIME del archivo que produce el motor de PDF del repo. */
export const MIME_DEL_REQUERIMIENTO = "application/pdf" as const

/**
 * Canal de la constancia de entrega.
 *
 * El contrato de `EnvioDocumento` tiene dos canales (`visor` | `email`). El visor
 * se registra `entregado` SÓLO porque en la misma transacción se crea la
 * `Notificacion` que lo prueba; acá no se crea ninguna, así que el visor no puede
 * ser el canal de una constancia que todavía no existe. Queda `email`, que es el
 * canal por el que esta entrega se cursa cuando se curse.
 */
export const CANAL_DE_LA_CONSTANCIA = "email" as const

/**
 * Motivo de la constancia PENDIENTE.
 *
 * En esta unidad no hay envío de correo: el requerimiento se emite y la entrega al
 * deudor queda por cursar. El contrato de los envíos dice que `enviado` (o
 * `entregado`) sólo se registra si el servidor aceptó el mensaje; escribir
 * `entregado` sin envío sería declarar una entrega que no ocurrió, y eso es
 * exactamente lo que este trámite no puede permitirse: el preaviso es el hecho
 * que habilita el corte cinco días después.
 */
export const MOTIVO_CONSTANCIA_PENDIENTE =
  "El requerimiento escrito quedó emitido, pero la entrega al deudor todavía no se cursó por ningún canal: la constancia queda pendiente hasta que exista un envío real. El estado `entregado` sólo se registra si el servidor de correo aceptó el mensaje."

/**
 * Motivo cuando la unidad NO tiene propietario vigente.
 *
 * No se inventa un destinatario: sin una persona a la que entregar, la constancia
 * no se escribe y la respuesta y la bitácora dicen por qué. Nombra la unidad
 * porque lo que falta es un dato de ESA unidad, no del trámite.
 */
export function motivoSinPropietarioVigente(numeroUnidad: string): string {
  return `No se registró la constancia de entrega: la unidad ${numeroUnidad} no tiene propietario vigente en el Registro de Copropietarios, así que no hay destinatario al que entregar el requerimiento y no se escribe una entrega en el vacío.`
}

/** Etiqueta humana del servicio: el papel no imprime el identificador interno. */
const ETIQUETAS_SERVICIO: Record<string, string> = {
  electricidad: "Electricidad",
  telecomunicaciones: "Telecomunicaciones",
  calefaccion: "Calefacción",
}

/** Pesos en formato chileno, el mismo de la bitácora del trámite. */
function pesos(monto: number): string {
  return `$${Math.round(monto).toLocaleString("es-CL")}`
}

/** Día de calendario (AAAA-MM-DD) de un instante: el papel fecha por día, no por hora. */
function diaISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

/** Glosa del documento: nombra la unidad, el servicio y la deuda que lo sostiene. */
export function glosaDelRequerimiento(datos: {
  numeroUnidad: string
  servicio: string
  cuotasImpagas: number
}): string {
  const servicio = ETIQUETAS_SERVICIO[datos.servicio] ?? datos.servicio
  return `Requerimiento de suspensión de ${servicio.toLowerCase()} a la unidad ${datos.numeroUnidad} por ${datos.cuotasImpagas} cuota(s) impaga(s) (Ley 21.442 art. 20 N°9)`
}

/**
 * Referencia auténtica del documento legal.
 *
 * Es el trámite del corte el que da fe de este papel: señala su id —el mismo que
 * la URL de descarga usa— y la fecha del preaviso que quedó registrada. Sin esto
 * el archivo guardaría un PDF sin origen verificable.
 */
export function referenciaAutenticaDelCorte(datos: {
  corteId: string
  fechaPreaviso: Date
}): string {
  return `Trámite de corte ${datos.corteId}, preaviso del ${diaISO(datos.fechaPreaviso)} (Ley 21.442 art. 20 N°9)`
}

/**
 * URL del archivo: la ruta que sirve este requerimiento.
 *
 * Es una ruta estática con el corte en la query —no un segmento `[id]`— porque el
 * inventario de permisos por objeto clasifica las rutas con segmento dinámico y
 * este papel se lee con la misma compuerta que el corte (`fi:cobranza` ver), no
 * con una compuerta nueva que habría que declarar en otro archivo.
 */
export function urlDelRequerimiento(corteId: string): string {
  return `/api/cortes-servicio/requerimiento?corteId=${encodeURIComponent(corteId)}`
}

/** Nombre del archivo. El id del corte se sanea: entra en un header HTTP. */
export function nombreDelRequerimiento(corteId: string): string {
  const seguro = corteId.replace(/[^A-Za-z0-9_-]/g, "")
  return `requerimiento-corte-${seguro || "sin-id"}.pdf`
}

/** Metadatos del archivo que el `Documento` guarda, calculados del PDF REAL. */
export interface ArchivoDelRequerimiento {
  readonly nombre: string
  readonly tipoMime: string
  readonly tamanoKB: number
  readonly url: string
  readonly hash: string
}

/**
 * Metadatos del archivo a partir de los BYTES compilados.
 *
 * El tamaño y el hash no se estiman: se calculan del PDF que el motor acaba de
 * producir, y el hash queda como la huella que prueba que el archivo servido es el
 * que se emitió (la definición es determinista a propósito, ver `info`).
 */
export function archivoDelRequerimiento(
  bytes: Uint8Array,
  corteId: string
): ArchivoDelRequerimiento {
  return {
    nombre: nombreDelRequerimiento(corteId),
    tipoMime: MIME_DEL_REQUERIMIENTO,
    tamanoKB: Math.round((bytes.length / 1024) * 10) / 10,
    url: urlDelRequerimiento(corteId),
    hash: createHash("sha256").update(bytes).digest("hex"),
  }
}

/** Todo lo que el papel imprime y que ya está en la fila del corte. */
export interface DatosDelRequerimiento {
  readonly corteId: string
  readonly comunidadNombre: string
  readonly unidadNumero: string
  readonly servicio: string
  readonly cuotasImpagas: number
  readonly montoAdeudado: number
  readonly fechaPreaviso: Date
  readonly fechaHabilitada: Date
  readonly acuerdoFolio: string
}

/**
 * Definición pdfmake del requerimiento.
 *
 * Imprime: la unidad, el servicio afectado, las cuotas impagas y el monto adeudado
 * (la deuda del preaviso), la fecha desde la cual la suspensión es posible (el
 * quinto día corrido) y la base legal.
 *
 * `info` fija `CreationDate`/`ModDate` al día del preaviso: sin eso pdfmake
 * estampa la hora de compilación y el mismo documento saldría con otro hash cada
 * vez que se regenera, así que el hash guardado dejaría de probar nada.
 */
export function definicionDelRequerimiento(
  datos: DatosDelRequerimiento
): Record<string, unknown> {
  const servicio = ETIQUETAS_SERVICIO[datos.servicio] ?? datos.servicio
  const fechaPreaviso = diaISO(datos.fechaPreaviso)
  const fechaHabilitada = diaISO(datos.fechaHabilitada)

  const fila = (rotulo: string, valor: string): unknown[] => [
    { text: rotulo },
    { text: valor, alignment: "right" },
  ]

  return {
    info: {
      Title: `Requerimiento de suspensión de servicios — unidad ${datos.unidadNumero}`,
      Author: datos.comunidadNombre,
      Subject: "Corte de servicios por morosidad (Ley 21.442 art. 20 N°9)",
      CreationDate: datos.fechaPreaviso,
      ModDate: datos.fechaPreaviso,
    },
    header: [
      { text: datos.comunidadNombre, bold: true, fontSize: 13 },
      "Requerimiento de suspensión de servicios · Ley 21.442 art. 20 N°9",
    ],
    footer: (pagina: number) => ({
      columns: [
        { text: `Trámite de corte ${datos.corteId}`, fontSize: 8 },
        { text: `Página ${pagina}`, fontSize: 8, alignment: "right" },
      ],
    }),
    content: [
      {
        text: "REQUERIMIENTO DE SUSPENSIÓN DE SERVICIOS",
        style: "titulo",
        alignment: "center",
        marginBottom: 4,
      },
      {
        text: "Corte de servicios por morosidad — Ley 21.442 art. 20 N°9",
        alignment: "center",
        fontSize: 9,
        marginBottom: 12,
      },
      {
        table: {
          widths: ["*", "auto"],
          body: [
            fila("Unidad", datos.unidadNumero),
            fila("Servicio afectado", servicio),
            fila("Cuotas impagas", String(datos.cuotasImpagas)),
            fila("Deuda a la fecha del preaviso", pesos(datos.montoAdeudado)),
            fila("Fecha del preaviso", fechaPreaviso),
            fila("Suspensión posible desde", fechaHabilitada),
            fila("Acuerdo del Comité que lo autoriza", datos.acuerdoFolio),
          ],
        },
      },
      {
        text: `Por medio del presente se requiere a la unidad ${datos.unidadNumero} el pago de las ${datos.cuotasImpagas} cuota(s) impaga(s) que a la fecha del preaviso suman ${pesos(datos.montoAdeudado)}. Cumplido el plazo de cinco días corridos contados desde el ${fechaPreaviso}, la comunidad podrá requerir a la empresa proveedora la suspensión del servicio de ${servicio.toLowerCase()} de la unidad, conforme al acuerdo del Comité ${datos.acuerdoFolio}.`,
        marginTop: 12,
        alignment: "justify",
      },
      {
        text: "Base legal: Ley 21.442 art. 20 N°9. El administrador puede suspender —o requerir a las empresas que suspendan— la electricidad, las telecomunicaciones o la calefacción de las unidades que adeuden tres o más cuotas, continuas o discontinuas, previo acuerdo del Comité y aviso al deudor con cinco días corridos de anticipación. El corte no procede en unidades donde resida una persona electrodependiente ni por deudas devengadas bajo estado de catástrofe, y no pueden suspenderse dos servicios a la vez. La reposición del servicio se cursará al día hábil siguiente de regularizada la deuda.",
        marginTop: 10,
        alignment: "justify",
        fontSize: 9,
      },
      {
        stack: [
          { text: " ", marginBottom: 36 },
          { text: "_______________________________", alignment: "center" },
          { text: "Administración de la comunidad", alignment: "center", bold: true },
          { text: datos.comunidadNombre, alignment: "center", fontSize: 9 },
        ],
        marginTop: 30,
      },
    ],
    styles: { titulo: { fontSize: 14, bold: true } },
    defaultStyle: { font: "Roboto", fontSize: 10 },
  }
}
