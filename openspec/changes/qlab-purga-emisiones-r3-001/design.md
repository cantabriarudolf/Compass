# Design: qlab-purga-emisiones-r3-001 (hallazgo R3-001)

## D1 — El hallazgo (CRITICAL, determinista)

En `app/api/qa-lab/purga-test/route.ts`, el paso 2 era:

```ts
await prisma.emisionGC.deleteMany({
  where: { comunidadId, OR: [{ id: porIdTest }, { periodo: { in: PERIODOS_FI_TEST } }] },
})
```

Es decir: borraba por `id test-*` **o** por mera pertenencia a `PERIODOS_FI_TEST`
(`2019-01`, `2019-03`) sin mirar la procedencia TEST de las líneas. El bucle legado de
fallback (`limpiar()` en `app/admin/qa-lab/page.tsx`) exigía
`em.lineas?.some((l) => l.unidadId?.startsWith("test-"))`, así que el camino "principal"
bulk era **más destructivo** que su propio fallback: una emisión real en esos períodos
quedaba destruida de forma determinista. Review RDD de la porción 1 (SERIE-NOCHE-2),
hallazgo R3-001.

## D2 — El fix: mismo filtro que el bucle, evaluado en memoria

`lineas` es JSON y SQLite no puede filtrarlo, así que el paso 2 pasa a:

1. `findMany` de candidatas (`comunidadId` + `OR [id test-* | periodo en PERIODOS_FI_TEST]`)
   con `select: { id, lineas }`.
2. Filtro en memoria:

   ```ts
   candidatas
     .filter((e) => e.id.startsWith(PREFIJO_TEST) || tieneLineaUnidadTest(e.lineas))
     .map((e) => e.id)
   ```

3. `deleteMany({ where: { comunidadId, id: { in: ids } } })`; si `ids` está vacío se
   retorna 0 sin llamar a Prisma.

El helper `tieneLineaUnidadTest(lineas)` replica la semántica del bucle legado:
`Array.isArray` + por línea, objeto no-nulo con `unidadId` string con prefijo `test-`.
Tipado defensivo sobre el JSON desconocido (Prisma tipa `lineas` como `Json`, y las
líneas legítimas siempre llevan `unidadId`).

La consulta candidatas es O(candidatas) y en el lab son pocas filas; la volúmica de la
purga (1 request bulk, ~26 `deleteMany`) no cambia.

## D3 — Semántica resultante (por qué no se rediseña)

La regla queda: **procedencia TEST, nunca mero período**. Una emisión se borra si su id
es `test-*` (poblamiento FI del lab) o si alguna de sus líneas apunta a una unidad TEST
(multa IN / cargos RA sobre unidades TEST, la materialización del lab en períodos
dedicados). El período `PERIODOS_FI_TEST` sigue siendo el pre-filtro de candidatas por
rendimiento, pero ya no es criterio suficiente. Paridad exacta con el bucle legado: el
camino principal y el fallback ahora borran el mismo conjunto.

## D4 — Evidencia RED→GREEN (asumida del orquestador, verificada en esta ventana)

- RED: con el código viejo, `test/api/qa-lab-purga.test.ts` da **1 failed** —la aserción
  `expect(purga-em-periodo-real).not.toBeNull()` falla porque la emisión real del período
  TEST se destruía (el conteo `emisiones-gc` era 2 y el registro real no existía).
- GREEN: con el fix, **6/6 verdes** (fixtures nuevos: `purga-em-periodo-real` sobrevive;
  `purga-em-proc-test` —id sin prefijo + período TEST + línea de unidad `test-`— sí se
  borra; conteo ajustado a `emisiones-gc: 2`).

## D5 — Riesgos residuales

- Una emisión **real** cuyas líneas apunten a unidades `test-*` se borraría: imposible en
  la práctica porque `PREFIJO_TEST` solo lo genera el propio lab (semántica ya aceptada en
  `qlab-purga-bulk` D3 para cobros por `unidadId`).
- Si alguna emisión legítima del lab quedara fuera del nuevo filtro (id y líneas sin rastro
  TEST), sería residuo honesto de `e2e:higiene` en cada reseed, no un falso negativo
  bloqueante — misma política que las liquidaciones confirmadas y los CT.
