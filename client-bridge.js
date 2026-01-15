#!/usr/bin/env node

/**
 * Cliente puente para conectar Claude Desktop (stdio) con servidor MCP remoto (SSE)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER_URL = process.argv[2] || 'https://pg.mcp.danteiturri.dev/sse';
const API_KEY = process.env.API_KEY || process.env['X-API-Key'];

async function main() {
  try {
    // Cliente que se conecta al servidor SSE remoto
    const client = new Client({
      name: 'mcp-sse-bridge',
      version: '1.0.0',
    }, {
      capabilities: {}
    });

    // Transporte SSE para conectarse al servidor remoto
    const sseTransport = new SSEClientTransport(
      new URL(SERVER_URL),
      {
        headers: API_KEY ? {
          'x-api-key': API_KEY
        } : {}
      }
    );

    // Conectar al servidor remoto
    await client.connect(sseTransport);

    console.error('✅ Conectado al servidor MCP remoto:', SERVER_URL);

    // Mantener la conexión abierta
    process.on('SIGINT', async () => {
      console.error('Cerrando conexión...');
      await client.close();
      process.exit(0);
    });

    // Manejar cierre de conexión
    sseTransport.onclose = () => {
      console.error('Conexión cerrada por el servidor');
      process.exit(1);
    };

    sseTransport.onerror = (error) => {
      console.error('Error de conexión:', error);
      process.exit(1);
    };

  } catch (error) {
    console.error('Error fatal:', error.message);
    process.exit(1);
  }
}

main();
