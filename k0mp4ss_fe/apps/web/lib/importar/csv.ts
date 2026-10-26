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
    } else if (c === ",") {
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
