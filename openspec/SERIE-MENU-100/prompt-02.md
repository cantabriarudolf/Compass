> **Este archivo ES tu prompt.** Ventana 2 de la serie **menu-100**. Lee
> `openspec/SERIE-MENU-100/00-plan.md` (bloque ARRANQUE + contexto común + base de hechos)
> antes que nada. La P1 debe estar HECHA en la Bitácora — verifícalo con git; si no, detente
> y repórtalo.

## Alcance P2 — change `mp-residentes-vista`: `/personas/residentes`

**Objetivo:** habilitar el item "Residentes" del grupo Personas: directorio filtrado de
residentes/propietarios sobre los datos de MP (hoy el item está en `RUTAS_PENDIENTES`).

1. **openspec-propose** `mp-residentes-vista`: capability `MP-maestro-personas` (delta ADDED
   requirement "Vista Residentes": directorio filtrado por vínculo vigente propietario/
   arrendatario, con unidad vinculada y estado; read-only sobre `personas`+`vinculos`).
2. **Implementar:** `app/personas/residentes/page.tsx` (client, patrón de
   `app/comunidad/personas/page.tsx` — lee el código real y reutiliza el patrón de grilla;
   NO dupliques edición: es vista de consulta con link a la ficha en MP si existe el patrón).
   Filtro: personas con `vinculos` vigente (sin fechaFin) en rol propietario/arrendatario;
   muestra unidad asociada (ref via `refUnidad`/equivalente). Skeleton si `!hasHydrated`.
   Quitar `/personas/residentes` de `RUTAS_PENDIENTES` en `components/app-sidebar.tsx`.
3. **e2e** `e2e/crud/residentes.spec.ts` (read-oriented): goto, afirmar heading, que las
   filas correspondan a personas con vínculo vigente del seed (cruza contra `/comunidad/
   personas` si sirve), y 0 pageerror. Naming y quirúrgicos según 00-plan.

## Verificación

`npx tsc --noEmit` (0) · `npm run lint` (0 errores) · `npx vitest run` (425/425 REAL) ·
`npx playwright test e2e/crud/residentes.spec.ts` verde · `openspec validate --all` ·
commit · nsgc-prepush · push · archive · Bitácora P2 HECHA con hash.
