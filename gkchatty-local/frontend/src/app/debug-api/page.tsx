'use client';

import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/lib/config';

export default function DebugApiPage() {
  const [info, setInfo] = useState<{
    hostname: string;
    apiUrl: string;
    fullUrl: string;
  } | null>(null);

  useEffect(() => {
    setInfo({
      hostname: window.location.hostname,
      apiUrl: getApiBaseUrl(),
      fullUrl: window.location.href,
    });
  }, []);

  if (!info) return <div>Loading...</div>;

  return (
    <div style={{ padding: '20px', fontSize: '18px', fontFamily: 'monospace', background: '#fff', minHeight: '100vh', color: '#000' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px', color: '#000' }}>API Debug Info</h1>

      <div style={{ marginBottom: '15px' }}>
        <strong style={{ color: '#000' }}>Hostname:</strong>
        <div style={{ background: '#333', color: '#0f0', padding: '10px', marginTop: '5px', border: '2px solid #000' }}>
          {info.hostname}
        </div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <strong style={{ color: '#000' }}>API Base URL:</strong>
        <div style={{ background: '#333', color: '#0f0', padding: '10px', marginTop: '5px', border: '2px solid #000' }}>
          {info.apiUrl}
        </div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <strong style={{ color: '#000' }}>Full URL:</strong>
        <div style={{ background: '#333', color: '#0f0', padding: '10px', marginTop: '5px', wordBreak: 'break-all', border: '2px solid #000' }}>
          {info.fullUrl}
        </div>
      </div>

      <div style={{ marginTop: '30px', padding: '15px', background: '#e8f5e9', borderRadius: '5px', border: '2px solid #000' }}>
        <strong style={{ color: '#000' }}>Expected:</strong>
        <ul style={{ marginTop: '10px', marginLeft: '20px', color: '#000' }}>
          <li>Desktop: hostname = "localhost", API = "http://localhost:4001"</li>
          <li>Mobile: hostname = "192.168.1.67", API = "http://192.168.1.67:4001"</li>
        </ul>
      </div>
    </div>
  );
}
