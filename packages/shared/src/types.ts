/**
 * Shared TypeScript types for GKChatty ecosystem
 */

export interface User {
  _id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

export interface Document {
  _id: string;
  userId: string;
  fileName: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  s3Key?: string;
  localPath?: string;
  description?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Chat {
  _id: string;
  userId: string;
  query: string;
  answer: string;
  sources?: ChatSource[];
  metadata?: {
    tokenUsage?: {
      prompt: number;
      completion: number;
      total: number;
    };
    model?: string;
    cost?: number;
  };
  createdAt: Date;
}

export interface ChatSource {
  documentId: string;
  type: 'system' | 'user';
  fileName: string;
  score: number;
  snippet: string;
}

export interface KnowledgeBase {
  _id: string;
  name: string;
  type: 'system' | 'tenant';
  userId?: string;
  description?: string;
  documentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  latency?: number;
  timestamp: Date;
}

export interface MCPToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
}
