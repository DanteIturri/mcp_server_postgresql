# MCP Server PostgreSQL

Este proyecto implementa un servidor del Protocolo de Contexto para Modelos (MCP - Model Context Protocol) que se conecta a bases de datos PostgreSQL. Permite a los modelos de IA (como Claude) interactuar directamente con bases de datos PostgreSQL a través de comandos MCP.

## ¿Qué es el Model Context Protocol (MCP)?

El Model Context Protocol es un estándar que permite a los modelos de IA comunicarse con herramientas externas y acceder a recursos. Con MCP, los modelos de IA pueden:

- Consultar bases de datos
- Ejecutar comandos
- Acceder a archivos
- Interactuar con APIs externas
- Y mucho más

MCP proporciona una interfaz estructurada para que los modelos realicen estas acciones de manera segura y controlada.

## Características de MCP Server PostgreSQL

Este servidor MCP permite a los modelos de IA:

- Conectarse a bases de datos PostgreSQL
- Ejecutar consultas SQL
- Obtener listas de tablas
- Describir la estructura de tablas
- Obtener columnas de tablas específicas
- Realizar otras operaciones de bases de datos

## Requisitos

- Node.js (v18 o superior)
- pnpm
- PostgreSQL (accesible mediante una cadena de conexión)

## Instalación

1. Clona el repositorio:
   ```bash
   git clone <url-del-repositorio>
   cd mcp_server_postgresql
   ```

2. Instala las dependencias:
   ```bash
   pnpm install
   ```

3. Compila el proyecto:
   ```bash
   pnpm tsc
   ```

## Uso

### Ejecución del servidor MCP PostgreSQL

Para iniciar el servidor:

```bash
node dist/index.js
```

## Integración con Claude Desktop

Para usar este servidor MCP con Claude Desktop:

1. Descarga e instala [Claude Desktop](https://claude.ai/desktop)
2. Abre Claude Desktop
3. Ve a Configuración (icono de engranaje)
4. Selecciona "Herramientas avanzadas" o "Model Context Protocol"
5. Haz clic en "Agregar herramienta" o "Agregar servidor MCP"
6. Configura la herramienta:
   - Nombre: PostgreSQL MCP
   - Comando: `node <ruta-absoluta-a>/dist/index.js`
   - Directorio de trabajo: La carpeta raíz de este proyecto
7. Guarda la configuración

Ahora puedes interactuar con bases de datos PostgreSQL directamente desde tus conversaciones con Claude Desktop.

Ejemplo de uso con Claude:
```
Conéctate a mi base de datos PostgreSQL con connectionString postgresql://user:password@localhost:5432/mydatabase y muéstrame todas las tablas.
```

## Integración con Visual Studio Code

Para usar este servidor MCP con la extensión de Claude para VS Code:

1. Instala la [extensión oficial de Claude para VS Code](https://marketplace.visualstudio.com/items?itemName=Anthropic.claude-vscode)
2. Abre VS Code y ve a la configuración de la extensión de Claude
3. Busca "Claude: Model Context Protocol Settings"
4. Haz clic en "Editar en settings.json"
5. Agrega la siguiente configuración:

```json
"claude.modelContextProtocol.tools": [
  {
    "name": "PostgreSQL MCP",
    "command": "node <ruta-absoluta-a>/dist/index.js",
    "workingDirectory": "<ruta-absoluta-a-la-carpeta-del-proyecto>"
  }
]
```

6. Guarda el archivo de configuración

Ahora puedes interactuar con bases de datos PostgreSQL directamente desde la extensión de Claude en VS Code.

## Herramientas MCP disponibles

El servidor proporciona las siguientes herramientas MCP:

- **connect_database**: Conecta a una base de datos PostgreSQL usando un connection string
- **execute_query**: Ejecuta consultas SQL en la base de datos conectada
- **get_tables**: Obtiene la lista de todas las tablas en la base de datos actual
- **describe_table**: Obtiene la descripción de una tabla específica
- **get_columns**: Obtiene las columnas de una tabla específica

## Seguridad

**¡Importante!** Este servidor MCP puede ejecutar consultas SQL arbitrarias. Considera lo siguiente:

- Utiliza usuarios de base de datos con privilegios limitados
- No incluyas credenciales de producción en conversaciones con el modelo
- Revisa las consultas generadas por el modelo antes de permitir su ejecución
- Considera implementar filtros adicionales para operaciones sensibles (DROP, DELETE sin WHERE, etc.)

## Desarrollo

Para contribuir a este proyecto:

1. Instala las dependencias de desarrollo: `pnpm install`
2. Realiza cambios en el código fuente en la carpeta `src/`
3. Compila el código con `pnpm tsc`
4. Prueba tus cambios

## Licencia

ISC

---

Creado con ❤️ para facilitar la integración de modelos de IA con bases de datos PostgreSQL.
