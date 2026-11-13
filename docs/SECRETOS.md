# Secretos y variables del despliegue

Registro de las variables de entorno que el proyecto necesita en Vercel, con la fecha
en que se cargaron y qué hacer con ellas. Ningún valor se escribe acá: solo los
nombres, para qué sirven y cuándo conviene rotarlas o borrarlas.

## Cargadas el 2026-11-13 (ventana de las pantallas y el barrido)

| variable | para qué | entornos | valor generado con | rotación sugerida |
|---|---|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | token del store privado de archivos `compass-docs` (`store_N6nhGocrimNsD5Mr`, región `iad1`). Lo usan las subidas de PDF firmados (convenios) | production, preview, development | inyectado por Vercel al conectar el store | si se filtra, **rotar desde el store** en el panel de Vercel; el store nuevo inyecta el token solo |
| `CLAVE_MAESTRA_SECRETOS` | clave maestra (32 bytes en hex) con la que se cifra en la base la credencial SMTP **de cada comunidad**. AES-256-GCM, IV y tag por registro | production, preview, development | `openssl rand -hex 32` | **rotarla invalida los paquetes guardados**: hay que volver a cargar la credencial de cada comunidad desde `/admin/configuracion/correo`. Rotar si se sospecha del entorno, no periódicamente |
| `CRON_SECRET` | secreto que Vercel envía como `Authorization: Bearer` al barrido diario de avisos (`GET /api/vigencia-registro/avisos`) | production, preview, development | `openssl rand -hex 24` | rotar sin efecto colateral: el cron toma el valor del entorno en la siguiente corrida. Rotar si alguien dejó de tener acceso al proyecto |

## Heredadas, siguen en uso

| variable | para qué | nota |
|---|---|---|
| `DATABASE_URL` | cadena de conexión a Postgres (Neon) | rotarla exige coordinar con el carril `db-prod` |
| `AUTH_SECRET` | firma de las sesiones de Auth.js | rotarla **cierra todas las sesiones activas** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | login con Google | se rotan desde Google Cloud Console |
| `APP_ENV` | marca el entorno en la app | no es secreto |
| `CLAVE_CIFRADO_DATOS` | clave del cifrado de datos preexistente (cifrar:datos) | si se pierde, esos datos no se descifran: **respaldarla fuera del proyecto** |

## Qué pasa si falta una

Las tres de arriba **fallan cerrado**: el sistema se niega a hacer la operación en vez
de hacerla mal. Sin `CLAVE_MAESTRA_SECRETOS` no se guarda la credencial de correo (500 y
cero filas escritas); sin `CRON_SECRET` el barrido responde 500 sin ejecutar nada; sin
el token del blob no se puede subir un PDF firmado. El mensaje de error nombra la
variable que falta.

## Cómo revisarlas sin exponerlas

```bash
# nombres y entornos, nunca valores
vercel env ls --environment production | awk '{print $1}'

# no usar `vercel env pull` en un árbol versionado: escribe un archivo con los valores
```

## Pendientes de seguridad

- Los backups de `Data/NSGC/backups/` se sacaron del índice de git el 2026-11-13, pero
  **siguen en el historial**: si el repositorio se publica, hay que reescribirlo
  (`git filter-repo`) antes, y eso cambia todos los hashes.
- Rotar el `CLAVE_CIFRADO_DATOS` exige descifrar y volver a cifrar los datos existentes
  con el script `cifrar:datos`; no es una rotación de una línea.
