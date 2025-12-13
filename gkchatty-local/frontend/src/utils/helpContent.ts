/**
 * Help Content Registry for GKChatty
 *
 * This file contains all help text for the Help Mode feature.
 * Add new entries by creating a unique helpId and providing title + description.
 */

export interface HelpItem {
  title: string;
  description: string;
  shortcut?: string;
  category?: 'chat' | 'documents' | 'navigation' | 'im' | 'admin' | 'general';
}

export const helpContent: Record<string, HelpItem> = {
  // === SIDEBAR NAVIGATION ===
  'sidebar-new-chat': {
    title: 'New Chat',
    description: 'Start a fresh conversation with the AI assistant. Your previous chats are saved in the sidebar and can be accessed anytime.',
    shortcut: 'Ctrl/Cmd + N',
    category: 'navigation',
  },
  'sidebar-documents': {
    title: 'Document Manager',
    description: 'Upload, organize, and manage your documents. Documents are automatically indexed for AI-powered search and retrieval.',
    category: 'documents',
  },
  'sidebar-admin': {
    title: 'Admin Dashboard',
    description: 'Access administrative functions including user management, system settings, audit logs, and knowledge base configuration.',
    category: 'admin',
  },
  'sidebar-chat-list': {
    title: 'Chat History',
    description: 'Your saved conversations. Click to resume any chat. Hover to see edit and delete options.',
    category: 'navigation',
  },
  'sidebar-logout': {
    title: 'Logout',
    description: 'Sign out of your account. Your data remains saved and will be available when you log back in.',
    category: 'navigation',
  },
  'sidebar-feedback': {
    title: 'Submit Feedback',
    description: 'Share your thoughts, report bugs, or suggest improvements. Your feedback helps us make GKChatty better.',
    category: 'navigation',
  },

  // === CHAT INTERFACE ===
  'chat-input': {
    title: 'Message Input',
    description: 'Type your message or question here. Press Enter to send, or Shift+Enter for a new line. You can ask questions about your documents or have general conversations.',
    shortcut: 'Enter to send, Shift+Enter for new line',
    category: 'chat',
  },
  'chat-send': {
    title: 'Send Message',
    description: 'Send your message to the AI assistant. The AI will search your knowledge base and provide relevant answers.',
    shortcut: 'Enter',
    category: 'chat',
  },
  'chat-context-toggle': {
    title: 'Knowledge Source Toggle',
    description: 'Switch between System KB (company knowledge base) and My Docs (your personal documents). This controls which documents the AI searches when answering your questions.',
    category: 'chat',
  },
  'chat-system-kb': {
    title: 'System Knowledge Base',
    description: 'Search the shared company knowledge base. Contains documents uploaded by administrators that are available to all users.',
    category: 'chat',
  },
  'chat-my-docs': {
    title: 'My Documents',
    description: 'Search only your personal documents. These are files you\'ve uploaded that are private to your account.',
    category: 'chat',
  },

  // === SEARCH MODE TOGGLE ===
  'search-mode-hybrid': {
    title: 'Hybrid Search Mode',
    description: 'Search both the System Knowledge Base and your personal documents simultaneously. Best for comprehensive answers using all available information.',
    category: 'chat',
  },
  'search-mode-system-kb': {
    title: 'Knowledge Base Only',
    description: 'Search only the System Knowledge Base. Contains company-wide documents and information shared by administrators.',
    category: 'chat',
  },
  'search-mode-user-docs': {
    title: 'My Docs Only',
    description: 'Search only your personal uploaded documents. Use this when you want answers based solely on your private files.',
    category: 'chat',
  },
  'chat-persona-selector': {
    title: 'AI Persona',
    description: 'Choose how the AI responds. Different personas have different expertise areas and communication styles.',
    category: 'chat',
  },
  'chat-view-toggle': {
    title: 'View Toggle',
    description: 'Switch between Chat view (conversation) and Docs view (browse documents). Use Docs view to explore your knowledge base.',
    category: 'chat',
  },

  // === DOCUMENT MANAGEMENT ===
  'docs-upload': {
    title: 'Upload Documents',
    description: 'Upload PDF, Word, Excel, images, audio, and video files. Documents are automatically processed and indexed for AI search.',
    category: 'documents',
  },
  'docs-folder-create': {
    title: 'Create Folder',
    description: 'Organize your documents into folders. Folders help you categorize and find documents more easily.',
    category: 'documents',
  },
  'docs-search': {
    title: 'Search Documents',
    description: 'Search your documents by filename or content. The AI-powered search understands natural language queries.',
    category: 'documents',
  },
  'docs-preview': {
    title: 'Document Preview',
    description: 'Click a document to preview it. Supports PDF, images, text files, and more. Use the viewer controls to zoom and navigate.',
    category: 'documents',
  },
  'docs-download': {
    title: 'Download Document',
    description: 'Download the original file to your computer.',
    category: 'documents',
  },
  'docs-delete': {
    title: 'Delete Document',
    description: 'Permanently remove this document. This action cannot be undone. The document will also be removed from AI search results.',
    category: 'documents',
  },

  // === IM CHAT ===
  'im-buddy-list': {
    title: 'Buddy List',
    description: 'See who\'s online. Click a user to start a direct message conversation. Green dot indicates online status.',
    category: 'im',
  },
  'im-start-chat': {
    title: 'Start Direct Message',
    description: 'Begin a private conversation with this user. Direct messages are end-to-end encrypted.',
    category: 'im',
  },
  'im-voice-call': {
    title: 'Voice Call',
    description: 'Start a voice call with this user. Requires microphone access. Call quality adapts to your connection.',
    shortcut: 'Click to initiate',
    category: 'im',
  },
  'im-video-call': {
    title: 'Video Call',
    description: 'Start a video call with this user. Requires camera and microphone access.',
    shortcut: 'Click to initiate',
    category: 'im',
  },
  'im-attach-file': {
    title: 'Attach File',
    description: 'Send a file to this user. Supports images, documents, and other file types up to 50MB.',
    category: 'im',
  },
  'im-emoji': {
    title: 'Emoji Picker',
    description: 'Add an emoji to your message. Click to open the emoji picker.',
    category: 'im',
  },
  'im-minimize': {
    title: 'Minimize Chat',
    description: 'Minimize this chat window. Click the chat in the taskbar to restore it.',
    category: 'im',
  },
  'im-close': {
    title: 'Close Chat',
    description: 'Close this chat window. Your conversation history is saved.',
    category: 'im',
  },

  // === ADMIN FEATURES ===
  'admin-users': {
    title: 'User Management',
    description: 'View, create, edit, and manage user accounts. Set roles and permissions. Reset passwords and manage access levels.',
    category: 'admin',
  },
  'admin-system-kb': {
    title: 'System Knowledge Base',
    description: 'Manage the shared company knowledge base. Upload PDF and text documents that will be indexed and available for AI-powered search by all users.',
    category: 'admin',
  },
  'admin-usage': {
    title: 'Usage Statistics',
    description: 'View system-wide usage statistics including total documents, chat sessions, messages, and per-user token consumption with cost estimates.',
    category: 'admin',
  },
  'admin-audit-logs': {
    title: 'Audit Logs',
    description: 'View system activity logs. Track user actions, document uploads/deletions, login events, and security-related activities.',
    category: 'admin',
  },
  'admin-knowledge-gaps': {
    title: 'Knowledge Gaps',
    description: 'Review questions the AI could not answer confidently. Identify missing information in the knowledge base to improve response quality.',
    category: 'admin',
  },
  'admin-feedback': {
    title: 'User Feedback',
    description: 'View and manage feedback submitted by users. Review bug reports, feature requests, and general comments.',
    category: 'admin',
  },
  'admin-settings': {
    title: 'System Settings',
    description: 'Configure system-wide settings including AI personas, system prompts, OpenAI API configuration, and feature flags.',
    category: 'admin',
  },

  // === HEADER ===
  'header-help-mode': {
    title: 'Help Mode',
    description: 'Toggle help mode on/off. When enabled, hover over any button or control to see helpful information about what it does.',
    shortcut: 'Press ? key',
    category: 'general',
  },
  'header-theme': {
    title: 'Theme Toggle',
    description: 'Switch between light and dark modes. Your preference is saved automatically.',
    category: 'general',
  },

  // === RIGHT PANEL TABS ===
  'panel-notes-tab': {
    title: 'Chat Notes',
    description: 'View and edit notes for the current chat. Notes are saved automatically and help you keep track of important information from your conversations.',
    category: 'chat',
  },
  'panel-system-kb-tab': {
    title: 'System Knowledge Base',
    description: 'Browse the shared company knowledge base. View documents uploaded by administrators that are available for AI-powered search.',
    category: 'documents',
  },
  'panel-my-docs-tab': {
    title: 'My Documents',
    description: 'Browse and manage your personal uploaded documents. These files are private to your account and can be used for AI-powered search.',
    category: 'documents',
  },

  // === GENERAL ===
  'panel-collapse': {
    title: 'Collapse Panel',
    description: 'Hide this panel to give more space to the main content area. Click again to expand.',
    category: 'general',
  },
  'panel-expand': {
    title: 'Expand Panel',
    description: 'Show this panel. Contains additional tools and options.',
    category: 'general',
  },

  // === DEFAULT ===
  'default': {
    title: 'Quick Help',
    description: 'Hover over any button or control to see what it does. Press ? to toggle help mode, or Escape to close.',
    shortcut: '? to toggle, Esc to close',
    category: 'general',
  },
};

// Helper function to get help by category
export const getHelpByCategory = (category: HelpItem['category']): Record<string, HelpItem> => {
  return Object.entries(helpContent)
    .filter(([_, item]) => item.category === category)
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
};
