#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_URL = process.env.GKCHATTY_API_URL || 'http://localhost:4001';
const API_KEY = process.env.GKCHATTY_API_KEY;
const ADMIN_USERNAME = process.env.GKCHATTY_ADMIN_USERNAME || 'davidmorinmusic';
const ADMIN_PASSWORD = process.env.GKCHATTY_ADMIN_PASSWORD || '123123';
const DEFAULT_KB_NAME = process.env.GKCHATTY_MCP_KB_NAME || 'MCP Knowledge Base';

class GKChattyMCPServer {
  constructor() {
    this.adminToken = null;
    this.adminTokenExpiry = 0;
    this.adminUser = null;

    this.currentUserToken = null;
    this.currentUserTokenExpiry = 0;
    this.currentUser = null;

    this.tenantKBId = null;

    // Create cookie jars for session management
    this.adminCookieJar = new CookieJar();
    this.currentUserCookieJar = new CookieJar();

    // Create axios instances with cookie support
    this.adminAxios = wrapper(axios.create({ jar: this.adminCookieJar, withCredentials: true }));
    this.userAxios = wrapper(axios.create({ jar: this.currentUserCookieJar, withCredentials: true }));

    this.server = new Server(
      {
        name: 'gkchatty-kb',
        version: '3.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  async authenticateAsAdmin() {
    try {
      // Use API key if available
      if (API_KEY) {
        return API_KEY;
      }

      if (this.adminToken && Date.now() < this.adminTokenExpiry) {
        return this.adminToken;
      }

      // Check if server is running
      try {
        await axios.get(`${API_URL}/health`, { timeout: 2000 });
      } catch (healthError) {
        if (healthError.code === 'ECONNREFUSED') {
          throw new Error(`❌ GKChatty is not running!\n\n📍 Start it with:\n   cd /path/to/gkchatty\n   npm start\n\nThen try again.`);
        }
      }

      const response = await this.adminAxios.post(`${API_URL}/api/auth/login`, {
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      }, {
        timeout: 5000
      });

      // Cookie is automatically stored in adminCookieJar
      // Mark as authenticated
      this.adminToken = 'cookie-based-auth';
      this.adminTokenExpiry = Date.now() + 1800000; // 30 minutes (matches cookie expiry)
      this.adminUser = response.data.user || { username: ADMIN_USERNAME, role: response.data.role };

      console.error(`[MCP] Admin authenticated as: ${ADMIN_USERNAME}`);

      return this.adminToken;
    } catch (error) {
      this.adminToken = null;
      this.adminTokenExpiry = 0;
      this.adminUser = null;

      if (error.message.includes('GKChatty is not running')) {
        throw error;
      } else if (error.response?.status === 401) {
        throw new Error(`❌ Admin authentication failed!`);
      } else {
        throw new Error(`Connection error: ${error.message}`);
      }
    }
  }

  async switchToUser(username, password) {
    try {
      const response = await this.userAxios.post(`${API_URL}/api/auth/login`, {
        username,
        password,
      }, {
        timeout: 5000
      });

      // Cookie is automatically stored in currentUserCookieJar
      this.currentUserToken = 'cookie-based-auth';
      this.currentUserTokenExpiry = Date.now() + 1800000; // 30 minutes
      this.currentUser = response.data.user || { username, role: response.data.role };

      console.error(`[MCP] Switched to user: ${username}`);

      return {
        success: true,
        user: this.currentUser,
        username: username
      };
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error(`Authentication failed for user: ${username}`);
      }
      throw new Error(`Error switching user: ${error.message}`);
    }
  }

  async listUsers() {
    try {
      const token = await this.authenticateAsAdmin();

      const headers = API_KEY
        ? { 'X-API-Key': token }
        : { Authorization: `Bearer ${token}` };

      const response = await axios.get(`${API_URL}/api/admin/users`, {
        headers,
        timeout: 5000
      });

      return response.data.users || [];
    } catch (error) {
      if (error.response?.status === 403) {
        throw new Error('Admin access required to list users');
      }
      if (error.response?.status === 401) {
        // Token expired, retry
        this.adminToken = null;
        this.adminTokenExpiry = 0;
        return this.listUsers();
      }
      throw error;
    }
  }

  async uploadAsUser(filePath, description) {
    try {
      if (!this.currentUser || !this.currentUserToken) {
        throw new Error('No user selected. Use switch_user tool first to select a user.');
      }

      const token = this.currentUserToken;

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

      // Upload to GKChatty as the selected user using cookie authentication
      const response = await this.userAxios.post(`${API_URL}/api/documents/upload`, formData, {
        headers: {
          ...formData.getHeaders()
        },
        timeout: 30000
      });

      return {
        ...response.data,
        uploadType: 'user_document',
        uploadedAs: this.currentUser.username
      };
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('User session expired. Please switch user again.');
      }
      throw error;
    }
  }

  async searchKnowledgeBase(query, kbName = null) {
    try {
      const token = this.currentUserToken || await this.authenticateAsAdmin();

      const headers = API_KEY
        ? { 'X-API-Key': token }
        : { Authorization: `Bearer ${token}` };

      const searchRequest = {
        query: query,
        knowledgeBaseTarget: kbName ? 'tenant' : 'user',
        tenantKbId: kbName && this.tenantKBId ? this.tenantKBId : undefined
      };

      const response = await axios.post(`${API_URL}/api/search`, searchRequest, {
        headers,
        timeout: 10000
      });

      const data = response.data;
      if (data.results) {
        return data.results;
      }
      return [{ content: data.message || JSON.stringify(data) }];
    } catch (error) {
      if (error.response?.status === 401) {
        this.adminToken = null;
        this.adminTokenExpiry = 0;
        return this.searchKnowledgeBase(query, kbName);
      }
      throw error;
    }
  }

  async queryChatGKChatty(query) {
    try {
      // Ensure we're authenticated (will use cookie)
      await this.authenticateAsAdmin();

      // Use the correct endpoint and request format matching web UI
      const chatRequest = {
        query: query,
        history: [],
        searchMode: 'user-docs', // or 'system-kb' depending on context
        chatId: null // null for new chat
      };

      // Use adminAxios which has the cookie jar
      const response = await this.adminAxios.post(`${API_URL}/api/chats`, chatRequest, {
        timeout: 30000
      });

      const data = response.data;

      // Return the full response text
      if (data.response) {
        return data.response;
      } else if (data.message) {
        return data.message;
      } else {
        return JSON.stringify(data);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        this.adminToken = null;
        this.adminTokenExpiry = 0;
        // Retry once after re-authenticating
        await this.authenticateAsAdmin();
        return this.queryChatGKChatty(query);
      }
      throw new Error(`Chat query failed: ${error.message}`);
    }
  }

  async listTenantKBs() {
    try {
      const token = await this.authenticateAsAdmin();

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
        this.adminToken = null;
        this.adminTokenExpiry = 0;
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
          name: 'list_users',
          description: 'List all users in GKChatty (requires admin authentication)',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'switch_user',
          description: 'Switch to a specific user for uploading documents (requires username and password)',
          inputSchema: {
            type: 'object',
            properties: {
              username: {
                type: 'string',
                description: 'Username to switch to',
              },
              password: {
                type: 'string',
                description: 'Password for the user',
              },
            },
            required: ['username', 'password'],
          },
        },
        {
          name: 'current_user',
          description: 'Show the currently selected user for uploads',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
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
                description: 'Optional: Name of specific knowledge base to search',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'query_gkchatty',
          description: 'Ask GKChatty a question and get a full conversational response with detailed content (uses chat endpoint for RAG queries)',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Question to ask GKChatty (e.g., "What is Step 1 of the DevBlog plan?")',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'upload_to_gkchatty',
          description: 'Upload a document to the selected user\'s document manager (use switch_user first)',
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
      if (request.params.name === 'list_users') {
        try {
          const users = await this.listUsers();

          if (!users || users.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'No users found.',
                },
              ],
            };
          }

          const formattedUsers = users
            .map((user, i) => {
              return `${i + 1}. ${user.username}\n   Email: ${user.email || 'N/A'}\n   Role: ${user.role || 'user'}\n   ID: ${user._id}`;
            })
            .join('\n\n');

          return {
            content: [
              {
                type: 'text',
                text: `Available Users:\n\n${formattedUsers}\n\nUse switch_user tool to select a user for uploads.`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error listing users: ${error.message}`,
              },
            ],
          };
        }
      }

      if (request.params.name === 'switch_user') {
        const username = request.params.arguments?.username;
        const password = request.params.arguments?.password;

        if (!username || !password) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: username and password parameters are required',
              },
            ],
          };
        }

        try {
          const result = await this.switchToUser(username, password);

          return {
            content: [
              {
                type: 'text',
                text: `✅ Successfully switched to user: ${username}\n\nRole: ${result.user.role || 'user'}\n\nYou can now upload documents to this user's document manager.`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error switching user: ${error.message}`,
              },
            ],
          };
        }
      }

      if (request.params.name === 'current_user') {
        if (!this.currentUser) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ No user currently selected.\n\nUse list_users to see available users, then switch_user to select one.',
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Current user: ${this.currentUser.username}\nRole: ${this.currentUser.role || 'user'}\n\nDocuments will be uploaded to this user's document manager.`,
            },
          ],
        };
      }

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
                text: `GKChatty Results for "${query}":\n\n${formattedResults}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error searching: ${error.message}`,
              },
            ],
          };
        }
      }

      if (request.params.name === 'query_gkchatty') {
        const query = request.params.arguments?.query;

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
          const response = await this.queryChatGKChatty(query);

          return {
            content: [
              {
                type: 'text',
                text: `GKChatty Response:\n\n${response}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error querying GKChatty: ${error.message}`,
              },
            ],
          };
        }
      }

      if (request.params.name === 'upload_to_gkchatty') {
        const filePath = request.params.arguments?.file_path;
        const description = request.params.arguments?.description;

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
          const result = await this.uploadAsUser(filePath, description);

          return {
            content: [
              {
                type: 'text',
                text: `✅ Successfully uploaded to GKChatty!\n\nFile: ${path.basename(filePath)}\nUploaded as: ${result.uploadedAs}\nLocation: User's My Docs\nDocument ID: ${result.id || result.documentId || 'N/A'}\n\nThe document is now in ${result.uploadedAs}'s document manager.`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error uploading: ${error.message}\n\nMake sure:\n1. You've selected a user with switch_user\n2. GKChatty is running\n3. The file exists and is readable`,
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
                  text: 'No tenant knowledge bases found.',
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
                text: `Error listing tenant KBs: ${error.message}`,
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
    console.error('[MCP] GKChatty MCP Server v3.0.0 (Multi-User) started');
    console.error(`[MCP] Using API: ${API_URL}`);
    console.error(`[MCP] Admin: ${ADMIN_USERNAME}`);
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
