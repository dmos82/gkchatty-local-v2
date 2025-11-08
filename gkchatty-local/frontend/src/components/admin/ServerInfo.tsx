'use client';

import React, { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Server, Database, HardDrive, Clock } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';

interface ServerInfoData {
  version: string;
  environment: string;
  nodeVersion: string;
  uptime: number;
  memory: {
    total: number;
    used: number;
    free: number;
  };
  database: {
    connected: boolean;
    name: string;
  };
}

const ServerInfo: React.FC = () => {
  const [serverInfo, setServerInfo] = useState<ServerInfoData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServerInfo = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetchWithAuth('/api/admin/server-info', {
          method: 'GET',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP error ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
          setServerInfo(data.serverInfo);
        } else {
          throw new Error(data.message || 'Failed to fetch server info');
        }
      } catch (err: any) {
        console.error('[ServerInfo] Error fetching server info:', err);
        setError(err.message || 'Failed to load server information');
      } finally {
        setIsLoading(false);
      }
    };

    fetchServerInfo();
  }, []);

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const formatBytes = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <Info className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!serverInfo) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No server information available
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* General Info */}
      <div className="p-4 border rounded-lg space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Server className="h-5 w-5 text-muted-foreground" />
          <h4 className="font-semibold">General Information</h4>
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version:</span>
            <span className="font-mono">{serverInfo.version || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Environment:</span>
            <span className="font-mono">{serverInfo.environment || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Node.js:</span>
            <span className="font-mono">{serverInfo.nodeVersion || 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* Uptime Info */}
      <div className="p-4 border rounded-lg space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h4 className="font-semibold">Uptime</h4>
        </div>
        <div className="text-2xl font-mono">
          {serverInfo.uptime ? formatUptime(serverInfo.uptime) : 'N/A'}
        </div>
      </div>

      {/* Memory Info */}
      <div className="p-4 border rounded-lg space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <HardDrive className="h-5 w-5 text-muted-foreground" />
          <h4 className="font-semibold">Memory Usage</h4>
        </div>
        {serverInfo.memory && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-mono">{formatBytes(serverInfo.memory.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Used:</span>
              <span className="font-mono">{formatBytes(serverInfo.memory.used)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Free:</span>
              <span className="font-mono">{formatBytes(serverInfo.memory.free)}</span>
            </div>
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{
                    width: `${(serverInfo.memory.used / serverInfo.memory.total) * 100}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {((serverInfo.memory.used / serverInfo.memory.total) * 100).toFixed(1)}% used
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Database Info */}
      <div className="p-4 border rounded-lg space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <h4 className="font-semibold">Database</h4>
        </div>
        {serverInfo.database && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span
                className={`font-mono ${
                  serverInfo.database.connected ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {serverInfo.database.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-mono">{serverInfo.database.name || 'N/A'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ServerInfo;