#!/bin/bash

# Script para desplegar el servidor backend a Azure App Service
# Requiere Azure CLI instalado y logueado (az login)

set -e

# Configuración
RESOURCE_GROUP="uml-diagram-rg-linux"
APP_SERVICE_PLAN="uml-diagram-plan-linux"
WEB_APP_NAME="uml-diagram-backend-linux"
LOCATION="East US"
NODE_VERSION="24"

echo "🚀 Iniciando despliegue del servidor backend a Azure App Service..."

# Verificar si Azure CLI está instalado y logueado
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI no está instalado. Instálalo desde https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

if ! az account show &> /dev/null; then
    echo "❌ No estás logueado en Azure. Ejecuta 'az login'"
    exit 1
fi

echo "✅ Azure CLI verificado"

# Crear Resource Group
echo "📦 Creando Resource Group: $RESOURCE_GROUP"
az group create --name $RESOURCE_GROUP --location "$LOCATION" --output none

# Crear App Service Plan
echo "⚙️ Creando App Service Plan: $APP_SERVICE_PLAN"
az appservice plan create \
    --name $APP_SERVICE_PLAN \
    --resource-group $RESOURCE_GROUP \
    --location "$LOCATION" \
    --sku B1 \
    --is-linux \
    --output none

# Crear Web App
echo "🌐 Creando Web App: $WEB_APP_NAME"
az webapp create \
    --name $WEB_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --plan $APP_SERVICE_PLAN \
    --runtime "NODE|$NODE_VERSION-lts" \
    --output none

# Configurar Node.js version
echo "🔧 Configurando Node.js version: $NODE_VERSION"
az webapp config set \
    --name $WEB_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --linux-fx-version "NODE|$NODE_VERSION" \
    --output none

# Configurar variables de entorno (ajusta según tu .env)
echo "🔐 Configurando variables de entorno..."
az webapp config appsettings set \
    --name $WEB_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --settings \
    NODE_ENV=production \
    PORT=8080 \
    DATABASE_URL="$DATABASE_URL" \
    AZURE_IA_API_KEY="$AZURE_IA_API_KEY" \
    AZURE_IA_ENDPOINT="$AZURE_IA_ENDPOINT" \
    AZURE_IA_DEPLOYMENT="$AZURE_IA_DEPLOYMENT" \
    IA_API_KEY="$IA_API_KEY" \
    APP_EMAIL="$APP_EMAIL" \
    APP_PASSWORD="$APP_PASSWORD" \
    AI_PROVIDER=azure \
    --output none

# Configurar WebSockets
echo "🔗 Habilitando WebSockets..."
az webapp config set \
    --name $WEB_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --web-sockets-enabled true \
    --output none

# Configurar Always On (para evitar suspensiones)
echo "⏰ Configurando Always On..."
az webapp config set \
    --name $WEB_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --always-on true \
    --output none

# Desplegar código desde GitHub
echo "📤 Desplegando código desde GitHub..."
az webapp deployment source config \
    --name $WEB_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --repo-url "https://github.com/borysinho/server-frontend-backend-generator" \
    --branch main \
    --manual-integration \
    --output none

# Configurar build commands
echo "🔨 Configurando comandos de build..."
az webapp config appsettings set \
    --name $WEB_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --settings \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true \
    --output none

# Obtener URL de la app
APP_URL=$(az webapp show --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP --query defaultHostName -o tsv)
echo "✅ Despliegue completado!"
echo "🌐 URL de la aplicación: https://$APP_URL"
echo ""
echo "📋 Próximos pasos:"
echo "1. Verifica que la app esté corriendo: https://$APP_URL"
echo "2. Revisa logs: az webapp log tail --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP"
echo "3. Si hay errores, redeploy: az webapp deployment source sync --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP"
echo ""
echo "⚠️ Nota: El plan FREE puede suspender la app después de inactividad. Considera upgrade a plan pago para WebSockets persistentes."