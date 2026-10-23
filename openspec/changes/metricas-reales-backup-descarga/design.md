# Design: metricas-reales-backup-descarga

## F2 — La variación tarifaria sale de las emisiones

### Decisión

`lib/metricas-utils.ts` expone `variacionTarifaria(emisiones)`:

- toma `EmisionGC[]` (`periodo` con formato `AAAA-MM` y `gastoTotal`);
- ignora emisiones con periodo inválido o `gastoTotal <= 0` (no se divide por cero);
- un periodo repetido se resuelve con **la última emisión de la lista** (es la vigente,
  no la suma de correcciones);
- ordena los periodos y compara los **dos más recientes**;
- devuelve `null` si no hay dos periodos comparables.

`/admin/metricas` pinta `—` con el motivo («Sin emisiones comparables todavía») cuando el
helper devuelve `null`, en vez de un número inventado.

### Por qué un helper puro y no el cálculo en la página

El cálculo tiene casos borde reales (desorden, periodos en cero, duplicados) y la página es
un componente con cinco hooks SWR: probar los casos borde dentro del componente costaría
mockear media aplicación. El helper se testea solo y la página queda de una línea.

### Alternativa descartada

Usar `TipoUnidad.historialTarifas` («promedio de alzas programadas», el texto que tenía el
KPI). Se descartó porque la decisión registrada del owner es calcularla **de las emisiones**,
que es lo efectivamente cobrado y no lo programado.

## F3 — El respaldo se descarga; el servidor no escribe

### Decisión

`POST /api/backup` conserva **todas** sus guardas en el mismo orden —`isWriteApiEnabled` →
404, sesión → 401, usuario inactivo → 401, membresía → 403, `puede(rol,'ejecutar','backup')`
→ 403 con `RP_PERMISSION_DENIED`, tamaño > 10 MB → 413 (header y cuerpo), JSON inválido →
400, `content` faltante → 400— y reemplaza el guardado por:

```
200 · Content-Type: application/json; charset=utf-8
     Content-Disposition: attachment; filename="<prefijo>-AAAA-MM-DD_HH-mm.json"
     Cache-Control: no-store
```

- **La fecha la fija el servidor.** El reloj del cliente puede faltar o mentir, y un
  respaldo sin fecha no sirve.
- **El prefijo es del cliente** (validado contra `/^[a-zA-Z0-9-]{1,60}$/`), porque aporta
  semántica: `compass-backup` por defecto, `compass-seed-report` para el comprobante del
  QA-Lab. Un prefijo inválido cae al de por defecto: no se cuela un path.
- `fileName` del cliente deja de usarse (un nombre del cliente podría quedar sin fecha).

### Por qué se conserva la ruta en vez de retirarla

`SG-hardening-despliegue` fija **cinco re-chequeos**, y el **1/5 es literalmente**
`POST /api/backup` con payload > 10 MB → 413; el **2/5** también lo nombra. Retirar la ruta
dejaría esa spec mintiendo y bajaría el checklist a cuatro. Conservarla con sus guardas
mantiene la spec y los tests de seguridad intactos, y el problema real —el disco efímero y
el mensaje «Copia en: `<path>`»— desaparece igual.

### Consecuencia en `DEV-qa-lab`

El requisito §Backups JSON auditables describía el comportamiento retirado: nombre
`compass-seed-report-AAAA-MM-DDTHH-MM-SS.json` y persistencia en `Data/NSGC/backups/` con
`backupToRepo`. El delta lo actualiza conservando el nombre del requirement y del escenario
(la trampa 1 de `CONVENCION-DELTAS.md`).

### `LAB-mejoras` queda afectado por implicación

`LAB-mejoras` §captura automática esperaba una GitHub Action que se dispara cuando aparece
un `compass-seed-report-*.json` en disco. Sin escritura en disco esa señal no existe. Es un
`SHOULD` marcado explícitamente como **futuro y no implementado**, así que no se modifica su
texto: se deja anotado acá para que quien lo implemente sepa que la señal cambió.

## Verificación

- **TDD en F2**: 6 casos —alza, baja con un decimal, un solo periodo, sin emisiones,
  desorden con periodo en cero, y divisor cero— vistos en ROJO antes del helper.
- **F3**: test propio del contrato nuevo (200 attachment fechado, cuerpo byte a byte,
  **cero archivos nuevos** bajo `Data/NSGC/backups/`, prefijo conservado y prefijo inválido
  rechazado) y los dos suites de seguridad **sin editar**: `api-backup-authz` (401/403) y
  `security-rechecks` (`[1/5]` 413, `[2/5]` 404 en producción).
