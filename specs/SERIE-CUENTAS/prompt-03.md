> **Este archivo ES tu prompt.** Ventana 3 (cierre) de la serie **cuentas**. Lee
> `openspec/SERIE-CUENTAS/00-plan.md` y verifica en la Bitácora que P1 y P2 estén HECHAS
> (git); si no, detente y repórtalo.

## Alcance P3 — Fase 4 (skill) + cierre integral de la serie

### Fase 4 — skill `pruebas` (.opencode/skills/pruebas/SKILL.md)

1. **Parámetro "¿con qué cuenta?"** en el abanico (protocolo de puerta de entrada): tercera
   pregunta del tool question — admin (default) / comite / conserjeria / residente /
   mantencion (las 5 del seed, password `test1234`). Regla de uso: los specs con
   `test.use({ storageState: "e2e/.auth/<rol>.json" })` ya fijan su cuenta; el parámetro
   aplica a pruebas ad-hoc y a los journeys generales. Añadir al mapa de la suite las
   cuentas disponibles y su rol.
2. **Sección orquestación de series** (nueva): "Si el owner pide correr una serie
   materializada (openspec/SERIE-*/), NO la corras inline: carga la skill `serie-ventanas`
   y delega cada prompt-NN.md al subagente `ejecutor-ventana`, verificando estado desde el
   repo entre ventanas (Bitácora + git). Reanudación: leer Roadmap/Bitácora; NUNCA texto de
   otros chats."
3. **Registro del rol** en `qa-estado.json`: schema `QaRun` gana campo opcional `cuenta`
   (email/rol usado) — actualizar `lib/qa-estado.ts` (interface + validación laxa) y la
   instrucción del protocolo (paso 5) para incluirlo. El dashboard ya muestra lo que venga
   si el JSON lo trae (verifica y ajusta solo si rompe).
4. Actualizar contadores del mapa de la suite si la serie agregó specs.

### Cierre integral

1. **Validación completa** (NÚMEROS REALES) — `cd k0mp4ss_fe/apps/web`:
   - `npx tsc --noEmit` → 0 errores · `npm run lint` → 0 errores
   - `npx vitest run` → total real (≥455)
   - `npx playwright test e2e/crud/` → todos (30 + journeys) — número exacto
   - `npx playwright test e2e/flujo/ e2e/smoke/ e2e/auth/` → verdes (incluye roles-menu,
     roles-accesos, roles-journeys, descubrimiento retirado)
   - `openspec validate --all` → sin fallos
2. **Verificación de cuentas:** los 5 storageStates generados en `e2e/.auth/` (NUNCA
   commiteados — verifica `.gitignore`), matriz rol×menú verde, journeys verdes.
3. **Documentación:** avance NSGC de cierre (`Data/NSGC/docs/avances/`), fila P3 HECHA con
   hash, Bitácora "SERIE COMPLETA" + hashes P1-P3 + referencia a `BACKLOG-100.md` (C3 sigue
   en pausa).
4. Commits → nsgc-prepush → push. Si algo está rojo: arréglalo ANTES del cierre.

## Reporte final

Cambios de la skill (parámetro cuenta + orquestación), totales reales de cada suite,
commits con hash, avance creado, confirmación "SERIE COMPLETA".
