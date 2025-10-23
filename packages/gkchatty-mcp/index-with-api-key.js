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
// Fallback to username/password if no API key
const USERNAME = process.env.GKCHATTY_USERNAME || 'dev';
const PASSWORD = process.env.GKCHATTY_PASSWORD || 'dev123';

class GKChattyMCPServer {
  constructor() {
    this.authHeader = null;
    this.initAuth();
    
    this.server = new Server(
      {
        name: 'gkchatty-kb',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  async initAuth() {
    // Use API key if available (preferred)
    if (API_KEY) {
      this.authHeader = { 'X-API-Key': API_KEY };
      return;
    }
    
    // Fall back to username/password auth
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        username: USERNAME,
        password: PASSWORD,
      }, {
        timeout: 5000
      });
      
      this.authHeader = { 'Authorization': `Bearer ${response.data.token}` };
    } catch (error) {
      console.error('Warning: Could not authenticate. Some features may not work.');
      this.authHeader = {};
    }
  }

  async searchKnowledgeBase(query) {
    try {
      const response = await axios.post(`${API_URL}/api/chat`, {
        message: query,
        mode: 'search',
        stream: false
      }, {
        headers: this.authHeader,
        timeout: 10000
      });
      
      // Extract search results from chat response
      const data = response.data;
      if (data.sources || data.documents) {
        return data.sources || data.documents;
      }
      return [{ content: data.message || data.response || JSON.stringify(data) }];
    } catch (error) {
      // No retry needed with API keys - they either work or don't
      throw error;
    }
  }

  async uploadDocument(filePath, description) {
    const fs = require('fs');
    const path = require('path');
    const FormData = require('form-data');
    
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
    const response = await axios.post(`${API_URL}/api/documents/upload`, formData, {
      headers: { 
        ...this.authHeader,
        ...formData.getHeaders()
      },
      timeout: 30000
    });
    
    return response.data;
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
            },
            required: ['file_path'],
          },
        },
      ],
    }));

    // Handler for calling tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'search_gkchatty') {
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
          const results = await this.searchKnowledgeBase(query);
          
          if (!results || results.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `No results found for query: "${query}"`,
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
                text: `GKChatty Knowledge Base Results for "${query}":\n\n${formattedResults}`,
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
          const result = await this.uploadDocument(filePath, description);
          
          return {
            content: [
              {
                type: 'text',
                text: `✅ Successfully uploaded to GKChatty!\n\nFile: ${filePath}\nDocument ID: ${result.id || 'N/A'}\nStatus: ${result.message || 'Upload complete'}\n\nThe document is now searchable in your knowledge base.`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error uploading to GKChatty: ${error.message}\n\nMake sure:\n1. GKChatty is running on ${API_URL}\n2. The file exists and is readable\n3. The file is a text-based format`,
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