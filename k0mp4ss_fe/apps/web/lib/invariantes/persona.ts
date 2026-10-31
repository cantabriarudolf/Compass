/**
 * INV-01 — Unicidad de identidad de `Persona` por comunidad.
 *
 * Regla (MP): dentro de una comunidad, dos fichas no pueden compartir RUT ni
 * email. El mismo RUT/email SÍ puede existir en otra comunidad (una persona
 * puede habitar dos).
 *
 * Historia del dueño: la regla vivía en UN solo lugar, `app/api/personas`,
 * mientras `/api/mis-datos` escribía la misma columna sin mirarla — el
 * autoservicio podía asignar el correo de otra persona. Esta función es la
 * única puerta: la usan las dos rutas y cualquier writer futuro.
 *
 * La base NO tiene `@@unique` (decisión C3b documentada en el schema:
 * `// No unique on rut per C3b`): el dueño de la regla es este módulo, sus
 * llamadores y `test/api/invariantes-*.test.ts`. Ver `docs/INVARIANTES.md`.
 */

import { prisma } from "@/lib/prisma"

export const MENSAJE_RUT_DUPLICADO =
  "Conflicto: el RUT ya está registrado en esta comunidad."
export const MENSAJE_EMAIL_DUPLICADO =
  "Conflicto: el correo electrónico ya está registrado en esta comunidad."

/**
 * Forma canónica del email almacenado: sin espacios y en minúsculas.
 *
 * Sin esto la comparación exacta deja pasar `Juan@X.cl` vs `juan@x.cl` como
 * dos personas distintas (SQLite compara TEXT con sensibilidad a mayúsculas).
 * Las dos rutas escriben la forma canónica para que la comparación exacta sea
 * suficiente.
 */
export function emailCanonico(email: string): string {
  return email.trim().toLowerCase()
}

/** ¿Otra ficha de la comunidad ya usa ese RUT? `excluirId` = la ficha que se edita. */
export async function personaConRutDuplicado(
  comunidadId: string,
  rut: string,
  excluirId?: string
): Promise<boolean> {
  const dup = await prisma.persona.findFirst({
    where: {
      comunidadId,
      rut,
      ...(excluirId ? { NOT: { id: excluirId } } : {}),
    },
    select: { id: true },
  })
  return dup !== null
}

/** ¿Otra ficha de la comunidad ya usa ese email? `excluirId` = la ficha que se edita. */
export async function personaConEmailDuplicado(
  comunidadId: string,
  email: string,
  excluirId?: string
): Promise<boolean> {
  const dup = await prisma.persona.findFirst({
    where: {
      comunidadId,
      email: emailCanonico(email),
      ...(excluirId ? { NOT: { id: excluirId } } : {}),
    },
    select: { id: true },
  })
  return dup !== null
}
