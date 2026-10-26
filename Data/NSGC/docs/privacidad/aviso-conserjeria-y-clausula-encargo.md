# Aviso de conserjería y cláusula de encargo — textos definitivos (borrador)

> **Qué es esto**: los dos textos cortos que produjo la cuarta consulta al skill
> `experto-admin-comunidades` el **2026-10-26**, coherentes con
> `borrador-politica-privacidad-v1.0.md` (mismos plazos y mismos roles: la comunidad es
> responsable, el administrador y Compass son encargados).
>
> **Estado**: `[CONFIRMAR CON ABOGADO]` = pendiente de norma secundaria o de la futura Agencia.
> **No reemplaza la revisión del abogado.**
>
> **Pendiente antes de publicar**: completar los `«…»` (razón social, RUT, domicilio) y confirmar en
> LeyChile los arts. 14 ter y 15 bis, que se citaron desde transcripciones.

---

## 1. Aviso de privacidad de conserjería (texto definitivo, 106 palabras)

> En conserjería registramos tu nombre, documento, patente si vienes en auto, la unidad que visitas y
> la jornada y hora de tu ingreso. Usamos estos datos solo para controlar el acceso y cuidar la
> seguridad de la comunidad, por su interés legítimo respaldado en su reglamento interno. La
> responsable de tus datos es la comunidad; el administrador y Compass solo actúan como encargados.
> Tu identificación se anonimiza a los 90 días y el registro de trazabilidad se mantiene. Para
> ejercer tus derechos, escribe a la administración de la comunidad; no necesitas tener cuenta en el
> sistema. «Zona con control de acceso: al ingresar aceptas este registro.»

**Dónde va hoy**: `k0mp4ss_fe/apps/web/components/aviso-privacidad-conserjeria.tsx` muestra una
versión anterior de este texto (informa qué se registra, la finalidad, que la responsable es la
comunidad y cómo ejercer derechos, pero **no menciona los 90 días**, porque esa decisión se tomó
después). Reemplazar el copy del componente por este texto **después** de la revisión del abogado,
en la misma pasada en que se actualice `app/privacidad/page.tsx` con el borrador de la política.

**Soporte**: el aviso en pantalla **no alcanza**. El visitante puede no ver la pantalla de
conserjería, así que hace falta un **cartel físico en portería** con este texto. Ese cartel es lo
único que garantiza el deber de informar al tercero, y depende del owner (imprimirlo y colgarlo).

## 2. Cláusula de encargo de tratamiento (art. 15 bis)

1. **Objeto y duración.** La comunidad «razón social, RUT, domicilio» (responsable) encarga al
   administrador «…» y/o a Compass «…» (encargado) el tratamiento de datos en la plataforma, solo
   para administrar la comunidad. Dura lo que dure el servicio. `[CONFIRMAR CON ABOGADO]`
2. **Instrucciones y límites.** El encargado solo trata datos según instrucciones documentadas del
   responsable, nunca para fines propios; no los cede ni entrega sin autorización expresa y
   específica para el encargo.
3. **Datos y titulares.** Padrón y vínculos, unidades, finanzas y morosidad, bitácora de conserjería,
   comunicaciones, ficha laboral y registros técnicos; titulares: residentes, visitas, personal y
   usuarios. *(Criterio del proyecto — política §2)*
4. **Seguridad y confidencialidad.** Cifrado AES-256-GCM, HTTPS, PII fuera de los logs, mínimo
   privilegio y personal bajo deber de confidencialidad. *(Criterio del proyecto — política §6)*
5. **Subencargados.** Hosting/base de datos, Sentry (errores) y SMTP (correo), con autorización
   general del responsable; los cambios se informan y el responsable puede oponerse.
   `[CONFIRMAR CON ABOGADO]`
6. **Asistencia.** El encargado ayuda a responder los derechos de los titulares y avisa de inmediato
   cualquier brecha al responsable.
7. **Supresión o devolución.** Al terminar el servicio, suprime o devuelve los datos según indique el
   responsable.
8. **Auditoría y responsabilidad.** El responsable puede verificar el cumplimiento; quien se aparta
   del encargo responde como responsable. `[CONFIRMAR CON ABOGADO]` montos, fuero y solidaridad.
9. **Modificaciones.** Solo por escrito entre las partes. `[CONFIRMAR CON ABOGADO]`

**Afirmaciones nuevas → fuente (recuperado 2026-10-26)**: el art. 15 bis (encargo, instrucciones, no
cesión sin autorización expresa, subencargo con autorización escrita, supresión/devolución al
término, reporte de brechas al responsable) y el art. 14 ter (deber de informar: responsable, datos,
finalidades, base de legitimidad, conservación, derechos y reclamo ante la Agencia) se verificaron en
la transcripción `ley.leydedatos.com`, **no en LeyChile directo**. Confirmar numeración y texto
oficial antes de fijarlos en contratos o specs.

## Preguntas abiertas (para el abogado)

1. Confirmar en LeyChile los arts. 14 ter y 15 bis.
2. Confirmar la base «interés legítimo + reglamento interno» para la bitácora de visitas.
3. Confirmar si la autorización de subencargados puede ser general y qué plazo de oposición
   corresponde.
