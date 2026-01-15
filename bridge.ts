#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';

const SERVER_URL = process.argv[2] || process.env.MCP_SERVER_URL || 'https://pg.mcp.danteiturri.dev/sse';
const API_KEY = process.argv[3] || process.env.MCP_API_KEY;

async function main() {
  console.error(`🔌 Conectando a servidor remoto: ${SERVER_URL}`);

  try {
    // Cliente que se conecta al servidor remoto SSE
    const remoteClient = new Client(
      {
        name: 'mcp-bridge-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // Servidor local que habla stdio con Claude
    const localServer = new Server(
      {
        name: 'mcp-bridge-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Interceptar fetch para agregar headers personalizados
    const originalFetch = global.fetch;
    global.fetch = (async (input: any, init?: any) => {
      const newInit = { 
        ...init, 
        headers: { 
          ...init?.headers,
          'x-api-key': API_KEY || '',
          'Content-Type': 'application/json'
        } 
      };
      return originalFetch(input, newInit);
    }) as typeof fetch;

    // Transporte SSE para conectar al servidor remoto
    const sseTransport = new SSEClientTransport(new URL(SERVER_URL));

    // Conectar al servidor remoto
    await remoteClient.connect(sseTransport);
    console.error('✅ Conectado al servidor remoto');

    // Obtener herramientas del servidor remoto
    const { tools } = await remoteClient.listTools();
    console.error(`📦 ${tools.length} herramientas disponibles`);

    // Registrar manejador para listar herramientas
    localServer.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools };
    });

    // Registrar manejador para llamar herramientas
    localServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.error(`🔧 Llamando herramienta: ${request.params.name}`);
      return await remoteClient.callTool(request.params);
    });

    // Configurar transporte stdio para comunicarse con Claude
    const stdioTransport = new StdioServerTransport();
    await localServer.connect(stdioTransport);
    console.error('🚀 Puente activo - Cliente <-> Servidor remoto');

    // Mantener el proceso vivo
    process.on('SIGINT', async () => {
      console.error('\n👋 Cerrando conexión...');
      await remoteClient.close();
      await localServer.close();
      process.exit(0);
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
