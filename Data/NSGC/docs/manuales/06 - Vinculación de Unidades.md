# 🔗 06 - Vinculación de Unidades (VU)

Ya tenís los departamentos y tenís a las personas. Ahora toca "amarrarlos". Este módulo es el que dice quién vive dónde y quién es el dueño de qué.

## 🚀 Funcionalidad Principal
Establecer la relación legal y operativa entre los habitantes/dueños y la infraestructura física.

## 🛠️ Tipos de Vínculo
Cuando vinculái a alguien a una unidad, tenís que elegir su rol:
- **Propietario**: El dueño legal (a quien le llega la cobranza pesada).
- **Arrendatario**: El que vive ahí pero no es dueño.
- **Copropietario / Familiar**: Personas que viven en la unidad pero no son el titular principal.
- **Ocupante**: Otros residentes registrados.

## 🏠 Estado de Ocupación de la Propiedad
La ficha del vínculo de un propietario declara además **cómo está ocupada la unidad**: el valor sale del
**maestro de estados inmobiliarios de esa comunidad** (Maestros Administrativos), no de una lista fija
del código. Es una fila por comunidad: una puede tener `habitada`, otra puede llamarla distinto.

Por eso el formulario **exige elegir** una fila del maestro y ya no propone `habitada` por defecto: si
la comunidad no sembró esa fila, el vínculo quedaba apuntando a un id que no existe en ningún maestro y
el filtro de ocupación no lo encontraba — sin error, porque el contrato de la columna acepta cualquier
texto no vacío.

## 🏢 Vinculación Múltiple
Una persona puede tener vínculos con varias unidades. 
*Ejemplo: El Sr. Pérez es **Propietario** del Depto 101, pero también es **Propietario** del Estacionamiento E-15 y la Bodega B-02.*

## 🛡️ Reglas que valida el sistema al guardar
El sistema rechaza el vínculo (y te muestra el motivo) si:
- **Persona inactiva**: La persona está marcada como inactiva en el Maestro de Personas.
- **Vínculo duplicado**: La persona ya tiene un vínculo **activo** con la misma unidad.
- **Solapamiento de arriendos**: Un contrato de arriendo (`Arrendatario`) se solapa con otro contrato vigente en la misma unidad.

## 🔍 El padrón completo detrás del vínculo

El formulario de vínculo ofrece **todas las unidades de la comunidad** en su selector, no sólo la primera página del padrón: la unidad de la fila 101 en adelante también se puede vincular. La ficha de la persona (`/comunidad/personas/[id]`) imprime el rótulo real de cada unidad vinculada, resuelto contra ese mismo padrón completo — ya no un id crudo cuando la unidad queda fuera de las primeras cien filas.

## 💡 ¿Para qué sirve esto?
Gracias a esta vinculación, el sistema puede:
1.  **Automatizar Cobros**: Sabe a quién mandarle el mail del Gasto Común.
2.  **Control de Acceso**: Sabe quién tiene permiso para entrar al edificio.
3.  **Censo en Vivo**: Te da un reporte de cuánta gente vive realmente en la torre en cualquier momento.
