# Tasks: e2e-fresh-prisma-generate

- [x] Verificar diff del fix ya aplicado (`scripts/e2e-fresh.mjs` solo) sin nada ajeno
- [x] Change `e2e-fresh-prisma-generate` (proposal + design + tasks + delta `DEV-qa-lab`
      MODIFIED con escenario R3-missing-prisma-generate)
- [x] Gates: `npx tsc --noEmit` (0), `npm test` completo (pisos), `npm run e2e:fresh`
      (paso `prisma generate` visible + "Lista: base fresca + seed completo"), desde la
      raíz `openspec validate --all` + `check-delta-coverage.mjs` (change + global)
- [x] `nsgc-prepush` antes del push (avance de hoy + nota en el manual/runbook e2e si
      documentan `e2e:fresh`; RG §4 "comunidad")
- [x] Commit del fix + change (`fix(e2e): e2e:fresh regenera el cliente Prisma SQLite
      antes del seed (R3-missing-prisma-generate)`); push de `noche/serie-noche-2`
- [x] Con CI verde del PR #1: `openspec archive e2e-fresh-prisma-generate --yes` +
      `openspec validate --all` + commit docs + push + run docs-only verde
