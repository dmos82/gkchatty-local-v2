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
      await this.authenticateAsAdmin();

      // Use adminAxios which has the cookie jar with authenticated session
      const response = await this.adminAxios.get(`${API_URL}/api/admin/users`, {
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

  async createUser(username, password, email, role = 'user') {
    try {
      await this.authenticateAsAdmin();

      // Create user via admin API using cookie authentication
      const userData = {
        username,
        password,
        role
      };

      // Add email if provided
      if (email) {
        userData.email = email;
      }

      const response = await this.adminAxios.post(`${API_URL}/api/admin/users`, userData, {
        timeout: 5000
      });

      console.error(`[MCP] Created user: ${username} (${role})`);

      return {
        success: true,
        username: response.data.user?.username || username,
        email: response.data.user?.email || email,
        role: response.data.user?.role || role,
        id: response.data.user?._id || response.data.user?.id,
        message: `User '${username}' created successfully`
      };
    } catch (error) {
      if (error.response?.status === 409 || error.response?.status === 400) {
        // User already exists
        return {
          success: false,
          error: `User '${username}' already exists`
        };
      }
      if (error.response?.status === 403) {
        throw new Error('Admin access required to create users');
      }
      if (error.response?.status === 401) {
        // Token expired, retry
        this.adminToken = null;
        this.adminTokenExpiry = 0;
        return this.createUser(username, password, email, role);
      }
      throw new Error(`Error creating user: ${error.message}`);
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

  async deleteDocument(documentId, filename) {
    try {
      if (!this.currentUser || !this.currentUserToken) {
        throw new Error('No user selected. Use switch_user tool first to select a user.');
      }

      // If filename provided but no documentId, we need to find the document first
      let actualDocumentId = documentId;

      if (!documentId && filename) {
        // Get user's documents to find the ID by filename
        const response = await this.userAxios.get(`${API_URL}/api/documents`, {
          timeout: 10000
        });

        const documents = response.data.documents || [];
        const matchingDoc = documents.find(doc => doc.originalFileName === filename);

        if (!matchingDoc) {
          return {
            success: false,
            error: `Document with filename '${filename}' not found`
          };
        }

        actualDocumentId = matchingDoc._id;
      }

      // Delete the document
      const deleteResponse = await this.userAxios.delete(`${API_URL}/api/documents/${actualDocumentId}`, {
        timeout: 10000
      });

      console.error(`[MCP] Deleted document: ${actualDocumentId} from user ${this.currentUser.username}`);

      return {
        success: true,
        documentId: actualDocumentId,
        filename: filename || 'document',
        message: deleteResponse.data.message || 'Document deleted successfully'
      };
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('User session expired. Please switch user again.');
      }
      if (error.response?.status === 404) {
        return {
          success: false,
          error: 'Document not found or already deleted'
        };
      }
      throw new Error(`Error deleting document: ${error.message}`);
    }
  }

  async searchKnowledgeBase(query, kbName = null) {
    try {
      // Use current user if switched, otherwise use admin (same pattern as query)
      const useCurrentUser = this.currentUser && this.currentUserToken;
      const axiosInstance = useCurrentUser ? this.userAxios : this.adminAxios;

      // Authenticate if needed
      if (!useCurrentUser) {
        await this.authenticateAsAdmin();
      } else if (Date.now() >= this.currentUserTokenExpiry) {
        throw new Error('User session expired. Please switch user again.');
      }

      const searchRequest = {
        query: query,
        knowledgeBaseTarget: kbName ? 'tenant' : 'user',
        tenantKbId: kbName && this.tenantKBId ? this.tenantKBId : undefined
      };

      const response = await axiosInstance.post(`${API_URL}/api/search`, searchRequest, {
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
      // Use current user if switched, otherwise use admin
      const useCurrentUser = this.currentUser && this.currentUserToken;
      const axiosInstance = useCurrentUser ? this.userAxios : this.adminAxios;
      const username = useCurrentUser ? this.currentUser.username : ADMIN_USERNAME;

      // Authenticate if needed
      if (!useCurrentUser) {
        await this.authenticateAsAdmin();
      } else if (Date.now() >= this.currentUserTokenExpiry) {
        throw new Error('User session expired. Please switch user again.');
      }

      // Use the correct endpoint and request format matching web UI
      const chatRequest = {
        query: query,
        history: [],
        searchMode: 'user-docs', // or 'system-kb' depending on context
        chatId: null // null for new chat
      };

      console.error(`[MCP] Query as ${username}: "${query.substring(0, 50)}..."`);

      // Use the appropriate axios instance with the correct cookie jar
      const response = await axiosInstance.post(`${API_URL}/api/chats`, chatRequest, {
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
        // Session expired - clear tokens
        if (this.currentUser) {
          this.currentUserToken = null;
          this.currentUserTokenExpiry = 0;
          throw new Error('User session expired. Please switch user again.');
        } else {
          this.adminToken = null;
          this.adminTokenExpiry = 0;
          // Retry once after re-authenticating
          await this.authenticateAsAdmin();
          return this.queryChatGKChatty(query);
        }
      }
      throw new Error(`Chat query failed: ${error.message}`);
    }
  }

  async listTenantKBs() {
    try {
      await this.authenticateAsAdmin();

      // Use adminAxios which has the cookie jar with authenticated session
      const response = await this.adminAxios.get(`${API_URL}/api/admin/tenant-kb`, {
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
        {
          name: 'create_user',
          description: 'Create a new GKChatty user for project isolation (requires admin authentication)',
          inputSchema: {
            type: 'object',
            properties: {
              username: {
                type: 'string',
                description: 'Username for new user (e.g., "platform-runner")',
              },
              password: {
                type: 'string',
                description: 'Password for new user (e.g., "platform-runner123!")',
              },
              email: {
                type: 'string',
                description: 'Optional email address for the user',
              },
              role: {
                type: 'string',
                description: 'User role (default: "user")',
                enum: ['user', 'admin', 'super_admin'],
              },
            },
            required: ['username', 'password'],
          },
        },
        {
          name: 'delete_document',
          description: 'Delete a document from the current user\'s document manager',
          inputSchema: {
            type: 'object',
            properties: {
              document_id: {
                type: 'string',
                description: 'MongoDB document ID to delete',
              },
              filename: {
                type: 'string',
                description: 'Optional: Filename to delete (if document_id not provided)',
              },
            },
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

      if (request.params.name === 'create_user') {
        const username = request.params.arguments?.username;
        const password = request.params.arguments?.password;
        const email = request.params.arguments?.email;
        const role = request.params.arguments?.role || 'user';

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
          const result = await this.createUser(username, password, email, role);

          if (!result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `⚠️ ${result.error}\n\nThe user already exists. Use switch_user to access it, or choose a different username.`,
                },
              ],
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: `✅ Successfully created user: ${username}\n\nRole: ${result.role}\nEmail: ${result.email || 'N/A'}\nID: ${result.id || 'N/A'}\n\nYou can now use switch_user to upload documents to this user's document manager.`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error creating user: ${error.message}\n\nMake sure:\n1. GKChatty is running\n2. You have admin permissions\n3. The username is not already taken`,
              },
            ],
          };
        }
      }

      if (request.params.name === 'delete_document') {
        const documentId = request.params.arguments?.document_id;
        const filename = request.params.arguments?.filename;

        if (!documentId && !filename) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Either document_id or filename parameter is required',
              },
            ],
          };
        }

        try {
          const result = await this.deleteDocument(documentId, filename);

          if (!result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ Failed to delete document: ${result.error}`,
                },
              ],
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: `✅ Successfully deleted document: ${result.filename}\n\nDocument ID: ${result.documentId}\nDeleted from: ${this.currentUser?.username || 'unknown user'}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error deleting document: ${error.message}\n\nMake sure:\n1. You're logged in as the correct user\n2. The document exists\n3. You have permission to delete it`,
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
