/**
 * @vitest-environment node
 *
 * Borrados con guarda · T5 — el guardián que impide que una baja nazca sin
 * diálogo.
 *
 * `odd/tasks/borrados-con-guarda.md` (L5) decidió exigir la guarda en el punto
 * donde se monta el botón destructivo, a través de una sola pieza
 * (`components/eliminar-con-confirmacion.tsx`). Las pantallas se migraron una
 * por una (T2–T5), pero nada impedía que la próxima naciera con un `remove()`
 * directo. Esto lo impide: recorre `app/` y `components/` —las superficies de
 * UI—, encuentra cada sitio que **de verdad elimina** y exige que su archivo
 * monte la guarda única.
 *
 * Qué cuenta como baja (el universo, con evidencia, no por intuición):
 *   · una llamada a una función de borrado (`remove*`, `borrar*`, `eliminar*`),
 *     que es como los hooks de `lib/api/` exponen la baja. El nombre de la
 *     función se toma del árbol tal como está escrito: los hooks se consumen
 *     tanto por alias (`remove: eliminarElementoApi`) como por el nombre
 *     directo (`remove`), y el guardián no puede adivinar cuál es cuál por el
 *     alias sin repetir el análisis del hook;
 *   · un `fetch` con `method: "DELETE"`.
 * Quedan fuera `removeEventListener`, `removeItem` y `removeChild`: liberan un
 * recurso del navegador, no un registro.
 *
 * No es un análisis semántico: un archivo con una baja detectada tiene que
 * importar la pieza, y esa lista es la que se mantiene. Un archivo que borre
 * por una sintaxis que este guardián no conoce escapa; por eso el universo se
 * **enumera acá** (`SITIOS_DE_BAJA_HOY`) y cualquier cambio en el árbol —una
 * baja nueva, un alias nuevo— obliga a mirar y declarar. Eso es lo que hace
 * visible el agujero en vez de dejarlo silencioso.
 *
 * Las excepciones viven en una lista propia y llevan motivo. No son «archivos
 * que borran sin guarda»: son sitios detectados que **no son bajas de una
 * pantalla**. Hoy son:
 *   · `mis-datos`: el DELETE registra una solicitud ARCO a 30 días; no hay job
 *     que procese la marca y el endpoint no borra (medición T1, L4).
 *   · `reporteria`: el único borrado de la pantalla limpia los informes del
 *     QA-Lab (`id` con prefijo `test-`, sin distribuir). Es limpieza de
 *     artefactos de prueba, no el registro de un usuario: el informe real
 *     distribuido no se ofrece para borrar y nada del dominio lo pide.
 *   · los dos handlers de documento: borran el archivo subido del almacén
 *     cuando la subida falla o se reemplaza. Es limpieza de disco en el
 *     servidor, sin pantalla ni registro de dominio que perder.
 *
 * Medido y **fuera del detector** (no son bajas y no hace falta declararlos):
 * `app/admin/gestion/presupuestos/_componentes/presupuestos.tsx:881`
 * (`quitarFila` filtra el estado local del formulario) y
 * `app/comunidad/portal/page.tsx:558` (saca una imagen del formulario local):
 * los dos usan `filter`, no una llamada de borrado. `admin/mis-datos:211`
 * tampoco borra, aunque su `fetch` DELETE sí entra y por eso está declarado.
 *
 * Si el guardián falla, la salida no es citar la guarda en un comentario:
 *   · montar `EliminarConConfirmacion` en el archivo que tiene la baja, o
 *   · si el sitio detectado no es una baja, declararlo acá con su motivo.
 */
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

// ─────────────────────────────────────────────────────────────────────────────
// 1 · El barrido: las superficies de UI y lo que cuenta como baja
// ─────────────────────────────────────────────────────────────────────────────

/** `apps/web` — este archivo vive en `test/`. */
const APP_DIR = path.resolve(__dirname, "..")

/** Sólo UI: una ruta de `app/api/` es un endpoint, no un punto de montaje. */
const RAIZES = [path.join(APP_DIR, "app"), path.join(APP_DIR, "components")]

const EXTENSIONES = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const ES_PRUEBA = /\.(?:test|spec)\.[^./\\]+$/
const CARPETAS_IGNORADAS = new Set(["node_modules", ".next", "coverage", "dist"])

/** La guarda única. Sin esta importación no hay diálogo. */
const LA_GUARDA = "@/components/eliminar-con-confirmacion"
/** El diálogo crudo: sólo lo monta la pieza, ninguna pantalla. */
const EL_DIALOGO_CRUDO = "@/components/confirmar-eliminacion"
/** La pieza que envuelve el diálogo: el único archivo que puede importarlo. */
const LA_PIEZA = "components/eliminar-con-confirmacion.tsx"

/**
 * Llamada a una función de borrado. El lookbehind deja pasar `.remove(` (una
 * colección también puede borrar así) pero no `onEliminar` ni
 * `enlace.removeEventListener`.
 */
const LLAMADA_DE_BAJA = /(?<![\w$])((?:remove|eliminar|borrar)[A-Za-z0-9_]*)\s*\(/g

/** Liberan un recurso del navegador, no un registro de la base. */
const NO_ES_BAJA = new Set(["removeEventListener", "removeItem", "removeChild"])

/** Borrado por HTTP directo, sin pasar por un hook. */
const FETCH_DELETE = /fetch\s*\([\s\S]{0,400}?method:\s*["']DELETE["']/g

const CAMBIOS_DE_METODO = '"DELETE"'


interface SitioDeBaja {
  /** Nombre de la función de borrado llamada, en el orden del archivo. */
  readonly llamadas: readonly string[]
  /** Línea de cada llamada (1-indexed), para que el fallo se pueda abrir. */
  readonly lineas: readonly number[]
}

function archivosDe(): readonly string[] {
  const encontrados: string[] = []
  const visitar = (directorio: string): void => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      if (CARPETAS_IGNORADAS.has(entrada.name)) continue
      const ruta = path.join(directorio, entrada.name)
      if (entrada.isDirectory()) visitar(ruta)
      else if (EXTENSIONES.test(entrada.name) && !ES_PRUEBA.test(entrada.name)) {
        encontrados.push(ruta)
      }
    }
  }
  for (const raiz of RAIZES) visitar(raiz)
  return encontrados
}

/**
 * Descarta comentarios —de línea y de bloque— conservando el código y las
 * cadenas, igual que `claves-con-consumidor.test.ts`. Sin esto, una baja
 * **citada** en la prosa contaría como una baja real y el guardián pediría una
 * guarda para un comentario.
 */
function quitarComentarios(fuente: string): string {
  const salida: string[] = []
  let estado: "codigo" | "linea" | "bloque" | "cadena" = "codigo"
  let comilla = ""
  let indice = 0
  while (indice < fuente.length) {
    const caracter = fuente[indice] as string
    const siguiente = fuente[indice + 1]
    if (estado === "linea") {
      if (caracter === "\n") {
        estado = "codigo"
        salida.push(caracter)
      }
      indice += 1
      continue
    }
    if (estado === "bloque") {
      if (caracter === "*" && siguiente === "/") {
        estado = "codigo"
        indice += 2
        salida.push(" ")
        continue
      }
      if (caracter === "\n") salida.push(caracter)
      indice += 1
      continue
    }
    if (estado === "cadena") {
      salida.push(caracter)
      if (caracter === "\\") {
        const escapado = fuente[indice + 1]
        if (escapado !== undefined) {
          salida.push(escapado)
          indice += 2
          continue
        }
      }
      if (caracter === comilla) estado = "codigo"
      indice += 1
      continue
    }
    if (caracter === "/" && siguiente === "/") {
      estado = "linea"
      indice += 2
      continue
    }
    if (caracter === "/" && siguiente === "*") {
      estado = "bloque"
      indice += 2
      continue
    }
    // El apóstrofo de «don't» en texto JSX no abre cadena.
    const anterior = indice === 0 ? "" : (fuente[indice - 1] as string)
    const esComilla =
      caracter === '"' ||
      caracter === "`" ||
      (caracter === "'" && !/[A-Za-z0-9_]/.test(anterior))
    if (esComilla) {
      estado = "cadena"
      comilla = caracter
      salida.push(caracter)
      indice += 1
      continue
    }
    salida.push(caracter)
    indice += 1
  }
  return salida.join("")
}

function lineaDe(fuente: string, indice: number): number {
  return fuente.slice(0, indice).split("\n").length
}

/** Los sitios de baja de un archivo, leídos del código sin comentarios. */
function sitiosDeBaja(fuente: string): SitioDeBaja {
  const codigo = quitarComentarios(fuente)
  const llamadas: string[] = []
  const lineas: number[] = []
  for (const coincidencia of codigo.matchAll(LLAMADA_DE_BAJA)) {
    const nombre = coincidencia[1]
    if (nombre === undefined || NO_ES_BAJA.has(nombre)) continue
    llamadas.push(nombre)
    lineas.push(lineaDe(codigo, coincidencia.index ?? 0))
  }
  for (const coincidencia of codigo.matchAll(FETCH_DELETE)) {
    llamadas.push(CAMBIOS_DE_METODO)
    lineas.push(lineaDe(codigo, coincidencia.index ?? 0))
  }
  return { llamadas, lineas }
}

/** Ruta relativa a `apps/web`, estable entre sistemas operativos. */
function relativa(archivo: string): string {
  return path.relative(APP_DIR, archivo).split(path.sep).join("/")
}

const ARCHIVOS = archivosDe()
const BAJAS_POR_ARCHIVO = new Map<string, SitioDeBaja>()
for (const archivo of ARCHIVOS) {
  const sitio = sitiosDeBaja(readFileSync(archivo, "utf8"))
  if (sitio.llamadas.length > 0) BAJAS_POR_ARCHIVO.set(relativa(archivo), sitio)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · El universo declarado: lo que el árbol tiene hoy, escrito acá
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las bajas que el árbol tiene hoy, por archivo y en el orden en que aparecen.
 * No es una lista de excepciones: es el censo contra el que se compara el
 * barrido. Si una pantalla gana una baja nueva —o un archivo nuevo aparece—,
 * esto falla y obliga a decidir si lleva guarda (la regla de abajo) en vez de
 * dejarla pasar.
 */
const SITIOS_DE_BAJA_HOY: Readonly<Record<string, readonly string[]>> = {
  // Administración
  "app/admin/maestros/page.tsx": ["borrarRegistro"],
  "app/admin/mantenciones/panel-mantenciones.tsx": ["eliminarMantencion"],
  "app/admin/mis-datos/page.tsx": [CAMBIOS_DE_METODO],
  "app/admin/reporteria/page.tsx": ["remove"],

  // Handlers HTTP (excepciones declaradas abajo: no montan UI)
  "app/api/acuerdos/[id]/documento/route.ts": [
    "borrarElArchivoSubido",
    "borrarElArchivoSubido",
    "borrarElArchivoSubido",
    "borrarArchivoPrivado",
  ],
  "app/api/convenios/documento/route.ts": [
    "borrarElArchivoSubido",
    "borrarElArchivoSubido",
    "borrarElArchivoSubido",
    "borrarArchivoPrivado",
  ],

  // Comunidad
  "app/comunidad/archivo/consola-archivo.tsx": ["remove", "borrar"],
  "app/comunidad/certificados/_componentes/certificados-emision.tsx": [
    "removeCertificadoApi",
    "remove",
    "removeCertificadoApi",
  ],
  "app/comunidad/comunicacion/consola-comunicacion.tsx": ["eliminarPlantillaApi"],
  "app/comunidad/directiva/page.tsx": ["eliminarActa"],
  "app/comunidad/personas/[id]/page.tsx": ["removeVinculoApi", "eliminarVinculo"],
  "app/comunidad/portal/page.tsx": ["eliminarPublicacion"],
  "app/comunidad/visor/page.tsx": ["eliminarAvisoApi", "eliminarAviso"],

  // Finanzas
  "app/finanzas/gastos-comunes/page.tsx": [
    "eliminarFondo",
    "eliminarEgreso",
    "eliminarIngreso",
    "eliminarFondoClick",
    "eliminarEgresoClick",
    "eliminarIngresoClick",
  ],
  "app/finanzas/multas/page.tsx": ["eliminarTipoApi"],
  "app/finanzas/remuneraciones/page.tsx": ["removeApi", "eliminar"],

  // Inventario, operaciones y personas
  "app/inventario/proyectos/page.tsx": ["eliminarProyecto"],
  "app/operaciones/reservas/page.tsx": ["eliminarElementoApi"],
  "app/personas/personal/page.tsx": ["eliminarFeriadoApi"],

  // Paneles PE (T2)
  "components/pe/contratistas-panel.tsx": ["eliminarIngresoApi"],
  "components/pe/encomiendas-panel.tsx": ["eliminarEncomiendaApi"],
  "components/pe/proveedores-panel.tsx": ["eliminarProveedorApi"],
  "components/pe/visitas-panel.tsx": ["eliminarVisitaApi"],
}

/**
 * Sitios detectados que **no son bajas de una pantalla**, con su motivo. Si una
 * excepción deja de ser cierta, el caso de abajo falla y hay que sacarla.
 */
const EXCEPCIONES: readonly { readonly archivo: string; readonly motivo: string }[] = [
  {
    archivo: "app/admin/mis-datos/page.tsx",
    motivo:
      "no borra: el DELETE registra una solicitud ARCO a 30 días y no hay job que procese la marca (medición T1, L4)",
  },
  {
    archivo: "app/admin/reporteria/page.tsx",
    motivo:
      "no es la baja de un usuario: el único borrado de la pantalla limpia los informes del QA-Lab (`id` con prefijo `test-`) y sólo se ofrece si no se distribuyeron; el informe real no se borra desde acá",
  },
  {
    archivo: "app/api/acuerdos/[id]/documento/route.ts",
    motivo:
      "handler HTTP: borra del almacén el archivo subido cuando la subida falla o se reemplaza; no es una baja de registro ni monta una pantalla",
  },
  {
    archivo: "app/api/convenios/documento/route.ts",
    motivo:
      "handler HTTP: borra del almacén el archivo subido cuando la subida falla o se reemplaza; no es una baja de registro ni monta una pantalla",
  },
]

const EXCEPCIONES_POR_ARCHIVO = new Set(EXCEPCIONES.map((e) => e.archivo))

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Las reglas
// ─────────────────────────────────────────────────────────────────────────────

function fuenteDe(archivo: string): string {
  return readFileSync(path.join(APP_DIR, archivo), "utf8")
}

describe("el universo de bajas es el declarado", () => {
  it("cada sitio del árbol está en el censo y el censo no tiene sitios muertos", () => {
    const enElArbol = [...BAJAS_POR_ARCHIVO.entries()]
      .map(([archivo, sitio]) => `${archivo} → ${sitio.llamadas.join(", ")}`)
      .sort()
    const declarados = Object.entries(SITIOS_DE_BAJA_HOY)
      .map(([archivo, llamadas]) => `${archivo} → ${llamadas.join(", ")}`)
      .sort()

    expect(enElArbol).toEqual(declarados)
  })

  it("cada excepción declarada sigue siendo un sitio detectado", () => {
    const huerfanas = EXCEPCIONES.filter(
      (excepcion) => !BAJAS_POR_ARCHIVO.has(excepcion.archivo)
    ).map((excepcion) => excepcion.archivo)

    expect(huerfanas).toEqual([])
  })
})

describe("todo archivo con una baja monta la guarda única", () => {
  it("la importa de `@/components/eliminar-con-confirmacion` y no el diálogo crudo", () => {
    const sinGuarda = [...BAJAS_POR_ARCHIVO.entries()]
      .filter(([archivo]) => !EXCEPCIONES_POR_ARCHIVO.has(archivo))
      .filter(([archivo]) => {
        const fuente = fuenteDe(archivo)
        return !fuente.includes(LA_GUARDA) || !fuente.includes("<EliminarConConfirmacion")
      })
      .map(
        ([archivo, sitio]) =>
          `${archivo} (${sitio.lineas.join(", ")}): ${sitio.llamadas.join(", ")}`
      )

    expect(sinGuarda).toEqual([])
  })

  it("ningún archivo con baja monta `ConfirmarEliminacion` por su cuenta", () => {
    const crudos = [...BAJAS_POR_ARCHIVO.keys()]
      .filter((archivo) => fuenteDe(archivo).includes(EL_DIALOGO_CRUDO))
      .sort()

    expect(crudos).toEqual([])
  })

  it("el diálogo crudo sólo se monta desde la pieza", () => {
    const montajes = ARCHIVOS.map(relativa)
      .filter((archivo) => fuenteDe(archivo).includes(EL_DIALOGO_CRUDO))
      .sort()

    expect(montajes).toEqual([LA_PIEZA])
  })
})
