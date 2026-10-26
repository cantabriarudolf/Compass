# Política de Privacidad — Compass (borrador v1.0)

> **Qué es esto**: el borrador de la política de privacidad que hoy vive como scaffold en
> `k0mp4ss_fe/apps/web/app/privacidad/page.tsx`. Lo produjo la consulta al skill
> `experto-admin-comunidades` el **2026-10-26**, sobre la asesoría previa registrada en
> `openspec/BACKLOG-100.md` §«Privacidad y datos personales».
>
> **Estado**: `[CRITERIO DEL PROYECTO]` = decisión nuestra · `[CONFIRMAR CON ABOGADO]` = depende de
> norma secundaria, de la futura Agencia o de datos que el proyecto todavía no tiene. Esto **no
> reemplaza la revisión del abogado**: es el texto que el abogado revisa en vez de escribir.
>
> **Pendiente antes de publicar**: completar los `«…»` (razón social, RUT, dirección y correos del
> responsable y del encargado por comunidad) y confirmar en LeyChile los arts. 14, 14 ter y 15 bis.

---

## 1. Quiénes somos y contacto

- **Responsable del tratamiento**: cada **comunidad** que usa Compass. `[CRITERIO DEL PROYECTO]`
- **Encargados del tratamiento**: el **administrador** de la comunidad y **Compass** como proveedor
  de la plataforma, que solo trata datos según las instrucciones de la comunidad.
  `[CRITERIO DEL PROYECTO]`
- Datos del responsable (completar por comunidad): razón social «…», RUT «…», dirección «…», correo
  de contacto «…». `[CONFIRMAR CON ABOGADO]`
- Contacto Compass (encargado): «…». `[CONFIRMAR CON ABOGADO]`

## 2. Qué datos tratamos

- **Padrón de personas y vínculos**: nombre, RUT, teléfonos, correo, unidad, rol y vínculo con la
  unidad. `[CRITERIO DEL PROYECTO]`
- **Unidades**: identificación de la unidad, alícuota, estado de ocupación. `[CRITERIO DEL PROYECTO]`
- **Finanzas (cobros, morosidad)**: cargos, pagos, saldos y estado de morosidad por unidad.
  `[CRITERIO DEL PROYECTO]`
- **Conserjería**: bitácora de visitas (nombre, RUT, destino, hora), encomiendas y contratistas.
  `[CRITERIO DEL PROYECTO]`
- **Comunicaciones y notificaciones**: avisos publicados y constancia de envío por visor o correo.
  `[CRITERIO DEL PROYECTO]`
- **Ficha laboral del personal**: datos de contratación y previsionales; datos de **salud solo si la
  ficha los pide**. `[CRITERIO DEL PROYECTO]`
- **Datos de uso y registros técnicos**: credenciales con hash irreversible, sesiones, registros de
  auditoría y telemetría de seguridad. `[CRITERIO DEL PROYECTO]`

## 3. Para qué y con qué base de licitud

| Finalidad | Base de licitud | ¿Requiere consentimiento? |
|---|---|---|
| Operar cuentas, roles y accesos | Ejecución de la relación con la comunidad / interés legítimo `[CONFIRMAR CON ABOGADO]` | No; se informa |
| Padrón, unidades, finanzas y cobranza | Obligación legal y administración de la comunidad `[CONFIRMAR CON ABOGADO]` | No; se informa |
| Bitácora de conserjería | Interés legítimo en seguridad, respaldado en reglamento interno o acuerdo de asamblea `[CRITERIO DEL PROYECTO]` | No; se informa en aviso visible |
| Comunicaciones operativas (avisos, cobranza) | Interés legítimo / ejecución de la administración `[CONFIRMAR CON ABOGADO]` | No; se informa |
| Comunicaciones **promocionales** | Consentimiento previo `[CRITERIO DEL PROYECTO]` | **Sí**, revocable (finalidad hoy no activa en el producto) |
| Datos de **salud/previsionales** del personal | Consentimiento + norma laboral aplicable `[CONFIRMAR CON ABOGADO]` | **Sí**, con registro server-side |
| Auditoría, seguridad y defensa ante reclamos | Interés legítimo y cumplimiento legal `[CONFIRMAR CON ABOGADO]` | No; se informa |

Solo las dos filas marcadas «Sí» exigen consentimiento con registro; el resto se sostiene
informando. `[CRITERIO DEL PROYECTO]`

## 4. Cuánto tiempo conservamos

- **Bitácora de visitas**: la identidad del visitante **90 días, luego se anonimiza**; el registro
  anonimizado se conserva como trazabilidad y **la línea de trazabilidad nunca se borra**.
  `[CRITERIO DEL PROYECTO]`
- **Documentación administrativa** (cobros, actas, rendiciones): **5 años**. `[CRITERIO DEL PROYECTO]`
- **Ficha laboral y previsional**: según la norma laboral aplicable. `[CONFIRMAR CON ABOGADO]`
- Al terminar el servicio, Compass **suprime o devuelve** los datos según el contrato de encargo.
  `[CONFIRMAR CON ABOGADO]`

## 5. Con quién los compartimos

- Encargados y subcontratados mínimos: **hosting/proveedor de base de datos, Sentry (errores) y SMTP
  (correo)**. `[CRITERIO DEL PROYECTO]`
- **No vendemos ni cedemos datos** con fines publicitarios. `[CRITERIO DEL PROYECTO]`
- Fuera de esos encargos y de obligaciones legales, no hay cesiones a terceros.
  `[CRITERIO DEL PROYECTO]`

## 6. Cómo los protegemos

- **Cifrado en reposo AES-256-GCM** y conexiones HTTPS. `[CRITERIO DEL PROYECTO]`
- **Redacción de PII en logs**, control de acceso por rol con mínimo privilegio y sesiones de 24 h
  con invalidación remota. `[CRITERIO DEL PROYECTO]`
- Segundo factor TOTP disponible. `[CRITERIO DEL PROYECTO]`

## 7. Tus derechos

Derechos de **acceso, rectificación, cancelación/supresión, oposición, portabilidad y bloqueo**.

- **Usuarios del sistema**: ejércelos en **`/admin/mis-datos`** (ver, descargar, corregir correo y
  teléfonos, pedir supresión). `[CRITERIO DEL PROYECTO]`
- **Terceros** (por ejemplo, el visitante de conserjería): escribe a la **administración de la
  comunidad** (correo «…»). `[CRITERIO DEL PROYECTO]`
- Plazo de respuesta y procedimiento exactos: `[CONFIRMAR CON ABOGADO]`. Si no quedas conforme puedes
  **reclamar ante la Agencia de Protección de Datos Personales** una vez operativa.

## 8. Vigencia y versiones

- Esta política es la **versión 1.0**; guardamos **qué versión aceptó cada usuario** y el banner
  registra el acuse por finalidad. `[CRITERIO DEL PROYECTO]`
- La Ley 21.719 rige desde el **01-12-2026** (existe un proyecto que propone postergarla a 2027;
  planificamos con 2026). `[CRITERIO DEL PROYECTO]`
- Los cambios relevantes se informan y, cuando corresponda, piden nueva aceptación.
  `[CONFIRMAR CON ABOGADO]`

## 9. Aviso para el visitante de conserjería

En conserjería se exhibe un aviso que indica **qué se registra, con qué finalidad, quién es el
responsable, el plazo de 90 días y el contacto para ejercer derechos**. `[CRITERIO DEL PROYECTO]`
Si te registran como visita, ese aviso es tu información de privacidad; para ejercer derechos escribe
a «…». Implementado en `components/aviso-privacidad-conserjeria.tsx`.

---

## Tabla claim → fuente (recuperado 2026-10-26)

| # | Afirmación normativa | Fuente |
|---|---|---|
| 1 | La Ley 21.719 regula el tratamiento y crea la Agencia de Protección de Datos Personales | gob.cl, «Aprobada Ley de Protección de Datos»: https://www.gob.cl/noticias/ley-proteccion-datos-personales-aprobacion-eleva-estandar-derechos/ |
| 2 | Derechos del titular: acceso, rectificación, supresión, oposición, portabilidad y bloqueo; la ley fija procedimiento y medios ante el responsable | misma página de gob.cl |
| 3 | La Agencia fiscaliza y sanciona (leves hasta 5.000 UTM, graves 10.000, gravísimas 20.000) | misma página de gob.cl |
| 4 | Publicada el 13-12-2024, vigencia a los 24 meses; hay un proyecto en trámite que propone postergarla a 2027 | Diario Oficial 13-12-2024: https://www.diariooficial.interior.gob.cl/publicaciones/2024/12/13/44023/01/2583630.pdf · gob.cl («24 meses») · prensa sobre la postergación |
| 5 | Detalle de los arts. 14 ter (deber de informar) y 15 bis (contrato de encargo, supresión/devolución) | **No verificado en LeyChile directo**: citado desde transcripciones (ley.leydedatos.com) → confirmar contra el texto oficial |

## Preguntas abiertas (para el abogado)

1. Confirmar numeración y texto vigente de los arts. **14, 14 ter y 15 bis** en LeyChile antes de
   fijarlos en UI o specs.
2. Confirmar las bases de licitud de cada fila de la tabla de §3 y los plazos de respuesta y
   reclamación ante la Agencia.
3. Confirmar la conservación laboral/previsional de la ficha del personal y el plazo de 5 años de la
   documentación administrativa.
4. Confirmar si el reglamento interno tipo exige una cláusula específica para la bitácora de visitas.
5. Completar razón social, RUT, dirección y correos reales del responsable y del encargado.
