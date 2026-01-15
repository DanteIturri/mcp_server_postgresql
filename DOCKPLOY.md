# Despliegue con Dockploy

Esta guía explica cómo desplegar el servidor MCP PostgreSQL usando Dockploy.

## 📋 Requisitos previos

1. Tener Dockploy instalado en tu VPS
2. Acceso a tu panel de Dockploy
3. Un repositorio Git (GitHub, GitLab, etc.) con este código

## 🚀 Pasos para desplegar

### 1. Crear nueva aplicación en Dockploy

1. Accede a tu panel de Dockploy
2. Haz clic en **"New Application"**
3. Selecciona **"Deploy from Git"**
4. Conecta tu repositorio

### 2. Configurar el proyecto

**Tipo de proyecto:** Docker

**Build Configuration:**
- **Dockerfile:** `Dockerfile` (usar el que está en la raíz)
- **Context:** `.`
- **Build Args:** (dejar vacío)

### 3. Configurar variables de entorno

En la sección **Environment Variables**, agrega:

```env
NODE_ENV=production
PORT=3000
API_KEY=tu-api-key-super-secreta-aqui
ALLOWED_ORIGINS=*
```

**Importante:** 
- Genera una API_KEY segura (mínimo 32 caracteres)
- En producción, configura ALLOWED_ORIGINS con dominios específicos

### 4. Configurar el dominio

1. En la sección **Domains**, agrega tu dominio
2. Dockploy configurará automáticamente:
   - ✅ **SSL/TLS con Let's Encrypt** (certificado gratuito)
   - ✅ **Renovación automática** del certificado
   - ✅ **Redirección HTTP → HTTPS** automática
   - ✅ **Proxy reverso** con Traefik/Nginx
3. Ejemplo: `mcp-postgresql.tudominio.com`
4. Espera 1-2 minutos para que el certificado SSL se genere

**Importante:** 
- El dominio debe estar apuntando a la IP de tu VPS (registro A o CNAME)
- Una vez configurado, **SIEMPRE usa HTTPS** en la URL
- Formato correcto: `https://mcp-postgresql.tudominio.com`

### 5. Configurar el puerto

- **Container Port:** `3000`
- **Protocol:** HTTP
- Dockploy automáticamente creará el proxy reverso

### 6. Health Check (Automático)

El Dockerfile incluye un healthcheck, pero puedes verificar en:
- URL: `https://tu-dominio.com/health`
- Respuesta esperada: `{"status":"ok","timestamp":"...","activeSessions":0}`

## 📱 Configurar Claude Desktop

Una vez desplegado, configura Claude Desktop:

**Archivo:** `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "postgresql": {
      "url": "https://mcp-postgresql.tudominio.com/sse",
      "headers": {
        "x-api-key": "tu-api-key-super-secreta-aqui"
      }
    }
  }
}
```

**Nota:** La API_KEY debe ser la misma que configuraste en las variables de entorno.

## 🔄 Actualizar la aplicación

### Opción 1: Desde Dockploy
1. Ve a tu aplicación en Dockploy
2. Haz clic en **"Redeploy"**
3. Dockploy hará pull del último código y rebuildeará

### Opción 2: Webhook automático
1. Configura el webhook de Dockploy en tu repositorio
2. Cada push a la rama principal desplegará automáticamente

## 🔧 Troubleshooting

### El contenedor no inicia
```bash
# Ver logs en Dockploy
# O conectarte por SSH a tu VPS:
docker logs mcp-postgresql
```

### Certificado SSL no se genera
- Verifica que el dominio apunte correctamente a tu VPS
- Usa `dig mcp-postgresql.tudominio.com` o `nslookup` para verificar DNS
- Espera 1-2 minutos después de agregar el dominio
- El puerto 80 y 443 deben estar abiertos en el firewall
- Dockploy usa Let's Encrypt, que requiere validación HTTP

### Error de certificado SSL en Claude
- Asegúrate de usar `https://` (no `http://`)
- Verifica que el certificado esté activo: `https://tu-dominio.com/health`
- Si usas un dominio nuevo, espera a que SSL esté completamente configurado

### Error 401 en Claude
- Verifica que la API_KEY sea exactamente igual en Dockploy y claude_desktop_config.json
- No debe tener espacios ni caracteres especiales no deseados

### CORS error
- Configura ALLOWED_ORIGINS con el dominio correcto
- Para desarrollo local usa: `ALLOWED_ORIGINS=*`
- Para producción usa: `ALLOWED_ORIGINS=https://claude.ai,https://app.claude.ai`

### SSE no conecta
- Verifica que Dockploy tenga configurado el proxy correctamente
- El healthcheck debe responder OK
- Revisa los logs del contenedor

## 📊 Monitoreo

Dockploy proporciona:
- **Logs en tiempo real:** Ver actividad del servidor
- **Métricas:** CPU, memoria, red
- **Reinicio automático:** Si el container falla
- **Health checks:** Verifica que el servicio esté disponible

## 🔐 Seguridad recomendada

1. **API Key fuerte:** Usa un generador de contraseñas
2. **CORS específico:** No uses `*` en producción
3. **Rate limiting:** Considera agregar límites de tasa
4. **Logs:** Monitorea accesos sospechosos
5. **SSL:** Dockploy lo configura automáticamente

## 🎯 Testing

Después del despliegue, prueba:

```bash
# Health check
curl https://tu-dominio.com/health

# Debe responder:
# {"status":"ok","timestamp":"2026-01-15T...","activeSessions":0}
```

Luego prueba desde Claude Desktop:
1. Reinicia Claude Desktop
2. Deberías ver "postgresql" en la lista de servidores MCP
3. Usa comandos como "conecta a mi base de datos PostgreSQL"

## 💡 Tips adicionales

- **Backups:** Dockploy puede crear backups automáticos
- **Staging:** Crea una segunda app para testing
- **Logs:** Configura retención de logs según necesites
- **Escalado:** Si necesitas más recursos, Dockploy permite escalar verticalmente

## 🆘 Soporte

Si tienes problemas:
1. Revisa los logs en Dockploy
2. Verifica las variables de entorno
3. Comprueba que el dominio apunte correctamente
4. Verifica el healthcheck: `/health`
