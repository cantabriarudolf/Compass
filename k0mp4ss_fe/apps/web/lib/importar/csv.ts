/**
 * lib/importar/csv.ts — parser CSV propio del importador de carga inicial
 * (ODD carga-inicial-csv, decisión del doc: sin dependencias nuevas; un
 * `.xlsx` se guarda como CSV desde Excel).
 *
 * Contrato:
 *   - comillas dobles con escape `""`, comas y saltos de línea dentro de comillas
 *   - CRLF y LF indistintos, BOM al inicio del archivo
 *   - encabezados normalizados a snake_case sin acentos («Rol SII» → `rol_sii`)
 *   - filas vacías ignoradas (la numeración `linea` es la real del archivo,
 *     con el encabezado en la línea 1)
 *   - con `encabezadosEsperados`, error legible si falta alguno
 *   - separador detectado en la línea de encabezados: coma, punto y coma
 *     (Excel en español guarda con `;`) o tabulación; si no se puede
 *     decidir, error legible que dice cuáles acepta (U2)
 *   - la serialización de las plantillas sigue con coma (estándar: Excel
 *     la abre igual)
 *
 * Es un parser laxo en un solo punto: una comilla en medio de un campo sin
 * abrir comillas se conserva literal (no es un error de archivo para Excel).
 */

export interface FilaCsv {
  /** Línea real del archivo donde empieza la fila (encabezado = línea 1). */
  linea: number
  /** Valores de la fila, indexados por encabezado normalizado. */
  valores: Record<string, string>
}

export interface CsvParseado {
  encabezados: string[]
  filas: FilaCsv[]
}

export interface OpcionesCsv {
  /** Encabezados que el archivo debe traer (ya normalizados). */
  encabezadosEsperados?: readonly string[]
}

/** «Descripción» → `descripcion`, «Rol SII» → `rol_sii`, «Año» → `ano`. */
export function normalizarEncabezado(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
}

/** Separadores que el importador acepta (U2: Excel español guarda con `;`). */
export type SeparadorCsv = "," | ";" | "\t"

/** Texto del error de detección, con la lista explícita de separadores. */
const MENSAJE_SEPARADOR_INDETERMINADO =
  "No se pudo detectar el separador del archivo. Revisiona la línea de " +
  "encabezados: el separador debe ser coma (,), punto y coma (;) o " +
  "tabulación. Si el archivo viene de Excel, usa «Guardar como» CSV."

/**
 * detectarSeparador — elige el separador contando apariciones en la línea de
 * encabezados (fuera de comillas; un separador citado no es delimitador).
 * Gana el más frecuente si es único; en empate o con todo en cero no se puede
 * decidir y se lanza el error legible.
 */
function detectarSeparador(lineaEncabezados: string): SeparadorCsv {
  const conteos = new Map<SeparadorCsv, number>([
    [",", 0],
    [";", 0],
    ["\t", 0],
  ])
  let enComillas = false
  for (const c of lineaEncabezados) {
    if (c === '"') {
      enComillas = !enComillas
    } else if (!enComillas) {
      const actual = conteos.get(c as SeparadorCsv)
      if (actual !== undefined) conteos.set(c as SeparadorCsv, actual + 1)
    }
  }
  let ganador: SeparadorCsv | null = null
  let maximo = 0
  let empate = false
  for (const [sep, n] of conteos) {
    if (n > maximo) {
      maximo = n
      ganador = sep
      empate = false
    } else if (n === maximo && n > 0) {
      empate = true
    }
  }
  if (ganador === null || empate) {
    throw new Error(MENSAJE_SEPARADOR_INDETERMINADO)
  }
  return ganador
}

/** Serializa filas sueltas a CSV (usado por la plantilla descargable). */
export function serializarCsv(filas: string[][]): string {
  const escapar = (valor: string): string =>
    /["\r\n,]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
  return filas.map((fila) => fila.map(escapar).join(",")).join("\r\n")
}

interface FilaCruda {
  linea: number
  celdas: string[]
}

/**
 * parsearCsv — convierte el texto de un archivo CSV en filas nombradas.
 *
 * Lanza `Error` con mensaje en español (para el administrador) si el archivo
 * está vacío o le faltan encabezados esperados.
 */
export function parsearCsv(texto: string, opciones: OpcionesCsv = {}): CsvParseado {
  // BOM de UTF-8: Excel lo escribe al guardar como CSV; si no se quita, el
  // primer encabezado quedaría con un carácter invisible adelante.
  const contenido = texto.startsWith("\ufeff") ? texto.slice(1) : texto

  // El separador se decide con la primera línea (los encabezados): después
  // del BOM y antes de tocar nada más. Un salto de línea dentro de un
  // encabezado citado no cierra la línea acá — cortamos en el primer \r o \n
  // sin profundidad (la detección sólo necesita los delimitadores de nivel
  // superior; los encabezados citados multilínea no son un formato que el
  // importador use).
  const corteEncabezados = (() => {
    let enComillas = false
    for (let i = 0; i < contenido.length; i++) {
      const c = contenido[i]!
      if (c === '"') enComillas = !enComillas
      if (!enComillas && (c === "\r" || c === "\n")) return i
    }
    return contenido.length
  })()
  const separador = detectarSeparador(contenido.slice(0, corteEncabezados))

  const filasCrudas: FilaCruda[] = []
  let celda = ""
  let celdas: string[] = []
  let lineaActual = 1
  let lineaFila = 1
  let enComillas = false

  const cerrarFila = (): void => {
    celdas.push(celda)
    celda = ""
    filasCrudas.push({ linea: lineaFila, celdas })
    celdas = []
  }

  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i]!
    if (enComillas) {
      if (c === '"') {
        if (contenido[i + 1] === '"') {
          celda += '"'
          i++
        } else {
          enComillas = false
        }
      } else if (c === "\r") {
        // CRLF dentro de un campo entre comillas: se normaliza a LF.
        if (contenido[i + 1] === "\n") i++
        celda += "\n"
        lineaActual++
      } else {
        if (c === "\n") lineaActual++
        celda += c
      }
      continue
    }

    if (c === '"') {
      // Comilla solo abre campo entre comillas al inicio del valor; en medio
      // de un campo suelto se conserva literal (parser laxo, ver cabecera).
      if (celda === "") {
        enComillas = true
      } else {
        celda += c
      }
    } else if (c === separador) {
      celdas.push(celda)
      celda = ""
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && contenido[i + 1] === "\n") i++
      cerrarFila()
      lineaActual++
      lineaFila = lineaActual
    } else {
      celda += c
    }
  }
  // Última fila sin salto de línea final.
  if (celda !== "" || celdas.length > 0) cerrarFila()

  if (filasCrudas.length === 0) {
    throw new Error("El archivo está vacío o no tiene encabezados.")
  }

  const encabezados = filasCrudas[0]!.celdas.map(normalizarEncabezado)

  if (opciones.encabezadosEsperados) {
    const faltantes = opciones.encabezadosEsperados.filter(
      (esperado) => !encabezados.includes(esperado)
    )
    if (faltantes.length > 0) {
      throw new Error(
        `El archivo no tiene los encabezados esperados. Faltan: ${faltantes.join(
          ", "
        )}. Encabezados encontrados: ${encabezados.join(", ")}.`
      )
    }
  }

  const filas: FilaCsv[] = []
  for (const { linea, celdas: valoresCrudos } of filasCrudas.slice(1)) {
    if (valoresCrudos.every((v) => v.trim() === "")) continue
    const valores: Record<string, string> = {}
    encabezados.forEach((h, i) => {
      valores[h] = valoresCrudos[i] ?? ""
    })
    filas.push({ linea, valores })
  }

  return { encabezados, filas }
}
