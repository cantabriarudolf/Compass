# Handoff — store legacy → base de datos (2026-10-25, continuación)

> **Qué es**: el prompt de arranque para la ventana que migra los paneles PE al servidor.
> El estado se lee del repo, no de este archivo: si algo no coincide con `git log` y
> `npm run audit:store`, gana el repo y este archivo se corrige.

---

```text
Retomá Compass. Es una ventana nueva: leé el estado antes de proponer nada.

Objetivo de esta ventana: que los paneles de Personal y Servicios dejen de leer y escribir el store
del navegador, y que la deuda del store baje de forma medible.

1) Leé, en este orden:
   - AGENTS.md (reglas del repo; monorepo en k0mp4ss_fe/, app en apps/web)
   - openspec/BACKLOG-100.md → la fila "Store legacy en la UI" y su marcador <!-- audit:store: -->
   - openspec/PENDIENTES-FUNCIONALIDAD.md → F6 y F9
   - k0mp4ss_fe/apps/web/scripts/audit-store.mjs (el candado y su allowlist)
   - git status -sb && git log --oneline -8

2) Corré vos mismo, antes de proponer:
   npm --prefix k0mp4ss_fe/apps/web run audit:store
   Ese número es la verdad de la deuda. Hoy debe decir 13.

3) Alcance, en este orden:
   a. Migrar los 3 paneles PE a sus hooks: components/pe/visitas-panel.tsx,
      encomiendas-panel.tsx y contratistas-panel.tsx. La infraestructura YA existe: 12 rutas bajo
      app/api/pe/ (8 con POST) y lib/api/use-pe.ts con 8 hooks de colección + useAccionesPE.
      Cada panel migrado BORRA su entrada de la allowlist de audit-store.mjs.
   b. Cabo suelto conocido: la bitácora persiste en el store (saveBitacoraVisitaPE). Al migrar la
      escritura, el razonamiento de H10 (hallazgos.md) deja de hacer falta.
   c. El wipe de datos de prueba, en sus dos mitades: `npm run datos:reset` (limpia y resiembra la
      base, reusando seed:mocks + seed:authz, con guarda de entorno para que no pueda correr contra
      producción) y "borrar datos locales" en /admin/dev-dashboard (hoy no existe ningún
      localStorage.clear en el repo).

4) Decisiones YA tomadas (no las reabras):
   - Los datos actuales son de PRUEBA, para usar el sistema hasta cargar la información real.
     NO se migran los datos del localStorage: se descartan. Los paneles escriben en la base y las
     visitas viejas del navegador se abandonan.
   - No se toca lib/authz.ts sin decisión del owner.

5) Reglas de verificación (costaron caro):
   - Prohibido escribir "saldado" sin pegar la salida de `npm run audit:store`. El candado tiene un
     marcador en BACKLOG-100 (<!-- audit:store: archivos=N -->) que compara el número documentado
     con la allowlist real: si no coinciden, CI en rojo.
   - La allowlist SÓLO se achica. Un PR que la agrande no se mergea.
   - La lane e2e se verifica por el artefacto (test-results/junit.xml y error-context.md), no por el
     log: e2e:fresh lo trunca. Para correrla: `npm run e2e:fresh -- -- <specs>`.
   - Si un e2e no pasa tras dos o tres intentos con hipótesis distintas, PARÁ y reportá el bloqueo
     con evidencia.
   - El job unit-PG corre la misma suite contra PostgreSQL: un fallo que sólo aparece ahí es del
     test o del modelo, no "flakiness".
   - Tests y docs viajan con el código; commits convencionales en español; "comunidad", nunca
     "condominio".

6) Definición de cumplido de esta ventana:
   - `npm run audit:store` en verde con la allowlist en 10 (13 − los 3 paneles PE), y el marcador
     del BACKLOG actualizado al mismo número.
   - Suite completa y CI en verde; los 3 paneles sin una sola referencia a useCompassStore.
   - Si el contexto se acaba antes: dejá la allowlist chica y el trabajo a medias commiteado en la
     rama, y decilo claro. Nunca la dejes más grande.

Empezá por el punto 2 y decime el número antes de tocar código.
```

---

## Por qué el prompt dice lo que dice

| Regla | El tropiezo que la origina |
| --- | --- |
| Medir antes de proponer | «Saldado» se escribió a mano dos veces; hoy hay 13 archivos con `useCompassStore` |
| La allowlist sólo se achica | La deuda volvió a crecer entre SERIE-DEUDA-6, SERIE-FASE2 y las features siguientes |
| El marcador del BACKLOG | Un número escrito a mano no lo verifica nadie; ahora lo compara el candado |
| No migrar localStorage | Los datos son de prueba: migrarlos agrega el único paso irreversible que se puede evitar |
| Artefacto, no log | Seis corridas de e2e persiguiendo una causa que el log truncado no mostraba |
