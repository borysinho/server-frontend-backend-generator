# 🚀 Despliegue en Vercel

## ⚠️ **Limitaciones Importantes**

### **WebSockets NO FUNCIONAN en Vercel**
- Vercel Functions no soportan conexiones WebSocket persistentes
- Las funcionalidades de colaboración en tiempo real **NO estarán disponibles**
- Los endpoints de WebSocket fallarán silenciosamente

### **Funcionalidades Afectadas**
- ❌ Edición colaborativa en tiempo real
- ❌ Chat/IA en tiempo real
- ❌ Notificaciones en vivo
- ❌ Undo/Redo colaborativo

### **Funcionalidades que SÍ Funcionan**
- ✅ Endpoints REST API
- ✅ Autenticación de usuarios
- ✅ Gestión de diagramas
- ✅ Generación de código backend
- ✅ Exportación de diagramas
- ✅ Gestión de invitaciones

## 📋 **Pasos para Desplegar**

### **1. Preparar el Proyecto**
```bash
# Asegúrate de tener el archivo vercel.json
# El archivo ya está configurado correctamente

# Instalar dependencias
npm install
```

### **2. Configurar Variables de Entorno en Vercel**
Ve a tu proyecto en Vercel → Settings → Environment Variables y agrega:

```bash
# Base de datos (requerido)
DATABASE_URL=postgresql://usuario:password@host:puerto/database?schema=public

# IA (opcional, pero recomendado)
AZURE_IA_API_KEY=tu-api-key-de-azure
AZURE_IA_ENDPOINT=https://tu-recurso.openai.azure.com/
AZURE_IA_DEPLOYMENT=gpt-4.1-mini
AI_PROVIDER=azure

# Email (requerido para invitaciones)
APP_EMAIL=tu-email@gmail.com
APP_PASSWORD=tu-app-password

# Configuración
NODE_ENV=production
```

### **3. Desplegar**
```bash
# Instalar Vercel CLI
npm i -g vercel

# Login en Vercel
vercel login

# Desplegar
vercel --prod
```

## 🔧 **Solución Recomendada**

Para tener **funcionalidad completa**, considera estas alternativas:

### **Opción 1: Railway (Recomendado)**
```bash
# Railway soporta WebSockets y servidores tradicionales
npm install -g @railway/cli
railway login
railway deploy
```

### **Opción 2: Render**
```bash
# Render también soporta WebSockets
# Configurar como Web Service
```

### **Opción 3: AWS/Heroku**
```bash
# Servicios tradicionales que soportan WebSockets
```

## 📊 **Comparación de Servicios**

| Servicio | WebSockets | Precio | Facilidad |
|----------|------------|--------|-----------|
| **Railway** | ✅ | 💰💰 | ⭐⭐⭐⭐⭐ |
| **Render** | ✅ | 💰💰 | ⭐⭐⭐⭐ |
| **Vercel** | ❌ | 💰 | ⭐⭐⭐⭐⭐ |
| **Heroku** | ✅ | 💰💰💰 | ⭐⭐⭐ |

## 🚨 **Problemas Conocidos en Vercel**

1. **Timeout de Functions**: Las funciones tienen límite de 30 segundos
2. **Conexiones Simultáneas**: Límite de conexiones por función
3. **Base de Datos**: Asegúrate de que tu BD acepte conexiones desde Vercel
4. **CORS**: Puede requerir configuración adicional

## 🔍 **Debugging en Vercel**

```bash
# Ver logs de despliegue
vercel logs

# Ver configuración actual
vercel env ls

# Redeploy forzado
vercel --prod --force
```

## 📞 **Soporte**

Si encuentras problemas específicos:
1. Revisa los logs de Vercel
2. Verifica las variables de entorno
3. Confirma que la base de datos es accesible
4. Considera migrar a un servicio que soporte WebSockets

---

**⚠️ IMPORTANTE**: Para funcionalidad completa de colaboración, **NO uses Vercel**. Opta por Railway o Render.