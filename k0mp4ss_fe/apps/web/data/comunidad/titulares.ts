/**
 * data/comunidad/titulares.ts — completa la titularidad de la comunidad de demo.
 *
 * El agujero que cierra: `data/inventario/estructura.ts` declara 166 unidades y
 * `data/comunidad/vinculos.ts` dejaba 132 sin propietario vigente (47 deptos, 2
 * locales y 83 estacionamientos). Una unidad sin dueño no se puede cobrar: la
 * morosidad, el convenio y la emisión de gasto común apuntan a una persona que no
 * existe, así que la fila se ve y no hay a quién cobrarle.
 *
 * Por qué es un módulo y no 132 filas escritas a mano: los datos son ficticios y
 * deterministas (misma semilla, mismo resultado), y así la mezcla de casos se
 * puede LEER y mantener en un solo lugar. El seed los escribe con el mismo
 * `upsert` idempotente que el resto de `data/` (ver `scripts/seed-db-from-data.ts`).
 *
 * La mezcla que deja (166 unidades, todas con propietario vigente):
 *   - la mayoría: un propietario que vive en su unidad (`habitada`);
 *   - 4 deptos: el dueño NO vive ahí (`desocupada`): caso normal que debe existir;
 *   - 3 unidades: dos dueños en la misma unidad, un propietario y un
 *     copropietario (la unidad vota UNA vez, ver `specs/GD-gestion-directiva`);
 *   - los locales: uno arrendado y otro en venta;
 *   - los estacionamientos (83): su titular es el dueño de un depto o local —la
 *     plaza no se habita, así que no declara estado inmobiliario— y la
 *     titularidad de la plaza se suma a la de su dueño;
 *   - las 12 unidades que ya tenían arrendatario en `data/` conservan su
 *     arrendatario vigente; el permiso para declarar el Registro lo enciende
 *     `data/comunidad/vinculos.ts` en UNO solo (v-12), así los dos caminos
 *     —habilitado y no habilitado— se pueden probar a mano.
 *
 * NO reemplaza ni re-apunta filas existentes: solo agrega personas y vínculos con
 * ids propios (`p-titular-*`, `p-copropietario-*`, `v-titular-*`,
 * `v-copropietario-*`), y sus RUT no chocan con los de `data/`.
 */
import { calcularDigitoVerificador } from "../../lib/rut"
import { unidades, type Unidad } from "../inventario/estructura"
import type { Persona } from "./personas"
import { personas } from "./personas"
import { vinculos, type VinculoUnidad } from "./vinculos"

/** Nombres y apellidos ficticios, en la convención de `data/` (nada de "lorem ipsum"). */
const NOMBRES = [
  "Amanda", "Ignacio", "Belen", "Cristian", "Daniela", "Emilio", "Francisca", "Gonzalo",
  "Hilda", "Ivan", "Javiera", "Leonardo", "Magdalena", "Nelson", "Olivia", "Patricio",
  "Quimey", "Ricardo", "Silvana", "Teodoro", "Ursula", "Victor", "Waleska", "Ximena",
  "Yasna", "Zacarias", "Alondra", "Bruno", "Carolina", "Dario", "Elisa", "Facundo",
]
const APELLIDOS = [
  "Abarca", "Bustamante", "Caceres", "Delgado", "Escobar", "Fierro", "Gaete", "Herrera",
  "Ibarra", "Jara", "Klein", "Leiva", "Molina", "Navarrete", "Orellana", "Pizarro",
  "Quiroga", "Riquelme", "Saavedra", "Toledo", "Urrutia", "Vergara", "Werner", "Yanez",
  "Zapata", "Alarcon", "Bravo", "Cortes", "Donoso", "Elgueta",
]

/** Fechas de inicio de la titularidad: estables para que la semilla sea reproducible. */
const FECHAS_INICIO = ["2021-06-01", "2022-09-15", "2023-04-01", "2024-01-10"] as const

/** Primer cuerpo de RUT de la generación; se salta cualquiera ya usado en `data/`. */
const CUERPO_RUT_INICIAL = 21_000_000

/** El estado inmobiliario que declara un dueño que no vive en su unidad. */
const DESOCUPADA = "desocupada"

const pad = (n: number) => String(n).padStart(2, "0")

/** Clave de comparación de RUT: sin puntos y en mayúscula, como la del seed. */
function claveRut(rut: string): string {
  return rut.trim().toUpperCase().replace(/\./g, "").replace(/\s/g, "")
}

function rutDesdeCuerpo(cuerpo: number): string {
  const cuerpoTexto = String(cuerpo)
  const conPuntos = cuerpoTexto.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return `${conPuntos}-${calcularDigitoVerificador(cuerpoTexto)}`
}

/** Correo ficticio: sin acentos ni espacios, con el id para que nunca se repita. */
function correoDe(nombres: string, apellidos: string, id: string): string {
  const limpiar = (valor: string) =>
    valor
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z]/g, "")
  return `${limpiar(nombres.split(" ")[0] ?? "")}.${limpiar(apellidos.split(" ")[0] ?? "")}.${id}@demo.cl`
}

function nombreCompletoDe(indice: number): { nombres: string; apellidos: string } {
  const nombres = `${NOMBRES[indice % NOMBRES.length]} ${NOMBRES[(indice * 7 + 3) % NOMBRES.length]}`
  const apellidos = `${APELLIDOS[indice % APELLIDOS.length]} ${APELLIDOS[(indice * 5 + 2) % APELLIDOS.length]}`
  return { nombres, apellidos }
}

/** ¿La unidad es un estacionamiento? Es la única que no se habita. */
function esEstacionamiento(unidad: Unidad): boolean {
  return unidad.etiqueta === "Estacionamiento"
}

/**
 * Genera las personas y vínculos que completan la titularidad. Se calcula desde
 * la semilla estática (no desde la base) para que dos corridas dejen lo mismo y
 * el resultado se pueda probar sin base de datos.
 */
export function generarTitularesDeDemo(): {
  personas: Persona[]
  vinculos: VinculoUnidad[]
} {
  const vigentes = vinculos.filter((v) => !v.fechaFin)
  const conPropietario = new Set(
    vigentes.filter((v) => v.rol === "propietario").map((v) => v.unidadId)
  )
  const conCopropietario = new Set(
    vigentes.filter((v) => v.rol === "copropietario").map((v) => v.unidadId)
  )
  const conArrendatario = new Set(
    vigentes.filter((v) => v.rol === "arrendatario").map((v) => v.unidadId)
  )

  const faltantes = unidades.filter((u) => !conPropietario.has(u.id))
  const residenciales = faltantes.filter((u) => !esEstacionamiento(u))
  const estacionamientos = faltantes.filter(esEstacionamiento)

  // Los casos especiales se eligen por posición en la semilla (determinista).
  // No se toca una unidad que ya tenga copropietario: esa ya es "dos dueños".
  const deptosLibres = residenciales.filter(
    (u) => u.etiqueta === "Depto" && !conArrendatario.has(u.id) && !conCopropietario.has(u.id)
  )
  const desocupadas = new Set(deptosLibres.slice(0, 4).map((u) => u.id))
  const conSegundoDuenio = new Set(deptosLibres.slice(4, 6).map((u) => u.id))

  // RUT: se reservan los de la semilla existente para no chocar con ninguna fila.
  const rutsUsados = new Set(personas.map((p) => claveRut(p.rut)))
  let siguienteCuerpo = CUERPO_RUT_INICIAL
  const rutNuevo = (): string => {
    for (;;) {
      const rut = rutDesdeCuerpo(siguienteCuerpo++)
      if (!rutsUsados.has(claveRut(rut))) {
        rutsUsados.add(claveRut(rut))
        return rut
      }
    }
  }

  let indice = 0
  const nuevaPersona = (id: string, roles: Persona["roles"]): Persona => {
    const { nombres, apellidos } = nombreCompletoDe(indice)
    const nombreCompleto = `${nombres} ${apellidos}`
    const persona: Persona = {
      id,
      rut: rutNuevo(),
      nombreCompleto,
      nombres,
      apellidos,
      email: correoDe(nombres, apellidos, id),
      telefonoMovil: `+56 9 ${String(3000 + (indice % 6000)).padStart(4, "0")} ${String(
        1000 + ((indice * 37) % 9000)
      ).padStart(4, "0")}`,
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles,
    }
    indice++
    return persona
  }

  const nuevasPersonas: Persona[] = []
  const nuevosVinculos: VinculoUnidad[] = []

  /** Titular de una unidad residencial: un propietario por unidad. */
  const porDuenio = new Map<string, string>()
  residenciales.forEach((unidad, posicion) => {
    const id = `p-titular-${pad(posicion + 1)}`
    const estado = desocupadas.has(unidad.id)
      ? DESOCUPADA
      : conArrendatario.has(unidad.id)
        ? "arrendada"
        : unidad.etiqueta === "Local"
          ? "en_venta"
          : "habitada"
    const viveAhi = estado === "habitada"
    nuevasPersonas.push(nuevaPersona(id, viveAhi ? ["propietario", "residente"] : ["propietario"]))
    nuevosVinculos.push({
      id: `v-titular-${pad(posicion + 1)}`,
      personaId: id,
      unidadId: unidad.id,
      rol: "propietario",
      fechaInicio: FECHAS_INICIO[posicion % FECHAS_INICIO.length] as string,
      estadoOcupacionPropiedad: estado,
      permiteVerFinanzas: estado !== "en_venta",
    })
    porDuenio.set(unidad.id, id)
  })

  // Dos unidades con dos dueños: propietario (arriba) + copropietario. La
  // unidad ejerce UN voto, el del propietario: el copropietario no vota aparte.
  let copropietario = 1
  for (const unidad of residenciales.filter((u) => conSegundoDuenio.has(u.id))) {
    const id = `p-copropietario-${pad(copropietario)}`
    nuevasPersonas.push(nuevaPersona(id, ["propietario"]))
    nuevosVinculos.push({
      id: `v-copropietario-${pad(copropietario)}`,
      personaId: id,
      unidadId: unidad.id,
      rol: "copropietario",
      fechaInicio: FECHAS_INICIO[copropietario % FECHAS_INICIO.length] as string,
      estadoOcupacionPropiedad: "habitada",
      permiteVerFinanzas: true,
    })
    copropietario++
  }

  // Los estacionamientos pertenecen a los dueños de las unidades residenciales:
  // la plaza acompaña a la unidad y su prorrateo suma al del mismo dueño.
  const duenios = residenciales.map((u) => porDuenio.get(u.id) as string)
  estacionamientos.forEach((plaza, posicion) => {
    nuevosVinculos.push({
      id: `v-titular-plaza-${plaza.id}`,
      personaId: duenios[posicion % duenios.length] as string,
      unidadId: plaza.id,
      rol: "propietario",
      fechaInicio: FECHAS_INICIO[posicion % FECHAS_INICIO.length] as string,
      // Una plaza no se habita: no declara estado inmobiliario.
      estadoOcupacionPropiedad: undefined,
      permiteVerFinanzas: true,
    })
  })

  return { personas: nuevasPersonas, vinculos: nuevosVinculos }
}

/** Semilla calculada una vez: el seed y las pruebas leen el mismo resultado. */
export const titularesDeDemo = generarTitularesDeDemo()
