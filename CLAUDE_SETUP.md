# Configuración para Claude Desktop con VPS

## Configuración del archivo claude_desktop_config.json

### Windows
Ubicación: `%APPDATA%\Claude\claude_desktop_config.json`

### Configuración:

```json
{
  "mcpServers": {
    "postgresql-vps": {
      "url": "https://tu-dominio.com/sse",
      "headers": {
        "x-api-key": "tu-api-key-super-secreta-aqui"
      }
    }
  }
}
```

**Importante:**
- Reemplaza `tu-dominio.com` con la URL de tu VPS
- Usa HTTPS en producción (configura un certificado SSL)
- La API Key debe coincidir con la del archivo `.env` en tu VPS

## Despliegue en VPS

### 1. Instalar dependencias en el VPS:
```bash
npm install -g pnpm
pnpm install
```

### 2. Compilar el proyecto:
```bash
pnpm build
```

### 3. Configurar variables de entorno:
```bash
cp .env.example .env
nano .env  # Edita las variables
```

### 4. Ejecutar con PM2 (recomendado):
```bash
npm install -g pm2
pm2 start dist/server-http.js --name mcp-postgresql
pm2 save
pm2 startup
```

### 5. Configurar Nginx como proxy reverso (opcional pero recomendado):

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Para SSE es importante
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
```

### 6. Configurar SSL con Certbot:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com
```

## Verificar que funciona:

```bash
# Health check
curl https://tu-dominio.com/health

# Debería responder:
# {"status":"ok","timestamp":"...","activeSessions":0}
```

## Seguridad adicional:

1. **Firewall**: Solo permite tráfico en puertos 80, 443, 22
2. **Fail2ban**: Protección contra fuerza bruta
3. **API Key fuerte**: Usa un generador de contraseñas
4. **CORS específico**: En producción, especifica solo los orígenes necesarios
5. **Rate limiting**: Considera agregar express-rate-limit

## Troubleshooting:

- **No conecta**: Verifica que el puerto 3000 esté abierto en el firewall
- **Error 401**: La API Key no coincide
- **CORS error**: Configura ALLOWED_ORIGINS correctamente
- **SSE no funciona**: Verifica que Nginx tenga `proxy_buffering off`
