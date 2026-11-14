/**
 * @vitest-environment node
 *
 * F29 — convenio de pago de la deuda de gastos comunes (Ley 21.442 art. 6).
 *
 * El convenio no es un acuerdo entre partes que el sistema pueda inventar: el
 * administrador lo celebra, pero la ley exige ACUERDO DEL COMITÉ y el pago de la
 * PRIMERA CUOTA al suscribir. Lo que se fija acá, todo observable por la API y
 * por la base:
 *
 *   1. sin sesión no se toca nada (401) y un rol sin `fi:cobranza` no suscribe
 *      convenios ni registra pagos (403, cero filas);
 *   2. sin un acuerdo APROBADO del Comité —abierto, de asamblea o inexistente—
 *      el alta responde 400 con su motivo y no deja ninguna fila;
 *   3. con el acuerdo del Comité el alta responde 201, la primera cuota nace
 *      PAGADA en la fecha de suscripción y las N cuotas del saldo suman exacto;
 *   4. una unidad no puede tener dos convenios vigentes (409 y una sola fila);
 *   5. al pagar todas las cuotas el convenio queda `saldado`, y una cuota pagada
 *      no se vuelve a pagar (409) sin tocar la fila ni duplicar el pago en el cargo;
 *   6. la lectura devuelve los convenios con sus cuotas y los totales pagado y
 *      pendiente, acotada a la comunidad de la sesión;
 *   7. la deuda del convenio es la que la contabilidad cobra: un `CobroFI` por
 *      cuota 1..N (ninguno por la cuota 0), imputado al fondo de gasto común
 *      activo, con su evento `FI_CONVENIO_CARGOS`; sin ese fondo el alta es 400 y
 *      no escribe nada, y un fallo a mitad de la transacción revierte todo.
 *
 * V5 — el convenio firmado a mano entra al archivo legal (F29):
 *
 *   8. el PDF que la administración escanea se sube al depósito PRIVADO, el
 *      `Documento` legal guarda los metadatos reales del archivo (tamaño y hash
 *      de los BYTES) y el convenio queda apuntando a él, con la constancia de
 *      entrega al deudor en `pendiente` (no hay envío cursado) y el evento
 *      `FI_CONVENIO_DOCUMENTO_SUBIDO`;
 *   9. la descarga devuelve los MISMOS bytes y el mismo sha256 que se
 *      archivaron, sólo para `fi:cobranza` ver (el residente recibe 403: el
 *      papel lleva el nombre del deudor y su deuda);
 *  10. un archivo que no es PDF es 400 literal y no toca ni la base ni el
 *      depósito, y el papel se sube UNA sola vez (el segundo intento es 409 y
 *      deja el primero intacto);
 *  11. si la subida falla no se escribe NADA, y si la transacción falla después
 *      de subir, el archivo se BORRA del depósito: no quedan huérfanos.
 *
 * Las llamadas al depósito NO salen a internet: el archivo habla con un servidor
 * HTTP falso en `127.0.0.1` que exige el token, la versión de API y el acceso
 * privado, igual que el servidor SMTP de prueba (`test/lib/servidor-smtp-falso.ts`).
 */
import { createHash } from "node:crypto"
import { createServer, type Server, type ServerResponse } from "node:http"
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { http, passthrough } from "msw"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import { server as servidorMSW } from "../setup"

const state = vi.hoisted(() => ({ cookie: "" }))
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(
      new Headers(
        state.cookie
          ? { cookie: state.cookie, "x-forwarded-proto": "http" }
          : { "x-forwarded-proto": "http" }
      )
    ),
}))

const AUTH_SECRET = "test-secret-12345678"

const COM_A = "conv-com-a"
const COM_B = "conv-com-b"
/**
 * Comunidad dedicada a los cobros vencidos de la derivación del deudor: sus
 * filas existen para que los dos endpoints nuevos se prueben sin mover los
 * contadores de A y de B, que varios casos de este archivo afirman en cero.
 */
const COM_C = "conv-com-c"

const U1 = "conv-u-1"
const U2 = "conv-u-2"
const U_OTRA = "conv-u-otra"
const U_OTRA_PAGO = "conv-u-otra-pago"

const P1 = "conv-p-1"
const P2 = "conv-p-2"
const P_OTRA = "conv-p-otra"
/** Propietario de U1 con el vínculo CERRADO: ya no es propietario vigente. */
const P_CERRADO = "conv-p-cerrado"
/** Arrendatario vigente de U1: vive en la unidad, no la debe. */
const P_ARRENDATARIO = "conv-p-arrendatario"

// ── El deudor se DERIVA de la unidad y no se elige a ciegas ─────────────────
/**
 * Unidades de COM_C: la 101 con dos cobros vencidos, la 102 con uno vencido y
 * uno pagado, y la 201 con un cobro que todavía no vence (no está morosa).
 */
const U_C_101 = "conv-c-u-101"
const U_C_102 = "conv-c-u-102"
const U_C_SIN_DEUDA = "conv-c-u-201"
/** Vínculos de la 101: dos propietarios vigentes, uno cerrado y un arrendatario. */
const P_C_ANA = "conv-c-p-ana"
const P_C_BRUNO = "conv-c-p-bruno"
const P_C_CERRADO = "conv-c-p-cerrado"
const P_C_ARRENDATARIO = "conv-c-p-arrendatario"
/** Fondo de gasto común de COM_C: el `CobroFI` lo exige, la derivación no lo lee. */
const FONDO_C = "conv-fondo-gc-c"

/** Acuerdo del Comité que autoriza el convenio de la unidad U1. */
const ACUERDO_OK = "conv-ac-ok"
const ACUERDO_ABIERTO = "conv-ac-abierto"
const ACUERDO_ASAMBLEA = "conv-ac-asamblea"
const ACUERDO_OTRA_COMUNIDAD = "conv-ac-b"
const ACUERDO_OK_U2 = "conv-ac-ok-u2"

const EMAIL_ADMIN = "conv-admin@test.cl"
const EMAIL_ADMIN_B = "conv-admin-b@test.cl"
const EMAIL_ADMIN_C = "conv-admin-c@test.cl"
const EMAIL_COMITE = "conv-comite@test.cl"
const EMAIL_RESIDENTE = "conv-residente@test.cl"

/** Fondo de gasto común ACTIVO donde el convenio imputa sus cuotas. */
const FONDO_A = "conv-fondo-gc-a"
/** En la comunidad B el único fondo de gasto común está INACTIVO. */
const FONDO_B_INACTIVO = "conv-fondo-gc-b-inactivo"

/** Mensaje literal del alta sin fondo: no se inventa un fondo ni se escribe nada. */
const MENSAJE_SIN_FONDO =
  "No se puede suscribir el convenio: la comunidad no tiene un fondo de gasto común activo donde imputar las cuotas."

/**
 * El 400 literal del alta cuando el deudor no es propietario VIGENTE de la
 * unidad. El convenio regulariza la deuda del DUEÑO (Ley 21.442 art. 6):
 * suscribirlo con quien no la debe sería un registro válido de una deuda ajena.
 */
const MENSAJE_DEUDOR_NO_PROPIETARIO =
  "No se puede suscribir el convenio: el deudor no es propietario vigente de la unidad."

/** Convenio de la OTRA comunidad: la lectura del scope no puede verlo. */
const CONVENIO_COM_B = "conv-convenio-b"

// ── V5: el papel firmado ────────────────────────────────────────────────────

/** Unidad del convenio cuyo PDF firmado se archiva. */
const U_FIRMA = "conv-u-firma"
/** Unidad del convenio que se usa para las subidas que fallan. */
const U_FIRMA_FALLA = "conv-u-firma-falla"
/** Convenio (comunidad A) que recibe el papel firmado en el primer caso. */
const CONVENIO_PARA_FIRMAR = "conv-convenio-para-firmar"
/** Convenio (comunidad A) que nunca queda con documento: subidas fallidas. */
const CONVENIO_DE_LA_SUBIDA_QUE_FALLA = "conv-convenio-subida-falla"

/** Token del depósito: texto inventado, nunca una credencial real. */
const TOKEN_DEL_DEPOSITO = "token-de-prueba-del-deposito"
/** Versión de la API del depósito que el servidor falso exige (la de Vercel Blob). */
const VERSION_API_DEL_DEPOSITO = "12"

/**
 * Mensajes LITERALES de las dos rutas del documento firmado.
 *
 * Van como literales en `jsonError` y se comparan acá tal cual: el contrato del
 * archivo no es «algo salió mal», es qué pasó con el papel.
 */
const MENSAJE_NO_ES_PDF =
  "El archivo no es un PDF: el convenio se firma a mano y la administración lo escanea en PDF, así que un archivo con otro formato no entra al archivo legal."
const MENSAJE_YA_TIENE_DOCUMENTO =
  "El convenio ya tiene su documento firmado: el papel firmado se sube una sola vez."
const MENSAJE_SUBIDA_FALLIDA =
  "No se pudo guardar el archivo en el depósito de documentos: no se escribió ninguna fila."
const MENSAJE_SIN_DOCUMENTO =
  "El convenio no tiene documento firmado: primero se sube el papel que la administración escaneó."

/** Forma de la vista que devuelven las tres rutas (altas y lectura). */
interface VistaConvenio {
  id: string
  unidadId: string
  personaId: string
  acuerdoId: string
  montoTotal: number
  numeroCuotas: number
  primeraCuota: number
  estado: string
  cuotas: Array<{
    numero: number
    monto: number
    estado: string
    venceEn: string
    pagadaEn: string | null
    registradaPor: string | null
  }>
  totales: { pagado: number; pendiente: number }
}

/** Centavos enteros: el dinero se compara sin floats sueltos. */
const centavos = (monto: number): number => Math.round(monto * 100)

function datosPersona(
  id: string,
  comunidadId: string,
  rut: string,
  nombre: string,
  email: string,
  roles: string[] = ["propietario"]
) {
  return {
    id,
    comunidadId,
    rut,
    nombreCompleto: nombre,
    nombres: nombre.split(" ")[0]!,
    apellidos: nombre.split(" ").slice(1).join(" "),
    email,
    telefonoMovil: "+56900000000",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles,
  }
}

function datosUnidad(
  id: string,
  comunidadId: string,
  numero: string,
  etiqueta = "Depto"
) {
  return {
    id,
    comunidadId,
    microSectorId: `conv-ms-${numero}`,
    numero,
    etiqueta,
    tipoUnidadId: "conv-tu-1",
    metraje: 50,
    prorrateo: 10,
    rolSii: `conv-${numero}`,
    estadoId: "habitada",
    servicios: {},
  }
}

/** Documento firmado tal como lo devuelve el alta (201). */
interface VistaDocumentoFirmado {
  id: string
  convenioId: string
  hash: string
  tamanoBytes: number
  archivoNombre: string
  constancia: {
    id: string
    estado: string
    personaId: string
    motivo: string
  }
}

/**
 * PDF mínimo REAL: cabecera `%PDF-1.4` con su marca binaria, catálogo, una página
 * y `%%EOF`.
 *
 * La ruta no parsea el PDF —lo que se archiva y se sirve son los BYTES y su
 * sha256—, así que el documento sólo tiene que ser un PDF de verdad en lo
 * observable: la cabecera mágica que la ruta verifica y el nombre que declara.
 * Cada llamada lleva una marca distinta para que dos PDF tengan bytes distintos.
 */
function pdfMinimo(marca: string): Buffer {
  const lineas = [
    "%PDF-1.4",
    `% ${marca}`,
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]>>endobj",
    "trailer<</Root 1 0 R>>",
    "startxref",
    "0",
    "%%EOF",
    "",
  ]
  return Buffer.from(lineas.join("\n"), "latin1")
}

/** Objeto guardado por el depósito de prueba, con los bytes exactos recibidos. */
interface ObjetoDelDeposito {
  bytes: Buffer
  tipoMime: string
}

/** Una petición recibida por el depósito de prueba, para auditar cabeceras. */
interface PeticionAlDeposito {
  metodo: string
  pathname: string
  autorizacion: string
  version: string
  acceso: string
}

/** Modos del depósito falso: lo que el test necesita provocar. */
type ModoDepositoFalso = "aceptar" | "rechazar_subida" | "rechazar_descarga"

interface ServidorDepositoFalso {
  readonly baseUrl: string
  readonly objetos: Map<string, ObjetoDelDeposito>
  readonly peticiones: PeticionAlDeposito[]
  readonly borrados: string[]
  modo: ModoDepositoFalso
  cerrar(): Promise<void>
}

/**
 * Servidor del depósito de archivos EN MEMORIA, escuchando sólo en `127.0.0.1`
 * con puerto efímero: ninguna conexión sale de loopback y el token es el que el
 * propio test decide (nunca una credencial real).
 *
 * Habla lo justo de la API REST del store privado que usa `lib/almacen-documentos`:
 * `PUT` (subir), `GET` (descargar) y `DELETE` (borrar). Exige el `authorization`
 * con su token, `x-api-version: 12` y, en la subida, `x-vercel-blob-access:
 * private`: si el código dejara de declarar el acceso privado o mandara otra
 * versión de API, el test lo dice en vez de fingir que guardó.
 */
async function iniciarServidorDepositoFalso(): Promise<ServidorDepositoFalso> {
  const objetos = new Map<string, ObjetoDelDeposito>()
  const peticiones: PeticionAlDeposito[] = []
  const borrados: string[] = []
  const estado: { modo: ModoDepositoFalso; baseUrl: string } = {
    modo: "aceptar",
    baseUrl: "",
  }

  const responder = (res: ServerResponse, status: number, cuerpo: unknown): void => {
    const texto = JSON.stringify(cuerpo)
    res.writeHead(status, {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(texto)),
    })
    res.end(texto)
  }

  const servidor: Server = createServer((req, res) => {
    const trozos: Buffer[] = []
    req.on("data", (trozo: Buffer) => trozos.push(Buffer.from(trozo)))
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1")
      const pathname = decodeURIComponent(url.pathname.replace(/^\//, ""))
      const autorizacion = String(req.headers.authorization ?? "")
      const version = String(req.headers["x-api-version"] ?? "")
      const acceso = String(req.headers["x-vercel-blob-access"] ?? "")
      const metodo = req.method ?? ""
      peticiones.push({ metodo, pathname, autorizacion, version, acceso })

      if (autorizacion !== `Bearer ${TOKEN_DEL_DEPOSITO}`) {
        responder(res, 403, { error: "el depósito de prueba exige su token" })
        return
      }
      if (version !== VERSION_API_DEL_DEPOSITO) {
        responder(res, 400, { error: "el depósito de prueba exige x-api-version 12" })
        return
      }

      if (metodo === "PUT") {
        if (estado.modo === "rechazar_subida") {
          responder(res, 500, { error: "el depósito no pudo guardar" })
          return
        }
        if (acceso !== "private") {
          responder(res, 400, { error: "el depósito de prueba es privado" })
          return
        }
        const tipoMime = String(req.headers["x-content-type"] ?? "application/octet-stream")
        objetos.set(pathname, { bytes: Buffer.concat(trozos), tipoMime })
        responder(res, 200, {
          pathname,
          url: `${estado.baseUrl}/${pathname}`,
          contentType: tipoMime,
        })
        return
      }

      if (metodo === "GET") {
        if (estado.modo === "rechazar_descarga") {
          responder(res, 500, { error: "el depósito no pudo leer el archivo" })
          return
        }
        const objeto = objetos.get(pathname)
        if (!objeto) {
          responder(res, 404, { error: "el archivo no existe en el depósito" })
          return
        }
        res.writeHead(200, {
          "content-type": objeto.tipoMime,
          "content-length": String(objeto.bytes.length),
        })
        res.end(objeto.bytes)
        return
      }

      if (metodo === "DELETE") {
        objetos.delete(pathname)
        borrados.push(pathname)
        responder(res, 200, { deleted: true, pathname })
        return
      }

      responder(res, 405, { error: "método no soportado por el depósito de prueba" })
    })
  })

  const puerto = await new Promise<number>((resolver, rechazar) => {
    servidor.once("error", rechazar)
    servidor.listen(0, "127.0.0.1", () => {
      const direccion = servidor.address()
      if (direccion === null || typeof direccion === "string") {
        rechazar(new Error("el depósito de prueba no obtuvo un puerto TCP"))
        return
      }
      resolver(direccion.port)
    })
  })
  estado.baseUrl = `http://127.0.0.1:${puerto}`

  return {
    get baseUrl(): string {
      return estado.baseUrl
    },
    get modo(): ModoDepositoFalso {
      return estado.modo
    },
    set modo(valor: ModoDepositoFalso) {
      estado.modo = valor
    },
    objetos,
    peticiones,
    borrados,
    async cerrar(): Promise<void> {
      await new Promise<void>((resolver) => servidor.close(() => resolver()))
    },
  }
}

describe("/api/convenios — convenio de pago con acuerdo del Comité (F29)", () => {
  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/convenios/route"),
    pago: await import("@/app/api/convenios/pago/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const c of [
      { id: COM_A, nombre: "Comunidad Convenios A", slug: "conv-com-a" },
      { id: COM_B, nombre: "Comunidad Convenios B", slug: "conv-com-b" },
      { id: COM_C, nombre: "Comunidad Convenios C", slug: "conv-com-c" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    // A tiene el fondo de gasto común activo que exige el convenio; B sólo uno
    // inactivo, así que su alta no puede imputar la deuda y se rechaza.
    for (const fondo of [
      {
        id: FONDO_A,
        comunidadId: COM_A,
        nombre: "Fondo de Gasto Común",
        tipo: "gasto_comun",
        activo: true,
      },
      {
        id: FONDO_B_INACTIVO,
        comunidadId: COM_B,
        nombre: "Fondo de Gasto Común",
        tipo: "gasto_comun",
        activo: false,
      },
      {
        id: FONDO_C,
        comunidadId: COM_C,
        nombre: "Fondo de Gasto Común",
        tipo: "gasto_comun",
        activo: true,
      },
    ]) {
      await prisma.fondoFI.upsert({
        where: { id: fondo.id },
        update: { activo: fondo.activo },
        create: fondo,
      })
    }

    for (const p of [
      datosPersona(P1, COM_A, "19111111-1", "Deudor Uno", "conv-p1@test.cl"),
      datosPersona(P2, COM_A, "19222222-2", "Deudor Dos", "conv-p2@test.cl"),
      datosPersona(P_OTRA, COM_B, "19333333-3", "Deudor Ajeno", "conv-p-otra@test.cl"),
      // Viven en la 101 de A pero NO son propietarios vigentes de ella.
      datosPersona(P_CERRADO, COM_A, "19444444-4", "Dueño Anterior", "conv-p-cerrado@test.cl"),
      datosPersona(
        P_ARRENDATARIO,
        COM_A,
        "19555555-5",
        "Arrendatario Vigente",
        "conv-p-arrendatario@test.cl",
        ["residente"]
      ),
      // COM_C: dos propietarios vigentes de la 101, uno cerrado y un arrendatario.
      datosPersona(P_C_ANA, COM_C, "19666666-6", "Ana Propietaria", "conv-c-ana@test.cl"),
      datosPersona(P_C_BRUNO, COM_C, "19777777-7", "Bruno Propietario", "conv-c-bruno@test.cl"),
      datosPersona(P_C_CERRADO, COM_C, "19888888-8", "Carla Ex Dueña", "conv-c-cerrada@test.cl"),
      datosPersona(
        P_C_ARRENDATARIO,
        COM_C,
        "19999999-9",
        "Diego Arrendatario",
        "conv-c-arrendatario@test.cl",
        ["residente"]
      ),
    ]) {
      await prisma.persona.upsert({ where: { id: p.id }, update: {}, create: p })
    }

    for (const u of [
      datosUnidad(U1, COM_A, "101"),
      datosUnidad(U2, COM_A, "102"),
      datosUnidad(U_FIRMA, COM_A, "103"),
      datosUnidad(U_FIRMA_FALLA, COM_A, "104"),
      datosUnidad(U_OTRA, COM_B, "901"),
      datosUnidad(U_OTRA_PAGO, COM_B, "902"),
      datosUnidad(U_C_101, COM_C, "101", "Depto"),
      datosUnidad(U_C_102, COM_C, "102", "Oficina"),
      datosUnidad(U_C_SIN_DEUDA, COM_C, "201", "Depto"),
    ]) {
      await prisma.unidad.upsert({ where: { id: u.id }, update: {}, create: u })
    }

    // ── Vínculos: el convenio exige que el deudor sea PROPIETARIO VIGENTE ────
    //
    // Mismo criterio que la cobranza FI (`propietarioVigenteDeUnidad`): rol
    // `propietario` con `fechaFin` null y el más reciente primero. P1 es dueño de
    // U1 y P2 de U2, que es lo que hace válidos los convenios de los casos de
    // abajo; los dos últimos vínculos de A existen para probar que NO alcanzan.
    const vinculos = [
      { id: "conv-v-p1-u1", comunidadId: COM_A, personaId: P1, unidadId: U1, rol: "propietario", fechaInicio: "2024-01-01", fechaFin: null },
      { id: "conv-v-p2-u2", comunidadId: COM_A, personaId: P2, unidadId: U2, rol: "propietario", fechaInicio: "2024-01-01", fechaFin: null },
      { id: "conv-v-cerrado-u1", comunidadId: COM_A, personaId: P_CERRADO, unidadId: U1, rol: "propietario", fechaInicio: "2020-01-01", fechaFin: "2025-06-30" },
      { id: "conv-v-arrend-u1", comunidadId: COM_A, personaId: P_ARRENDATARIO, unidadId: U1, rol: "arrendatario", fechaInicio: "2025-01-01", fechaFin: null },
      { id: "conv-v-p-otra-u-otra", comunidadId: COM_B, personaId: P_OTRA, unidadId: U_OTRA, rol: "propietario", fechaInicio: "2024-01-01", fechaFin: null },
      { id: "conv-c-v-ana-101", comunidadId: COM_C, personaId: P_C_ANA, unidadId: U_C_101, rol: "propietario", fechaInicio: "2023-01-01", fechaFin: null },
      { id: "conv-c-v-bruno-101", comunidadId: COM_C, personaId: P_C_BRUNO, unidadId: U_C_101, rol: "propietario", fechaInicio: "2024-01-01", fechaFin: null },
      { id: "conv-c-v-cerrado-101", comunidadId: COM_C, personaId: P_C_CERRADO, unidadId: U_C_101, rol: "propietario", fechaInicio: "2019-01-01", fechaFin: "2022-12-31" },
      { id: "conv-c-v-arrend-101", comunidadId: COM_C, personaId: P_C_ARRENDATARIO, unidadId: U_C_101, rol: "arrendatario", fechaInicio: "2025-02-01", fechaFin: null },
    ]
    for (const v of vinculos) {
      await prisma.vinculoUnidad.upsert({
        where: { id: v.id },
        update: { fechaFin: v.fechaFin },
        create: { ...v, permiteVerFinanzas: true },
      })
    }

    // ── Cobros vencidos de COM_C ────────────────────────────────────────────
    //
    // La deuda se DERIVA de los `CobroFI` (`estadoDeCobro`/`morosidadPorUnidad`),
    // igual que el tablero de morosos: un cobro pagado no es deuda y uno que
    // todavía no vence tampoco. La 102 aparece con un período y la 201 no aparece.
    const cobros = [
      { id: "conv-c-cob-101-01", unidadId: U_C_101, periodo: "2024-01", montoBase: 10_000, fechaVencimiento: "2024-01-10", pagos: [] },
      { id: "conv-c-cob-101-02", unidadId: U_C_101, periodo: "2024-02", montoBase: 20_000, fechaVencimiento: "2024-02-10", pagos: [] },
      { id: "conv-c-cob-102-03", unidadId: U_C_102, periodo: "2024-03", montoBase: 5_000, fechaVencimiento: "2024-03-10", pagos: [] },
      {
        id: "conv-c-cob-102-04",
        unidadId: U_C_102,
        periodo: "2024-04",
        montoBase: 7_000,
        fechaVencimiento: "2024-04-10",
        pagos: [{ id: "conv-c-pago-102-04", monto: 7_000, fecha: "2024-04-05", medio: "transferencia" }],
      },
      { id: "conv-c-cob-201-05", unidadId: U_C_SIN_DEUDA, periodo: "2099-01", montoBase: 9_000, fechaVencimiento: "2099-01-10", pagos: [] },
    ]
    for (const c of cobros) {
      await prisma.cobroFI.upsert({
        where: { id: c.id },
        update: { pagos: c.pagos },
        create: {
          id: c.id,
          comunidadId: COM_C,
          unidadId: c.unidadId,
          periodo: c.periodo,
          concepto: "gasto_comun",
          origenModulo: "FI",
          fondoId: FONDO_C,
          descripcion: `Cobro de prueba de la unidad ${c.unidadId} del período ${c.periodo}`,
          montoBase: c.montoBase,
          fechaCargo: c.fechaVencimiento,
          fechaVencimiento: c.fechaVencimiento,
          moras: [],
          pagos: c.pagos,
          diferencias: [],
        },
      })
    }

    const acuerdos = [
      {
        id: ACUERDO_OK,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Convenio de pago de la unidad 101 (Ley 21.442 art. 6)",
        folio: "AD-2026-8001",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "conv-usuario-admin",
      },
      {
        id: ACUERDO_OK_U2,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Convenio de pago de la unidad 102 (Ley 21.442 art. 6)",
        folio: "AD-2026-8002",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "conv-usuario-admin",
      },
      {
        id: ACUERDO_ABIERTO,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Convenio de pago que el comité todavía no votó",
        folio: "AD-2026-8003",
        estado: "abierto",
        quorumRequerido: "un_voto_por_miembro",
        creadoPor: "conv-usuario-admin",
      },
      {
        id: ACUERDO_ASAMBLEA,
        comunidadId: COM_A,
        cuerpo: "asamblea",
        materia: "Convenio aprobado por la asamblea y no por el comité",
        folio: "AD-2026-8004",
        estado: "aprobado",
        quorumRequerido: "mayoria_absoluta_derechos",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "conv-usuario-admin",
      },
      {
        id: ACUERDO_OTRA_COMUNIDAD,
        comunidadId: COM_B,
        cuerpo: "comite",
        materia: "Convenio de pago de la otra comunidad",
        folio: "AD-2026-8100",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "conv-usuario-admin",
      },
    ]
    for (const a of acuerdos) {
      await prisma.acuerdo.upsert({
        where: { id: a.id },
        update: { estado: a.estado },
        create: a,
      })
    }

    // Convenio de la comunidad B, escrito directo en la base: ningún scope de la
    // sesión (que es de A) puede leerlo por la API.
    await prisma.convenioPago.upsert({
      where: { id: CONVENIO_COM_B },
      update: {},
      create: {
        id: CONVENIO_COM_B,
        comunidadId: COM_B,
        unidadId: U_OTRA_PAGO,
        personaId: P_OTRA,
        acuerdoId: ACUERDO_OTRA_COMUNIDAD,
        montoTotal: 500_000,
        numeroCuotas: 2,
        fechaSuscripcion: new Date("2026-02-15T12:00:00.000Z"),
        primeraCuota: 100_000,
        estado: "vigente",
        creadoPor: "conv-usuario-admin",
      },
    })

    const usuarios = [
      { id: "conv-usuario-admin", email: EMAIL_ADMIN, comunidadId: COM_A, rol: "administrador" },
      // Administración de B: la prueba del alta sin fondo necesita una sesión
      // cuyo scope sea la comunidad que no puede imputar.
      { id: "conv-usuario-admin-b", email: EMAIL_ADMIN_B, comunidadId: COM_B, rol: "administrador" },
      { id: "conv-usuario-admin-c", email: EMAIL_ADMIN_C, comunidadId: COM_C, rol: "administrador" },
      { id: "conv-usuario-comite", email: EMAIL_COMITE, comunidadId: COM_A, rol: "comite" },
      { id: "conv-usuario-residente", email: EMAIL_RESIDENTE, comunidadId: COM_A, rol: "residente" },
    ]
    for (const u of usuarios) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: {},
        create: { id: u.id, email: u.email, activo: true, personaId: null },
      })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: usuarios.map((u) => u.id) } },
    })
    for (const u of usuarios) {
      await prisma.membresia.create({
        data: { usuarioId: u.id, comunidadId: u.comunidadId, rol: u.rol },
      })
    }
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.cobroFI.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B, COM_C] } },
      })
      await prisma.cuotaConvenio.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B, COM_C] } },
      })
      await prisma.convenioPago.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B, COM_C] } },
      })
      await prisma.votoAcuerdo.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B, COM_C] } },
      })
      await prisma.acuerdo.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B, COM_C] } },
      })
      await prisma.vinculoUnidad.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B, COM_C] } },
      })
      await prisma.unidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B, COM_C] } } })
      await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B, COM_C] } } })
      await prisma.fondoFI.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B, COM_C] } },
      })
      await prisma.membresia.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B, COM_C] } },
      })
      await prisma.usuario.deleteMany({
        where: { email: { in: [EMAIL_ADMIN, EMAIL_ADMIN_B, EMAIL_ADMIN_C, EMAIL_COMITE, EMAIL_RESIDENTE] } },
      })
      for (const id of [COM_A, COM_B, COM_C]) {
        await prisma.comunidad.delete({ where: { id } }).catch(() => {})
      }
    } catch {
      // intencional: limpieza best-effort, la base de la suite es descartable
    }
  })

  async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  async function POST_CONVENIO(body: unknown): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.POST(
      new NextRequest("http://localhost/api/convenios", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function POST_PAGO(body: unknown): Promise<Response> {
    const { pago } = await cargaModulos()
    return pago.POST(
      new NextRequest("http://localhost/api/convenios/pago", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET_CONVENIOS(
    url = "http://localhost/api/convenios"
  ): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest(url, { method: "GET" }))
  }

  /**
   * Las dos rutas ESTÁTICAS de la derivación del deudor se cargan por separado:
   * si se sumaran a `cargaModulos`, un fallo de estos endpoints haría fallar los
   * casos del convenio que no tienen nada que ver.
   */
  async function GET_UNIDADES_CON_DEUDA(query = ""): Promise<Response> {
    const { GET } = await import("@/app/api/convenios/unidades-con-deuda/route")
    return GET(
      new NextRequest(
        `http://localhost/api/convenios/unidades-con-deuda${query}`,
        { method: "GET" }
      )
    )
  }

  async function GET_DEUDORES(query = ""): Promise<Response> {
    const { GET } = await import("@/app/api/convenios/deudores/route")
    return GET(
      new NextRequest(`http://localhost/api/convenios/deudores${query}`, {
        method: "GET",
      })
    )
  }

  const terminos = (extra: Record<string, unknown> = {}) => ({
    unidadId: U1,
    personaId: P1,
    acuerdoId: ACUERDO_OK,
    montoTotal: 1_000_000,
    numeroCuotas: 3,
    primeraCuota: 333_333,
    ...extra,
  })

  /** Alta de un convenio por la API con la sesión de la administración. */
  async function crearConvenio(body: Record<string, unknown>): Promise<VistaConvenio> {
    let creado: VistaConvenio | null = null
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_CONVENIO(body)
      expect(res.status).toBe(201)
      creado = (await res.json()) as VistaConvenio
    })
    if (!creado) throw new Error("no se pudo crear el convenio de prueba")
    return creado
  }

  it("401 sin sesión en las tres rutas", async () => {
    state.cookie = ""
    expect((await POST_CONVENIO(terminos())).status).toBe(401)
    expect((await POST_PAGO({ convenioId: "conv-inexistente", numero: 1 })).status).toBe(401)
    expect((await GET_CONVENIOS()).status).toBe(401)
  })

  it("un rol sin `fi:cobranza` no suscribe convenios ni registra pagos → 403 y cero filas", async () => {
    await conSesion(EMAIL_RESIDENTE, async () => {
      const alta = await POST_CONVENIO(terminos())
      expect(alta.status).toBe(403)
      const pago = await POST_PAGO({ convenioId: "conv-inexistente", numero: 1 })
      expect(pago.status).toBe(403)
      // La lectura tampoco: el residente no ve la deuda de las unidades ajenas.
      expect((await GET_CONVENIOS()).status).toBe(403)
    })
    expect(await prisma.convenioPago.count({ where: { comunidadId: COM_A } })).toBe(0)
    expect(await prisma.cuotaConvenio.count({ where: { comunidadId: COM_A } })).toBe(0)
  })

  it("sin acuerdo aprobado del Comité el alta es 400 con su motivo y no deja filas", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const inexistente = await POST_CONVENIO(
        terminos({ acuerdoId: "conv-ac-fantasma" })
      )
      expect(inexistente.status).toBe(400)
      expect(((await inexistente.json()) as { error: string }).error).toBe(
        "No se puede suscribir el convenio: el acuerdo del Comité no existe en esta comunidad."
      )

      const abierto = await POST_CONVENIO(terminos({ acuerdoId: ACUERDO_ABIERTO }))
      expect(abierto.status).toBe(400)
      expect(((await abierto.json()) as { error: string }).error).toBe(
        "No se puede suscribir el convenio: el acuerdo no está aprobado."
      )

      // La ley pide acuerdo del COMITÉ: uno de asamblea no autoriza el convenio.
      const asamblea = await POST_CONVENIO(terminos({ acuerdoId: ACUERDO_ASAMBLEA }))
      expect(asamblea.status).toBe(400)
      expect(((await asamblea.json()) as { error: string }).error).toBe(
        "No se puede suscribir el convenio: el acuerdo no es del Comité."
      )

      // El acuerdo de otra comunidad no existe para este scope.
      const ajeno = await POST_CONVENIO(terminos({ acuerdoId: ACUERDO_OTRA_COMUNIDAD }))
      expect(ajeno.status).toBe(400)
      expect(((await ajeno.json()) as { error: string }).error).toBe(
        "No se puede suscribir el convenio: el acuerdo del Comité no existe en esta comunidad."
      )
    })
    expect(await prisma.convenioPago.count({ where: { comunidadId: COM_A } })).toBe(0)
    expect(await prisma.cuotaConvenio.count({ where: { comunidadId: COM_A } })).toBe(0)
  })

  it("la unidad y el deudor se resuelven en la comunidad: el ajeno es 404 y no persiste", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const unidadAjena = await POST_CONVENIO(terminos({ unidadId: U_OTRA, personaId: P_OTRA }))
      expect(unidadAjena.status).toBe(404)
      expect(((await unidadAjena.json()) as { error: string }).error).toBe(
        "Unidad no encontrada."
      )

      const personaAjena = await POST_CONVENIO(terminos({ personaId: P_OTRA }))
      expect(personaAjena.status).toBe(404)
      expect(((await personaAjena.json()) as { error: string }).error).toBe(
        "Persona no encontrada."
      )
    })
    expect(await prisma.convenioPago.count({ where: { comunidadId: COM_A } })).toBe(0)
  })

  it("un deudor que no es propietario VIGENTE de la unidad es 400 literal y no escribe NADA", async () => {
    // El convenio regulariza la deuda del DUEÑO de la unidad (Ley 21.442 art. 6).
    // Aceptar a cualquier persona de la comunidad permitía crear el convenio de la
    // unidad 101 con el deudor de la 102: un registro válido de una deuda ajena.
    await conSesion(EMAIL_ADMIN, async () => {
      // P2 existe en la comunidad, pero es propietario de la 102, no de la 101.
      const otroDueno = await POST_CONVENIO(terminos({ personaId: P2 }))
      expect(otroDueno.status).toBe(400)
      expect(((await otroDueno.json()) as { error: string }).error).toBe(
        MENSAJE_DEUDOR_NO_PROPIETARIO
      )

      // Dueño de la 101 con el vínculo CERRADO: ya no es propietario vigente.
      const cerrado = await POST_CONVENIO(terminos({ personaId: P_CERRADO }))
      expect(cerrado.status).toBe(400)
      expect(((await cerrado.json()) as { error: string }).error).toBe(
        MENSAJE_DEUDOR_NO_PROPIETARIO
      )

      // Arrendatario vigente de la 101: vive ahí, no la debe.
      const arrendatario = await POST_CONVENIO(
        terminos({ personaId: P_ARRENDATARIO })
      )
      expect(arrendatario.status).toBe(400)
      expect(((await arrendatario.json()) as { error: string }).error).toBe(
        MENSAJE_DEUDOR_NO_PROPIETARIO
      )
    })

    // El rechazo no deja fila alguna: ni convenio, ni cuota, ni cargo, ni evento.
    expect(await prisma.convenioPago.count({ where: { comunidadId: COM_A } })).toBe(0)
    expect(await prisma.cuotaConvenio.count({ where: { comunidadId: COM_A } })).toBe(0)
    expect(await prisma.cobroFI.count({ where: { comunidadId: COM_A } })).toBe(0)
    expect(
      await prisma.eventoAuditoria.count({
        where: {
          comunidadId: COM_A,
          tipoAccion: { in: ["FI_CONVENIO_CREADO", "FI_CONVENIO_CARGOS"] },
        },
      })
    ).toBe(0)
  })

  it("el alta exige los términos del convenio → 400 por zod sin escribir", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const sinCuotas = await POST_CONVENIO(terminos({ numeroCuotas: 0 }))
      expect(sinCuotas.status).toBe(400)
      expect(((await sinCuotas.json()) as { error: string }).error).toBe(
        "Datos inválidos."
      )

      // La primera cuota se paga al suscribir: no puede superar la deuda.
      const primeraMayor = await POST_CONVENIO(terminos({ primeraCuota: 1_500_000 }))
      expect(primeraMayor.status).toBe(400)

      const primeraCero = await POST_CONVENIO(terminos({ primeraCuota: 0 }))
      expect(primeraCero.status).toBe(400)
    })
    expect(await prisma.convenioPago.count({ where: { comunidadId: COM_A } })).toBe(0)
  })

  it("sin fondo de gasto común activo el alta es 400 literal y no escribe NADA", async () => {
    await conSesion(EMAIL_ADMIN_B, async () => {
      const res = await POST_CONVENIO({
        unidadId: U_OTRA,
        personaId: P_OTRA,
        acuerdoId: ACUERDO_OTRA_COMUNIDAD,
        montoTotal: 300_000,
        numeroCuotas: 2,
        primeraCuota: 100_000,
      })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(MENSAJE_SIN_FONDO)
    })

    // Ni convenio, ni cuotas, ni cargos, ni auditoría: el fondo se resuelve antes
    // de la transacción que escribe. El fondo inactivo de B NO se usa.
    expect(
      await prisma.convenioPago.count({ where: { comunidadId: COM_B, unidadId: U_OTRA } })
    ).toBe(0)
    expect(await prisma.cuotaConvenio.count({ where: { comunidadId: COM_B } })).toBe(0)
    expect(await prisma.cobroFI.count({ where: { comunidadId: COM_B } })).toBe(0)
    expect(
      await prisma.eventoAuditoria.count({
        where: {
          comunidadId: COM_B,
          tipoAccion: { in: ["FI_CONVENIO_CREADO", "FI_CONVENIO_CARGOS"] },
        },
      })
    ).toBe(0)
    // El convenio preexistente de B sigue siendo el único de esa comunidad.
    expect(await prisma.convenioPago.count({ where: { comunidadId: COM_B } })).toBe(1)
  })

  it("si un cargo FI falla en medio de la transacción no queda NADA escrito", async () => {
    const ahoraFijo = Date.now()
    const reloj = vi.spyOn(Date, "now").mockReturnValue(ahoraFijo)
    const azar = vi.spyOn(Math, "random").mockReturnValue(0.5)
    // El id con el que la ruta identificará el cargo de la cuota 2, ya ocupado: la
    // escritura de los cargos choca contra la clave primaria y la transacción revierte.
    const idEnConflicto = generarId("cob", 2)
    try {
      await prisma.cobroFI.create({
        data: {
          id: idEnConflicto,
          comunidadId: COM_A,
          unidadId: U1,
          periodo: "2026-01",
          concepto: "gasto_comun",
          origenModulo: "FI",
          fondoId: FONDO_A,
          descripcion: "Cargo plantado para forzar la colisión de clave",
          montoBase: 1,
          fechaCargo: "2026-01-01",
          fechaVencimiento: "2026-01-01",
          moras: [],
          pagos: [],
          diferencias: [],
        },
      })

      await conSesion(EMAIL_ADMIN, async () => {
        const res = await POST_CONVENIO(terminos())
        expect(res.status).toBe(500)
        expect(((await res.json()) as { error: string }).error).toBe(
          "Error interno del servidor."
        )
      })

      // La transacción ya había escrito el convenio y sus cuotas cuando el cargo
      // chocó: si no fuera atómica, esas filas seguirían acá.
      expect(await prisma.convenioPago.count({ where: { comunidadId: COM_A } })).toBe(0)
      expect(await prisma.cuotaConvenio.count({ where: { comunidadId: COM_A } })).toBe(0)
      expect(await prisma.cobroFI.count({ where: { comunidadId: COM_A } })).toBe(1)
      expect(
        await prisma.eventoAuditoria.count({
          where: {
            comunidadId: COM_A,
            tipoAccion: { in: ["FI_CONVENIO_CREADO", "FI_CONVENIO_CARGOS"] },
          },
        })
      ).toBe(0)
    } finally {
      azar.mockRestore()
      reloj.mockRestore()
      await prisma.cobroFI.deleteMany({ where: { id: idEnConflicto } })
    }
  })

  it("con acuerdo aprobado del Comité el alta es 201: primera cuota pagada y N cuotas que suman el saldo", async () => {
    const creado = await crearConvenio(terminos())

    const enBd = await prisma.convenioPago.findUnique({
      where: { id: creado.id },
      include: { cuotas: { orderBy: { numero: "asc" } } },
    })
    expect(enBd).not.toBeNull()
    expect(enBd?.comunidadId).toBe(COM_A)
    expect(enBd?.unidadId).toBe(U1)
    expect(enBd?.personaId).toBe(P1)
    expect(enBd?.acuerdoId).toBe(ACUERDO_OK)
    expect(enBd?.estado).toBe("vigente")
    expect(enBd?.numeroCuotas).toBe(3)
    expect(enBd?.montoTotal).toBe(1_000_000)
    expect(enBd?.primeraCuota).toBe(333_333)
    expect(enBd?.creadoPor).toBe("conv-usuario-admin")

    const cuotas = enBd?.cuotas ?? []
    // Cuota 0 = el pago al suscribir, pagada el mismo día de la firma.
    expect(cuotas.map((cuota) => cuota.numero)).toEqual([0, 1, 2, 3])
    const primera = cuotas[0]!
    expect(primera.estado).toBe("pagada")
    expect(primera.monto).toBe(333_333)
    expect(primera.pagadaEn).not.toBeNull()
    expect(primera.registradaPor).toBe("conv-usuario-admin")
    expect(primera.venceEn.getTime()).toBe(enBd?.fechaSuscripcion.getTime())

    // Las cuotas del saldo nacen pendientes, con su vencimiento mensual creciente.
    const deuda = cuotas.slice(1)
    expect(deuda.map((cuota) => cuota.estado)).toEqual([
      "pendiente",
      "pendiente",
      "pendiente",
    ])
    expect(deuda.every((cuota) => cuota.pagadaEn === null)).toBe(true)
    for (let i = 1; i < deuda.length; i++) {
      expect(deuda[i]!.venceEn.getTime()).toBeGreaterThan(deuda[i - 1]!.venceEn.getTime())
    }

    // El saldo se reparte exacto al centavo (residuo en la última cuota).
    const saldo = deuda.reduce((suma, cuota) => suma + centavos(cuota.monto), 0)
    expect(saldo).toBe(centavos(1_000_000) - centavos(333_333))
    expect(deuda.map((cuota) => centavos(cuota.monto))).toEqual([
      22_222_233, 22_222_233, 22_222_234,
    ])

    // La respuesta trae la misma vista con los totales derivados.
    expect(creado.estado).toBe("vigente")
    expect(creado.cuotas.map((cuota) => cuota.numero)).toEqual([0, 1, 2, 3])
    expect(centavos(creado.totales.pagado)).toBe(centavos(333_333))
    expect(centavos(creado.totales.pendiente)).toBe(centavos(666_667))

    // El alta queda auditada con el monto y el folio del acuerdo que la autoriza.
    const evento = await prisma.eventoAuditoria.findFirst({
      where: {
        comunidadId: COM_A,
        tipoAccion: "FI_CONVENIO_CREADO",
        referenciaId: creado.id,
      },
    })
    expect(evento).not.toBeNull()
    expect(evento?.categoria).toBe("FI")
    expect(evento?.descripcion).toContain("AD-2026-8001")
    expect(evento?.descripcion).toContain("1.000.000")

    // La deuda del convenio quedó en la contabilidad FI: UN cargo por cuota 1..N,
    // ninguno por la cuota 0 (ya pagada al suscribir: contarla sería cobrar dos
    // veces el mismo dinero) y todos imputados al fondo de gasto común activo.
    const cargos = await prisma.cobroFI.findMany({
      where: { comunidadId: COM_A, origenRef: creado.id },
      orderBy: { periodo: "asc" },
    })
    expect(cargos).toHaveLength(3)
    expect(cargos.every((cargo) => cargo.unidadId === U1)).toBe(true)
    expect(cargos.every((cargo) => cargo.origenModulo === "FI")).toBe(true)
    expect(cargos.every((cargo) => cargo.concepto === "gasto_comun")).toBe(true)
    expect(cargos.every((cargo) => cargo.fondoId === FONDO_A)).toBe(true)
    expect(cargos.every((cargo) => (cargo.pagos as unknown[]).length === 0)).toBe(true)
    // El período de cada cargo es el mes en que vence su cuota, y su vencimiento
    // es el de la cuota: la cuota 0 no tiene ningún cargo.
    expect(cargos.map((cargo) => cargo.periodo)).toEqual(
      deuda.map((cuota) => cuota.venceEn.toISOString().slice(0, 7))
    )
    expect(cargos.map((cargo) => cargo.fechaVencimiento)).toEqual(
      deuda.map((cuota) => cuota.venceEn.toISOString().slice(0, 10))
    )
    expect(
      cargos.reduce((suma, cargo) => suma + centavos(cargo.montoBase), 0)
    ).toBe(saldo)
    // El detalle de cada cargo suma exactamente su monto base (S5).
    for (const cargo of cargos) {
      const lineas = cargo.lineas as unknown as Array<{
        concepto: string
        monto: number
        fondoId?: string
      }>
      expect(
        lineas.reduce((suma, linea) => suma + centavos(linea.monto), 0)
      ).toBe(centavos(cargo.montoBase))
      expect(lineas.every((linea) => linea.fondoId === FONDO_A)).toBe(true)
    }

    // UN evento con el CONTEO de cargos (no con los montos).
    const eventoCargos = await prisma.eventoAuditoria.findMany({
      where: {
        comunidadId: COM_A,
        tipoAccion: "FI_CONVENIO_CARGOS",
        referenciaId: creado.id,
      },
    })
    expect(eventoCargos).toHaveLength(1)
    expect(eventoCargos[0]?.categoria).toBe("FI")
    expect(eventoCargos[0]?.descripcion).toContain("3 cargo(s)")
  })

  it("una unidad no puede tener dos convenios vigentes: 409 y una sola fila", async () => {
    const antes = await prisma.convenioPago.count({ where: { comunidadId: COM_A, unidadId: U1 } })
    expect(antes).toBe(1)

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_CONVENIO(terminos({ montoTotal: 500_000, primeraCuota: 100_000 }))
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "La unidad ya tiene un convenio de pago vigente."
      )
    })

    expect(
      await prisma.convenioPago.count({ where: { comunidadId: COM_A, unidadId: U1 } })
    ).toBe(1)
    // El rechazo no dejó cuotas huérfanas.
    expect(await prisma.cuotaConvenio.count({ where: { comunidadId: COM_A } })).toBe(4)
  })

  it("pagar todas las cuotas deja el convenio saldado y audita cada pago", async () => {
    const convenio = await prisma.convenioPago.findFirst({ where: { comunidadId: COM_A } })
    expect(convenio).not.toBeNull()
    const convenioId = convenio!.id

    for (const numero of [1, 2, 3]) {
      await conSesion(EMAIL_ADMIN, async () => {
        const res = await POST_PAGO({ convenioId, numero })
        expect(res.status).toBe(200)
        const j = (await res.json()) as {
          cuotaPagada: number
          estado: string
          totales: { pagado: number; pendiente: number }
        }
        expect(j.cuotaPagada).toBe(numero)
        // Mientras queden cuotas pendientes el convenio sigue vigente.
        expect(j.estado).toBe(numero === 3 ? "saldado" : "vigente")
        if (numero === 3) expect(centavos(j.totales.pendiente)).toBe(0)
      })
    }

    const enBd = await prisma.convenioPago.findUnique({
      where: { id: convenioId },
      include: { cuotas: { orderBy: { numero: "asc" } } },
    })
    expect(enBd?.estado).toBe("saldado")
    const cuotas = enBd?.cuotas ?? []
    expect(cuotas.every((cuota) => cuota.estado === "pagada")).toBe(true)
    expect(cuotas.every((cuota) => cuota.pagadaEn !== null)).toBe(true)
    expect(cuotas.every((cuota) => cuota.registradaPor === "conv-usuario-admin")).toBe(true)
    const pagado = cuotas.reduce((suma, cuota) => suma + centavos(cuota.monto), 0)
    expect(pagado).toBe(centavos(1_000_000))

    // Cada pago de cuota quedó en SU cargo FI, una sola vez: ni una segunda fila
    // de cobro ni una segunda entrada de pago.
    const cargos = await prisma.cobroFI.findMany({
      where: { comunidadId: COM_A, origenRef: convenioId },
      orderBy: { periodo: "asc" },
    })
    expect(cargos).toHaveLength(3)
    expect(cargos.map((cargo) => centavos(cargo.montoBase))).toEqual(
      cuotas.slice(1).map((cuota) => centavos(cuota.monto))
    )
    for (const cargo of cargos) {
      const pagosDelCargo = cargo.pagos as unknown as Array<{
        monto: number
        fecha: string
        medio: string
      }>
      expect(pagosDelCargo).toHaveLength(1)
      expect(centavos(pagosDelCargo[0]!.monto)).toBe(centavos(cargo.montoBase))
      expect(pagosDelCargo[0]!.medio).toBe("convenio")
    }

    const eventos = await prisma.eventoAuditoria.findMany({
      where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_PAGO" },
    })
    expect(eventos).toHaveLength(3)
    expect(eventos.every((evento) => evento.referenciaId === convenioId)).toBe(true)
  })

  it("una cuota ya pagada no se vuelve a pagar: 409 sin tocar la fila", async () => {
    const convenio = await prisma.convenioPago.findFirst({ where: { comunidadId: COM_A } })
    const convenioId = convenio!.id
    const antes = await prisma.cuotaConvenio.findFirst({
      where: { convenioId, numero: 1 },
    })
    expect(antes?.estado).toBe("pagada")

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PAGO({ convenioId, numero: 1 })
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "La cuota ya está pagada."
      )

      // La cuota 0 (el pago al suscribir) también nace pagada.
      const primera = await POST_PAGO({ convenioId, numero: 0 })
      expect(primera.status).toBe(409)
    })

    const despues = await prisma.cuotaConvenio.findFirst({
      where: { convenioId, numero: 1 },
    })
    expect(despues?.pagadaEn?.getTime()).toBe(antes?.pagadaEn?.getTime())
    // El 409 tampoco agregó un segundo pago al cargo FI de la cuota.
    const cargoCuota1 = await prisma.cobroFI.findFirst({
      where: {
        comunidadId: COM_A,
        origenRef: convenioId,
        fechaVencimiento: antes!.venceEn.toISOString().slice(0, 10),
      },
    })
    expect((cargoCuota1?.pagos as unknown[] | undefined)?.length).toBe(1)
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_PAGO" },
      })
    ).toBe(3)
  })

  it("el pago de un convenio o una cuota ajenos es 404", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const convenioAjeno = await POST_PAGO({ convenioId: "conv-inexistente", numero: 1 })
      expect(convenioAjeno.status).toBe(404)
      expect(((await convenioAjeno.json()) as { error: string }).error).toBe(
        "Convenio no encontrado."
      )

      const convenio = await prisma.convenioPago.findFirst({ where: { comunidadId: COM_A } })
      const cuotaAjena = await POST_PAGO({ convenioId: convenio!.id, numero: 99 })
      expect(cuotaAjena.status).toBe(404)
      expect(((await cuotaAjena.json()) as { error: string }).error).toBe(
        "Cuota no encontrada."
      )
    })
  })

  it("la lectura devuelve los convenios con sus cuotas y los totales pagado/pendiente", async () => {
    // Segundo convenio (otra unidad): queda vigente con deuda pendiente.
    const segundo = await crearConvenio(
      terminos({
        unidadId: U2,
        personaId: P2,
        acuerdoId: ACUERDO_OK_U2,
        montoTotal: 400_000,
        numeroCuotas: 2,
        primeraCuota: 100_000,
      })
    )

    await conSesion(EMAIL_COMITE, async () => {
      const res = await GET_CONVENIOS("http://localhost/api/convenios?comunidadId=conv-com-b")
      expect(res.status).toBe(200)
      const j = (await res.json()) as {
        data: Array<{
          id: string
          estado: string
          unidadId: string
          cuotas: Array<{ numero: number; estado: string }>
          totales: { pagado: number; pendiente: number }
        }>
        total: number
      }

      expect(j.total).toBe(await prisma.convenioPago.count({ where: { comunidadId: COM_A } }))
      expect(j.data).toHaveLength(j.total)
      // El `comunidadId` de la URL no mueve el alcance: es la comunidad de la sesión.
      expect(j.data.every((convenio) => [U1, U2].includes(convenio.unidadId))).toBe(true)
      // El convenio de la comunidad B no aparece, y su unidad tampoco.
      expect(j.data.map((convenio) => convenio.id)).not.toContain(CONVENIO_COM_B)
      expect(j.data.map((convenio) => convenio.unidadId)).not.toContain(U_OTRA_PAGO)

      const saldado = j.data.find((convenio) => convenio.unidadId === U1)
      expect(saldado?.estado).toBe("saldado")
      expect(centavos(saldado?.totales.pendiente ?? -1)).toBe(0)
      expect(centavos(saldado?.totales.pagado ?? -1)).toBe(centavos(1_000_000))
      expect(saldado?.cuotas).toHaveLength(4)

      const vigente = j.data.find((convenio) => convenio.id === segundo.id)
      expect(vigente?.estado).toBe("vigente")
      // La cuota 0 nace pagada: el primer pago del convenio ya está en la base.
      expect(centavos(vigente?.totales.pagado ?? -1)).toBe(centavos(100_000))
      expect(centavos(vigente?.totales.pendiente ?? -1)).toBe(centavos(300_000))
      expect(
        centavos((vigente?.totales.pagado ?? 0) + (vigente?.totales.pendiente ?? 0))
      ).toBe(centavos(400_000))
    })
  })

  // ── El deudor se DERIVA de la unidad, no se elige a ciegas ────────────────
  describe("/api/convenios — la deuda y el deudor se derivan de la unidad", () => {
    it("sin sesión las dos rutas de derivación son 401", async () => {
      state.cookie = ""
      expect((await GET_UNIDADES_CON_DEUDA()).status).toBe(401)
      expect((await GET_DEUDORES(`?unidadId=${U_C_101}`)).status).toBe(401)
    })

    it("un rol sin `fi:cobranza` crear no deriva ni la deuda ni el deudor: 403", async () => {
      await conSesion(EMAIL_RESIDENTE, async () => {
        expect((await GET_UNIDADES_CON_DEUDA()).status).toBe(403)
        const deudores = await GET_DEUDORES(`?unidadId=${U1}`)
        expect(deudores.status).toBe(403)
        expect(((await deudores.json()) as { error: string }).error).toBe(
          "Permiso denegado."
        )
      })
    })

    it("`unidades-con-deuda` lista sólo las unidades con cobros VENCIDOS, con sus períodos y su deuda", async () => {
      await conSesion(EMAIL_ADMIN_C, async () => {
        const res = await GET_UNIDADES_CON_DEUDA()
        expect(res.status).toBe(200)
        const j = (await res.json()) as {
          data: Array<{
            unidadId: string
            numero: string
            etiqueta: string | null
            periodosVencidos: number
            deudaVencida: number
          }>
          total: number
          limite: number
          mostrados: number
        }

        // La 102 tiene dos cobros con fecha pasada y sólo UNO es deuda (el otro
        // está pagado); la 201 tiene un cobro que todavía no vence y no está morosa.
        expect(j.data.map((fila) => fila.unidadId).sort()).toEqual(
          [U_C_101, U_C_102].sort()
        )
        expect(j.data.map((fila) => fila.unidadId)).not.toContain(U_C_SIN_DEUDA)

        const c101 = j.data.find((fila) => fila.unidadId === U_C_101)!
        expect(c101.numero).toBe("101")
        expect(c101.etiqueta).toBe("Depto")
        expect(c101.periodosVencidos).toBe(2)
        expect(centavos(c101.deudaVencida)).toBe(centavos(30_000))

        const c102 = j.data.find((fila) => fila.unidadId === U_C_102)!
        expect(c102.numero).toBe("102")
        expect(c102.periodosVencidos).toBe(1)
        expect(centavos(c102.deudaVencida)).toBe(centavos(5_000))

        expect(j.total).toBe(2)
        expect(j.mostrados).toBe(j.data.length)
        expect(j.limite).toBe(50)
      })
    })

    it("el filtro `q` busca por número y por etiqueta, y nunca hace aparecer una unidad sin deuda", async () => {
      await conSesion(EMAIL_ADMIN_C, async () => {
        const porNumero = (await (await GET_UNIDADES_CON_DEUDA("?q=101")).json()) as {
          data: Array<{ unidadId: string; numero: string }>
        }
        expect(porNumero.data.map((fila) => fila.unidadId)).toEqual([U_C_101])

        const porEtiqueta = (await (await GET_UNIDADES_CON_DEUDA("?q=Ofic")).json()) as {
          data: Array<{ unidadId: string }>
        }
        expect(porEtiqueta.data.map((fila) => fila.unidadId)).toEqual([U_C_102])

        // La 201 coincide con el número buscado, pero no tiene deuda vencida: la
        // búsqueda ACOTA el universo de deudoras, no lo amplía.
        const sinDeuda = (await (await GET_UNIDADES_CON_DEUDA("?q=201")).json()) as {
          data: unknown[]
          total: number
        }
        expect(sinDeuda.data).toEqual([])
        expect(sinDeuda.total).toBe(0)
      })
    })

    it("la unidad de otra comunidad NUNCA aparece en el listado", async () => {
      await conSesion(EMAIL_ADMIN, async () => {
        const res = await GET_UNIDADES_CON_DEUDA()
        expect(res.status).toBe(200)
        const j = (await res.json()) as { data: Array<{ unidadId: string }> }
        const ajenas = [U_C_101, U_C_102, U_C_SIN_DEUDA]
        expect(j.data.every((fila) => !ajenas.includes(fila.unidadId))).toBe(true)
      })
    })

    it("`deudores` devuelve los propietarios VIGENTES y no el vínculo cerrado ni el arrendatario", async () => {
      await conSesion(EMAIL_ADMIN_C, async () => {
        const res = await GET_DEUDORES(`?unidadId=${U_C_101}`)
        expect(res.status).toBe(200)
        const j = (await res.json()) as {
          data: Array<{ personaId: string; nombreCompleto: string; rut: string | null }>
          total: number
        }

        // Dos propietarios vigentes, el más reciente primero: el mismo `orderBy`
        // del criterio de la cobranza FI.
        expect(j.data.map((deudor) => deudor.personaId)).toEqual([
          P_C_BRUNO,
          P_C_ANA,
        ])
        expect(
          j.data.find((deudor) => deudor.personaId === P_C_ANA)?.nombreCompleto
        ).toBe("Ana Propietaria")
        // El propietario con `fechaFin` y el arrendatario vigente NO son deudores.
        expect(j.data.map((deudor) => deudor.personaId)).not.toContain(P_C_CERRADO)
        expect(j.data.map((deudor) => deudor.personaId)).not.toContain(
          P_C_ARRENDATARIO
        )
        expect(j.total).toBe(2)
      })
    })

    it("`deudores` de una unidad de otra comunidad es 404 y sin `unidadId` es 400", async () => {
      await conSesion(EMAIL_ADMIN, async () => {
        const ajena = await GET_DEUDORES(`?unidadId=${U_C_101}`)
        expect(ajena.status).toBe(404)
        expect(((await ajena.json()) as { error: string }).error).toBe(
          "Unidad no encontrada."
        )

        const sinParametro = await GET_DEUDORES()
        expect(sinParametro.status).toBe(400)
        expect(((await sinParametro.json()) as { error: string }).error).toBe(
          "Falta el parámetro unidadId."
        )
      })
    })
  })

  // ── V5: el papel firmado a mano entra al archivo legal ────────────────────
  describe("/api/convenios/documento — el papel firmado se archiva y se sirve", () => {
      let deposito: ServidorDepositoFalso
      const entornoPrevio = {
        token: process.env.BLOB_READ_WRITE_TOKEN,
        base: process.env.BLOB_API_BASE_URL,
      }

      /** Alta del papel firmado por la API (el cuerpo que arma la pantalla). */
      async function POST_DOCUMENTO(body: Record<string, unknown>): Promise<Response> {
        const { POST } = await import("@/app/api/convenios/documento/route")
        return POST(
          new NextRequest("http://localhost/api/convenios/documento", {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
          })
        )
      }

      /** Descarga del papel firmado por la API. */
      async function GET_DOCUMENTO(convenioId: string): Promise<Response> {
        const { GET } = await import("@/app/api/convenios/documento/route")
        return GET(
          new NextRequest(
            `http://localhost/api/convenios/documento?convenioId=${encodeURIComponent(convenioId)}`,
            { method: "GET" }
          )
        )
      }

      /** Documento archivado del convenio que ya lo tiene (caso 1). */
      async function documentoDelConvenio(convenioId: string) {
        const convenio = await prisma.convenioPago.findUnique({ where: { id: convenioId } })
        if (!convenio?.documentoId) throw new Error("el convenio no tiene documento archivado")
        const documento = await prisma.documento.findUnique({ where: { id: convenio.documentoId } })
        if (!documento) throw new Error("el documento archivado no está en la base")
        return documento
      }

      beforeAll(async () => {
        deposito = await iniciarServidorDepositoFalso()
        // El único depósito que el código puede ver en la suite: 127.0.0.1.
        process.env.BLOB_READ_WRITE_TOKEN = TOKEN_DEL_DEPOSITO
        process.env.BLOB_API_BASE_URL = deposito.baseUrl

        // La corrida arranca sin documentos del archivo en estas comunidades: los
        // casos de abajo cuentan filas.
        await prisma.envioDocumento.deleteMany({
          where: { comunidadId: { in: [COM_A, COM_B] } },
        })
        await prisma.documento.deleteMany({
          where: { comunidadId: { in: [COM_A, COM_B] } },
        })
        await prisma.eventoAuditoria.deleteMany({
          where: {
            comunidadId: { in: [COM_A, COM_B] },
            tipoAccion: "FI_CONVENIO_DOCUMENTO_SUBIDO",
          },
        })

        // Dos convenios vigentes SIN documento firmado, escritos directo en la base:
        // la subida del papel no depende de cómo se suscribió el convenio.
        for (const convenio of [
          {
            id: CONVENIO_PARA_FIRMAR,
            unidadId: U_FIRMA,
          },
          {
            id: CONVENIO_DE_LA_SUBIDA_QUE_FALLA,
            unidadId: U_FIRMA_FALLA,
          },
        ]) {
          const datos = {
            comunidadId: COM_A,
            unidadId: convenio.unidadId,
            personaId: P1,
            acuerdoId: ACUERDO_OK,
            montoTotal: 600_000,
            numeroCuotas: 2,
            fechaSuscripcion: new Date("2026-03-31T12:00:00.000Z"),
            primeraCuota: 200_000,
            estado: "vigente",
            creadoPor: "conv-usuario-admin",
            documentoId: null,
          }
          await prisma.convenioPago.upsert({
            where: { id: convenio.id },
            update: datos,
            create: { id: convenio.id, ...datos },
          })
        }
      }, 30_000)

      beforeEach(() => {
        // `test/setup.ts` monta msw y rechaza toda petición no declarada. Las del
        // depósito salen de verdad, pero sólo hacia 127.0.0.1: se dejan pasar.
        servidorMSW.use(http.all(/^http:\/\/127\.0\.0\.1:\d+\//, () => passthrough()))
      })

      afterAll(async () => {
        try {
          await deposito.cerrar()
          if (entornoPrevio.token === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
          else process.env.BLOB_READ_WRITE_TOKEN = entornoPrevio.token
          if (entornoPrevio.base === undefined) delete process.env.BLOB_API_BASE_URL
          else process.env.BLOB_API_BASE_URL = entornoPrevio.base

          await prisma.envioDocumento.deleteMany({
            where: { comunidadId: { in: [COM_A, COM_B] } },
          })
          await prisma.documento.deleteMany({
            where: { comunidadId: { in: [COM_A, COM_B] } },
          })
          await prisma.eventoAuditoria.deleteMany({
            where: {
              comunidadId: { in: [COM_A, COM_B] },
              tipoAccion: "FI_CONVENIO_DOCUMENTO_SUBIDO",
            },
          })
        } catch {
          // intencional: limpieza best-effort, la base de la suite es descartable
        }
      }, 30_000)

      it("sube el PDF firmado: 201 con el documento legal real, el convenio apuntando y la constancia en pendiente", async () => {
        const pdf = pdfMinimo("convenio firmado de la unidad 103")
        const hashEsperado = createHash("sha256").update(pdf).digest("hex")

        let vista: VistaDocumentoFirmado | null = null
        await conSesion(EMAIL_ADMIN, async () => {
          const res = await POST_DOCUMENTO({
            convenioId: CONVENIO_PARA_FIRMAR,
            nombreArchivo: "convenio-firmado-101.pdf",
            contenidoBase64: pdf.toString("base64"),
          })
          expect(res.status).toBe(201)
          vista = (await res.json()) as VistaDocumentoFirmado
        })
        const creado = vista!

        // La respuesta dice lo que el archivo guardó: id, hash y tamaño REALES.
        expect(creado.convenioId).toBe(CONVENIO_PARA_FIRMAR)
        expect(creado.hash).toBe(hashEsperado)
        expect(creado.tamanoBytes).toBe(pdf.length)
        expect(creado.archivoNombre).toBe("convenio-firmado-101.pdf")

        const documento = await prisma.documento.findUnique({ where: { id: creado.id } })
        expect(documento).not.toBeNull()
        expect(documento?.comunidadId).toBe(COM_A)
        expect(documento?.naturaleza).toBe("legal")
        expect(documento?.tipoDocumental).toBe("otros")
        expect(documento?.glosa).toContain("103")
        expect(documento?.archivoNombre).toBe("convenio-firmado-101.pdf")
        expect(documento?.archivoTipoMime).toBe("application/pdf")
        expect(documento?.archivoTamanoKB).toBe(
          Math.round((pdf.length / 1024) * 10) / 10
        )
        expect(documento?.hash).toBe(hashEsperado)
        // Lo archivado es la RUTA del depósito privado, nunca un enlace público.
        expect(documento?.archivoUrl).not.toMatch(/^https?:/i)
        expect(documento?.archivoUrl?.startsWith("convenios/")).toBe(true)
        expect(documento?.archivoUrl).toContain(CONVENIO_PARA_FIRMAR)
        // La referencia auténtica es el acuerdo del Comité que autoriza el convenio.
        expect(documento?.referenciaAutentica).toContain("AD-2026-8001")
        // La vigencia del papel es la fecha de suscripción del convenio.
        expect(documento?.vigenteDesde).toBe("2026-03-31")
        expect(documento?.version).toBeGreaterThanOrEqual(1)

        // Los bytes que recibió el depósito son exactamente los del PDF, en la ruta
        // que quedó archivada, y con acceso privado.
        const guardado = deposito.objetos.get(documento!.archivoUrl)
        expect(guardado).toBeDefined()
        expect(Buffer.compare(guardado!.bytes, pdf)).toBe(0)
        const subida = deposito.peticiones.find((peticion) => peticion.metodo === "PUT")
        expect(subida?.pathname).toBe(documento!.archivoUrl)
        expect(subida?.acceso).toBe("private")
        expect(subida?.version).toBe(VERSION_API_DEL_DEPOSITO)

        // El convenio queda apuntando a su papel.
        const convenio = await prisma.convenioPago.findUnique({
          where: { id: CONVENIO_PARA_FIRMAR },
        })
        expect(convenio?.documentoId).toBe(creado.id)

        // La constancia de entrega al DEUDOR nace `pendiente`: no se cursó ningún envío.
        const envios = await prisma.envioDocumento.findMany({
          where: { documentoId: creado.id },
        })
        expect(envios).toHaveLength(1)
        const envio = envios[0]!
        expect(envio.comunidadId).toBe(COM_A)
        expect(envio.personaId).toBe(P1)
        expect(envio.canal).toBe("email")
        expect(envio.estado).toBe("pendiente")
        expect(envio.notificacionId).toBeNull()
        expect(envio.claveEnvio).toBe(`${creado.id}:${P1}:email`)
        expect(envio.motivo).toContain("no se cursó")
        expect(creado.constancia).toEqual({
          id: envio.id,
          estado: "pendiente",
          personaId: P1,
          motivo: envio.motivo,
        })

        // El papel queda auditado con el folio que lo autoriza.
        const evento = await prisma.eventoAuditoria.findFirst({
          where: {
            comunidadId: COM_A,
            tipoAccion: "FI_CONVENIO_DOCUMENTO_SUBIDO",
            referenciaId: CONVENIO_PARA_FIRMAR,
          },
        })
        expect(evento).not.toBeNull()
        expect(evento?.categoria).toBe("FI")
        expect(evento?.descripcion).toContain(creado.id)
        expect(evento?.descripcion).toContain("AD-2026-8001")
      })

      it("la descarga devuelve los MISMOS bytes y el mismo sha256 que se archivaron", async () => {
        const documento = await documentoDelConvenio(CONVENIO_PARA_FIRMAR)
        const guardado = deposito.objetos.get(documento.archivoUrl)
        expect(guardado).toBeDefined()

        // El Comité AUDITA la cobranza: `fi:cobranza` ver alcanza para leer el papel.
        await conSesion(EMAIL_COMITE, async () => {
          const res = await GET_DOCUMENTO(CONVENIO_PARA_FIRMAR)
          expect(res.status).toBe(200)
          expect(res.headers.get("content-type")).toBe("application/pdf")
          expect(res.headers.get("content-disposition")).toBe(
            'attachment; filename="convenio-firmado-101.pdf"'
          )
          // `no-store`: es el papel de un deudor, no un recurso cacheable.
          expect(res.headers.get("cache-control")).toBe("no-store")
          expect(res.headers.get("content-length")).toBe(String(guardado!.bytes.length))

          const servidos = Buffer.from(await res.arrayBuffer())
          // Byte por byte contra lo que el depósito tiene guardado...
          expect(Buffer.compare(servidos, guardado!.bytes)).toBe(0)
          // ...y el sha256 servido es el hash que el archivo legal declara.
          expect(createHash("sha256").update(servidos).digest("hex")).toBe(documento.hash)
          expect(servidos.toString("latin1").startsWith("%PDF-")).toBe(true)
        })
      })

      it("un archivo que no es PDF es 400 literal y no toca ni la base ni el depósito", async () => {
        const documentosAntes = await prisma.documento.count({
          where: { comunidadId: COM_A },
        })
        const enviosAntes = await prisma.envioDocumento.count({
          where: { comunidadId: COM_A },
        })
        const eventosAntes = await prisma.eventoAuditoria.count({
          where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_DOCUMENTO_SUBIDO" },
        })
        const peticionesAntes = deposito.peticiones.length

        // Un escaneo JPEG: los vecinos SOLO pueden subir PDF, así que este archivo no
        // entra al archivo legal y no hay nada que rechazar más tarde.
        const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

        await conSesion(EMAIL_ADMIN, async () => {
          const res = await POST_DOCUMENTO({
            convenioId: CONVENIO_DE_LA_SUBIDA_QUE_FALLA,
            nombreArchivo: "escaneo.jpg",
            contenidoBase64: jpeg.toString("base64"),
          })
          expect(res.status).toBe(400)
          expect(((await res.json()) as { error: string }).error).toBe(MENSAJE_NO_ES_PDF)
        })

        expect(await prisma.documento.count({ where: { comunidadId: COM_A } })).toBe(
          documentosAntes
        )
        expect(await prisma.envioDocumento.count({ where: { comunidadId: COM_A } })).toBe(
          enviosAntes
        )
        expect(
          await prisma.eventoAuditoria.count({
            where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_DOCUMENTO_SUBIDO" },
          })
        ).toBe(eventosAntes)
        expect(
          (
            await prisma.convenioPago.findUnique({
              where: { id: CONVENIO_DE_LA_SUBIDA_QUE_FALLA },
            })
          )?.documentoId
        ).toBeNull()
        // El depósito no se tocó: un archivo que no es PDF no se sube ni para
        // descubrir después que no se podía archivar.
        expect(deposito.peticiones.length).toBe(peticionesAntes)
      })

      it("el papel firmado se sube UNA sola vez: el segundo intento es 409 y el primero queda intacto", async () => {
        const antes = await documentoDelConvenio(CONVENIO_PARA_FIRMAR)
        const objetosAntes = deposito.objetos.size
        const enviosAntes = await prisma.envioDocumento.count({
          where: { comunidadId: COM_A },
        })

        // Un PDF con OTROS bytes: si la ruta lo aceptara, el hash archivado dejaría de
        // ser el de la firma que el deudor puso en el papel.
        const otroPdf = pdfMinimo("una segunda firma que no corresponde")
        await conSesion(EMAIL_ADMIN, async () => {
          const res = await POST_DOCUMENTO({
            convenioId: CONVENIO_PARA_FIRMAR,
            nombreArchivo: "convenio-firmado-101-v2.pdf",
            contenidoBase64: otroPdf.toString("base64"),
          })
          expect(res.status).toBe(409)
          expect(((await res.json()) as { error: string }).error).toBe(
            MENSAJE_YA_TIENE_DOCUMENTO
          )
        })

        const despues = await documentoDelConvenio(CONVENIO_PARA_FIRMAR)
        expect(despues.id).toBe(antes.id)
        expect(despues.hash).toBe(antes.hash)
        expect(despues.archivoUrl).toBe(antes.archivoUrl)
        expect(despues.version).toBe(antes.version)
        // El depósito no ganó un segundo objeto ni cambió el de la firma.
        expect(deposito.objetos.size).toBe(objetosAntes)
        expect(
          createHash("sha256")
            .update(deposito.objetos.get(antes.archivoUrl)!.bytes)
            .digest("hex")
        ).toBe(antes.hash)
        expect(
          await prisma.envioDocumento.count({ where: { comunidadId: COM_A } })
        ).toBe(enviosAntes)
      })

      it("el convenio de otra comunidad es 404 en las dos rutas y no deja filas", async () => {
        await conSesion(EMAIL_ADMIN, async () => {
          const subida = await POST_DOCUMENTO({
            convenioId: CONVENIO_COM_B,
            nombreArchivo: "convenio-firmado-901.pdf",
            contenidoBase64: pdfMinimo("convenio de la otra comunidad").toString("base64"),
          })
          expect(subida.status).toBe(404)
          expect(((await subida.json()) as { error: string }).error).toBe(
            "Convenio no encontrado."
          )

          const descarga = await GET_DOCUMENTO(CONVENIO_COM_B)
          expect(descarga.status).toBe(404)
          expect(((await descarga.json()) as { error: string }).error).toBe(
            "Convenio no encontrado."
          )
        })

        // El convenio ajeno no ganó documento ni constancia, y el depósito no se tocó.
        expect(await prisma.documento.count({ where: { comunidadId: COM_B } })).toBe(0)
        expect(await prisma.envioDocumento.count({ where: { comunidadId: COM_B } })).toBe(0)
        expect(
          (
            await prisma.convenioPago.findUnique({ where: { id: CONVENIO_COM_B } })
          )?.documentoId
        ).toBeNull()
      })

      it("el residente no sube ni descarga el convenio firmado: 403 en las dos rutas", async () => {
        await conSesion(EMAIL_RESIDENTE, async () => {
          const subida = await POST_DOCUMENTO({
            convenioId: CONVENIO_PARA_FIRMAR,
            nombreArchivo: "convenio-firmado-101.pdf",
            contenidoBase64: pdfMinimo("un residente no firma por la administración").toString(
              "base64"
            ),
          })
          expect(subida.status).toBe(403)
          expect(((await subida.json()) as { error: string }).error).toBe("Permiso denegado.")

          // El papel lleva el nombre del deudor y su deuda: el vecino no lo lee.
          const descarga = await GET_DOCUMENTO(CONVENIO_PARA_FIRMAR)
          expect(descarga.status).toBe(403)
          expect(((await descarga.json()) as { error: string }).error).toBe(
            "Permiso denegado."
          )
        })

        const documento = await documentoDelConvenio(CONVENIO_PARA_FIRMAR)
        expect(documento.hash).not.toBe(
          createHash("sha256")
            .update(pdfMinimo("un residente no firma por la administración"))
            .digest("hex")
        )
      })

      it("la descarga de un convenio sin documento firmado es 409 con su motivo", async () => {
        await conSesion(EMAIL_ADMIN, async () => {
          const res = await GET_DOCUMENTO(CONVENIO_DE_LA_SUBIDA_QUE_FALLA)
          expect(res.status).toBe(409)
          expect(((await res.json()) as { error: string }).error).toBe(MENSAJE_SIN_DOCUMENTO)
        })
      })

      it("si la subida al depósito falla no se escribe NADA", async () => {
        const documentosAntes = await prisma.documento.count({
          where: { comunidadId: COM_A },
        })
        const enviosAntes = await prisma.envioDocumento.count({
          where: { comunidadId: COM_A },
        })
        const eventosAntes = await prisma.eventoAuditoria.count({
          where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_DOCUMENTO_SUBIDO" },
        })
        const objetosAntes = deposito.objetos.size

        deposito.modo = "rechazar_subida"
        try {
          await conSesion(EMAIL_ADMIN, async () => {
            const res = await POST_DOCUMENTO({
              convenioId: CONVENIO_DE_LA_SUBIDA_QUE_FALLA,
              nombreArchivo: "convenio-firmado-104.pdf",
              contenidoBase64: pdfMinimo("el depósito no guardó").toString("base64"),
            })
            expect(res.status).toBe(502)
            expect(((await res.json()) as { error: string }).error).toBe(
              MENSAJE_SUBIDA_FALLIDA
            )
          })
        } finally {
          deposito.modo = "aceptar"
        }

        // Sin archivo no hay documento legal, ni vínculo, ni constancia, ni evento.
        expect(await prisma.documento.count({ where: { comunidadId: COM_A } })).toBe(
          documentosAntes
        )
        expect(await prisma.envioDocumento.count({ where: { comunidadId: COM_A } })).toBe(
          enviosAntes
        )
        expect(
          await prisma.eventoAuditoria.count({
            where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_DOCUMENTO_SUBIDO" },
          })
        ).toBe(eventosAntes)
        expect(
          (
            await prisma.convenioPago.findUnique({
              where: { id: CONVENIO_DE_LA_SUBIDA_QUE_FALLA },
            })
          )?.documentoId
        ).toBeNull()
        expect(deposito.objetos.size).toBe(objetosAntes)
      })

      it("si la transacción falla después de subir, el archivo se BORRA del depósito", async () => {
        const ahoraFijo = Date.now()
        const reloj = vi.spyOn(Date, "now").mockReturnValue(ahoraFijo)
        const azar = vi.spyOn(Math, "random").mockReturnValue(0.5)
        // El id con el que la ruta identificará el documento, ya ocupado: el alta del
        // `Documento` choca contra la clave primaria y la transacción revierte.
        const idEnConflicto = generarId("doc")
        const documentosAntes = await prisma.documento.count({
          where: { comunidadId: COM_A },
        })
        try {
          await prisma.documento.create({
            data: {
              id: idEnConflicto,
              comunidadId: COM_A,
              naturaleza: "legal",
              tipoDocumental: "otros",
              glosa: "Documento plantado para forzar la colisión de clave",
              referenciaAutentica: "sin referencia",
              archivoNombre: "plantado.pdf",
              archivoTipoMime: "application/pdf",
              archivoTamanoKB: 1,
              archivoUrl: "convenios/plantado.pdf",
              hash: null,
              version: 999,
              vigenteDesde: "2026-01-01",
            },
          })

          const peticionesAntes = deposito.peticiones.length
          await conSesion(EMAIL_ADMIN, async () => {
            const res = await POST_DOCUMENTO({
              convenioId: CONVENIO_DE_LA_SUBIDA_QUE_FALLA,
              nombreArchivo: "convenio-firmado-104.pdf",
              contenidoBase64: pdfMinimo("la transacción no se pudo aplicar").toString("base64"),
            })
            expect(res.status).toBe(500)
            expect(((await res.json()) as { error: string }).error).toBe(
              "Error interno del servidor."
            )
          })

          const subidas = deposito.peticiones
            .slice(peticionesAntes)
            .filter((peticion) => peticion.metodo === "PUT")
          // Se subió UNA vez: el reintento del contador de versiones reintenta la
          // transacción, no la subida del archivo.
          expect(subidas).toHaveLength(1)
          // Y como la transacción no se pudo aplicar, el archivo se borró: no queda un
          // huérfano en el depósito que nadie pueda volver a leer.
          expect(deposito.borrados).toContain(subidas[0]!.pathname)
          expect(deposito.objetos.has(subidas[0]!.pathname)).toBe(false)

          expect(await prisma.documento.count({ where: { comunidadId: COM_A } })).toBe(
            documentosAntes + 1
          )
          expect(
            (
              await prisma.convenioPago.findUnique({
                where: { id: CONVENIO_DE_LA_SUBIDA_QUE_FALLA },
              })
            )?.documentoId
          ).toBeNull()
          expect(await prisma.envioDocumento.count({ where: { comunidadId: COM_A } })).toBe(1)
          expect(
            await prisma.eventoAuditoria.count({
              where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_DOCUMENTO_SUBIDO" },
            })
          ).toBe(1)
        } finally {
          azar.mockRestore()
          reloj.mockRestore()
          await prisma.documento.deleteMany({ where: { id: idEnConflicto } })
        }
      })
    })
})
