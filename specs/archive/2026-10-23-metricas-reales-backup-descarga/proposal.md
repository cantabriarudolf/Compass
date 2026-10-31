# Proposal: metricas-reales-backup-descarga

## Contexto

Dos ítems de `openspec/PENDIENTES-FUNCIONALIDAD.md` con decisión del owner ya tomada,
ambos de la misma familia: **datos que la interfaz afirmaba y no respaldaba nada**.

| Ítem | Qué pasaba |
|---|---|
| **F2** | `/admin/metricas` mostraba `+7.2%` de variación tarifaria **escrito a mano**. No salía de ningún dato del sistema |
| **F3** | `POST /api/backup` escribía el respaldo en `Data/NSGC/backups/` del **disco del servidor**. En producción ese disco es efímero: la pantalla decía «Copia en: `<path>`» y el archivo no existía al día siguiente |

Al auditar F3 aparecieron dos hechos que cambiaron el alcance:

1. **Las tres pantallas ya descargaban el respaldo al navegador** (blob + ancla). El POST
   era una copia *extra* al servidor, no el mecanismo de descarga.
2. El respaldo real del servidor ya existe y es otro: `npm run backup:db` + `restore:db`
   (dump de Prisma). El endpoint duplicaba eso, peor.

## Objetivo

Que los dos números/artefactos que la interfaz muestra sean reales: la variación sale de
las emisiones o no se muestra, y el respaldo se descarga con nombre fechado por el
servidor sin escribir en un disco que se pierde.

## Alcance

**Dentro:**
1. `lib/metricas-utils.ts` — helper puro `variacionTarifaria()` y su conexión en la página.
2. `POST /api/backup` — sin `writeFileSync`; devuelve el contenido como adjunto con nombre
   `prefijo-AAAA-MM-DD_HH-mm.json` donde la fecha la fija el servidor.
3. Retiro de `lib/backup.ts` (único consumidor: el endpoint).
4. Las tres pantallas (`admin/mantenimiento`, `admin/dev-dashboard`, `admin/qa-lab`)
   descargan desde la respuesta de la API y pierden el checkbox «Guardar copia en
   Data/NSGC/backups/».
5. Delta de `DEV-qa-lab` §Backups JSON auditables, que describía la escritura en disco y
   el nombre con `T`/`:`. Se conserva la ruta y sus guardas.

**Fuera:**
- Rediseñar qué contiene el respaldo (hoy lo arma el cliente desde el store legacy).
- Retirar el módulo QA/dev (F9) o migrarlo a BD.
- `LAB-mejoras` §captura automática: es `SHOULD` futuro no implementado; se anota como
  afectado por implicación, no se modifica.
- `F1`, que vive en otra rama y no se toca acá.

## Riesgo

Medio. El endpoint es una ruta de escritura con guardas de seguridad pinneadas por spec
(`SG-hardening-despliegue`: 413 por tamaño y 404 en producción son 2 de sus 5
re-chequeos). Por eso **no se retira**: se conserva con todas sus guardas y solo cambia la
respuesta final. Verificación: los tests de seguridad existentes deben seguir verdes sin
editarse.
