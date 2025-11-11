# Colección de Postman - API del Generador de Diagramas UML

Esta colección contiene todos los endpoints disponibles en la API del servidor para el generador de diagramas UML y código backend/frontend.

## 📋 **Endpoints Incluidos**

### 🔍 **Health Check**
- `GET /health` - Verificar estado del servidor

### 🔐 **Autenticación**
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/register` - Registrar nuevo usuario

### 📊 **Diagramas**
- `GET /api/diagrams/check-name` - Verificar nombre disponible
- `GET /api/diagrams/user/:userId` - Obtener diagramas del usuario
- `GET /api/diagrams/:diagramId` - Obtener diagrama específico
- `POST /api/diagrams` - Crear nuevo diagrama
- `PUT /api/diagrams/:diagramId` - Actualizar diagrama
- `DELETE /api/diagrams/:diagramId` - Eliminar diagrama
- `GET /diagram/:diagramId/stats` - Estadísticas del diagrama
- `GET /diagram/:diagramId/state` - Estado actual del diagrama

### 📨 **Invitaciones**
- `POST /api/invitations` - Crear invitación
- `GET /api/invitations` - Todas las invitaciones
- `GET /api/invitations/user/:userId` - Invitaciones del usuario
- `GET /api/invitations/:id` - Invitación específica
- `POST /api/invitations/:id/accept` - Aceptar invitación
- `POST /api/invitations/:id/reject` - Rechazar invitación
- `DELETE /api/invitations/:id` - Eliminar invitación

### 🤖 **Procesamiento IA**
- `POST /api/ai/process` - Procesar solicitud con IA

### ⚙️ **Generación de Código**
- `POST /api/diagrams/generate-backend` - Generar backend Spring Boot
- `POST /api/flutter/generate` - Generar app Flutter

### 📤 **Exportación**
- `GET /api/diagrams/:diagramId/export/json` - Exportar como JSON
- `GET /api/diagrams/:diagramId/export/svg` - Exportar como SVG

### 🧪 **Testing**
- `GET /api/test` - Endpoint de prueba

## 🚀 **Cómo Usar**

### 1. **Importar la Colección**
1. Abrir Postman
2. Click en "Import" → "File"
3. Seleccionar `UML_Diagram_Generator_API.postman_collection.json`

### 2. **Configurar Variables**
Antes de usar los endpoints, configura estas variables en Postman:

| Variable | Valor por Defecto | Descripción |
|----------|------------------|-------------|
| `base_url` | `http://localhost:3001` | URL del servidor API |
| `user_id` | `user-uuid-here` | ID del usuario autenticado |
| `diagram_id` | `diagram-uuid-here` | ID del diagrama a probar |
| `invitation_id` | `invitation-uuid-here` | ID de invitación a probar |

### 3. **Flujo de Uso Típico**

1. **Registro/Login**: Usar endpoints de autenticación
2. **Crear Diagrama**: `POST /api/diagrams`
3. **Trabajar con Diagrama**: Usar endpoints de diagramas
4. **Generar Código**: `POST /api/diagrams/generate-backend`
5. **Colaboración**: Crear y gestionar invitaciones

## 📝 **Notas Importantes**

### **Autenticación**
- Algunos endpoints requieren autenticación
- El `user_id` debe obtenerse del login/registro

### **IDs Dinámicos**
- Reemplaza `{{user_id}}`, `{{diagram_id}}`, etc. con valores reales
- Los IDs se obtienen de respuestas de creación/consulta

### **Cuerpo de las Peticiones**
- Los endpoints POST/PUT incluyen ejemplos de JSON
- Ajusta los valores según tus necesidades

### **Base de Datos**
- Asegúrate de que el servidor tenga conexión a PostgreSQL
- Las credenciales están en el archivo `.env`

### **IA**
- Requiere configuración de API key (Azure OpenAI o Google AI)
- Verifica las variables de entorno del servidor

## 🔧 **Configuración del Servidor**

Asegúrate de que el servidor esté ejecutándose en `http://localhost:3001` con:

```bash
npm install
npm run dev
```

## 📊 **Testing Recomendado**

1. **Health Check**: Verificar que el servidor responde
2. **Registro**: Crear un usuario de prueba
3. **Login**: Obtener token/ID de usuario
4. **Crear Diagrama**: Probar creación básica
5. **Generar Backend**: Probar generación de código
6. **Exportar**: Probar exportación de diagramas

## 🆘 **Solución de Problemas**

### **Errores Comunes**
- **404 Not Found**: Verificar URL y variables
- **500 Internal Server Error**: Revisar logs del servidor
- **401 Unauthorized**: Verificar autenticación
- **400 Bad Request**: Revisar formato del JSON

### **Debugging**
- Usar `GET /api/test` para verificar conectividad
- Revisar logs del servidor en la consola
- Verificar variables de entorno en `.env`

---

**Archivo generado automáticamente para testing de la API del Generador de Diagramas UML**