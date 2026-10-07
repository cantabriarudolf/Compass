# 🧾 13 - Gestión Administrativa (AD)

El panel de trabajo del administrador: desde acá ves los perfiles de toda la comunidad (propietarios, residentes, directiva) y el personal, y defines qué puede ver cada uno sobre su propiedad.

## 🚀 Funcionalidad Principal

Centralizar la gestión de personas bajo dos cajones — Comunidad y Recursos Humanos — y dar al propietario controles de privacidad/comunicación sobre su unidad.

## 🛠️ Secciones

- **Cajón de Comunidad**: directorio de propietarios, residentes y miembros de directiva, con sus vínculos a unidades y roles.
- **Cajón de Recursos Humanos**: acceso a fichas del personal (conserjería, aseo, administración).
- **Controles por Unidad**: por cada propiedad definís `residenteVeMorosidad`, `residenteVeActas` y `alertasResidentesActivas`. Si la unidad no tiene registro, aplican los valores por defecto (morosidad oculta, actas ocultas, alertas activas).
- **Notificar a Residentes / Gestión de Alertas**: envío de alertas respetando el opt-out del propietario.
- **Firma Digitalizada**: los cargos de directiva registran su firma como referencia (URL/metadata) para alimentar el flujo de actas de GD.

## 💡 Tips de Oro

- **Privacidad primero**: aunque el residente tenga vínculo vigente, solo ve morosidad o actas si el dueño lo autorizó acá.
- **Firma por referencia**: la firma es una URL/metadato, jamás una imagen incrustada (decisión D1).
- **Alertas silenciables**: si el propietario apaga `alertasResidentesActivas`, el sistema registra pero no notifica (decisión D3).
- **Auditoría**: cambios de configuración y firmas generan eventos `AD_OWNER_CONFIG_CHANGE` y `AD_DIRECTIVA_SIGN_UPLOAD`; la depuración de una ficha de gobernanza al perder el rol `directiva` queda auditada con `AD_DIRECTIVA_DESVINCULADA` por cualquier vía de escritura (API incluida).
- **Alcance actual**: lo contractual/previsional del personal vive en PE (módulo futuro); acá solo hay acceso a fichas.
- **Robustez ante extensiones nulas**: las listas de Directiva y Personal excluyen fichas con `datosGobernanza`/`datosLaborales` en `null` (igual que ausente); la página nunca revienta por eso.
- **Ficha atada al período vigente**: la ficha de gobernanza guarda `periodoId`; al guardarla hereda el período de directiva **vigente** (si existe), para que la trazabilidad de quién firmó qué sobreviva a la rotación. Los períodos se gestionan en **GD - Gestión de Directiva**.
- **Ficha editable desde el perfil**: la pestaña **Gobernanza** del perfil de la persona permite crear o editar la ficha (cargo, fecha de asunción, firma por referencia). Si se le quita el rol `directiva` a la persona, la ficha se **depura** — no queda una ficha fantasma sin cargo que la respalde.

## 🔗 Dependencias

- Lee identidades de **MP - Maestro de Personas** y vínculos de **VU - Vinculación de Unidades**.
- Sus controles gobiernan la visibilidad de actas en **GD - Gestión de Directiva**.
- Las alertas usan la bandeja simulada transversal (**ST - Capa de Datos Persistente**, D3).
