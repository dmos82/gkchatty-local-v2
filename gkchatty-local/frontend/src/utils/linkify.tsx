import React from 'react';

// Regex to match URLs (http, https, and www)
const URL_REGEX = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi;

/**
 * Parse text and return array of strings and URL objects
 */
export function parseLinks(text: string): Array<{ type: 'text' | 'link'; content: string; url?: string }> {
  const parts: Array<{ type: 'text' | 'link'; content: string; url?: string }> = [];
  let lastIndex = 0;
  let match;

  // Reset regex lastIndex
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    // Add the URL
    let url = match[0];
    // Add protocol if missing (for www. URLs)
    if (url.startsWith('www.')) {
      url = 'https://' + url;
    }

    parts.push({
      type: 'link',
      content: match[0],
      url: url,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return parts;
}

/**
 * React component that renders text with clickable links
 */
interface LinkifiedTextProps {
  text: string;
  className?: string;
}

export const LinkifiedText: React.FC<LinkifiedTextProps> = ({ text, className }) => {
  const parts = parseLinks(text);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.type === 'link') {
          return (
            <a
              key={index}
              href={part.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part.content}
            </a>
          );
        }
        return <React.Fragment key={index}>{part.content}</React.Fragment>;
      })}
    </span>
  );
};

export default LinkifiedText;
