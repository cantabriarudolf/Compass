/**
 * propiedad-de-alta — la guardia de ESCRITURA que el alcance por filas no puede dar.
 *
 * El alcance por filas (`CrudConfig.alcance`, los `_alcance.ts` de cada recurso, el
 * `alcance` de `put-merge`) acota filas EXISTENTES: colección, detalle, PUT y DELETE.
 * Un ALTA no se puede validar con un `where`, porque la fila todavía no existe: la
 * comparación que falta no es «¿puedo ver esta fila?» sino «¿el dueño que este payload
 * reclama es el actor?». Eso es lo que responde este módulo, y por eso la guardia se
 * declara en la ruta (`antesDeEscribir` de la factory / del put-merge, o antes de la
 * transacción en un POST custom), después del authz y ANTES de tocar Prisma.
 *
 * Forma: la de `rechazoDeSolicitudAjena` (`app/api/ge/solicitudes/_alcance.ts`), que
 * fue la primera ruta con esta cerradura. Se factoriza acá porque la serie «permisos por
 * objeto» cerró el mismo hueco en varios recursos y cada uno lo reimplementaba; lo que
 * NO se factoriza son los nombres de campo de cada recurso —cada ruta declara los
 * suyos, que es lo único que cambia entre ellos—:
 *
 * ```ts
 * const corto = await rechazoDeAltaAjena({
 *   scope,
 *   pretension: { personaId: datos.trabajadorPersonaId },
 * })
 * if (corto) return corto
 * ```
 *
 * Reglas, en tres estados (la misma decisión de `alcancePorFilasDeSesion`):
 *
 * - Gestión (administrador, comité) → `gestion`: crea para quien quiera, como siempre.
 * - Rol acotado con identidad → `propio` si el payload solo reclama SU persona y SUS
 *   unidades con vínculo vigente; `ajeno` en cualquier otro caso. La identidad y los
 *   vínculos salen de la BD de la sesión (`personaIdDelUsuarioDb`,
 *   `unidadesVinculadasDb`), nunca del body ni del query: el cliente no puede
 *   declararse dueño de nada.
 * - Rol acotado SIN identidad MP (`denegado`) → `ajeno` si el payload reclama algo.
 *   Sin ficha no hay «lo propio» con lo que comparar, y abrir por falta de alta del
 *   usuario sería un fallo ABIERTO (el mismo criterio de T16 y el que ya aplicaba
 *   `rechazoDeSolicitudAjena`).
 *
 * Un campo de propiedad AUSENTE no bloquea: el payload no está reclamando nada, y si el
 * recurso lo exige, quien decide es su schema Zod. El veredicto es sobre lo que el
 * payload afirma, no sobre lo que el modelo podría llegar a rellenar.
 *
 * La fila ajena responde 404 «Registro no encontrado.» y no 403: el 403 confirmaría que
 * la persona o la unidad reclamada existe. Es el contrato de la serie para toda fila
 * ajena, y la guardia lo devuelve con el mismo cuerpo genérico.
 */
import { alcancePorFilasDeSesion, unidadesVinculadasDb } from "./sesion-persona"
import { jsonError, type ComunidadScope } from "./with-comunidad-scope"

/**
 * Lo que el payload del alta AFIRMA sobre el dueño de la fila.
 *
 * Los dos campos son opcionales por separado: un recurso puede tener dueño-persona y
 * dueño-unidad (`ra/reservas`, `ge/solicitudes`), solo persona (`pe/cierres-turno`,
 * `pe/turnos/iniciar`, `ir/solicitudes-insumo`) o solo unidad. Se tipan como `unknown`
 * a propósito: la guardia corre sobre payloads que Zod ya validó o sobre la fusión de
 * un PUT parcial, y un campo ausente, `null` o de otro tipo es «no reclama».
 */
export type PretensionDePropiedad = {
  personaId?: unknown
  unidadId?: unknown
}

/**
 * Respuesta del veredicto (ver el encabezado):
 *
 * - `gestion`: el rol no está acotado por fila (administrador, comité).
 * - `propio`: el payload solo reclama al actor.
 * - `ajeno`: el payload reclama a un tercero → la ruta corta con el 404 genérico.
 */
export type VeredictoDePropiedad = "gestion" | "propio" | "ajeno"

/** Id reclamado, normalizado; `""` cuando el payload no reclama ese campo. */
function idReclamado(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : ""
}

/**
 * Veredicto sobre la propiedad de la fila que el payload va a crear o reasignar.
 *
 * No escribe nada ni devuelve una respuesta: es la decisión, para que una ruta pueda
 * preguntarla sin cortar (o para un test que quiera fijar el veredicto, no el status).
 */
export async function decidirPropiedadDeAlta({
  scope,
  pretension,
}: {
  scope: ComunidadScope
  pretension: PretensionDePropiedad
}): Promise<VeredictoDePropiedad> {
  const personaPedida = idReclamado(pretension.personaId)
  const unidadPedida = idReclamado(pretension.unidadId)

  const alcance = await alcancePorFilasDeSesion(scope)
  if (alcance.tipo === "comunidad") return "gestion"
  if (alcance.tipo === "denegado") {
    // Sin identidad no hay «lo propio»: solo puede pasar un payload que no reclame a
    // nadie (ver el encabezado: falla CERRADO, nunca abierto).
    return personaPedida || unidadPedida ? "ajeno" : "propio"
  }

  const personaPropia = !personaPedida || personaPedida === alcance.personaId
  if (!personaPropia) return "ajeno"
  if (!unidadPedida) return "propio"

  // Los vínculos solo se consultan cuando el payload reclama una unidad: es la única
  // rama que los necesita, y el alta más común (solo persona) no paga la consulta.
  const unidades = await unidadesVinculadasDb(alcance.personaId, scope.comunidadId)
  return unidades.includes(unidadPedida) ? "propio" : "ajeno"
}

/**
 * Guardia lista para `antesDeEscribir` (o para un POST custom): `null` si el payload
 * puede escribirse, o el 404 genérico de la serie si reclama a un tercero.
 */
export async function rechazoDeAltaAjena({
  scope,
  pretension,
}: {
  scope: ComunidadScope
  pretension: PretensionDePropiedad
}): Promise<Response | null> {
  const veredicto = await decidirPropiedadDeAlta({ scope, pretension })
  return veredicto === "ajeno" ? jsonError(404, "Registro no encontrado.") : null
}
