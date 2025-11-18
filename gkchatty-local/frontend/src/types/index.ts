// Basic index file for types

// (Removed incorrect backend import)

// Define the Document type here later
export interface Document {
  _id: string;
  originalFileName: string;
  fileSize: number;
  uploadTimestamp: string;
  sourceType: 'user' | 'system'; // Added sourceType
  // Add other relevant fields as needed
}

// Frontend representation of a message
export interface Message {
  _id?: string; // Added optional _id for list keys
  sender: 'user' | 'assistant' | 'system' | 'loading';
  text: string;
  sources?: Source[];
  timestamp?: string; // Added optional timestamp
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
  cost?: number | null;
  modelUsed?: string; // AI model that generated the response
}

// Frontend representation of a source
// Derived from backend IChatMessage sources and queryCollection results
export interface Source {
  fileName: string; // Changed from 'source' to 'fileName' to match API response
  pageNumbers?: number[];
  documentId: string | null; // MongoDB ID (user) or string ID (system)
  type: 'user' | 'system';
  text?: string; // Optional chunk text
  // Add other fields from API that might be used by frontend components
  score?: number;
  snippet?: string;
  origin?: string;
  keywordMatch?: boolean;
}

// Simplified Chat Summary type for the list
export interface ChatSummary {
  _id: string;
  chatName: string;
  updatedAt: string;
  createdAt: string;
}

// Re-define IChatMessage structure for frontend use
// We avoid direct import from backend to keep concerns separate
export interface FrontendChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: {
    documentId: string | null;
    fileName: string;
    pageNumbers?: number[];
    type: 'user' | 'system';
  }[];
  timestamp: string; // Store as string or Date
}

// Representing the full chat detail structure for the frontend
export interface ChatDetail {
  _id: string;
  userId: string; // Assuming string representation of ObjectId
  chatName: string;
  createdAt: string;
  updatedAt: string;
  messages: FrontendChatMessage[];
}

// Type for the response from POST /api/chat
export interface ChatApiResponse {
  success: boolean;
  answer?: string;
  sources?: Source[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
  cost?: number | null;
  modelUsed?: string; // AI model that generated the response
  chatId?: string; // Can be null/undefined for new chats initially
  persistenceError?: string; // Optional error message
  message?: string; // Optional general message from backend
}

// Admin and User types
export interface AdminUser {
  _id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
}

export interface User {
  _id: string;
  username: string;
  email?: string;
  role: 'user' | 'admin';
  canCustomizePersona?: boolean;
  forcePasswordChange?: boolean;
}

export interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
  isLoading: boolean;  // Alias for loading
  handleApiError?: (error: any) => void;  // Optional error handler
  checkSession?: () => Promise<void>;  // Optional session check
}

// Persona types
export interface Persona {
  _id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  prompt?: string;  // Alias for systemPrompt (some code uses prompt)
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaListResponse {
  success: boolean;
  personas: Persona[];
}

export interface PersonaResponse {
  success: boolean;
  persona: Persona;
  message?: string;
}

export interface CreatePersonaRequest {
  name: string;
  description?: string;
  prompt?: string;  // Flexible - accepts either prompt or systemPrompt
  systemPrompt?: string;
  isActive?: boolean;
}

export interface UpdatePersonaRequest {
  name?: string;
  description?: string;
  prompt?: string;  // Flexible - accepts either prompt or systemPrompt
  systemPrompt?: string;
  isActive?: boolean;
}

// API response types
export interface ApiErrorResponse {
  success: false;
  message: string;
  error?: string;
  status?: number;
  errorCode?: string | null;
  data?: any;
}

export interface StandardApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Export other types from this directory if needed
