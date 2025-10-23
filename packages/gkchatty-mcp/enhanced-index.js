#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

const API_URL = process.env.GKCHATTY_API_URL || 'http://localhost:4001';
const API_KEY = process.env.GKCHATTY_API_KEY;
const USERNAME = process.env.GKCHATTY_USERNAME || 'dev';
const PASSWORD = process.env.GKCHATTY_PASSWORD || 'dev123';

class GKChattyMCPServer {
  constructor() {
    this.token = null;
    this.tokenExpiry = 0;
    
    this.server = new Server(
      {
        name: 'gkchatty-kb-enhanced',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  async authenticate() {
    try {
      if (API_KEY) {
        return API_KEY;
      }
      
      if (this.token && Date.now() < this.tokenExpiry) {
        return this.token;
      }

      const response = await axios.post(`${API_URL}/api/auth/login`, {
        username: USERNAME,
        password: PASSWORD,
      }, {
        timeout: 5000
      });

      this.token = response.data.token;
      this.tokenExpiry = Date.now() + 3600000;
      return this.token;
    } catch (error) {
      this.token = null;
      this.tokenExpiry = 0;
      throw new Error(`Authentication error: ${error.message}`);
    }
  }

  // Enhanced search with KB targeting
  async searchKnowledgeBase(query, searchMode = 'unified', tenantKbId = null) {
    try {
      const token = await this.authenticate();
      
      const headers = API_KEY 
        ? { 'X-API-Key': token }
        : { Authorization: `Bearer ${token}` };
      
      const requestBody = {
        message: query,
        mode: 'search',
        stream: false,
        knowledgeBaseTarget: searchMode, // 'unified', 'user', 'tenant', or specific tenant ID
      };

      // If searching specific tenant KB
      if (tenantKbId) {
        requestBody.tenantKbId = tenantKbId;
        requestBody.knowledgeBaseTarget = 'tenant';
      }
      
      const response = await axios.post(`${API_URL}/api/chat`, requestBody, {
        headers,
        timeout: 10000
      });
      
      const data = response.data;
      return {
        results: data.sources || data.documents || [],
        searchMode: searchMode,
        tenantKbId: tenantKbId,
        message: data.message || data.response
      };
    } catch (error) {
      throw error;
    }
  }

  // List available tenant KBs
  async listTenantKBs() {
    try {
      const token = await this.authenticate();
      
      const headers = API_KEY 
        ? { 'X-API-Key': token }
        : { Authorization: `Bearer ${token}` };
      
      const response = await axios.get(`${API_URL}/api/admin/tenant-kb`, {
        headers,
        timeout: 5000
      });
      
      return response.data.tenantKBs || [];
    } catch (error) {
      throw new Error(`Failed to list tenant KBs: ${error.message}`);
    }
  }

  // Create a new tenant KB
  async createTenantKB(name, description) {
    try {
      const token = await this.authenticate();
      
      const headers = API_KEY 
        ? { 'X-API-Key': token }
        : { Authorization: `Bearer ${token}` };
      
      const response = await axios.post(`${API_URL}/api/admin/tenant-kb`, {
        name: name,
        description: description,
        isActive: true
      }, {
        headers,
        timeout: 5000
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create tenant KB: ${error.message}`);
    }
  }

  // Upload document to specific KB
  async uploadDocument(filePath, description, targetKB = 'user') {
    try {
      const token = await this.authenticate();
      const fs = require('fs');
      const path = require('path');
      const FormData = require('form-data');
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      const formData = new FormData();
      formData.append('files', fs.createReadStream(filePath));
      if (description) {
        formData.append('description', description);
      }
      
      // Add KB target parameter
      if (targetKB !== 'user') {
        formData.append('targetKB', targetKB);
      }

      const headers = {
        ...formData.getHeaders(),
        ...(API_KEY 
          ? { 'X-API-Key': token }
          : { Authorization: `Bearer ${token}` })
      };

      const response = await axios.post(`${API_URL}/api/documents/upload`, formData, {
        headers,
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_gkchatty',
          description: 'Search GKChatty knowledge base with KB targeting options',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query to find relevant documents',
              },
              searchMode: {
                type: 'string',
                description: 'Search mode: unified (all KBs), user (user docs only), tenant (tenant KBs), or specific tenant ID',
                enum: ['unified', 'user', 'tenant'],
                default: 'unified'
              },
              tenantKbId: {
                type: 'string',
                description: 'Optional: Specific tenant KB ID to search',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'upload_to_gkchatty',
          description: 'Upload a document to GKChatty knowledge base',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the file to upload',
              },
              description: {
                type: 'string',
                description: 'Optional description of the document',
              },
              targetKB: {
                type: 'string',
                description: 'Target KB: user (default) or specific tenant KB ID',
                default: 'user'
              },
            },
            required: ['file_path'],
          },
        },
        {
          name: 'list_tenant_kbs',
          description: 'List all available tenant knowledge bases',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'create_tenant_kb',
          description: 'Create a new tenant knowledge base',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name for the new tenant KB',
              },
              description: {
                type: 'string',
                description: 'Description of the tenant KB purpose',
              },
            },
            required: ['name'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (name === 'search_gkchatty') {
          const results = await this.searchKnowledgeBase(
            args.query, 
            args.searchMode || 'unified',
            args.tenantKbId
          );
          
          const formattedResults = results.results.map((doc) => {
            const source = doc.metadata?.filename || doc.source || 'Unknown source';
            const content = doc.pageContent || doc.content || doc.text || '';
            const kb = results.tenantKbId ? `Tenant KB: ${results.tenantKbId}` : `Mode: ${results.searchMode}`;
            return `[${kb}] Source: ${source}\n${content}\n`;
          }).join('\n---\n');

          return {
            content: [
              {
                type: 'text',
                text: formattedResults || results.message || 'No results found',
              },
            ],
          };
        } else if (name === 'upload_to_gkchatty') {
          const result = await this.uploadDocument(
            args.file_path, 
            args.description,
            args.targetKB || 'user'
          );
          
          return {
            content: [
              {
                type: 'text',
                text: `Successfully uploaded document to ${args.targetKB || 'user'} KB: ${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        } else if (name === 'list_tenant_kbs') {
          const kbs = await this.listTenantKBs();
          
          const formatted = kbs.map(kb => 
            `- ${kb.name} (ID: ${kb._id})\n  Description: ${kb.description || 'N/A'}\n  Documents: ${kb.documentCount || 0}`
          ).join('\n');
          
          return {
            content: [
              {
                type: 'text',
                text: formatted || 'No tenant KBs found',
              },
            ],
          };
        } else if (name === 'create_tenant_kb') {
          const result = await this.createTenantKB(args.name, args.description);
          
          return {
            content: [
              {
                type: 'text',
                text: `Successfully created tenant KB: ${result.name} (ID: ${result._id})`,
              },
            ],
          };
        }
      } catch (error) {
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Start the server
const server = new GKChattyMCPServer();
server.run().catch(console.error);