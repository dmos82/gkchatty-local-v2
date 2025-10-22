#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_URL = process.env.GKCHATTY_API_URL || 'http://localhost:3001';
const API_KEY = process.env.GKCHATTY_API_KEY;
const USERNAME = process.env.GKCHATTY_USERNAME || 'dev';
const PASSWORD = process.env.GKCHATTY_PASSWORD || 'dev123';
const DEFAULT_KB_NAME = process.env.GKCHATTY_MCP_KB_NAME || 'MCP Knowledge Base';

class GKChattyMCPServer {
  constructor() {
    this.token = null;
    this.tokenExpiry = 0;
    this.user = null;
    this.tenantKBId = null;
    
    this.server = new Server(
      {
        name: 'gkchatty-kb',
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
      // Use API key if available (no expiry, no refresh needed)
      if (API_KEY) {
        return API_KEY;
      }
      
      if (this.token && Date.now() < this.tokenExpiry) {
        return this.token;
      }

      // Check if server is running
      try {
        await axios.get(`${API_URL}/health`, { timeout: 2000 });
      } catch (healthError) {
        if (healthError.code === 'ECONNREFUSED') {
          throw new Error(`❌ GKChatty is not running!\n\n📍 Start it with:\n   cd /path/to/gkchatty\n   npm start\n\nThen try again.`);
        }
        // Server might be running but no health endpoint, continue
      }

      const response = await axios.post(`${API_URL}/api/auth/login`, {
        username: USERNAME,
        password: PASSWORD,
      }, {
        timeout: 5000
      });

      this.token = response.data.token;
      this.tokenExpiry = Date.now() + 3600000;
      this.user = response.data.user || { role: response.data.role };
      
      // Initialize tenant KB if user is admin
      if (this.user.role === 'admin') {
        await this.initializeTenantKB();
      }
      
      return this.token;
    } catch (error) {
      this.token = null;
      this.tokenExpiry = 0;
      this.user = null;
      
      // User-friendly error messages
      if (error.message.includes('GKChatty is not running')) {
        throw error;
      } else if (error.response?.status === 401) {
        throw new Error(`❌ Authentication failed!\n\n🔑 Set your credentials:\n   export GKCHATTY_USERNAME="your_username"\n   export GKCHATTY_PASSWORD="your_password"\n\nOr use an API key:\n   export GKCHATTY_API_KEY="gk_live_..."`);
      } else if (error.response?.status === 404) {
        throw new Error(`❌ GKChatty API endpoint not found at ${API_URL}\n\nMake sure GKChatty is running the latest version.`);
      } else {
        throw new Error(`Connection error: ${error.message}`);
      }
    }
  }

  async initializeTenantKB() {
    try {
      const token = this.token;
      const headers = API_KEY 
        ? { 'X-API-Key': token }
        : { Authorization: `Bearer ${token}` };
      
      // Check if MCP KB already exists
      const listResponse = await axios.get(`${API_URL}/api/admin/tenant-kb`, {
        headers,
        timeout: 5000
      });
      
      const existingKB = listResponse.data.knowledgeBases?.find(
        kb => kb.name === DEFAULT_KB_NAME || kb.slug === 'mcp-knowledge-base'
      );
      
      if (existingKB) {
        this.tenantKBId = existingKB._id;
        console.error(`[MCP] Using existing KB: ${existingKB.name} (${existingKB._id})`);
        return;
      }
      
      // Create new tenant KB for MCP
      const createResponse = await axios.post(`${API_URL}/api/admin/tenant-kb`, {
        name: DEFAULT_KB_NAME,
        description: 'Knowledge base for documents uploaded via MCP server',
        accessType: 'public',
        color: '#4A90E2',
        icon: '📚',
        shortName: 'MCP'
      }, {
        headers,
        timeout: 5000
      });
      
      this.tenantKBId = createResponse.data.knowledgeBase._id;
      console.error(`[MCP] Created new KB: ${DEFAULT_KB_NAME} (${this.tenantKBId})`);
    } catch (error) {
      console.error('[MCP] Warning: Could not initialize tenant KB:', error.message);
      console.error('[MCP] Will fall back to user document uploads');
      // Non-fatal: will fall back to user document uploads
    }
  }

  async searchKnowledgeBase(query, kbName = null) {
    try {
      const token = await this.authenticate();
      
      const headers = API_KEY 
        ? { 'X-API-Key': token }
        : { Authorization: `Bearer ${token}` };
      
      // Build the search request
      const searchRequest = {
        message: query,
        mode: 'search',
        stream: false
      };
      
      // If a specific KB name is provided, add it to the request
      if (kbName && this.tenantKBId) {
        searchRequest.tenantKBId = this.tenantKBId;
      }
      
      const response = await axios.post(`${API_URL}/api/chat`, searchRequest, {
        headers,
        timeout: 10000
      });
      
      // Extract search results from chat response
      const data = response.data;
      if (data.sources || data.documents) {
        return data.sources || data.documents;
      }
      return [{ content: data.message || data.response || JSON.stringify(data) }];
    } catch (error) {
      if (error.response?.status === 401) {
        // Token expired, reset and retry
        this.token = null;
        this.tokenExpiry = 0;
        return this.searchKnowledgeBase(query, kbName);
      }
      throw error;
    }
  }

  async uploadToTenantKB(filePath, description, kbName = null) {
    try {
      const token = await this.authenticate();
      
      // Check if user is admin and we have a tenant KB
      if (!this.user || this.user.role !== 'admin' || !this.tenantKBId) {
        // Fall back to regular user upload
        return this.uploadDocument(filePath, description);
      }
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      // Create form data
      const formData = new FormData();
      const fileStream = fs.createReadStream(filePath);
      const fileName = path.basename(filePath);
      
      formData.append('file', fileStream, fileName);
      if (description) {
        formData.append('description', description);
      }
      
      // Upload to tenant KB
      const authHeader = API_KEY 
        ? { 'X-API-Key': token }
        : { Authorization: `Bearer ${token}` };
      
      const response = await axios.post(
        `${API_URL}/api/admin/kb/${this.tenantKBId}/upload`, 
        formData, 
        {
          headers: { 
            ...authHeader,
            ...formData.getHeaders()
          },
          timeout: 30000
        }
      );
      
      return {
        ...response.data,
        kbName: DEFAULT_KB_NAME,
        kbId: this.tenantKBId,
        uploadType: 'tenant_kb'
      };
    } catch (error) {
      if (error.response?.status === 403) {
        // Not admin, fall back to regular upload
        console.error('[MCP] Admin access required for tenant KB upload, falling back to user upload');
        return this.uploadDocument(filePath, description);
      }
      if (error.response?.status === 401) {
        // Token expired, retry
        this.token = null;
        this.tokenExpiry = 0;
        return this.uploadToTenantKB(filePath, description, kbName);
      }
      throw error;
    }
  }

  async uploadDocument(filePath, description) {
    try {
      const token = await this.authenticate();
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      // Create form data
      const formData = new FormData();
      const fileStream = fs.createReadStream(filePath);
      const fileName = path.basename(filePath);
      
      formData.append('files', fileStream, fileName);
      formData.append('sourceType', 'user');
      if (description) {
        formData.append('description', description);
      }
      
      // Upload to GKChatty
      const authHeader = API_KEY 
        ? { 'X-API-Key': token }
        : { Authorization: `Bearer ${token}` };
      
      const response = await axios.post(`${API_URL}/api/documents/upload`, formData, {
        headers: { 
          ...authHeader,
          ...formData.getHeaders()
        },
        timeout: 30000
      });
      
      return {
        ...response.data,
        uploadType: 'user_document'
      };
    } catch (error) {
      if (error.response?.status === 401) {
        // Token expired, retry
        this.token = null;
        this.tokenExpiry = 0;
        return this.uploadDocument(filePath, description);
      }
      throw error;
    }
  }

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
      
      return response.data.knowledgeBases || [];
    } catch (error) {
      if (error.response?.status === 403) {
        throw new Error('Admin access required to list tenant knowledge bases');
      }
      if (error.response?.status === 401) {
        // Token expired, retry
        this.token = null;
        this.tokenExpiry = 0;
        return this.listTenantKBs();
      }
      throw error;
    }
  }

  setupHandlers() {
    // Handler for listing tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_gkchatty',
          description: 'Search GKChatty knowledge base for relevant information',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query to find relevant documents',
              },
              kb_name: {
                type: 'string',
                description: 'Optional: Name of specific knowledge base to search (defaults to all accessible KBs)',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'upload_to_gkchatty',
          description: 'Upload a document to GKChatty knowledge base (uses tenant KB if admin, otherwise user documents)',
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
              kb_name: {
                type: 'string',
                description: 'Optional: Name of tenant KB to upload to (admin only, defaults to MCP KB)',
              },
            },
            required: ['file_path'],
          },
        },
        {
          name: 'list_tenant_kbs',
          description: 'List all available tenant knowledge bases (admin only)',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    // Handler for calling tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'search_gkchatty') {
        const query = request.params.arguments?.query;
        const kbName = request.params.arguments?.kb_name;
        
        if (!query) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Query parameter is required',
              },
            ],
          };
        }

        try {
          const results = await this.searchKnowledgeBase(query, kbName);
          
          if (!results || results.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `No results found for query: "${query}"${kbName ? ` in KB: ${kbName}` : ''}`,
                },
              ],
            };
          }

          // Format results
          const formattedResults = results
            .slice(0, 5)
            .map((r, i) => {
              const content = r.content || r.extractedText || '';
              const preview = content.substring(0, 200).replace(/\n/g, ' ');
              return `${i + 1}. ${r.fileName || 'Document'}\n   Score: ${r.score?.toFixed(3) || 'N/A'}\n   ${preview}${content.length > 200 ? '...' : ''}`;
            })
            .join('\n\n');

          return {
            content: [
              {
                type: 'text',
                text: `GKChatty Knowledge Base Results for "${query}"${kbName ? ` in ${kbName}` : ''}:\n\n${formattedResults}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error searching GKChatty: ${error.message}\n\nMake sure GKChatty is running on ${API_URL}`,
              },
            ],
          };
        }
      }

      if (request.params.name === 'upload_to_gkchatty') {
        const filePath = request.params.arguments?.file_path;
        const description = request.params.arguments?.description;
        const kbName = request.params.arguments?.kb_name;
        
        if (!filePath) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: file_path parameter is required',
              },
            ],
          };
        }

        try {
          const result = await this.uploadToTenantKB(filePath, description, kbName);
          
          const uploadLocation = result.uploadType === 'tenant_kb' 
            ? `Tenant KB: ${result.kbName || DEFAULT_KB_NAME}` 
            : 'User Documents';
          
          return {
            content: [
              {
                type: 'text',
                text: `✅ Successfully uploaded to GKChatty!\n\nFile: ${filePath}\nLocation: ${uploadLocation}\nDocument ID: ${result.id || result.documentId || 'N/A'}\nStatus: ${result.message || 'Upload complete'}\n\nThe document is now searchable in your knowledge base.`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error uploading to GKChatty: ${error.message}\n\nMake sure:\n1. GKChatty is running on ${API_URL}\n2. The file exists and is readable\n3. You have appropriate permissions (admin for tenant KB)\n4. The file is a supported format`,
              },
            ],
          };
        }
      }

      if (request.params.name === 'list_tenant_kbs') {
        try {
          const kbs = await this.listTenantKBs();
          
          if (!kbs || kbs.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'No tenant knowledge bases found. Admin access may be required.',
                },
              ],
            };
          }

          const formattedKBs = kbs
            .map((kb, i) => {
              return `${i + 1}. ${kb.name}\n   ID: ${kb._id}\n   Slug: ${kb.slug}\n   Documents: ${kb.documentCount || 0}\n   Access: ${kb.accessType || 'N/A'}`;
            })
            .join('\n\n');

          return {
            content: [
              {
                type: 'text',
                text: `Available Tenant Knowledge Bases:\n\n${formattedKBs}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error listing tenant KBs: ${error.message}\n\nNote: Admin access is required to list tenant knowledge bases.`,
              },
            ],
          };
        }
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${request.params.name}`,
          },
        ],
      };
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[MCP] GKChatty MCP Server v2.0.0 started');
    console.error(`[MCP] Using API: ${API_URL}`);
    console.error(`[MCP] Auth method: ${API_KEY ? 'API Key' : 'Username/Password'}`);
  }
}

// Start the server
async function main() {
  const server = new GKChattyMCPServer();
  await server.start();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});