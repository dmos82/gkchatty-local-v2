import React from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';

interface Source {
  documentId?: string;
  fileName?: string;
  type?: 'user' | 'system';
  score?: number;
  keywordMatch?: boolean;
}

// Define persona type hierarchy
interface BasePersona {
  name?: string;
  iconUrl?: string;
}

interface DefaultPersona extends BasePersona {
  type: 'default';
}

interface SystemPersona extends BasePersona {
  type: 'system';
  iconUrl: string;
  name: string;
}

interface UserDocsPersona extends BasePersona {
  type: 'userdocs';
}

interface LLMPersona extends BasePersona {
  type: 'llm';
}

export type MessagePersona = DefaultPersona | SystemPersona | UserDocsPersona | LLMPersona;

interface MessageProps {
  message: {
    role: 'user' | 'assistant';
    content: string;
    sources?: Source[];
    iconUrl?: string | null;
    knowledgeBaseTarget?: 'unified' | 'system' | 'user';
  };
  isGenerating: boolean;
  persona?: MessagePersona;
  userName?: string;
}

const ChatMessage: React.FC<MessageProps> = ({
  message,
  isGenerating,
  persona,
  userName = 'You',
}) => {
  // Determine icon URL based on message role and persona
  const getIconUrl = (): string | null => {
    if (message.role === 'user') {
      // For user messages, no custom icon is displayed
      return null;
    }

    // For assistant messages
    if (message.iconUrl) {
      // If the message already has an iconUrl (from backend), use it
      return message.iconUrl;
    } else if (persona?.iconUrl) {
      // If a persona is provided with an iconUrl, use it
      return persona.iconUrl;
    }

    // Default case: no icon
    return null;
  };

  // Determine display name based on message role and persona
  const getDisplayName = (): string => {
    if (message.role === 'user') {
      return userName;
    }

    // For assistant messages
    if (message.knowledgeBaseTarget === 'user' && persona?.type === 'userdocs' && persona.name) {
      return persona.name;
    } else if (
      message.knowledgeBaseTarget === 'system' &&
      persona?.type === 'system' &&
      persona.name
    ) {
      return persona.name;
    }

    // Default case
    return 'AI Assistant';
  };

  const iconUrl = getIconUrl();
  const displayName = getDisplayName();

  return (
    <div
      data-testid="chat-message-bubble"
      className={cn(
        'relative mb-1 rounded-lg p-3 outline-none transition-shadow',
        message.role === 'user'
          ? 'bg-blue-500 text-white shadow-lg dark:bg-blue-600'
          : 'bg-white text-neutral-800 shadow-lg dark:bg-neutral-800 dark:text-neutral-100',
        isGenerating && message.role === 'assistant' ? 'animate-pulse' : ''
      )}
    >
      {/* Message sender and icon */}
      <div className="flex items-center mb-1">
        {/* Icon display */}
        {message.role === 'assistant' && (
          <div className="absolute -left-10 top-0 w-8 h-8 rounded-full overflow-hidden border border-gray-200 shadow-sm bg-white flex items-center justify-center">
            {iconUrl ? (
              <Image
                src={iconUrl}
                alt={`${displayName} icon`}
                width={32}
                height={32}
                className="object-cover"
              />
            ) : (
              <Sparkles className="h-5 w-5 text-blue-500" />
            )}
          </div>
        )}

        {/* Display name - only show for assistant messages */}
        {message.role === 'assistant' && (
          <span className="text-xs text-gray-500 font-medium">{displayName}</span>
        )}
      </div>

      {/* Message content */}
      <div className="w-full">{message.content}</div>
    </div>
  );
};

export default ChatMessage;
