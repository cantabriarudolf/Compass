# ⚖️ 22 - Infracciones y Multas (IN)

El expediente disciplinario de la comunidad: cataloga las faltas al Reglamento de Copropiedad, documenta cada evento con evidencias y aplica sanciones económicas estandarizadas con respaldo de la directiva.

## 🚀 Funcionalidad Principal

Cada infracción nace con folio único `IN-####` en estado En Revisión, amarrada a la unidad infractora, con fecha/hora del suceso, antecedentes detallados (mín. 20 caracteres) y evidencias por referencia D1. Puede venir del catálogo de faltas o ser un cobro directo por daños con costo exacto y respaldo obligatorio.

## 🛠️ Secciones

- **Registro**: bandeja con filtros y detalle/expediente trazable; formulario dual (falta del catálogo vs daño directo) con conversión desde reclamos del buzón CO (arrastra folio, asunto y cuerpo como antecedentes).
- **Panel Directiva**: incidentes en curso con contadores por estado/categoría, montos comprometidos, comentarios internos privados y votos de respaldo.
- **Catálogo de faltas**: parametrizable con nombre, categoría (Leve/Grave/Gravísima) y sanción base (Monto Fijo $ o Porcentaje % del Gasto Común); seed NSGC incluido (ruidos molestos, mascotas, basura, áreas comunes, obras sin autorización).

## 💡 Tips de Oro

- **Estados estrictos**: En Revisión → Apelada (descargos del vecino) → Aplicada o Desestimada; ya resueltas no admiten segunda resolución.
- **Graves con quórum directivo**: multas Grave/Gravísima exigen ≥1 respaldo de miembro vigente de la directiva antes de aplicarse; los comentarios internos son exclusivos de admin/directiva.
- **Aplicar fija el monto**: monto fijo del catálogo o costo del daño; el % GC queda registrado como tal (la conversión a pesos llega con FI). Toda aplicación deja `cargoFIReferencia:"pendiente"` y notifica al propietario vigente de la unidad (pasa por gate AD).
- **Desestimación exige justificación**: queda escrita en el expediente.
- **Tipo en uso no eliminable**: el catálogo bloquea borrar faltas con infracciones registradas.
- **Auditoría**: `IN_REG_EVENT`, `IN_APELACION`, `IN_APPLY_FINE`.

## 🔗 Dependencias

- Unidad infractora de **EF**, reportantes de **MP**, directiva vigente de **GD** (`datosGobernanza`).
- Reclamos verídicos desde `mensajesBuzonCO` de **CO - Comunicación Vecinos**.
- Notificaciones con `notify()` (**ST**, D3).

