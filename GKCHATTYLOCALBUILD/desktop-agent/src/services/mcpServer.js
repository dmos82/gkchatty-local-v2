/**
 * MCP Server Service
 *
 * Provides MCP server on localhost:7860
 * Maintains compatibility with existing Claude Code MCP configuration
 */

const axios = require('axios');

// Use dynamic imports for ES modules
let Server, StdioServerTransport, CallToolRequestSchema, ListToolsRequestSchema;

async function loadMCPModules() {
  const serverModule = await import('@modelcontextprotocol/sdk/server/index.js');
  const stdioModule = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const typesModule = await import('@modelcontextprotocol/sdk/types.js');

  Server = serverModule.Server;
  StdioServerTransport = stdioModule.StdioServerTransport;
  CallToolRequestSchema = typesModule.CallToolRequestSchema;
  ListToolsRequestSchema = typesModule.ListToolsRequestSchema;
}

class MCPServer {
  constructor(config) {
    this.port = config.port || 7860;
    this.backendUrl = config.backendUrl || 'http://localhost:6001';
    this.server = null;
    this.transport = null;
    this.initialized = false;
  }

  /**
   * Initialize and start MCP server
   */
  async start() {
    console.log(`🚀 Starting MCP Server on port ${this.port}...`);

    // Load ES modules dynamically
    if (!this.initialized) {
      await loadMCPModules();
      this.initialized = true;
    }

    this.server = new Server(
      {
        name: 'gkchatty-local-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Register tool handlers
    this.registerToolHandlers();

    // Setup transport
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);

    console.log('✅ MCP Server started successfully');
  }

  /**
   * Register all MCP tool handlers
   */
  registerToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'query_gkchatty',
            description: 'Query the local GKChatty knowledge base using RAG',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query',
                },
                userId: {
                  type: 'string',
                  description: 'User ID for context',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'upload_to_gkchatty',
            description: 'Upload a document to local GKChatty knowledge base',
            inputSchema: {
              type: 'object',
              properties: {
                filePath: {
                  type: 'string',
                  description: 'Path to file to upload',
                },
                userId: {
                  type: 'string',
                  description: 'User ID',
                },
              },
              required: ['filePath'],
            },
          },
          {
            name: 'search_gkchatty',
            description: 'Search local GKChatty documents',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'list_users',
            description: 'List all users in local GKChatty',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'switch_user',
            description: 'Switch active user context',
            inputSchema: {
              type: 'object',
              properties: {
                username: {
                  type: 'string',
                  description: 'Username to switch to',
                },
                password: {
                  type: 'string',
                  description: 'User password',
                },
              },
              required: ['username', 'password'],
            },
          },
          {
            name: 'current_user',
            description: 'Get current active user',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'query_gkchatty':
            return await this.handleQuery(args);

          case 'upload_to_gkchatty':
            return await this.handleUpload(args);

          case 'search_gkchatty':
            return await this.handleSearch(args);

          case 'list_users':
            return await this.handleListUsers();

          case 'switch_user':
            return await this.handleSwitchUser(args);

          case 'current_user':
            return await this.handleCurrentUser();

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Error handling tool ${name}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    });
  }

  /**
   * Handle RAG query
   */
  async handleQuery(args) {
    const { query, userId = 'default' } = args;

    const response = await axios.post(`${this.backendUrl}/api/chat/rag`, {
      query,
      userId,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  }

  /**
   * Handle document upload
   */
  async handleUpload(args) {
    const { filePath, userId = 'default' } = args;

    const FormData = require('form-data');
    const fs = require('fs');

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('userId', userId);

    const response = await axios.post(
      `${this.backendUrl}/api/documents/upload`,
      form,
      {
        headers: form.getHeaders(),
      }
    );

    return {
      content: [
        {
          type: 'text',
          text: `Document uploaded successfully: ${response.data.documentId}`,
        },
      ],
    };
  }

  /**
   * Handle search
   */
  async handleSearch(args) {
    const { query } = args;

    const response = await axios.get(`${this.backendUrl}/api/documents/search`, {
      params: { q: query },
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  }

  /**
   * Handle list users
   */
  async handleListUsers() {
    const response = await axios.get(`${this.backendUrl}/api/users`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  }

  /**
   * Handle switch user
   */
  async handleSwitchUser(args) {
    const { username, password } = args;

    const response = await axios.post(`${this.backendUrl}/api/auth/login`, {
      username,
      password,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Switched to user: ${username}`,
        },
      ],
    };
  }

  /**
   * Handle current user
   */
  async handleCurrentUser() {
    const response = await axios.get(`${this.backendUrl}/api/auth/current`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  }

  /**
   * Stop MCP server
   */
  async stop() {
    if (this.server) {
      await this.server.close();
      console.log('MCP Server stopped');
    }
  }
}

module.exports = { MCPServer };
