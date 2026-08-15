# PE - Personal y Servicios

Este módulo permite la supervisión eficiente de los recursos humanos y técnicos que mantienen la operativa diaria del condominio.

## 1. Gestión de Personal Interno

Control del equipo de seguridad, conserjería y limpieza directa.

### 1.1 Ficha Integral del Trabajador
El sistema actúa como el repositorio maestro de identidad y condiciones laborales:
- **Gestión de Identidad:** Nombres, Apellidos, RUT, Email, Teléfono, Dirección y Fotografía de perfil.
- **Tipología Contractual:** Clasificación según el vínculo (Indefinido, Plazo Fijo, Honorarios).
- **Configuración Previsional y Salud:** 
    - Selección de AFP, Fonasa/Isapre, Seguro Complementario y APV.
- **Gestión Bancaria:** Registro de datos de transferencia vinculados al Maestro de Bancos.
- **Seguridad y Salud:** 
    - Ficha médica (medicamentos, alergias, condiciones).
    - Contactos de emergencia.
- **Control de Asistencia y Desempeño:**
    - Jornada Base Asociada y registro de horas extras.
    - Evaluación periódica de desempeño.
- **Panel de Monitoreo (Vista Administrador):** Listado en tiempo real del personal de turno y tareas pendientes.

### 1.2 Maestro de Feriados y Proyección Operativa
Permite a la administración anticiparse a los días festivos del año para asegurar la cobertura de turnos.
- **Carga de Calendario:** Importación anual de los feriados nacionales o regionales (ej: Fiestas Patrias, Navidad).
- **Proyección de Cobertura:** El sistema cruza los feriados con el calendario rotativo de asistencia y alerta al administrador: *"En este mes, el día 2 y 8 son feriados. Necesitará 3 trabajadores de reemplazo (parches) para cubrir los descansos legales"*.
- **Estimación de Costos:** Al identificar los reemplazos o el pago de "día extra" al personal de planta, el sistema envía una proyección de sobrecosto operativo al módulo de [Finanzas (`FI`)](<FI - Finanzas y Morosidad.md>).

## 2. Gestión de Proveedores Externos (Servicios)

Control de las empresas de mantenimiento (Ascensores, Bombas de agua, Seguridad CCTV).

### Funcionalidades:
- **Catálogo de Proveedores:** Información de contacto y RUT de la empresa.
- **Calendario de Mantenciones Preventivas:** Alertas automáticas para servicios recurrentes (ej: "Mantención de ascensores vence en 5 días").
- **Libro de Visitas Técnicas:** Registro digital de cada vez que un técnico ingresa al condominio, qué hizo y quién lo supervisó.

### 2.1 Directorio de Emergencias y Utilidad Pública
Un submódulo accesible tanto para conserjería como para residentes, diseñado para dar respuesta rápida en crisis.
- **Categorización Específica:** Servicios de Urgencia (Policía, Bomberos, Ambulancia, Paz Ciudadana) y Servicios Técnicos de Urgencia (Cerrajeros, Plomeros/Gasfíter, Electricistas, Jardineros).
- **Datos Estándar:** 
  - Categoría del servicio.
  - Descripción o Nombre de la Empresa/Contacto.
  - Número de Teléfono (con link directo para llamar desde móviles).
  - URL / Sitio Web (si aplica).

## 3. Bitácora Digital de Conserjería

Reemplazo del libro de novedades físico por uno digital auditable.

### Sub-módulo de Controles (Accesos y Logística)
Registro en tiempo real de todo el flujo externo. Todos los controles se muestran como tarjetas de resumen en el Dashboard Diario (clic para ver el detalle).

**1. Control de Visitas:**
- *Pre-Agendamiento:* El residente (o admin) puede agendar la visita con antelación. La unidad se autocompleta (si el residente tiene varias, muestra un selector). Al llegar la visita, el conserje solo la busca en el Dashboard y marca "Ingresada" para sellar la hora.
- *Llegada sin Aviso:* El conserje registra la visita buscando manualmente la unidad o residente destino.
- *Datos:* Nombre, DNI, Patente, Unidad destino, Fecha, **Jornada** (Selector ligado a un maestro: Mañana/Tarde/Noche, crucial para métricas) y Notas.
- *Escaneo DNI (Feature Local):* Capacidad de utilizar la cámara del dispositivo para escanear el código de la Cédula de Identidad Chilena y autocompletar el DNI y Nombre de la visita.

**2. Control de Encomiendas y Delivery:**
- *Maestro Courier/App:* Selector desplegable (Chilexpress, PedidosYa, etc.) para evitar escritura libre y normalizar los reportes.
- *Evidencia:* Campo para adjuntar fotografía del paquete al recibirlo en conserjería.

**3. Control de Contratistas y Servicios:**
- *Maestro de Contratistas:* Selector de empresas concurrentes o servicios autorizados.
- *Agendamiento:* El residente puede agendar contratistas particulares, o el administrador puede agendar los de la comunidad.
- *Datos:* Se exige detallar el motivo específico del ingreso.
### Dashboard Operativo ("Operaciones -> Reporte Diario")
Interfaz exclusiva para el personal, diseñada para dar contexto rápido antes de iniciar el trabajo.
- **Tarjetas de Jornada:** Muestra el estado (Informado / No Informado) de la Mañana, Tarde y Noche.
- **Historial Accesible:** Permite seleccionar el día actual o días anteriores. Al hacer clic en una tarjeta, se ve el resumen de novedades.

### Protocolo de Cierre de Turno (Reporte Obligatorio)
Formulario dinámico para validar el "Trabajo Invisible". (El sistema no cronometra tiempo de uso, solo valida el evento de reporte).
- **Lógica de UX (Anti-Negligencia):** Todas las preguntas críticas vienen marcadas en **"SÍ"** por defecto (indicando que *hubo* incidentes o que *se revisó* algo). Esto obliga a escribir descripción y subir evidencia. Si no hay novedades, se cambia activamente a **"NO"**, ocultando los campos.
- **Secciones del Formulario:**
  1. *Identificación del Turno:* Fecha, hora y jornada. **Permite cambiar la jornada reportada** en caso de estar haciendo un reemplazo.
  2. *Novedades Generales:* Resumen libre.
  3. *Reporte de Incidencias:* "¿Existieron incidencias o emergencias?".
  4. *Estado de Instalaciones:* Checklist basado en la **Jornada reportada**.
  5. *Estado de Equipamiento:* Checklist de equipos que pasan de ronda en ronda (Celular, PC, llaves maestras).
- **Edición y Trazabilidad:** El reporte cerrado puede editarse, pero el sistema guardará un registro histórico de los cambios.
- **Notificación Inmediata:** Al enviar, se envía una copia del reporte al correo electrónico registrado en la Ficha del Trabajador.

## 4. Integración con Auditoría y Métricas (AM)

Cuantificación de la labor operativa y cumplimiento de mantenimientos:
- **Evento:** `PE_START_SHIFT`, `PE_TASK_DONE`, `PE_VISITA_TECNICA`, `PE_ENCOMIENDA_RECIBIDA`.
- **Data Cuantificable:** Horas trabajadas, cantidad de tareas completadas, número de visitas técnicas registradas.
- **Métrica:** Porcentaje de cumplimiento del plan de mantenimiento preventivo, volumen de encomiendas gestionadas por turno, puntualidad del personal.
