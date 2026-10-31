> **Este archivo ES tu prompt.** Ventana P4 de la serie produccion-fase2.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie produccion-fase2)

Estado previo: Compass, Next.js 16, PostgreSQL en Neon. Tests: 552+ unit. CI/CD completo. 2FA/TOTP implementado.

Método: openspec-propose → apply → archive → commit → nsgc-prepush.
Reglas: secretos jamás en localStorage; cambio de esquema store = bump STORE_VERSION + migrate + test.
Verificación: tsc 0 errores, lint 0 errores, npm test verde, openspec validate OK.

## Arranque: verificación de la ventana anterior (P3)

1. git status (tree limpio) y git status -sb y git log --oneline -10.
2. openspec validate --all → sin fallos.
3. cd k0mp4ss_fe/apps/web && npm test → suite completa verde.
4. Contrasta con openspec/SERIE-PRODUCCION-FASE2/00-plan.md:
   - Filas P1-P3 HECHAS y todo OK → marca tu fila P4 EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero.
   - PARCIAL → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de esta ventana (P4 — Cifrado de datos sensibles en reposo)

### Tarea 1: Identificar campos sensibles

Del inventario de la auditoría de seguridad, estos campos DEBEN cifrarse:

| Campo | Modelo | Tipo |
|-------|--------|------|
| `rut` | `Persona`, `ProveedorPE`, `ConfiguracionGlobal` | string |
| `email` | `Persona`, `Usuario` | string |
| `telefonoMovil` | `Persona` | string |
| `telefonoFijo` | `Persona` | string |
| `direccionOficial` | `ConfiguracionGlobal` | string |
| `telefonoAdmin` | `ConfiguracionGlobal` | string |
| `datosLaborales` | `Persona` | Json (incluye sueldo, banco, cuenta) |
| `fichaMedica` | dentro de `datosLaborales` | Json (medicamentos, alergias, condiciones) |
| `monto` | `EgresoFI`, `IngresoFI`, `AdelantoPL`, `CobroFI` | number/Decimal |
| `passwordHash` | `Usuario` | Ya está hasheado (bcrypt) — OK |

### Tarea 2: Implementar cifrado AES-256

1. Crear `lib/crypto.ts`:
   - `cifrar(texto: string, clave: string): string` → retorna `iv:ciphertext` en base64
   - `descifrar(cifrado: string, clave: string): string`
   - Usar Node.js `crypto` (AES-256-GCM con IV aleatorio de 16 bytes)
   - La clave maestra se lee de `process.env.CLAVE_CIFRADO_DATOS` (mínimo 32 chars)
2. En desarrollo/test: si `CLAVE_CIFRADO_DATOS` no está definida, usar una clave dummy derivada de "dev-key" (nunca en producción).
3. Crear `lib/crypto.test.ts` con tests (cifrar/descifrar roundtrip, clave incorrecta falla, IV único).

### Tarea 3: Wrapper de Prisma con cifrado transparente

1. Crear `lib/prisma-cifrado.ts`:
   - Intercepta operaciones `create`/`update` en campos sensibles
   - Cifra antes de enviar a Prisma
   - Descifra después de recibir de Prisma
2. Campos a cifrar/descifrar automáticamente:
   - `Persona.rut`, `Persona.email`, `Persona.telefonoMovil`, `Persona.telefonoFijo`
   - `Persona.datosLaborales` (cifrar el JSON completo como string)
   - `ProveedorPE.rut`, `ProveedorPE.telefono`, `ProveedorPE.email`
   - `ConfiguracionGlobal.rutCondominio`, `ConfiguracionGlobal.direccionOficial`, `ConfiguracionGlobal.telefonoAdmin`
3. Los montos financieros (`monto` en `EgresoFI`, etc.): por ahora NO cifrar (afecta cálculos/agregaciones). Documentar como decisión pendiente.

### Tarea 4: Migración de datos existentes

1. Script `scripts/cifrar-datos-existentes.mjs`:
   - Lee todos los registros con campos sensibles
   - Cifra los campos
   - Actualiza los registros
   - Idempotente: si ya está cifrado (detectable por prefijo), saltar
2. El script debe poder correrse manualmente una sola vez en producción.

### Tarea 5: Tests

1. Tests de cifrado/descifrar (lib/crypto.test.ts)
2. Tests de integración: crear Persona → verificar que en BD está cifrada → leer y verificar que se descifra correctamente
3. Tests de búsqueda: búsqueda por RUT/email debe funcionar (descifra antes de comparar, o usa índices de texto plano si son necesarios)

### Tarea 6: Validación final

1. `npx tsc --noEmit` → 0 errores
2. `npm test` → suite completa verde
3. `npm run lint` → 0 errores
4. `openspec validate --all` → sin fallos

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado: P4 HECHA/PARCIAL + motivo.
2. Commits: hash + subject y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK.
5. Desviaciones vs el prompt.
6. Pendientes heredados.
7. Última línea exacta: `BITACORA_ENTRY: P4 — Cifrado AES-256 datos sensibles en reposo (commit <hash>)`.
