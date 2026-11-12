/**
 * @vitest-environment node
 *
 * Serie «Permisos por objeto» · T12 — el guardián de los mensajes de error.
 *
 * L14/L15 dejaron anotada la clase de defecto que ningún otro guardián mira: el
 * 409 del gate de saldo de certificados llevaba **el monto pendiente de otra
 * unidad dentro del texto del error**. Nadie lo lee como fuga porque no es un 200
 * con datos: es un error, y el error lo lee el que pide. Un mensaje que interpola
 * un dato de una fila es una respuesta con datos, con otro código de estado.
 *
 * Este archivo recorre `app/api/**` y `lib/api/**`, encuentra **todo mensaje de
 * error que interpole un valor** —`jsonError(status, …)` con template literal y las
 * propiedades `error`/`mensaje`/`message`/`detalle`— y exige que cada uno esté
 * declarado con su clase y su motivo. Un mensaje nuevo sin declarar rompe; una
 * declaración sin sitio también.
 *
 * Las tres clases que admite la declaración son las tres formas en que un mensaje
 * con datos puede ser correcto:
 *
 *   · `no-fila`  — lo interpolado NO es dato de una fila: un valor del cuerpo del
 *                  request, una constante, un contador de un conjunto propio.
 *   · `admin`    — lo interpolado sí es dato de una fila, pero la ruta exige una
 *                  clave de administración de la comunidad: quien llega ya ve
 *                  todas las filas de esa comunidad en su pantalla.
 *   · `alcance`  — lo interpolado sí es dato de una fila, y la fila se resolvió
 *                  acotada al que pide (where con `comunidadId`, alcance por
 *                  unidad/persona) o la compuerta de ajeneidad corrió antes.
 *
 * No existe clase «excepción»: un mensaje que filtra la fila de un tercero no se
 * puede declarar. Es el mismo criterio que el guardián del inventario (T5): la
 * deuda no se disfraza de exención.
 *
 * Qué se verifica mecánicamente y qué no:
 *   · SÍ: que no haya mensajes sin declarar, que no haya declaraciones huérfanas
 *     y que el token de compuerta que la declaración nombra **siga existiendo** en
 *     el archivo que corresponde. Si alguien borra `fi:gasto_comun` de una ruta
 *     cuyo mensaje interpola el nombre de un fondo, este guardián lo dice.
 *   · NO: que la compuerta sea suficiente. Eso lo lee un humano en el `motivo`,
 *     que por eso es obligatorio y nombra el `path` que lo sostiene.
 *
 * No toca base, ni sesión, ni fixtures: lee el filesystem y compara listas.
 */
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/** `apps/web` — este archivo vive en `test/api/`. */
const APP_DIR = path.resolve(__dirname, "../..")
const RAICES = ["app/api", "lib/api"] as const

type Declaracion =
  | {
      readonly archivo: string
      readonly mensaje: string
      readonly clase: "no-fila"
      readonly motivo: string
    }
  | {
      readonly archivo: string
      readonly mensaje: string
      readonly clase: "admin" | "alcance"
      /** Token que debe seguir en el archivo: la clave de permiso o el helper de alcance. */
      readonly compuerta: string
      /** Archivo donde vive la compuerta, cuando el mensaje se arma en un helper puro. */
      readonly enArchivo?: string
      readonly motivo: string
    }
  | {
      readonly archivo: string
      readonly mensaje: string
      // El segundo argumento de `jsonError` no es un literal: el texto lo redacta un
      // helper de `lib/**` y la ruta sólo lo reenvía con su status. `origen` nombra
      // la raíz donde se redacta, y sus mensajes con interpolación tienen que estar
      // declarados acá también (regla de productores).
      readonly clase: "indirecto"
      readonly origen: "lib/**"
      readonly motivo: string
    }

/** Un sitio detectado en el código: archivo, línea del mensaje y expresión interpolada. */
interface Sitio {
  readonly archivo: string
  readonly linea: number
  readonly mensaje: string
}

/**
 * Forma canónica de un mensaje: colapsa espacios (un template literal puede ocupar
 * tres líneas) y reemplaza cada interpolación por `${}`, así la clave no depende de
 * la línea ni del nombre de la variable. Si cambia el texto o cambia lo que se
 * interpola, deja de coincidir y hay que volver a declararlo.
 */
function normalizar(mensaje: string): string {
  return mensaje
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\$\{[^}]*(\}[^}]*)*\}/g, "${}")
}

/** Recorre las raíces dadas y entrega cada `.ts` (sin tests) con su ruta relativa a `apps/web`. */
function recorrerArchivos(
  raices: readonly string[],
  alLeer: (archivo: string, completo: string) => void
): void {
  const recorrer = (dir: string): void => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name)
      if (entrada.isDirectory()) recorrer(completo)
      else if (/\.ts$/.test(entrada.name) && !/\.test\.ts$/.test(entrada.name)) {
        alLeer(path.relative(APP_DIR, completo), completo)
      }
    }
  }
  for (const raiz of raices) recorrer(path.join(APP_DIR, raiz))
}

/**
 * Recorre las dos raíces y devuelve cada mensaje de error que interpola algo.
 *
 * Se usa el parser de TypeScript y no regex porque el repo tiene mensajes de tres
 * líneas con interpolaciones anidadas dentro de un objeto: un regex los corta por
 * la mitad, y un guardián que se pierde sitios no guarda nada.
 */
function recolectar(raices: readonly string[] = RAICES): Sitio[] {
  const sitios: Sitio[] = []
  recorrerArchivos(raices, (archivo, completo: string) => {
    const fuente = readFileSync(completo, "utf8")
    const sf = ts.createSourceFile(archivo, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const linea = (pos: number): number => sf.getLineAndCharacterOfPosition(pos).line + 1
    const registrar = (nodo: ts.Node, mensajeNodo: ts.Node): void => {
      sitios.push({
        archivo,
        linea: linea(nodo.getStart()),
        mensaje: normalizar(mensajeNodo.getText(sf)),
      })
    }
    const visitar = (nodo: ts.Node): void => {
      // jsonError(status, `…`) — el mensaje es el segundo argumento.
      if (
        ts.isCallExpression(nodo) &&
        ts.isIdentifier(nodo.expression) &&
        nodo.expression.text === "jsonError"
      ) {
        const arg = nodo.arguments[1]
        if (arg && ts.isTemplateExpression(arg)) registrar(nodo, arg)
      }
      // { error: `…` } y sus sinónimos: cubre Response.json y los extras de jsonError.
      if (
        ts.isPropertyAssignment(nodo) &&
        ts.isIdentifier(nodo.name) &&
        ["error", "mensaje", "message", "detalle"].includes(nodo.name.text) &&
        ts.isTemplateExpression(nodo.initializer) &&
        // En `lib/**` sólo interesan los que INTERPOLAN: los catálogos de mensajes
        // fijos (`MENSAJE_LEGAL_INMUTABLE`) son un literal con nombre, no una fila.
        (RAICES.some((r) => archivo.startsWith(r)) || nodo.initializer.templateSpans.length > 0)
      ) {
        registrar(nodo, nodo.initializer)
      }
      // `new RechazoIR(\`…\`)` / `throw new Error(\`…\`)`: el mensaje viaja como
      // excepción y una ruta lo reenvía con `e.message`. También es texto del cliente.
      if (ts.isNewExpression(nodo) && /Error$|^Rechazo/.test(nodo.expression.getText(sf))) {
        const arg = nodo.arguments?.[0]
        if (arg && ts.isTemplateExpression(arg) && arg.templateSpans.length > 0) {
          registrar(nodo, arg)
        }
      }
      ts.forEachChild(nodo, visitar)
    }
    visitar(sf)
  })
  return sitios
}

/**
 * Mensajes que la ruta **reenvía**: `jsonError(status, e.message)`, `resultado.error`,
 * un `MENSAJE_*` con nombre, el mensaje de un zod... El guardián no puede saber qué
 * dice adentro (lo redacta otro módulo), así que exige declararlo con `indirecto` y
 * revisa el módulo que lo redacta (regla de productores, abajo).
 */
function recolectarIndirectos(raices: readonly string[] = RAICES): Sitio[] {
  const sitios: Sitio[] = []
  recorrerArchivos(raices, (archivo, completo: string) => {
    const fuente = readFileSync(completo, "utf8")
    const sf = ts.createSourceFile(archivo, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const visitar = (nodo: ts.Node): void => {
      if (
        ts.isCallExpression(nodo) &&
        ts.isIdentifier(nodo.expression) &&
        nodo.expression.text === "jsonError"
      ) {
        const arg = nodo.arguments[1]
        if (arg && !ts.isStringLiteral(arg) && !ts.isTemplateExpression(arg)) {
          sitios.push({
            archivo,
            linea: sf.getLineAndCharacterOfPosition(nodo.getStart()).line + 1,
            mensaje: normalizar(arg.getText(sf)),
          })
        }
      }
      ts.forEachChild(nodo, visitar)
    }
    visitar(sf)
  })
  return sitios
}

/**
 * Mensajes que se redactan en `lib/**` y pueden terminar en el cuerpo de un error
 * reenviado. Sólo los que interpolan: un mensaje fijo no puede describir una fila.
 */
function recolectarProductores(): Sitio[] {
  const sitios: Sitio[] = []
  recorrerArchivos(["lib"], (archivo, completo: string) => {
    const fuente = readFileSync(completo, "utf8")
    const sf = ts.createSourceFile(archivo, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const visitar = (nodo: ts.Node): void => {
      if (
        ts.isPropertyAssignment(nodo) &&
        ts.isIdentifier(nodo.name) &&
        ["error", "mensaje", "message", "detalle"].includes(nodo.name.text) &&
        ts.isTemplateExpression(nodo.initializer) &&
        nodo.initializer.templateSpans.length > 0
      ) {
        sitios.push({
          archivo,
          linea: sf.getLineAndCharacterOfPosition(nodo.getStart()).line + 1,
          mensaje: normalizar(nodo.initializer.getText(sf)),
        })
      }
      ts.forEachChild(nodo, visitar)
    }
    visitar(sf)
  })
  return sitios
}

/**
 * El barrido se paga UNA vez por proceso. Antes cada caso re-escaneaba el árbol y
 * el primero se pasaba de los 5 s por defecto cuando la suite entera corría en
 * paralelo: un guardián que se cae por reloj no está guardando nada.
 */
let cacheVigilados: Sitio[] | undefined
function sitiosVigilados(): Sitio[] {
  cacheVigilados ??= recolectarTodo()
  return cacheVigilados
}

let cacheRaiz: Sitio[] | undefined
function sitiosDeRaiz(): Sitio[] {
  cacheRaiz ??= recolectar()
  return cacheRaiz
}

/**
 * Todos los sitios que el guardián vigila, sin duplicados: lo que la ruta escribe, lo
 * que la ruta reenvía y lo que se redacta en `lib/**` (con interpolación). `lib/api`
 * pertenece a las dos raíces y a `lib`, así que se deduplica por clave.
 */
function recolectarTodo(): Sitio[] {
  const unicos = new Map<string, Sitio>()
  for (const sitio of [
    ...recolectar(),
    ...recolectarIndirectos(),
    ...recolectarProductores(),
  ]) {
    unicos.set(clave(sitio), sitio)
  }
  return [...unicos.values()]
}

const clave = (s: { archivo: string; mensaje: string }): string =>
  `${s.archivo}\u0000${s.mensaje}`

/**
 * Inventario auditado el 2026-11-07 sobre los 243 archivos de `app/api` + `lib/api`:
 * 54 mensajes con interpolación. Dos (`mt/proyectos`) eran fuga —nombre y saldo del
 * fondo FI servidos a mantención, que no tiene ninguna clave `fi`— y se corrigieron
 * en la misma unidad; los otros 52 están acá con su clase y su motivo.
 *
 * Agrupado por recurso, en el orden en que los devuelve el recorrido.
 */
const DECLARACIONES: readonly Declaracion[] = [
  // ── app/api/vigencia-registro ─────────────────────────────────
  {
    archivo: "app/api/vigencia-registro/multa/route.ts",
    mensaje: "resultadoPropuesta.motivo",
    clase: "no-fila",
    motivo:
      "el motivo lo produce la regla pura (`propuestaDeMultaPermitida`) sobre el estado de la propia unidad del scope y el monto declarado de la comunidad: no lee ni revela una fila ajena.",
  },
  // ── app/api/actas-gd ──────────────────────────────────────────
  {
    archivo: "app/api/actas-gd/route.ts",
    mensaje:
      "`No se puede guardar el acta: el asistente \"${}\" no existe en el Maestro de Personas.`",
    clase: "no-fila",
    motivo:
      "el id sale del cuerpo del acta: el mensaje dice cuál id no existe, no lee ninguna fila.",
  },
  {
    archivo: "app/api/actas-gd/route.ts",
    mensaje:
      "`No se puede guardar el acta: ${} no es miembro vigente de la directiva.`",
    clase: "admin",
    compuerta: "gd",
    motivo:
      "la persona se busca con `comunidadId` en el where y el POST exige `gd` crear/editar: quien llega ya ve el maestro de su comunidad.",
  },

  // ── app/api/auditoria ─────────────────────────────────────────
  {
    archivo: "app/api/auditoria/sync/route.ts",
    mensaje:
      "`Batch demasiado grande: máximo ${} eventos`",
    clase: "no-fila",
    motivo:
      "`MAX_BATCH` es una constante del módulo.",
  },

  // ── app/api/avisos-cobro ──────────────────────────────────────
  {
    archivo: "app/api/avisos-cobro/[id]/entrega/route.ts",
    mensaje:
      "`La unidad ${} no se puede entregar sin destinatario y no se registra una entrega en el vacío.`",
    clase: "admin",
    compuerta: "fi:gasto_comun",
    motivo:
      "registrar la entrega exige `fi:gasto_comun` crear (sólo administración); aviso y unidad se resuelven con `comunidadId`.",
  },
  {
    archivo: "app/api/avisos-cobro/[id]/route.ts",
    mensaje:
      "`El aviso ${} no se puede eliminar: es el documento con el que se cobra y la ley no permite retirarlo una vez emitido. La corrección de un aviso equivocado se emite como documento posterior.`",
    clase: "admin",
    compuerta: "fi:gasto_comun",
    motivo:
      "el folio y el período salen sólo después de `fi:gasto_comun` eliminar y del 404 cross-comunidad de la factory.",
  },
  {
    archivo: "app/api/avisos-cobro/route.ts",
    mensaje:
      "`No se puede emitir el aviso: el período ${} no tiene emisión de gasto común.`",
    clase: "no-fila",
    motivo:
      "el período es del cuerpo del request.",
  },
  {
    archivo: "app/api/avisos-cobro/route.ts",
    mensaje:
      "`La unidad ${}: un aviso no cobra un período sin cargo.`",
    clase: "alcance",
    compuerta: "comunidadId",
    motivo:
      "la unidad se resuelve con `findFirst` acotado por `comunidadId` antes de nombrarla.",
  },
  {
    archivo: "app/api/avisos-cobro/route.ts",
    mensaje:
      "`El período ${} no tiene unidades con cobro: no hay aviso que emitir.`",
    clase: "no-fila",
    motivo:
      "el período es del cuerpo del request.",
  },
  {
    archivo: "app/api/avisos-cobro/route.ts",
    mensaje:
      "`El período ${}): un aviso emitido no se reemplaza.`",
    clase: "admin",
    compuerta: "fi:gasto_comun",
    motivo:
      "los folios son avisos ya emitidos de la propia comunidad, y emitir exige `fi:gasto_comun` crear.",
  },
  {
    archivo: "app/api/avisos-cobro/route.ts",
    mensaje:
      "`El período ${}): un aviso emitido no se reemplaza.`",
    clase: "admin",
    compuerta: "fi:gasto_comun",
    motivo:
      "el folio en conflicto se lee dentro de la transacción con `comunidadId`; la ruta exige `fi:gasto_comun` crear.",
  },

  // ── app/api/certificados-ct ───────────────────────────────────
  {
    archivo: "app/api/certificados-ct/route.ts",
    mensaje:
      "`No se puede emitir: la unidad mantiene $${} pendiente(s). El certificado Al Día exige saldo <= 0.`",
    clase: "alcance",
    compuerta: "rechazoDeEmisionAjena",
    motivo:
      "`rechazoDeEmisionAjena` corre ANTES del gate de saldo: cuando el mensaje se arma, la unidad ya es la propia (hallazgo L14).",
  },

  // ── app/api/controles-propiedad ───────────────────────────────
  {
    archivo: "app/api/controles-propiedad/route.ts",
    mensaje:
      "`La unidad ya tiene controles registrados (${}).`",
    clase: "admin",
    compuerta: "ad",
    motivo:
      "el id del duplicado es de la propia comunidad y el alta exige `ad` crear (administración y comité).",
  },

  // ── app/api/cv ────────────────────────────────────────────────
  {
    archivo: "app/api/cv/actas/route.ts",
    mensaje:
      "`Solo un acta publicada por quórum puede difundirse en el visor (estado actual: ${}).`",
    clase: "admin",
    compuerta: "cv",
    motivo:
      "el estado del acta es de un acta con `comunidadId` verificado; difundir exige `cv` crear.",
  },

  // ── app/api/documentos ────────────────────────────────────────
  {
    archivo: "app/api/documentos/[id]/envio/route.ts",
    mensaje:
      "`El documento no se puede entregar a personas que no pertenecen a esta comunidad: ${}.`",
    clase: "no-fila",
    motivo:
      "`faltantes` son los ids del cuerpo que no pertenecen a la comunidad: no son datos de una fila leída.",
  },

  // ── app/api/egresos-fi ────────────────────────────────────────
  {
    archivo: "app/api/egresos-fi/route.ts",
    mensaje:
      "`No se puede guardar el gasto: el fondo \"${}\" está inactivo.`",
    clase: "admin",
    compuerta: "fi",
    motivo:
      "el fondo se resuelve con `comunidadId` y la ruta exige `fi` crear/editar (sólo administración).",
  },

  // ── app/api/emisiones-gc ──────────────────────────────────────
  {
    archivo: "app/api/emisiones-gc/[id]/route.ts",
    mensaje:
      "`No se puede eliminar la emisión: ${} cobro(s) tienen pagos registrados.`",
    clase: "admin",
    compuerta: "fi",
    motivo:
      "el contador se calcula con `comunidadId` y eliminar exige `fi` eliminar.",
  },
  {
    archivo: "app/api/emisiones-gc/route.ts",
    mensaje:
      "`El periodo ${} ya fue procesado previamente.`",
    clase: "no-fila",
    motivo:
      "el período es del cuerpo; el mensaje no agrega ningún dato de la emisión previa.",
  },
  {
    archivo: "app/api/emisiones-gc/route.ts",
    mensaje:
      "`Emisión bloqueada: ${} unidad(es) sin responsable de cobro asignado.`",
    clase: "no-fila",
    motivo:
      "cuenta de un conjunto propio que el handler ya recorre; no nombra ninguna unidad.",
  },

  // ── app/api/fi ────────────────────────────────────────────────
  {
    archivo: "app/api/fi/sync/route.ts",
    mensaje:
      "`Batch demasiado grande: máximo ${} elementos`",
    clase: "no-fila",
    motivo:
      "`MAX_BATCH` es una constante del módulo.",
  },

  // ── app/api/fondos-fi ─────────────────────────────────────────
  {
    archivo: "app/api/fondos-fi/[id]/retirar/route.ts",
    mensaje:
      "`No se puede retirar: el fondo \"${}\" está inactivo.`",
    clase: "admin",
    compuerta: "fi",
    motivo:
      "la ruta exige `fi` editar (sólo administración) y el fondo es de la propia comunidad.",
  },
  {
    archivo: "app/api/fondos-fi/[id]/retirar/route.ts",
    mensaje:
      "`Saldo insuficiente en \"${}.`",
    clase: "admin",
    compuerta: "fi",
    motivo:
      "saldo de la propia comunidad bajo gate `fi` editar: quien lo lee ya ve el fondo en Finanzas.",
  },
  {
    archivo: "app/api/fondos-fi/[id]/route.ts",
    mensaje:
      "`Ya existe un fondo con el nombre \"${}\".`",
    clase: "no-fila",
    motivo:
      "el nombre es del cuerpo del request que choca con el existente.",
  },
  {
    archivo: "app/api/fondos-fi/route.ts",
    mensaje:
      "`No se puede eliminar el fondo: ${} movimiento(s) financiero(s) lo imputan.`",
    clase: "admin",
    compuerta: "fi",
    motivo:
      "el contador se calcula con `comunidadId` y eliminar exige `fi` eliminar.",
  },
  {
    archivo: "app/api/fondos-fi/route.ts",
    mensaje:
      "`Ya existe un fondo con el nombre \"${}\".`",
    clase: "no-fila",
    motivo:
      "el nombre es del cuerpo del request que choca con el existente.",
  },

  // ── app/api/ingresos-fi ───────────────────────────────────────
  {
    archivo: "app/api/ingresos-fi/route.ts",
    mensaje:
      "`No se puede registrar el ingreso: el fondo \"${}\" está inactivo.`",
    clase: "admin",
    compuerta: "fi",
    motivo:
      "el fondo se resuelve con `comunidadId` y la ruta exige `fi` crear/editar.",
  },

  // ── app/api/liquidaciones ─────────────────────────────────────
  {
    archivo: "app/api/liquidaciones/adelantos/_calculo.ts",
    mensaje:
      "`El préstamo de ${}): regístralo como anticipo regular o difiere el excedente a otro período.`",
    clase: "admin",
    compuerta: "pl:adelantos",
    enArchivo: "app/api/liquidaciones/adelantos/route.ts",
    motivo:
      "función pura del cálculo: la compuerta vive en el caller, que exige `pl:adelantos` crear (sólo administración).",
  },
  {
    archivo: "app/api/liquidaciones/adelantos/_calculo.ts",
    mensaje:
      "`Las deducciones del período (${}) — art. 58 inc. 4.`",
    clase: "admin",
    compuerta: "pl:adelantos",
    enArchivo: "app/api/liquidaciones/adelantos/route.ts",
    motivo:
      "función pura del cálculo: la compuerta vive en el caller, que exige `pl:adelantos` crear (sólo administración).",
  },
  {
    archivo: "app/api/liquidaciones/route.ts",
    mensaje:
      "`Ya existe una liquidación ${} para este trabajador.`",
    clase: "no-fila",
    motivo:
      "el período es del cuerpo del request.",
  },

  // ── app/api/macro-sectores ────────────────────────────────────
  {
    archivo: "app/api/macro-sectores/route.ts",
    mensaje:
      "`No se puede eliminar el macro sector: ${} sub-sector(es) asociado(s).`",
    clase: "admin",
    compuerta: "mp",
    motivo:
      "el contador se calcula con `comunidadId` y eliminar exige `mp` eliminar.",
  },

  // ── app/api/maestros ──────────────────────────────────────────
  {
    archivo: "app/api/maestros/[tipo]/route.ts",
    mensaje:
      "`Conflicto: el maestro está en uso por fichas laborales (campo ${}).`",
    clase: "no-fila",
    motivo:
      "el campo es una clave de la constante `CAMPOS_FK_LABORALES`.",
  },

  // ── app/api/micro-sectores ────────────────────────────────────
  {
    archivo: "app/api/micro-sectores/route.ts",
    mensaje:
      "`No se puede eliminar el sub-sector: ${} unidad(es) asociada(s).`",
    clase: "admin",
    compuerta: "mp",
    motivo:
      "el contador se calcula con `comunidadId` y eliminar exige `mp` eliminar.",
  },

  // ── app/api/mt ────────────────────────────────────────────────
  // Los dos mensajes que había acá interpolaban nombre y saldo del fondo FI y los
  // leía mantención, que no tiene ninguna clave `fi`: se corrigieron en T12 (409/400
  // sin datos de Finanzas). Lo que queda interpola el monto que el usuario escribió.
  {
    archivo: "app/api/mt/proyectos/route.ts",
    mensaje:
      "`Saldo insuficiente del fondo de financiamiento: el proyecto pide $${}.`",
    clase: "no-fila",
    motivo:
      "el monto es el presupuesto que vino en el cuerpo del request: dato del que pide, no de la fila del fondo.",
  },

  // ── app/api/pe ────────────────────────────────────────────────
  {
    archivo: "app/api/pe/personas/route.ts",
    mensaje:
      "`Se piden más de ${}.`",
    clase: "no-fila",
    motivo:
      "`MAXIMO_IDS` es una constante del módulo.",
  },
  {
    archivo: "app/api/pe/proyecciones/enviar/route.ts",
    mensaje:
      "`No hay feriados registrados para ${}; cargue el calendario antes de proyectar.`",
    clase: "no-fila",
    motivo:
      "`mesAnio` es del cuerpo del request.",
  },
  {
    archivo: "app/api/pe/unidades/route.ts",
    mensaje:
      "`Se piden más de ${}.`",
    clase: "no-fila",
    motivo:
      "`MAXIMO_IDS` es una constante del módulo.",
  },
  {
    archivo: "app/api/pe/visitas-tecnicas/_avance-mantencion.ts",
    mensaje:
      "`Mantención reprogramada al ${}.`",
    clase: "alcance",
    compuerta: "comunidadId",
    motivo:
      "si la mantención es de otra comunidad el mensaje es genérico y sin fecha; la fecha sólo aparece cuando la fila es propia.",
  },

  // ── app/api/periodos-directiva ────────────────────────────────
  {
    archivo: "app/api/periodos-directiva/[id]/route.ts",
    mensaje:
      "`No se puede eliminar: ${} acta(s) referencian este período (trazabilidad del libro).`",
    clase: "admin",
    compuerta: "gd",
    motivo:
      "el contador se calcula con `comunidadId` y eliminar exige `gd` eliminar.",
  },
  {
    archivo: "app/api/periodos-directiva/route.ts",
    mensaje:
      "`Cargo inválido en la nómina: ${}.`",
    clase: "no-fila",
    motivo:
      "el cargo es del cuerpo de la nómina.",
  },
  {
    archivo: "app/api/periodos-directiva/route.ts",
    mensaje:
      "`Fecha de asunción inválida en la nómina: ${}.`",
    clase: "no-fila",
    motivo:
      "la fecha es del cuerpo de la nómina.",
  },
  {
    archivo: "app/api/periodos-directiva/route.ts",
    mensaje:
      "`No se puede activar: la persona \"${}\" no existe.`",
    clase: "no-fila",
    motivo:
      "el id de persona es del cuerpo de la nómina: se nombra el id que no existe, no una fila leída.",
  },
  {
    archivo: "app/api/periodos-directiva/route.ts",
    mensaje:
      "`No se puede activar: ${} no tiene cuenta activa.`",
    clase: "admin",
    compuerta: "gd",
    motivo:
      "el nombre se interpola sólo si `persona.comunidadId` es la del scope, y activar exige `gd` crear/editar.",
  },
  {
    archivo: "app/api/periodos-directiva/route.ts",
    mensaje:
      "`No se puede activar el período: la nómina debe ser impar de 3 a 5 miembros (art. 17 Ley 21.442). Recibidos: ${}.`",
    clase: "no-fila",
    motivo:
      "cuenta la nómina que vino en el cuerpo.",
  },

  // ── app/api/personas ──────────────────────────────────────────
  {
    archivo: "app/api/personas/[id]/route.ts",
    mensaje:
      "`No se puede eliminar la persona: ${} vínculo(s) de unidad asociado(s).`",
    clase: "admin",
    compuerta: "mp",
    motivo:
      "el contador se calcula con `comunidadId` y eliminar exige `mp` eliminar, después del ABAC de identidad.",
  },
  {
    archivo: "app/api/personas/route.ts",
    mensaje:
      "`${} no existe en el maestro correspondiente.`",
    clase: "no-fila",
    motivo:
      "el campo es una clave de un mapa constante de validación.",
  },
  {
    archivo: "app/api/personas/route.ts",
    mensaje:
      "`condicionEspecial ${} no existe.`",
    clase: "no-fila",
    motivo:
      "el id es del cuerpo y el conjunto válido se lee con `comunidadId`.",
  },

  // ── app/api/publicaciones-portal ──────────────────────────────
  {
    archivo: "app/api/publicaciones-portal/route.ts",
    mensaje:
      "`No se puede eliminar la publicación: tiene ${} lead(s) asociado(s).`",
    clase: "admin",
    compuerta: "pi",
    motivo:
      "el contador se calcula con `comunidadId` y eliminar exige la clave de publicaciones internas.",
  },

  // ── app/api/ra ────────────────────────────────────────────────
  {
    archivo: "app/api/ra/reservas/[id]/retener/route.ts",
    mensaje:
      "`El monto retenido debe coincidir con la garantía de la reserva ($${}).`",
    clase: "admin",
    compuerta: "ra",
    motivo:
      "retener exige `ra` editar (sólo administración) y la reserva se carga con `comunidadId`.",
  },

  // ── app/api/reglamento ────────────────────────────────────────
  {
    archivo: "app/api/reglamento/route.ts",
    mensaje:
      "`La comunidad no tiene una versión del reglamento vigente para el período ${}.`",
    clase: "no-fila",
    motivo:
      "el período es del query validado; el mensaje no agrega datos de la versión vigente.",
  },

  // ── app/api/reportes-re ───────────────────────────────────────
  {
    archivo: "app/api/reportes-re/[id]/distribuir/route.ts",
    mensaje:
      "`El reporte ya fue distribuido el ${} destinatario(s).`",
    clase: "admin",
    compuerta: "re",
    motivo:
      "distribuir exige `re` editar (sólo administración) y el reporte se carga con el scope.",
  },
  {
    archivo: "app/api/reportes-re/[id]/distribuir/route.ts",
    mensaje:
      "`Reporte publicado en el visor interno para ${} destinatario(s).`",
    clase: "no-fila",
    motivo:
      "cuenta los destinatarios del conjunto que el handler acaba de resolver, en la respuesta de éxito.",
  },
  {
    archivo: "app/api/reportes-re/generar/route.ts",
    mensaje:
      "`${} no existe en la Estructura Física de la comunidad.`",
    clase: "no-fila",
    motivo:
      "`faltante` es un id del cuerpo que no existe en la estructura física de la comunidad.",
  },

  // ── app/api/tipos-unidad ──────────────────────────────────────
  {
    archivo: "app/api/tipos-unidad/route.ts",
    mensaje:
      "`No se puede eliminar el tipo de unidad: ${} unidad(es) vinculada(s).`",
    clase: "admin",
    compuerta: "mp",
    motivo:
      "el contador se calcula con `comunidadId` y eliminar exige `mp` eliminar.",
  },

  // ── app/api/vinculos ──────────────────────────────────────────
  {
    archivo: "app/api/vinculos/route.ts",
    mensaje:
      "`No se puede vincular: la persona está marcada como ${} en el Maestro de Personas.`",
    clase: "admin",
    compuerta: "mp",
    motivo:
      "la persona se busca con `comunidadId` en el where y vincular exige `mp` crear/editar.",
  },

  // ── Segunda pasada de T12: lo que la ruta REENVÍA y lo que se REDACTA en lib/**
  // (hallazgo del verificador independiente: 33 `jsonError(status, e.message)` y compañía
  // eran invisibles para el barrido de literales). Ver el docstring de arriba.
  // app/api/avisos-cobro/route.ts
  {
    archivo: "app/api/avisos-cobro/route.ts",
    mensaje:
      "totales.error",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  {
    archivo: "app/api/avisos-cobro/route.ts",
    mensaje:
      "esCorrelativo ? \"Conflicto: no se pudo reservar un folio libre para el aviso, reintentá la emisión.\" : `El período ${} ya tiene aviso emitido: un aviso emitido no se reemplaza.`",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/cobros-fi/route.ts
  {
    archivo: "app/api/cobros-fi/route.ts",
    mensaje:
      "delDetalle?.message ?? \"Datos inválidos.\"",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/documentos/[id]/envio/route.ts
  {
    archivo: "app/api/documentos/[id]/envio/route.ts",
    mensaje:
      "MENSAJE_COMUNITARIO_PUBLICADO",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/documentos/route.ts
  {
    archivo: "app/api/documentos/route.ts",
    mensaje:
      "MENSAJE_LEGAL_INMUTABLE",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  {
    archivo: "app/api/documentos/route.ts",
    mensaje:
      "MENSAJE_REFERENCIA_AUTENTICA",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  {
    archivo: "app/api/documentos/route.ts",
    mensaje:
      "MENSAJE_LEGAL_INMUTABLE",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/emisiones-gc/route.ts
  {
    archivo: "app/api/emisiones-gc/route.ts",
    mensaje:
      "mensajes[motivo]",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/importar/estructura/route.ts
  {
    archivo: "app/api/importar/estructura/route.ts",
    mensaje:
      "e instanceof Error ? e.message : \"El archivo CSV no se pudo leer.\"",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/importar/personas/route.ts
  {
    archivo: "app/api/importar/personas/route.ts",
    mensaje:
      "e instanceof Error ? e.message : \"El archivo CSV no se pudo leer.\"",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/importar/vinculos/route.ts
  {
    archivo: "app/api/importar/vinculos/route.ts",
    mensaje:
      "e instanceof Error ? e.message : \"El archivo CSV no se pudo leer.\"",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/ir/solicitudes-insumo/[id]/entregar/route.ts
  {
    archivo: "app/api/ir/solicitudes-insumo/[id]/entregar/route.ts",
    mensaje:
      "e.message",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/ir/solicitudes-insumo/[id]/resolver-comodin/route.ts
  {
    archivo: "app/api/ir/solicitudes-insumo/[id]/resolver-comodin/route.ts",
    mensaje:
      "e.message",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/liquidaciones/adelantos/route.ts
  {
    archivo: "app/api/liquidaciones/adelantos/route.ts",
    mensaje:
      "validacion.error",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/maestros/[tipo]/[id]/route.ts
  {
    archivo: "app/api/maestros/[tipo]/[id]/route.ts",
    mensaje:
      "mensaje",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/maestros/[tipo]/route.ts
  {
    archivo: "app/api/maestros/[tipo]/route.ts",
    mensaje:
      "MENSAJE_NACIONAL_PROTEGIDO",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/pe/personas/[id]/evaluaciones/route.ts
  {
    archivo: "app/api/pe/personas/[id]/evaluaciones/route.ts",
    mensaje:
      "parsed.error.issues[0]?.message ?? \"Datos de la evaluación inválidos.\"",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/pe/personas/[id]/horas-extras/route.ts
  {
    archivo: "app/api/pe/personas/[id]/horas-extras/route.ts",
    mensaje:
      "parsed.error.issues[0]?.message ?? \"Datos de la hora extra inválidos.\"",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/pe/personas/route.ts
  {
    archivo: "app/api/pe/personas/route.ts",
    mensaje:
      "filtroIds.error",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/pe/proyecciones/enviar/route.ts
  {
    archivo: "app/api/pe/proyecciones/enviar/route.ts",
    mensaje:
      "parsed.error.issues[0]?.message ?? \"Datos de la proyección inválidos.\"",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/pe/unidades/route.ts
  {
    archivo: "app/api/pe/unidades/route.ts",
    mensaje:
      "filtroIds.error",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/personas/route.ts
  {
    archivo: "app/api/personas/route.ts",
    mensaje:
      "MENSAJE_RUT_DUPLICADO",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  {
    archivo: "app/api/personas/route.ts",
    mensaje:
      "MENSAJE_EMAIL_DUPLICADO",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/ra/reservas/[id]/autorizar/route.ts
  {
    archivo: "app/api/ra/reservas/[id]/autorizar/route.ts",
    mensaje:
      "e.message",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/ra/reservas/[id]/cancelar/route.ts
  {
    archivo: "app/api/ra/reservas/[id]/cancelar/route.ts",
    mensaje:
      "e.message",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/ra/reservas/[id]/retener/route.ts
  {
    archivo: "app/api/ra/reservas/[id]/retener/route.ts",
    mensaje:
      "e.message",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/ra/reservas/route.ts
  {
    archivo: "app/api/ra/reservas/route.ts",
    mensaje:
      "e.message",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  {
    archivo: "app/api/ra/reservas/route.ts",
    mensaje:
      "e.message",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/reglamento/route.ts
  {
    archivo: "app/api/reglamento/route.ts",
    mensaje:
      "MENSAJES_DOCUMENTO_REGLAMENTO[respaldo.motivo]",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/reportes-re/generar/route.ts
  {
    archivo: "app/api/reportes-re/generar/route.ts",
    mensaje:
      "parsed.error.issues[0]?.message ?? \"Datos del reporte inválidos.\"",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  {
    archivo: "app/api/reportes-re/generar/route.ts",
    mensaje:
      "resultado.error",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/reportes-re/vistas/route.ts
  {
    archivo: "app/api/reportes-re/vistas/route.ts",
    mensaje:
      "parsed.error.issues[0]?.message ?? \"La vista del Centro de Mando no es válida.\"",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // app/api/vinculos/route.ts
  {
    archivo: "app/api/vinculos/route.ts",
    mensaje:
      "e.message",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta un helper de `lib/**` y la ruta sólo le pone el status y el `extra`; los mensajes de `lib/**` que interpolan están declarados en este mismo archivo, y ninguno describe una fila que el que pide no pueda ver.",
  },
  // lib/api/use-server-collection.ts
  {
    archivo: "lib/api/use-server-collection.ts",
    mensaje:
      "`Sin conexión y sin caché offline para ${}.`",
    clase: "no-fila",
    motivo:
      "la URL del endpoint y el status HTTP: constantes del hook, no datos de una fila.",
  },
  {
    archivo: "lib/api/use-server-collection.ts",
    mensaje:
      "`Error ${}.`",
    clase: "no-fila",
    motivo:
      "la URL del endpoint y el status HTTP: constantes del hook, no datos de una fila.",
  },
  // lib/aviso-cobro.ts
  {
    archivo: "lib/aviso-cobro.ts",
    mensaje:
      "`La comunidad no declara una versión del reglamento vigente para el período ${}: la forma de contribución y el porcentaje de aporte al fondo de reserva no son computables.`",
    clase: "no-fila",
    motivo:
      "el período del cálculo y la versión del reglamento de la propia comunidad; quien lo recibe emite con `fi:gasto_comun` crear, la misma compuerta de la emisión.",
  },
  {
    archivo: "lib/aviso-cobro.ts",
    mensaje:
      "`La versión ${} del reglamento no declara parámetros válidos: el porcentaje de aporte al fondo de reserva no es computable.`",
    clase: "no-fila",
    motivo:
      "el período del cálculo y la versión del reglamento de la propia comunidad; quien lo recibe emite con `fi:gasto_comun` crear, la misma compuerta de la emisión.",
  },
  {
    archivo: "lib/aviso-cobro.ts",
    mensaje:
      "`La unidad ${} no declara coeficiente de participación en el maestro de unidades: la proporción al gasto común y al fondo de reserva no es computable.`",
    clase: "no-fila",
    motivo:
      "el período del cálculo y la versión del reglamento de la propia comunidad; quien lo recibe emite con `fi:gasto_comun` crear, la misma compuerta de la emisión.",
  },
  {
    archivo: "lib/aviso-cobro.ts",
    mensaje:
      "`No se puede emitir el aviso: la comunidad no tiene fondos de caja registrados, así que el saldo de caja al cierre del período ${} no es computable.`",
    clase: "no-fila",
    motivo:
      "el período del cálculo y la versión del reglamento de la propia comunidad; quien lo recibe emite con `fi:gasto_comun` crear, la misma compuerta de la emisión.",
  },
  // lib/database-url.ts
  {
    archivo: "lib/database-url.ts",
    mensaje:
      "`Definí DATABASE_URL en el entorno o revisá la línea DATABASE_URL= de ${}.`",
    clase: "no-fila",
    motivo:
      "nombra el archivo de entorno que el operador debe revisar; no lee ninguna fila.",
  },
  // lib/importar/personas.ts
  {
    archivo: "lib/importar/personas.ts",
    mensaje:
      "`debe listar al menos un rol del sistema (${}).`",
    clase: "no-fila",
    motivo:
      "lista las claves cerradas de roles del catálogo, no filas de personas.",
  },
  {
    archivo: "lib/importar/personas.ts",
    mensaje:
      "`debe ser uno de: ${}».`",
    clase: "no-fila",
    motivo:
      "lista las claves cerradas de roles del catálogo, no filas de personas.",
  },
  // lib/qa-estado.ts
  {
    archivo: "lib/qa-estado.ts",
    mensaje:
      "`Run no encontrado: ${}`",
    clase: "no-fila",
    motivo:
      "ids del run de QA que el propio llamador envió por la API de QA.",
  },
  {
    archivo: "lib/qa-estado.ts",
    mensaje:
      "`La etapa ${}`",
    clase: "no-fila",
    motivo:
      "ids del run de QA que el propio llamador envió por la API de QA.",
  },
  {
    archivo: "lib/qa-estado.ts",
    mensaje:
      "`Etapa desconocida: ${}`",
    clase: "no-fila",
    motivo:
      "ids del run de QA que el propio llamador envió por la API de QA.",
  },
  {
    archivo: "lib/qa-estado.ts",
    mensaje:
      "`Baseline de ${} min`",
    clase: "no-fila",
    motivo:
      "ids del run de QA que el propio llamador envió por la API de QA.",
  },
  // lib/schemas.ts
  {
    archivo: "lib/schemas.ts",
    mensaje:
      "`Maestro \"${}\" no soportado.`",
    clase: "no-fila",
    motivo:
      "la clave del maestro que vino en el request.",
  },
  // lib/smtp.ts
  {
    archivo: "lib/smtp.ts",
    mensaje:
      "`\"${}\" es un dominio de primer nivel reservado por RFC 2606/RFC 6761 para pruebas y documentación`",
    clase: "no-fila",
    motivo:
      "valida la dirección que el propio usuario tipeó: el TLD y el dominio son parte de su entrada, no de una fila.",
  },
  {
    archivo: "lib/smtp.ts",
    mensaje:
      "`\"${}\" es un dominio reservado por RFC 2606 para pruebas y documentación`",
    clase: "no-fila",
    motivo:
      "valida la dirección que el propio usuario tipeó: el TLD y el dominio son parte de su entrada, no de una fila.",
  },
  {
    archivo: "lib/smtp.ts",
    mensaje:
      "`\"${}\" es el dominio ficticio de los datos semilla de la plataforma`",
    clase: "no-fila",
    motivo:
      "valida la dirección que el propio usuario tipeó: el TLD y el dominio son parte de su entrada, no de una fila.",
  },
  // ── El anclaje del certificado de residencia (F34) ────────────────────
  // Mensajes fijos de `lib/certificados-ct.ts` reenviados por la ruta: el texto no
  // interpola nada, así que no hay dato de fila que pueda viajar al cliente.
  {
    archivo: "app/api/certificados-ct/route.ts",
    mensaje:
      "MENSAJE_SIN_VINCULO",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta `lib/certificados-ct.ts` y no interpola ningún valor: no describe ninguna fila, sólo la ausencia de un vínculo propio.",
  },
  {
    archivo: "app/api/certificados-ct/route.ts",
    mensaje:
      "MENSAJE_ELEGIR_VINCULO",
    clase: "indirecto",
    origen: "lib/**",
    motivo:
      "el texto lo redacta `lib/certificados-ct.ts` y no interpola ningún valor: pide elegir entre vínculos propios, sin nombrar datos de la fila.",
  },
  // ── Borrado de personas: la ficha que un usuario apunta ──────────────
  {
    archivo: "app/api/personas/[id]/route.ts",
    mensaje:
      "`No se puede eliminar la persona: ${} usuario(s) tienen su ficha asignada. Quitá la ficha primero.`",
    clase: "no-fila",
    motivo:
      "el número cuenta usuarios que apuntan a la persona del path; no describe la fila de un tercero y la ruta exige `mp` eliminar.",
  },
]

describe("mensajes de error — T12: ningún mensaje que interpola datos queda sin declarar", () => {
  it("las dos raíces existen y el barrido encuentra mensajes (si no, el guardián se apagó solo)", { timeout: 30_000 }, () => {
    for (const raiz of RAICES) expect(() => readdirSync(path.join(APP_DIR, raiz))).not.toThrow()
    expect(sitiosDeRaiz().length).toBeGreaterThan(0)
    // El barrido completo suma lo reenviado y lo redactado en `lib/**`: si sólo
    // encuentra los literales de las rutas, las dos reglas nuevas se apagaron.
    expect(sitiosVigilados().length).toBeGreaterThan(sitiosDeRaiz().length)
  })

  it("cada mensaje que interpola está declarado con su clase y su motivo", { timeout: 30_000 }, () => {
    const declarados = new Set(DECLARACIONES.map(clave))
    const sinDeclarar = sitiosVigilados().filter((s) => !declarados.has(clave(s)))
    const detalle = sinDeclarar.map((s) => `  ${s.archivo}:${s.linea}\n      ${s.mensaje}`).join("\n")
    expect(
      sinDeclarar,
      sinDeclarar.length === 0
        ? ""
        : "Mensaje de error nuevo que interpola un valor. Declaralo en DECLARACIONES con su clase " +
          "(no-fila | admin | alcance) y su motivo, o quitá la interpolación:\n" +
          detalle +
          "\n"
    ).toEqual([])
  })

  it("no hay declaraciones huérfanas: si el mensaje se fue, la declaración también", { timeout: 30_000 }, () => {
    const detectados = new Set(sitiosVigilados().map(clave))
    const huerfanas = DECLARACIONES.filter((d) => !detectados.has(clave(d)))
    const detalle = huerfanas.map((d) => `  ${d.archivo}\n      ${d.mensaje}`).join("\n")
    expect(
      huerfanas,
      huerfanas.length === 0
        ? ""
        : "Declaración sin mensaje que la respalde: borrala o corregí el texto normalizado:\n" +
          detalle +
          "\n"
    ).toEqual([])
  })

  it("cada declaración con dato de fila nombra una compuerta que sigue existiendo en el código", () => {
    const sinCompuerta = DECLARACIONES.filter(
      (d) =>
        (d.clase === "admin" || d.clase === "alcance") &&
        !readFileSync(path.join(APP_DIR, d.enArchivo ?? d.archivo), "utf8").includes(d.compuerta)
    )
    const detalle = sinCompuerta
      .map((d) => `  ${d.archivo} → compuerta ausente: ${"compuerta" in d ? d.compuerta : ""}`)
      .join("\n")
    expect(
      sinCompuerta,
      sinCompuerta.length === 0
        ? ""
        : "La compuerta que el motivo nombra ya no está en el archivo: el mensaje interpola un " +
          "dato de fila sin el permiso que lo respaldaba. Revisá el motivo o quitá la interpolación:\n" +
          detalle +
          "\n"
    ).toEqual([])
  })

  it("ninguna declaración es una excepción encubierta: toda clase admite veredicto y todo motivo explica", () => {
    for (const d of DECLARACIONES) {
      expect(["no-fila", "admin", "alcance", "indirecto"]).toContain(d.clase)
      expect(d.motivo.length, `motivo vacío en ${d.archivo}: ${d.mensaje}`).toBeGreaterThan(20)
      if (d.clase === "admin" || d.clase === "alcance") expect(d.compuerta.length).toBeGreaterThan(0)
      if (d.clase === "indirecto") expect(d.origen).toBe("lib/**")
    }
  })
})
