/**
 * prisma-con-fallas — inyección de fallas de escritura, SOLO para tests.
 *
 * Por qué existe (T1b de `odd/tasks/un-camino-de-entrega.md`, spec S3b): el
 * defecto que esta tarea cierra es que el aviso in-app quedaba confirmado antes
 * de la transacción que escribe la constancia del módulo. Para probarlo hay que
 * poder FORZAR el fallo de esa constancia y observar el rollback; un test que
 * sólo mira el camino feliz no distingue la atomicidad de su ausencia.
 *
 * Cómo: un cliente de Prisma extendido (`$extends`) cuyo `create`/`update` de UN
 * modelo lanza cuando `fallaDeConstancia.escritura` nombra ese modelo. La
 * extensión se aplica también al cliente de transacción que crea el cliente
 * extendido, así que el throw ocurre DENTRO de la transacción del llamador y
 * Prisma revierte todo lo escrito por ella.
 *
 * `fallaDeConstancia.escritura` es el nombre del modelo de Prisma
 * (`envioCobranzaFI`, `envioAvisoCobro`, `envioDocumento`, `reporteRE`), sin
 * distinguir mayúsculas: el hook entrega el nombre como propiedad del cliente
 * (`envioCobranzaFI`) y el modelo como tipo (`EnvioCobranzaFI`), y comparar en
 * minúsculas sirve para las dos formas.
 *
 * Los tests deben apagarla en un `finally`: dejarla prendida rompería el resto
 * del archivo.
 */
import type { PrismaClient } from "@prisma/client"

/** Falla activa: el modelo cuya escritura debe lanzar, o `null` (todo normal). */
export const fallaDeConstancia: { escritura: string | null } = { escritura: null }

function esElModelo(model: unknown): boolean {
  const objetivo = fallaDeConstancia.escritura
  if (objetivo === null) return false
  return objetivo.toLowerCase() === String(model).toLowerCase()
}

/**
 * Envuelve el cliente real con la falla inyectable.
 *
 * El cliente devuelto es funcionalmente el mismo (misma conexión, mismos
 * delegados): cuando la falla está apagada, cada escritura pasa sin cambios.
 */
export function conFallaDeConstancia(base: PrismaClient): PrismaClient {
  return base.$extends({
    query: {
      $allModels: {
        async create({ model, args, query }) {
          if (esElModelo(model)) {
            throw new Error(`falla forzada: ${String(model)}.create`)
          }
          return query(args)
        },
        async update({ model, args, query }) {
          if (esElModelo(model)) {
            throw new Error(`falla forzada: ${String(model)}.update`)
          }
          return query(args)
        },
      },
    },
  }) as unknown as PrismaClient
}
