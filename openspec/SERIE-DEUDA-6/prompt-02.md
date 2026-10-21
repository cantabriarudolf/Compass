# Ventana V2 — `visor-mensajes`: quitar `caducarAvisosCV` del store

**ARRANQUE**: leé `openspec/SERIE-DEUDA-6/00-plan.md` completo. Marcá tu fila **EN CURSO**.

**Rama**: `noche/deuda-6`. Prohibido `git push`, `gh`, merge y PR.

## Alcance

`k0mp4ss_fe/apps/web/app/visor-mensajes/page.tsx`: hoy monta `useCompassStore.getState().caducarAvisosCV`
en un `useRef` y lo llama en un `setInterval` de 30 s (TODO en `:40`). Es el último uso del store en esa
página.

## Pasos

1. **Entender la semántica actual**: leé `caducarAvisosCV` en `lib/store/slices/cv-slice.ts` (o
   `lib/store.ts`) y documentá en tu retorno qué hace exactamente (qué marca, con qué criterio de fecha,
   qué evento emite).
2. **Buscar el contrato ya existente**: `app/comunidad/visor/page.tsx` ya resuelve el archivado vía API.
   Identificá la acción/route que usa (`grep -rn "archivar\|actualizarAviso\|caduc" app/api app/comunidad/visor lib/api`).
3. **Elegir la opción de menor superficie**, en este orden:
   a. Si ya existe una acción API equivalente → exponerla en `lib/api/use-cv.ts` y usarla (sin crear ruta).
   b. Si no existe, crear `POST /api/cv/avisos/caducar` replicando **la misma lógica server-side** que
      `caducarAvisosCV`, con scoping de comunidad y test de contrato.
   c. Si para (b) hay que decidir política de negocio (por ejemplo quién puede caducar, o si la
      caducidad deja de ser automática) → **BLOQUEADO** con la decisión exacta que falta.
4. Reemplazá el `ref` + `setInterval` por el nuevo camino, conservando el refresco visual de 30 s y el
   reloj de 1 s. Sin cambios visibles de comportamiento.
5. **Tests**: caso que pruebe que la caducidad ya no depende del store (mock del endpoint) y que el
   intervalo sigue disparando.
6. **Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 problemas · `npm test` verde.
7. Commit(s) por work-unit. Actualizá tu fila en el 00-plan.

## Retorno

Fila actualizada · commits · gates · semántica documentada de `caducarAvisosCV` · qué opción elegiste
y por qué · `path:line` de la evidencia · `BLOQUEADO` si aplica. No pushees.
