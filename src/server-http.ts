import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Client as PgClient } from 'pg';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

app.use(express.json());

// Middleware de autenticación
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.API_KEY;
  
  // Si no hay API_KEY configurada, permitir acceso
  if (!validApiKey) {
    return next();
  }
  
  // Si hay API_KEY configurada, validar que coincida
  if (apiKey !== validApiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Almacenar instancias de servidor por sesión
const sessions = new Map<string, PgMcpServer>();

class PgMcpServer {
  private server: Server;
  private pgClient: PgClient | null = null;
  private connectionString: string | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'pg-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    this.setupToolsHandlers();
  }

  // Validar y sanitizar identificadores SQL (nombres de tablas y columnas)
  private sanitizeIdentifier(identifier: string): string {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
      throw new Error(`Identificador inválido: ${identifier}`);
    }
    return `"${identifier}"`;
  }

  private setupToolsHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'connect_database',
            description: 'Conectar a la base de datos PostgreSQL usando connection string',
            inputSchema: {
              type: 'object',
              properties: {
                connectionString: {
                  type: 'string',
                  description: 'Connection string de PostgreSQL (ej: postgresql://user:password@localhost:5432/dbname)',
                },
              },
              required: ['connectionString'],
            },
          },
          {
            name: 'execute_query',
            description: 'Ejecutar una consulta SQL en la base de datos conectada',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Consulta SQL a ejecutar',
                },
                params: {
                  type: 'array',
                  description: 'Parámetros para la consulta preparada (opcional)',
                  items: {
                    type: ['string', 'number', 'boolean', 'null'],
                  },
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_tables',
            description: 'Obtener lista de tablas en la base de datos',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'describe_table',
            description: 'Obtener descripción de una tabla específica',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: 'Nombre de la tabla',
                },
              },
              required: ['tableName'],
            },
          },
          {
            name: 'get_columns',
            description: 'Obtener columnas de una tabla específica',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: 'Nombre de la tabla',
                },
              },
              required: ['tableName'],
            },
          },
          {
            name: 'get_data_table',
            description: 'Obtener datos de una tabla específica',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: 'Nombre de la tabla',
                },
                limit: {
                  type: 'number',
                  description: 'Número máximo de filas a retornar (opcional, por defecto 10)',
                },
                offset: {
                  type: 'number',
                  description: 'Número de filas a saltar (opcional, por defecto 0)',
                },
              },
              required: ['tableName'],
            },
          },
          {
            name: 'create_table',
            description: 'Crear una nueva tabla en la base de datos',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: 'Nombre de la nueva tabla',
                },
                columns: {
                  type: 'array',
                  description: 'Lista de columnas con sus tipos (ej: [{"name": "id", "type": "SERIAL PRIMARY KEY"}, {"name": "name", "type": "VARCHAR(100)"}])',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      type: { type: 'string' },
                    },
                    required: ['name', 'type'],
                  },
                },
              },
              required: ['tableName', 'columns'],
            },
          },
          {
            name: 'drop_table',
            description: 'Eliminar una tabla de la base de datos',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: 'Nombre de la tabla a eliminar',
                },
              },
              required: ['tableName'],
            },
          },
          {
            name: 'insert_data',
            description: 'Insertar un único registro en una tabla',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: 'Nombre de la tabla',
                },
                data: {
                  type: 'object',
                  description: 'Datos a insertar (ej: {"column1": "value1", "column2": "value2"})',
                  additionalProperties: true,
                },
              },
              required: ['tableName', 'data'],
            },
          },
          {
            name: 'upload_multiple_data',
            description: 'Subir múltiples registros a una tabla específica',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: 'Nombre de la tabla',
                },
                data: {
                  type: 'array',
                  description: 'Lista de registros a insertar (ej: [{"column1": "value1", "column2": "value2"}, ...])',
                  items: {
                    type: 'object',
                    additionalProperties: true,
                  },
                },
              },
              required: ['tableName', 'data'],
            },
          },
          {
            name: 'update_data',
            description: 'Actualizar datos en una tabla específica',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: 'Nombre de la tabla',
                },
                data: {
                  type: 'object',
                  description: 'Datos a actualizar (ej: {"column1": "new_value", "column2": "value2"})',
                  additionalProperties: true,
                },
                whereClause: {
                  type: 'string',
                  description: 'Condición WHERE para la actualización (ej: "id = $1")',
                },
                whereValues: {
                  type: 'array',
                  description: 'Valores para los parámetros en la cláusula WHERE',
                  items: {
                    type: ['string', 'number', 'boolean', 'null'],
                  },
                },
              },
              required: ['tableName', 'data', 'whereClause', 'whereValues'],
            },
          },
          {
            name: 'delete_data',
            description: 'Eliminar datos de una tabla específica',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: 'Nombre de la tabla',
                },
                whereClause: {
                  type: 'string',
                  description: 'Condición WHERE para la eliminación (ej: "id = $1")',
                },
                whereValues: {
                  type: 'array',
                  description: 'Valores para los parámetros en la cláusula WHERE',
                  items: {
                    type: ['string', 'number', 'boolean', 'null'],
                  },
                },
              },
              required: ['tableName', 'whereClause', 'whereValues'],
            },
          },
          {
            name: 'get_one_data',
            description: 'Obtener un único registro de una tabla por ID',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: 'Nombre de la tabla',
                },
                id: {
                  type: 'number',
                  description: 'ID del registro a obtener',
                },
              },
              required: ['tableName', 'id'],
            },
          },
          {
            name: 'filter_data',
            description: 'Filtrar datos de una tabla específica',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: 'Nombre de la tabla',
                },
                filter: {
                  type: 'object',
                  description: 'Criterios de filtrado (ej: {"column1": "value1", "column2": "value2"})',
                  additionalProperties: true,
                },
                limit: {
                  type: 'number',
                  description: 'Límite de resultados (opcional)',
                },
              },
              required: ['tableName', 'filter'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const TOOLS_METHODS: Record<string, Function> = {
        connect_database: this.connectDatabase.bind(this),
        execute_query: this.executeQuery.bind(this),
        get_tables: this.getTables.bind(this),
        describe_table: this.describeTable.bind(this),
        get_columns: this.getColumns.bind(this),
        get_data_table: this.getDataTable.bind(this),
        create_table: this.createTable.bind(this),
        drop_table: this.dropTable.bind(this),
        insert_data: this.insertData.bind(this),
        update_data: this.updateData.bind(this),
        delete_data: this.deleteData.bind(this),
        get_one_data: this.getOneData.bind(this),
        filter_data: this.filterData.bind(this),
        upload_multiple_data: this.uploadMultipleData.bind(this),
      };

      try {
        if (name in TOOLS_METHODS) {
          if (name === 'connect_database' && args && typeof args.connectionString === 'string') {
            return await TOOLS_METHODS[name](args.connectionString);
          } else {
            return await TOOLS_METHODS[name](args);
          }
        } else {
          throw new Error(`Tool ${name} not found`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    });
  }

  private async connectDatabase(connectionString: string) {
    try {
      // Cerrar conexión anterior si existe
      if (this.pgClient) {
        await this.pgClient.end();
      }

      this.connectionString = connectionString;
      this.pgClient = new PgClient({
        connectionString,
        connectionTimeoutMillis: 5000,
        query_timeout: 10000,
        idle_in_transaction_session_timeout: 10000,
      });

      // Timeout de conexión con Promise.race
      const connectPromise = this.pgClient.connect();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout de conexión (5s)')), 5000)
      );

      await Promise.race([connectPromise, timeoutPromise]);

      // Probar la conexión
      const result = await this.pgClient.query('SELECT version()');

      return {
        content: [
          {
            type: 'text',
            text: `✅ Conexión exitosa a PostgreSQL\nVersión: ${result.rows[0].version}`,
          },
        ],
      };
    } catch (error) {
      this.pgClient = null;
      this.connectionString = null;
      throw new Error(`Error al conectar: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async executeQuery(args: { query: string; params?: any[] }) {
    if (!this.pgClient) {
      throw new Error('No hay conexión activa. Usa connect_database primero.');
    }

    const { query, params = [] } = args;

    if (!query) {
      throw new Error('La consulta SQL es requerida');
    }

    try {
      const result = await this.pgClient.query(query, params);

      const queryResult = {
        rowCount: result.rowCount ?? 0,
        rows: result.rows,
        fields: result.fields?.map((f) => ({
          name: f.name,
          dataTypeID: f.dataTypeID,
        })),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(queryResult, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Error en consulta: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getTables() {
    if (!this.pgClient) {
      throw new Error('No hay conexión activa. Usa connect_database primero.');
    }

    try {
      const result = await this.pgClient.query(`
        SELECT table_name, table_type 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
      `);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.rows, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Error obteniendo tablas: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async describeTable(args: { tableName: string }) {
    if (!this.pgClient) {
      throw new Error('No hay conexión activa. Usa connect_database primero.');
    }

    const tableName = this.sanitizeIdentifier(args.tableName);

    try {
      const result = await this.pgClient.query(
        `
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `,
        [args.tableName]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.rows, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Error describiendo tabla: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getColumns(args: { tableName: string }) {
    if (!this.pgClient) {
      throw new Error('No hay conexión activa. Usa connect_database primero.');
    }

    const tableName = this.sanitizeIdentifier(args.tableName);

    try {
      const result = await this.pgClient.query(
        `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `,
        [args.tableName]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.rows, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Error obteniendo columnas: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getDataTable(args: { tableName: string; limit?: number; offset?: number }) {
    if (!this.pgClient) {
      throw new Error('No hay conexión activa. Usa connect_database primero.');
    }

    const { tableName, limit = 10, offset = 0 } = args;

    if (!tableName) {
      throw new Error('Falta el nombre de la tabla');
    }

    // Validar límite y offset
    if (!Number.isInteger(limit) || limit < 0 || limit > 1000) {
      throw new Error('El límite debe ser un número entero entre 0 y 1000');
    }
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error('El offset debe ser un número entero positivo');
    }

    const sanitizedTable = this.sanitizeIdentifier(tableName);

    try {
      const result = await this.pgClient.query(
        `SELECT * FROM ${sanitizedTable} LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              rows: result.rows,
              count: result.rowCount,
              limit,
              offset,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Error obteniendo datos de la tabla: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async createTable(args: { tableName: string; columns: { name: string; type: string }[] }) {
    if (!this.pgClient) {
      throw new Error('No hay conexión activa. Usa connect_database primero.');
    }

    const { tableName, columns } = args;

    if (!tableName || !columns || columns.length === 0) {
      throw new Error('Faltan parámetros para crear la tabla');
    }

    const sanitizedTable = this.sanitizeIdentifier(tableName);
    const columnDefinitions = columns.map((col) => {
      const sanitizedCol = this.sanitizeIdentifier(col.name);
      return `${sanitizedCol} ${col.type}`;
    }).join(', ');

    try {
      await this.pgClient.query(`CREATE TABLE IF NOT EXISTS ${sanitizedTable} (${columnDefinitions})`);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Tabla ${tableName} creada exitosamente`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Error creando tabla: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async dropTable(args: { tableName: string }) {
    if (!this.pgClient) {
      throw new Error('No hay conexión activa. Usa connect_database primero.');
    }

    if (!args.tableName) {
      throw new Error('Falta el nombre de la tabla a eliminar');
    }

    const sanitizedTable = this.sanitizeIdentifier(args.tableName);

    try {
      await this.pgClient.query(`DROP TABLE IF EXISTS ${sanitizedTable}`);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Tabla ${args.tableName} eliminada exitosamente`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Error eliminando tabla: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async insertData(args: { tableName: string; data: Record<string, any> }) {
    if (!this.pgClient) {
      throw new Error('No hay conexión activa. Usa connect_database primero.');
    }

    const { tableName, data } = args;

    if (!tableName || !data || Object.keys(data).length === 0) {
      throw new Error('Faltan parámetros para insertar datos');
    }

    const sanitizedTable = this.sanitizeIdentifier(tableName);
    const columns = Object.keys(data);
    const values = Object.values(data);

    const sanitizedColumns = columns.map(col => this.sanitizeIdentifier(col)).join(', ');
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    try {
      const result = await this.pgClient.query(
        `INSERT INTO ${sanitizedTable} (${sanitizedColumns}) VALUES (${placeholders}) RETURNING *`,
        values
      );

      return {
        content: [
          {
            type: 'text',
            text: `✅ Datos insertados en ${tableName} exitosamente\n${JSON.stringify(result.rows[0], null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Error insertando datos: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async uploadMultipleData(args: { tableName: string; data: Record<string, any>[] }) {
    if (!this.pgClient) {
      throw new Error('No hay conexión activa. Usa connect_database primero.');
    }

    const { tableName, data } = args;

    if (!tableName || !data || data.length === 0) {
      throw new Error('Faltan parámetros para subir datos');
    }

    const sanitizedTable = this.sanitizeIdentifier(tableName);
    const columns = Object.keys(data[0]);
    const sanitizedColumns = columns.map(col => this.sanitizeIdentifier(col)).join(', ');

    const values = data.map((row) => columns.map((col) => row[col] ?? null));

    const placeholders = values.map((_, i) =>
      `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(', ')})`
    ).join(', ');

    try {
      const result = await this.pgClient.query(
        `INSERT INTO ${sanitizedTable} (${sanitizedColumns}) VALUES ${placeholders}`,
        values.flat()
      );

      return {
        content: [
          {
            type: 'text',
            text: `✅ ${result.rowCount} registro(s) subido(s) a ${tableName} exitosamente`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Error subiendo datos: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async updateData(args: {
    tableName: string;
    data: Record<string, any>;
    whereClause: string;
    whereValues: any[];
  }) {
    if (!this.pgClient) {
      throw new Error('No hay conexión activa. Usa connect_database primero.');
    }

    const { tableName, data, whereClause, whereValues } = args;

    if (!tableName || !data || Object.keys(data).length === 0 || !whereClause) {
      throw new Error('Faltan parámetros para actualizar datos');
    }

    const sanitizedTable = this.sanitizeIdentifier(tableName);
    const columns = Object.keys(data);
    const values = Object.values(data);

    const setClause = columns.map((col, i) => {
      const sanitizedCol = this.sanitizeIdentifier(col);
      return `${sanitizedCol} = $${i + 1}`;
    }).join(', ');

    try {
      const allParams = [...values, ...whereValues];
      const result = await this.pgClient.query(
        `UPDATE ${sanitizedTable} SET ${setClause} WHERE ${whereClause}`,
        allParams
      );

      return {
        content: [
          {
            type: 'text',
            text: `✅ ${result.rowCount} fila(s) actualizada(s) en ${tableName} exitosamente`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Error actualizando datos: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async deleteData(args: {
    tableName: string;
    whereClause: string;
    whereValues: any[];
  }) {
    if (!this.pgClient) {
      throw new Error('No hay conexión activa. Usa connect_database primero.');
    }

    const { tableName, whereClause, whereValues = [] } = args;

    if (!tableName || !whereClause) {
      throw new Error('Faltan parámetros para eliminar datos');
    }

    const sanitizedTable = this.sanitizeIdentifier(tableName);

    try {
      const result = await this.pgClient.query(
        `DELETE FROM ${sanitizedTable} WHERE ${whereClause}`,
        whereValues
      );

      return {
        content: [
          {
            type: 'text',
            text: `✅ ${result.rowCount} fila(s) eliminada(s) de ${tableName} exitosamente`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Error eliminando datos: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getOneData(args: { tableName: string; id: number }) {
    if (!this.pgClient) {
      throw new Error('No hay conexión activa. Usa connect_database primero.');
    }

    const { tableName, id } = args;

    if (!tableName || id === undefined || id === null) {
      throw new Error('Faltan parámetros para obtener datos');
    }

    if (!Number.isInteger(id) || id < 0) {
      throw new Error('El ID debe ser un número entero positivo');
    }

    const sanitizedTable = this.sanitizeIdentifier(tableName);

    try {
      const result = await this.pgClient.query(
        `SELECT * FROM ${sanitizedTable} WHERE id = $1`,
        [id]
      );

      if (result.rowCount === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No se encontraron datos para el ID ${id} en la tabla ${tableName}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.rows[0], null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Error obteniendo datos: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async filterData(args: { tableName: string; filter: Record<string, any>; limit?: number }) {
    if (!this.pgClient) {
      throw new Error('No hay conexión activa. Usa connect_database primero.');
    }

    const { tableName, filter, limit } = args;

    if (!tableName || !filter || Object.keys(filter).length === 0) {
      throw new Error('Faltan parámetros para filtrar datos');
    }

    // Validar límite para prevenir SQL injection
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
      throw new Error('El límite debe ser un número entero positivo');
    }

    const sanitizedTable = this.sanitizeIdentifier(tableName);

    const conditions = Object.keys(filter).map((key, i) => {
      const sanitizedKey = this.sanitizeIdentifier(key);
      return `${sanitizedKey} = $${i + 1}`;
    }).join(' AND ');

    const values = Object.values(filter);

    try {
      let query = `SELECT * FROM ${sanitizedTable} WHERE ${conditions}`;
      const queryParams = [...values];
      
      if (limit) {
        query += ` LIMIT $${queryParams.length + 1}`;
        queryParams.push(limit);
      }

      const result = await this.pgClient.query(query, queryParams);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              rows: result.rows,
              count: result.rowCount,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Error filtrando datos: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getServer() {
    return this.server;
  }

  async cleanup() {
    if (this.pgClient) {
      try {
        await this.pgClient.end();
        console.log('Conexión PostgreSQL cerrada correctamente');
      } catch (error) {
        console.error('Error cerrando conexión PostgreSQL:', error);
      }
    }
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeSessions: sessions.size 
  });
});

// Endpoint SSE para MCP
app.get('/sse', authMiddleware, async (req, res) => {
  console.log('Nueva conexión SSE recibida');
  
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const mcpServer = new PgMcpServer();
  sessions.set(sessionId, mcpServer);
  
  const transport = new SSEServerTransport(`/message/${sessionId}`, res);
  transports.set(sessionId, transport);
  
  try {
    await mcpServer.getServer().connect(transport);
    console.log(`✅ Sesión ${sessionId} conectada`);
  } catch (error) {
    console.error('❌ Error conectando servidor:', error);
    sessions.delete(sessionId);
    transports.delete(sessionId);
    return;
  }
  
  req.on('close', async () => {
    console.log(`🔌 Conexión SSE cerrada para sesión ${sessionId}`);
    const server = sessions.get(sessionId);
    if (server) {
      await server.cleanup();
      sessions.delete(sessionId);
    }
    transports.delete(sessionId);
  });
});

// Almacenar transportes por sesión
const transports = new Map<string, SSEServerTransport>();

// Endpoint para recibir mensajes del cliente
app.post('/message/:sessionId', authMiddleware, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  if (typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'ID de sesión inválido' });
  }
  
  const mcpServer = sessions.get(sessionId);
  
  if (!mcpServer) {
    return res.status(404).json({ error: 'Sesión no encontrada' });
  }
  
  const transport = transports.get(sessionId);
  if (!transport) {
    return res.status(500).json({ error: 'Transporte no encontrado' });
  }
  
  try {
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error('Error manejando mensaje:', error);
    res.status(500).json({ error: 'Error procesando mensaje' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 MCP PostgreSQL Server escuchando en http://localhost:${PORT}`);
});