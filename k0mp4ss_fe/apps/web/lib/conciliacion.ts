/**
 * lib/conciliacion.ts — conciliación bancaria por importación de cartola (F30).
 *
 * Decisión D1 del plan: NO hay integración con el banco. Se importa el archivo
 * que el banco ya exporta (CSV), el sistema propone el enlace contra lo que ya
 * está registrado y lo que no puede enlazar con certeza queda en una cola que una
 * persona resuelve. El reglamento de la ley exige llevar las cuentas e inversiones
 * «debidamente conciliadas» (art. 24) y el reglamento de la comunidad pide que el
 * ingreso bancario se vincule con la unidad: eso es lo que se implementa acá.
 *
 * REGLA PURA: no consulta la base, no lee el reloj y no escribe nada. El texto de
 * la cartola entra por parámetro y los candidatos entran ya leídos, así que la
 * importación no puede decidir distinto según cuándo corre.
 *
 * Tres decisiones que, si quedaran al llamador, cada ruta resolvería distinto:
 *
 *   1. El lector del CSV devuelve los errores POR FILA y las filas legibles en la
 *      misma respuesta. Quien importa decide qué hacer con eso —la ruta rechaza
 *      el archivo completo—; el lector no tira la basura adentro ni esconde la
 *      fila que no pudo leer.
 *   2. El dinero se compara en CENTAVOS enteros: `150000.004` y `150000` son el
 *      mismo monto, y un centavo de diferencia ya no lo es.
 *   3. La ambigüedad NUNCA se resuelve por azar. Dos candidatos con el mismo
 *      monto dejan el movimiento en la cola; un enlace que adivina es peor que
 *      un movimiento sin conciliar, porque el error se descubre meses después.
 */

/** Signo del movimiento en la cartola: cargo = sale plata, abono = entra plata. */
export const TIPOS_MOVIMIENTO_CARTOLA = ["cargo", "abono"] as const

export type TipoMovimientoCartola = (typeof TIPOS_MOVIMIENTO_CARTOLA)[number]

/** Estados de un movimiento de cartola (`MovimientoCartola.estado`). */
export const ESTADOS_MOVIMIENTO_CARTOLA = [
  "conciliado",
  "no_conciliado",
  "resuelto_manual",
] as const

export type EstadoMovimientoCartola = (typeof ESTADOS_MOVIMIENTO_CARTOLA)[number]

/** Un movimiento de la cartola, ya leído y normalizado. */
export interface MovimientoParseado {
  /** Fecha del movimiento en `AAAA-MM-DD` (sin hora: la cartola trae un día). */
  readonly fecha: string
  readonly descripcion: string
  readonly referencia: string | null
  readonly contraparte: string | null
  /** Monto en pesos, SIEMPRE positivo: el signo vive en `tipo`. */
  readonly monto: number
  readonly tipo: TipoMovimientoCartola
}

/** Resultado del lector: las filas legibles y el motivo de cada fila ilegible. */
export interface ResultadoParseoCartola {
  readonly filas: MovimientoParseado[]
  readonly errores: string[]
}

/** Los campos de la cartola que la regla de enlace necesita. */
export interface MovimientoParaEnlazar {
  readonly tipo: TipoMovimientoCartola
  readonly monto: number
  readonly fecha: string
  readonly referencia?: string | null
  readonly contraparte?: string | null
}

/**
 * Un registro del sistema contra el que un movimiento de la cartola puede
 * enlazarse. `ingreso` y `pago` son plata que ENTRA (abonos); `egreso` es plata
 * que SALE (cargos), y un cargo no puede enlazarse con un ingreso ni al revés.
 */
export type TipoCandidatoConciliacion = "ingreso" | "egreso" | "pago"

export interface CandidatoConciliacion {
  readonly id: string
  readonly tipo: TipoCandidatoConciliacion
  readonly monto: number
  readonly fecha: string
  readonly referencia?: string | null
  readonly contraparte?: string | null
}

/** Dictamen del enlace: o queda atado a un candidato, o queda en la cola. */
export type ResultadoEnlace =
  | { readonly enlazado: true; readonly candidatoId: string; readonly motivo: string }
  | { readonly enlazado: false; readonly motivo: string }

/**
 * Motivos del dictamen. Van como constantes exportadas porque el motivo es
 * evidencia de por qué un movimiento quedó en la cola: los tests lo leen y una
 * persona puede reconstruir la decisión sin mirar el código.
 */
export const MOTIVOS_DE_ENLACE = {
  referenciaMonto: "referencia exacta y monto exacto",
  contraparteMontoFecha: "contraparte, monto y fecha dentro de ±5 días",
  montoUnico: "monto exacto con un único candidato",
  ambiguoReferencia: "ambiguo: más de un candidato con la misma referencia y monto",
  ambiguoContraparte: "ambiguo: más de un candidato con la misma contraparte, monto y fecha",
  ambiguoMonto: "ambiguo: más de un candidato con el mismo monto",
  sinCandidatos: "no hay candidatos compatibles con el tipo de movimiento",
  sinCoincidencia: "ningún candidato coincide en referencia, contraparte ni monto",
} as const

/** Días de holgura entre la fecha del banco y la fecha del registro. */
export const DIAS_TOLERANCIA_FECHA = 5

/** Tipos de candidato con los que cada signo puede enlazarse. */
const TIPOS_COMPATIBLES: Readonly<
  Record<TipoMovimientoCartola, readonly TipoCandidatoConciliacion[]>
> = {
  cargo: ["egreso"],
  abono: ["ingreso", "pago"],
}

/** Columnas que el encabezado tiene que declarar sí o sí. */
const COLUMNAS_OBLIGATORIAS = ["fecha", "descripcion", "monto"] as const

type CampoColumna = (typeof COLUMNAS_OBLIGATORIAS)[number] | "referencia" | "contraparte" | "tipo"

/**
 * Nombres aceptados por columna. El banco no usa un vocabulario único y exigir
 * uno solo obligaría a editar el archivo a mano antes de importarlo, que es
 * justamente lo que se quiere evitar.
 */
const ALIAS_COLUMNAS: Readonly<Record<CampoColumna, readonly string[]>> = {
  fecha: ["fecha", "fecha movimiento", "fecha operacion", "fecha contable"],
  descripcion: ["descripcion", "detalle", "glosa", "concepto", "descripcion movimiento"],
  monto: ["monto", "importe", "monto clp", "monto pesos"],
  referencia: [
    "referencia",
    "referencia bancaria",
    "nro operacion",
    "numero operacion",
    "operacion",
    "documento",
  ],
  contraparte: [
    "contraparte",
    "rut",
    "nombre",
    "pagador",
    "beneficiario",
    "proveedor",
    "ordenante",
  ],
  tipo: ["tipo", "tipo movimiento", "cargo abono", "cargo o abono", "debito credito"],
}

/** Valores aceptados en la columna `tipo`, normalizados. */
const TIPO_CARGO = ["cargo", "c", "d", "debito", "debe", "giro", "salida"]
const TIPO_ABONO = ["abono", "a", "h", "credito", "haber", "deposito", "entrada"]

/**
 * Normaliza texto para comparar: sin acentos, minúsculas y sin puntuación. Un RUT
 * escrito «12.345.678-9» y «12345678-9» es el mismo RUT, y una contraparte
 * «Inmobiliaria Los Aromos SpA» contiene el nombre que trae la cartola.
 */
function normalizarTexto(valor: string | null | undefined): string {
  if (!valor) return ""
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

/** Un encabezado se compara sin acentos, sin mayúsculas y con los espacios colapsados. */
function normalizarEncabezado(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Parte una línea de CSV respetando las comillas y el escape `""`. */
function dividirFila(linea: string, separador: string): string[] {
  const celdas: string[] = []
  let actual = ""
  let entreComillas = false
  for (let i = 0; i < linea.length; i++) {
    const caracter = linea[i]!
    if (entreComillas) {
      if (caracter === '"') {
        if (linea[i + 1] === '"') {
          actual += '"'
          i++
        } else {
          entreComillas = false
        }
      } else {
        actual += caracter
      }
      continue
    }
    if (caracter === '"') {
      entreComillas = true
      continue
    }
    if (caracter === separador) {
      celdas.push(actual)
      actual = ""
      continue
    }
    actual += caracter
  }
  celdas.push(actual)
  return celdas
}

/**
 * El separador se decide con el encabezado: el que más aparece gana, y el empate
 * (un encabezado sin separadores) cae en la coma. Se cuentan sólo los que están
 * fuera de comillas para que un nombre con coma no confunda la lectura.
 */
function detectarSeparador(encabezado: string): string {
  let comas = 0
  let puntosYComa = 0
  let entreComillas = false
  for (let i = 0; i < encabezado.length; i++) {
    const caracter = encabezado[i]!
    if (caracter === '"') {
      if (entreComillas && encabezado[i + 1] === '"') {
        i++
      } else {
        entreComillas = !entreComillas
      }
      continue
    }
    if (entreComillas) continue
    if (caracter === ",") comas++
    if (caracter === ";") puntosYComa++
  }
  return puntosYComa > comas ? ";" : ","
}

/** Ubica cada campo en el encabezado; devuelve `null` si falta una columna obligatoria. */
function ubicarColumnas(
  encabezado: readonly string[],
  errores: string[]
): Partial<Record<CampoColumna, number>> | null {
  const columnas: Partial<Record<CampoColumna, number>> = {}
  for (const campo of Object.keys(ALIAS_COLUMNAS) as CampoColumna[]) {
    const indice = encabezado.findIndex((columna) => ALIAS_COLUMNAS[campo].includes(columna))
    if (indice >= 0) columnas[campo] = indice
  }
  const faltantes = COLUMNAS_OBLIGATORIAS.filter((campo) => columnas[campo] === undefined)
  if (faltantes.length === 1) {
    const campo = faltantes[0]!
    errores.push(
      `El encabezado no declara la columna obligatoria «${campo}» (se aceptan: ${ALIAS_COLUMNAS[campo].join(", ")}).`
    )
    return null
  }
  if (faltantes.length > 1) {
    errores.push(
      `El encabezado no declara las columnas obligatorias ${faltantes.map((campo) => `«${campo}»`).join(", ")}.`
    )
    return null
  }
  return columnas
}

/**
 * Monto a número. Tolera el símbolo de peso, los espacios y los dos formatos de
 * separador:
 *   · con punto y coma juntos, el ÚLTIMO separador es el decimal («1.234,56» y
 *     «1,234.56» son mil doscientos treinta y cuatro con cincuenta y seis);
 *   · un único separador con exactamente tres dígitos detrás es de miles
 *     («1.234» = 1234), porque los montos no se escriben con tres decimales;
 *     con cualquier otro largo es decimal («1234,5»).
 * Devuelve `null` cuando no hay dígitos: el llamador decide qué hacer con la fila.
 */
function parsearMonto(texto: string): number | null {
  let limpio = texto.replace(/[^\d,.-]/g, "")
  if (!/\d/.test(limpio)) return null
  const negativo = limpio.startsWith("-") || limpio.endsWith("-")
  limpio = limpio.replace(/-/g, "")
  const ultimoPunto = limpio.lastIndexOf(".")
  const ultimaComa = limpio.lastIndexOf(",")

  let normalizado: string
  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    const decimal = ultimoPunto > ultimaComa ? "." : ","
    const miles = decimal === "." ? "," : "."
    normalizado = limpio.split(miles).join("").replace(decimal, ".")
  } else if (ultimoPunto >= 0 || ultimaComa >= 0) {
    const separador = ultimoPunto >= 0 ? "." : ","
    const partes = limpio.split(separador)
    const esMiles = partes.length > 2 || (partes.length === 2 && partes[1]!.length === 3)
    normalizado = esMiles ? partes.join("") : partes.join(".")
  } else {
    normalizado = limpio
  }

  const valor = Number(normalizado)
  if (!Number.isFinite(valor)) return null
  return negativo ? -valor : valor
}

/** `AAAA-MM-DD` y `DD/MM/AAAA` a fecha ISO; `null` si el día no existe. */
function parsearFecha(texto: string): string | null {
  const crudo = texto.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(crudo)
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(crudo)
  let anio: number
  let mes: number
  let dia: number
  if (iso) {
    anio = Number(iso[1])
    mes = Number(iso[2])
    dia = Number(iso[3])
  } else if (dmy) {
    dia = Number(dmy[1])
    mes = Number(dmy[2])
    anio = Number(dmy[3])
  } else {
    return null
  }
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    return null
  }
  const dosDigitos = (n: number): string => String(n).padStart(2, "0")
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`
}

/** El signo del monto decide el tipo cuando la cartola no trae columna `tipo`. */
function tipoPorSigno(monto: number): TipoMovimientoCartola {
  return monto < 0 ? "cargo" : "abono"
}

/**
 * Lector de la cartola del banco. Devuelve las filas legibles y un error por cada
 * fila que no se pudo leer, con el número de línea del archivo (el encabezado es
 * la línea 1). No lanza: quien importa decide si un archivo con errores entra o
 * no, y la ruta lo rechaza completo.
 */
export function parsearCartola(texto: string): ResultadoParseoCartola {
  const errores: string[] = []
  const filas: MovimientoParseado[] = []
  const lineas = texto.replace(/^\uFEFF/, "").split(/\r?\n/)

  const indiceEncabezado = lineas.findIndex((linea) => linea.trim() !== "")
  if (indiceEncabezado === -1) {
    return { filas: [], errores: ["La cartola está vacía: no hay encabezado que leer."] }
  }

  const lineaEncabezado = lineas[indiceEncabezado]!
  const separador = detectarSeparador(lineaEncabezado)
  const encabezado = dividirFila(lineaEncabezado, separador).map(normalizarEncabezado)
  const columnas = ubicarColumnas(encabezado, errores)
  if (columnas === null) return { filas: [], errores }

  const conTipo = columnas.tipo !== undefined

  for (let i = indiceEncabezado + 1; i < lineas.length; i++) {
    const linea = lineas[i] ?? ""
    if (linea.trim() === "") continue
    const numeroDeFila = i + 1
    const celdas = dividirFila(linea, separador)

    if (celdas.length > encabezado.length) {
      errores.push(
        `fila ${numeroDeFila}: tiene ${celdas.length} columnas y el encabezado declara ${encabezado.length}.`
      )
      continue
    }

    const celda = (campo: CampoColumna): string => {
      const indice = columnas[campo]
      if (indice === undefined) return ""
      return (celdas[indice] ?? "").trim()
    }

    const fecha = parsearFecha(celda("fecha"))
    if (fecha === null) {
      errores.push(
        `fila ${numeroDeFila}: la fecha «${celda("fecha")}» no es válida (se espera AAAA-MM-DD o DD/MM/AAAA).`
      )
      continue
    }

    const descripcion = celda("descripcion")
    if (descripcion === "") {
      errores.push(`fila ${numeroDeFila}: la descripción es obligatoria.`)
      continue
    }

    const monto = parsearMonto(celda("monto"))
    if (monto === null) {
      errores.push(`fila ${numeroDeFila}: el monto «${celda("monto")}» no es un número válido.`)
      continue
    }
    if (monto === 0) {
      errores.push(`fila ${numeroDeFila}: el monto no puede ser cero.`)
      continue
    }

    let tipo: TipoMovimientoCartola
    if (conTipo) {
      const valorTipo = normalizarEncabezado(celda("tipo"))
      if (TIPO_CARGO.includes(valorTipo)) tipo = "cargo"
      else if (TIPO_ABONO.includes(valorTipo)) tipo = "abono"
      else {
        errores.push(
          `fila ${numeroDeFila}: el tipo «${celda("tipo")}» no es válido (se espera cargo o abono).`
        )
        continue
      }
    } else {
      tipo = tipoPorSigno(monto)
    }

    // Referencia y contraparte son opcionales: la celda vacía es «no vino el dato»,
    // no una cadena vacía que después haya que distinguir de null.
    const referencia = celda("referencia")
    const contraparte = celda("contraparte")

    filas.push({
      fecha,
      descripcion,
      referencia: referencia === "" ? null : referencia,
      contraparte: contraparte === "" ? null : contraparte,
      monto: Math.abs(monto),
      tipo,
    })
  }

  return { filas, errores }
}

/** Centavos enteros: la comparación de dinero se hace sin floats sueltos. */
function centavosDe(monto: number): number {
  return Math.round(monto * 100)
}

/** Día en milisegundos UTC, o `null` si la fecha no es `AAAA-MM-DD`. */
function tiempoUTC(fecha: string): number | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim())
  if (!partes) return null
  return Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))
}

/** ¿Las dos fechas están a lo sumo a `DIAS_TOLERANCIA_FECHA` días? */
function dentroDeTolerancia(fechaCartola: string, fechaCandidato: string): boolean {
  const desde = tiempoUTC(fechaCartola)
  const hasta = tiempoUTC(fechaCandidato)
  if (desde === null || hasta === null) return false
  return Math.abs(desde - hasta) <= DIAS_TOLERANCIA_FECHA * 86_400_000
}

/**
 * ¿La contraparte del banco nombra a este candidato? Se compara contra la
 * contraparte y la referencia del candidato, ya normalizadas. La contención se
 * acepta sólo desde cuatro caracteres para que un «101» o un «a» no enlacen
 * cualquier cosa.
 */
function coincideContraparte(contraparte: string, candidato: CandidatoConciliacion): boolean {
  const textos = [normalizarTexto(candidato.contraparte), normalizarTexto(candidato.referencia)]
  return textos.some((texto) => {
    if (texto === "") return false
    if (texto === contraparte) return true
    if (texto.length < 4 || contraparte.length < 4) return false
    return texto.includes(contraparte) || contraparte.includes(texto)
  })
}

/**
 * Reglas de enlace, en este orden:
 *
 *   1. REFERENCIA exacta + MONTO exacto (en centavos).
 *   2. CONTRAPARTE (RUT o nombre, normalizados) + MONTO exacto + FECHA dentro de
 *      ±5 días.
 *   3. MONTO exacto con UN único candidato compatible del mismo signo.
 *
 * Si una regla encuentra más de un candidato, el movimiento NO se enlaza: se
 * queda en la cola con el motivo ambiguo. Nunca se elige el primero.
 *
 * El signo manda antes que todo: un `cargo` sólo puede enlazarse con un egreso y
 * un `abono` sólo con un ingreso o con el pago de un cobro.
 */
export function enlazarMovimiento(
  movimiento: MovimientoParaEnlazar,
  candidatos: readonly CandidatoConciliacion[]
): ResultadoEnlace {
  const compatibles = candidatos.filter((candidato) =>
    TIPOS_COMPATIBLES[movimiento.tipo].includes(candidato.tipo)
  )
  if (compatibles.length === 0) {
    return { enlazado: false, motivo: MOTIVOS_DE_ENLACE.sinCandidatos }
  }

  const centavos = centavosDe(movimiento.monto)
  const referencia = normalizarTexto(movimiento.referencia)

  if (referencia !== "") {
    const porReferencia = compatibles.filter(
      (candidato) =>
        centavosDe(candidato.monto) === centavos &&
        normalizarTexto(candidato.referencia) === referencia
    )
    if (porReferencia.length === 1) {
      return {
        enlazado: true,
        candidatoId: porReferencia[0]!.id,
        motivo: MOTIVOS_DE_ENLACE.referenciaMonto,
      }
    }
    if (porReferencia.length > 1) {
      return { enlazado: false, motivo: MOTIVOS_DE_ENLACE.ambiguoReferencia }
    }
  }

  const contraparte = normalizarTexto(movimiento.contraparte)
  if (contraparte !== "") {
    const porContraparte = compatibles.filter(
      (candidato) =>
        centavosDe(candidato.monto) === centavos &&
        dentroDeTolerancia(movimiento.fecha, candidato.fecha) &&
        coincideContraparte(contraparte, candidato)
    )
    if (porContraparte.length === 1) {
      return {
        enlazado: true,
        candidatoId: porContraparte[0]!.id,
        motivo: MOTIVOS_DE_ENLACE.contraparteMontoFecha,
      }
    }
    if (porContraparte.length > 1) {
      return { enlazado: false, motivo: MOTIVOS_DE_ENLACE.ambiguoContraparte }
    }
  }

  const mismoMonto = compatibles.filter((candidato) => centavosDe(candidato.monto) === centavos)
  if (mismoMonto.length === 1) {
    return {
      enlazado: true,
      candidatoId: mismoMonto[0]!.id,
      motivo: MOTIVOS_DE_ENLACE.montoUnico,
    }
  }
  if (mismoMonto.length > 1) {
    return { enlazado: false, motivo: MOTIVOS_DE_ENLACE.ambiguoMonto }
  }
  return { enlazado: false, motivo: MOTIVOS_DE_ENLACE.sinCoincidencia }
}

/** Los tres números que la cartola persiste y que siempre tienen que cerrar. */
export interface ContadoresCartola {
  readonly filas: number
  readonly conciliadas: number
  readonly noConciliadas: number
}

/**
 * Contadores de la cartola a partir del estado de sus movimientos. Estar
 * conciliado incluye haberse resuelto a mano —el movimiento quedó atado a un
 * registro, que es lo que la conciliación significa— y cualquier estado que no
 * sea conciliado cuenta como cola: `filas` es siempre la suma de los dos.
 */
export function contadoresDeCartola(estados: readonly string[]): ContadoresCartola {
  let conciliadas = 0
  for (const estado of estados) {
    if (estado === "conciliado" || estado === "resuelto_manual") conciliadas++
  }
  return {
    filas: estados.length,
    conciliadas,
    noConciliadas: estados.length - conciliadas,
  }
}
