# Design: GD Períodos de Directiva

## Superficies
- `lib/schemas.ts`: `PeriodoDirectivaSchema` + tipo; ficha +=
  `periodoId`/`fechaTermino`/`motivoTermino`; acta += `periodoId`;
  certificado += `directivaRef` (todo opcional → persistido viejo válido).
- `lib/store.ts`: `periodosDirectiva` + `STORE_VERSION` 28 + migración v28
  (período-1 estimado + `periodoId` en fichas) + helpers exportados
  `periodoDirectivaVigente`/`esMiembroDirectivaVigente` + acción
  `savePeriodoDirectiva` + auto-assign en `savePersona` + attach en
  `saveActaGD`/`generarCertificadoCT` + quórum por período.
- `app/comunidad/directiva/page.tsx`: sección Períodos (vigente con
  alertas, históricos solo lectura, diálogo de registro con nómina).
- `test/store-directiva.test.ts`: describes `períodos` + `ficha` dentro
  del describe exterior (beforeEach aplica; lección: el append fuera del
  describe rompe el aislamiento).

## Decisiones (dictamen skill)
1. Libro físico: cierre archiva nómina en el período; fichas salientes se
   depuran de personas. Eventos `GD_PERIODO_REGISTRADO`,
   `AD_DIRECTIVA_DESVINCULADA` (ya existente).
2. Legado: ficha sin `periodoId` cuenta solo sin período registrado; al
   activar uno, el quórum se acota a su nómina. Cero cambios en tests
   viejos.
3. Migración idempotente por id; si el schema rechaza, no inyecta (quórum
   legacy cubre).
4. Sin bump de UI en actas salvo `periodoId` automático; sin cambios en
   `/personas/*`.

## Riesgos
- Medio: `savePersona`/quórum son writers centrales; mitigado con regla
  legacy + suite 19/19 + full suite antes de pushear.
- `savePeriodoDirectiva` hace set dual (períodos + personas) en una acción;
  documentado y testeado (cierre archiva + depura).
