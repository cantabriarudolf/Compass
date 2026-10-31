# Tasks: qa-lab-poblar-api

- [x] Reseed limpio + ARRANQUE P3 verificado (validate 40/7, dc14a92) + fila P4 EN CURSO
- [x] Change `qa-lab-poblar-api` (proposal + tasks + deltas LAB, queda abierto)
- [x] `tieneDatosTest(state, bd?)` en ambos mundos + unit tests nuevos
- [x] `cargarFase4PI` vía API (pub upsert + lead upsert, ids fijos QA)
- [x] `cargarFase15PL` vía API (CF + persona upsert + generar periodo rotativo + confirmar + espejo store; adelanto store legacy)
- [x] `limpiar` purga BD vía API (lead→pub, notif PI, borradores, espejo, persona) + guard BD en `runFase`
- [x] PLAN pi/pl veraces (vía API + legacy/residuo documentado)
- [x] Manual "34 - Historia de Poblamiento" actualizado
- [x] Validar: GATED 10/10 + poblado-idempotente + poblamiento + ciclo + unit + tsc 0 + lint 0 + validate
- [x] Commit local sin push + fila P4 y Bitácora en `00-plan.md`
