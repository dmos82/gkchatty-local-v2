import * as fs from 'fs';
import * as path from 'path';

export interface GKChattyConfig {
  version: string;
  environment: 'development' | 'staging' | 'production';
  backend: {
    api: {
      port: number;
      host: string;
      cors: {
        origins: string[];
      };
    };
    database: {
      mongodb: {
        uri: string;
        options?: Record<string, any>;
      };
    };
    services: {
      pinecone: {
        environment: string;
        indexName: string;
      };
      openai: {
        model: {
          chat: string;
          chatFallback?: string;
          embedding: string;
        };
      };
    };
  };
  mcp: {
    gkchatty: {
      apiUrl: string;
      timeout: number;
      retries: number;
    };
    builderPro: {
      enabled: boolean;
      autoFix: boolean;
    };
  };
  health: {
    checkInterval: number;
    services: string[];
  };
}

/**
 * Load configuration from .gkchatty/config.json
 */
export function loadConfig(rootDir?: string): GKChattyConfig {
  const configPath = path.join(
    rootDir || process.cwd(),
    '.gkchatty',
    'config.json'
  );

  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return config as GKChattyConfig;
}

/**
 * Get a configuration value by dot-notation path
 * Example: getConfig('backend.api.port') => 4001
 */
export function getConfig<T = any>(key: string, defaultValue?: T): T {
  const config = loadConfig();
  const keys = key.split('.');
  let value: any = config;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return defaultValue as T;
    }
  }

  return value as T;
}
