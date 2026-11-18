#!/usr/bin/env -S npx vite-node --config vitest.config.ts
/**
 * scripts/crear-admin.mjs — el primer arranque de una comunidad (F42 · T3 · S2).
 *
 * Problema que ataca: la primera cuenta no se podía crear sin tocar la base. La
 * pantalla de cuentas exige sesión y el alta exige ser administrador de una
 * comunidad que ya tiene cuentas, así que una comunidad nueva nacía sin puerta de
 * entrada. Abrir una ruta pública de alta habría sido una puerta abierta en el
 * momento más vulnerable, así que el primer arranque es un acto de operador: este
 * script, corrido con la base configurada.
 *
 * Qué hace, en UNA transacción:
 *   · crea la comunidad si no existe (id + nombre; el slug es el id);
 *   · crea la primera cuenta administradora, SIN contraseña y SIN persona —el
 *     primer arranque existe antes que el padrón—;
 *   · emite su invitación con `crearInvitacionDeAcceso`, la MISMA función del alta
 *     (S4 no se reimplementa: token de un solo uso, con vencimiento y guardado en
 *     hash), y deja el evento de bitácora.
 * El "cambio forzado" de S2 no necesita columna ni flag: la cuenta no tiene
 * contraseña, así que el login la rechaza hasta que alguien abra el enlace e
 * imponga la suya. Sólo entra quien abrió el enlace.
 *
 * Idempotente y negado a duplicar: si la comunidad ya tiene una cuenta, se
 * detiene sin escribir nada y sale con 1. Volver a correrlo nunca crea la segunda.
 * Si la comunidad ya existe pero no tiene cuentas (un intento anterior quedó a
 * medias), la usa y crea la primera: no se recrea la comunidad.
 *
 * La salida es el enlace completo a `/invitacion?token=…`, que es la página
 * pública donde la persona define su contraseña. Se imprime que el envío por
 * correo todavía no existe (F43): el script no finge haber avisado a nadie.
 *
 * Uso (desde `k0mp4ss_fe/apps/web`):
 *   npx vite-node --config vitest.config.ts scripts/crear-admin.mjs \
 *     --comunidad-id=comunidad-x \
 *     --comunidad-nombre="Comunidad X" \
 *     --admin-email=admin@dominio.cl \
 *     [--base-url=https://app.dominio.cl]
 *
 * Códigos de salida: 0 = creado; 1 = se negó (ya hay cuenta); 2 = error de uso.
 * Se corre con `vite-node --config vitest.config.ts` porque importa `lib/**` con
 * el alias `@/`, igual que `scripts/email-prueba.mjs`.
 */
/* global process, console */
import { randomUUID } from "node:crypto"
import { cargarUrlBase } from "../lib/database-url"

const USO = `uso: npx vite-node --config vitest.config.ts scripts/crear-admin.mjs \\
  --comunidad-id=<id> --comunidad-nombre="<nombre>" --admin-email=<correo> [--base-url=<origen>]`

/** Rechazos previstos: cada uno sale con su código y su texto, sin stack. */
class ErrorDeUso extends Error {}
class YaHayCuenta extends Error {}
class CorreoTomado extends Error {}

function leerArgumentos(argumentos) {
  const valores = {}
  for (const argumento of argumentos) {
    if (!argumento.startsWith("--")) {
      throw new ErrorDeUso(`Argumento no reconocido: ${argumento}`)
    }
    const separador = argumento.indexOf("=")
    if (separador === -1) {
      throw new ErrorDeUso(`Argumento sin valor: ${argumento}`)
    }
    valores[argumento.slice(2, separador)] = argumento.slice(separador + 1)
  }
  return valores
}

/** Misma forma mínima de correo que exige el alta; la base no valida formato. */
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validar(valores) {
  const comunidadId = (valores["comunidad-id"] ?? "").trim()
  const comunidadNombre = (valores["comunidad-nombre"] ?? "").trim()
  const adminEmail = (valores["admin-email"] ?? "").trim().toLowerCase()
  const baseUrl = (valores["base-url"] ?? "http://localhost:3000").trim()

  const faltan = []
  if (!comunidadId) faltan.push("--comunidad-id")
  if (!comunidadNombre) faltan.push("--comunidad-nombre")
  if (!adminEmail) faltan.push("--admin-email")
  if (faltan.length > 0) {
    throw new ErrorDeUso(`Faltan argumentos obligatorios: ${faltan.join(", ")}`)
  }
  if (!CORREO_RE.test(adminEmail)) {
    throw new ErrorDeUso(`El correo no tiene forma válida: ${adminEmail}`)
  }
  if (!/^https?:\/\//.test(baseUrl)) {
    throw new ErrorDeUso(`--base-url debe ser un origen http(s): ${baseUrl}`)
  }

  return {
    comunidadId,
    comunidadNombre,
    adminEmail,
    baseUrl: baseUrl.replace(/\/+$/, ""),
  }
}

async function main() {
  let datos
  try {
    datos = validar(leerArgumentos(process.argv.slice(2)))
  } catch (error) {
    if (error instanceof ErrorDeUso) {
      console.error(error.message)
      console.error(USO)
      process.exitCode = 2
      return
    }
    throw error
  }

  // La base se resuelve antes de importar Prisma: `lib/prisma.ts` lee
  // `DATABASE_URL` al cargarse, y el cliente debe nacer apuntando a la base
  // configurada (env o `.env` del proyecto, con la guarda de `lib/database-url`).
  process.env.DATABASE_URL = cargarUrlBase()

  const { prisma } = await import("../lib/prisma")
  const {
    CATEGORIA_AUDITORIA_CUENTAS,
    crearInvitacionDeAcceso,
  } = await import("../lib/invitacion-acceso")
  const { registrarEventoAuditoria } = await import("../lib/auditoria")

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const existente = await tx.comunidad.findUnique({
        where: { id: datos.comunidadId },
      })
      const comunidad =
        existente ??
        (await tx.comunidad.create({
          data: {
            id: datos.comunidadId,
            nombre: datos.comunidadNombre,
            // El id ya es un slug válido en este proyecto (`comunidad-a`).
            slug: datos.comunidadId,
          },
        }))

      // La negativa a duplicar se decide DENTRO de la transacción: dos corridas
      // simultáneas no pueden ver "cero cuentas" las dos.
      const cuentas = await tx.membresia.count({
        where: { comunidadId: comunidad.id },
      })
      if (cuentas > 0) throw new YaHayCuenta()

      const correoTomado = await tx.usuario.findUnique({
        where: { email: datos.adminEmail },
        select: { id: true },
      })
      if (correoTomado) throw new CorreoTomado()

      const usuario = await tx.usuario.create({
        data: {
          email: datos.adminEmail,
          // Sin contraseña y sin ficha: entra sólo por la invitación.
          activo: true,
        },
      })

      await tx.membresia.create({
        data: {
          usuarioId: usuario.id,
          comunidadId: comunidad.id,
          rol: "administrador",
        },
      })

      // `creadoPor` es la propia cuenta: en el primer arranque no hay otro actor
      // en el sistema, y el evento de bitácora lo deja dicho.
      const { token, invitacion } = await crearInvitacionDeAcceso({
        usuarioId: usuario.id,
        comunidadId: comunidad.id,
        creadoPor: usuario.id,
        client: tx,
      })

      await registrarEventoAuditoria(
        {
          id: randomUUID(),
          comunidadId: comunidad.id,
          timestamp: new Date().toISOString(),
          usuario: usuario.id,
          categoria: CATEGORIA_AUDITORIA_CUENTAS,
          tipoAccion: "cuenta_inicial_creada",
          referenciaId: usuario.id,
          descripcion:
            "Primera cuenta de la comunidad (primer arranque): administradora, sin contraseña, con invitación de un solo uso.",
        },
        tx
      )

      return { comunidad, usuario, token, invitacion }
    })

    const enlace = `${datos.baseUrl}/invitacion?token=${resultado.token}`
    const vence = new Date(resultado.invitacion.expiraEn).toISOString()

    console.log(`Comunidad: ${resultado.comunidad.id} — ${resultado.comunidad.nombre}`)
    console.log(`Cuenta administradora: ${resultado.usuario.email}`)
    console.log("  Nace sin contraseña: sólo entra quien abra la invitación.")
    console.log(`Invitación emitida (vence ${vence}), de un solo uso.`)
    console.log(
      "  El envío por correo todavía no existe: pasale este enlace por un canal seguro."
    )
    console.log("Enlace:")
    console.log(`  ${enlace}`)
    process.exitCode = 0
  } catch (error) {
    if (error instanceof YaHayCuenta) {
      console.error("La comunidad ya tiene una cuenta: no se crea otra.")
      console.error(`No se escribió nada. Comunidad: ${datos.comunidadId}`)
      process.exitCode = 1
      return
    }
    if (error instanceof CorreoTomado) {
      console.error(
        `Ya existe una cuenta con el correo ${datos.adminEmail}: no se crea otra.`
      )
      console.error("No se escribió nada.")
      process.exitCode = 1
      return
    }
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

await main()
