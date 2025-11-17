'use client';

import React from 'react';
import LoginForm from '@/components/auth/LoginForm';

export default function AuthPage() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen p-4 overflow-hidden" style={{ backgroundColor: '#252525' }}>
      {/* Decorative circles (left side middle) */}
      <div className="absolute top-0 left-0 pointer-events-none overflow-hidden w-full h-full">
        {/* Large yellow circle - taking up most of left side */}
        <div
          className="absolute rounded-full"
          style={{
            width: '1000px',
            height: '1000px',
            top: '50%',
            left: '-650px',
            transform: 'translateY(-50%)',
            backgroundColor: '#FFDD00'
          }}
        />
        {/* Blue circle - overlapping yellow, centered on yellow */}
        <div
          className="absolute rounded-full"
          style={{
            width: '500px',
            height: '500px',
            top: '50%',
            left: '-400px',
            transform: 'translateY(-50%)',
            backgroundColor: '#0020F2'
          }}
        />
      </div>

      {/* Login content */}
      <div className="relative z-10 w-full max-w-[550px] flex flex-col items-center">
        <LoginForm />
      </div>
    </div>
  );
}
