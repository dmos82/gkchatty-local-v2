'use client';

import React from 'react';
import LoginForm from '@/components/auth/LoginForm';

export default function AuthPage() {
  return (
    <div className="relative flex min-h-screen p-4 overflow-hidden" style={{ backgroundColor: '#252525' }}>
      {/* Decorative circles (left side middle) */}
      <div className="absolute top-0 left-0 pointer-events-none overflow-hidden w-full h-full">
        {/* Large gold circle - taking up most of left side */}
        <div
          className="absolute rounded-full"
          style={{
            width: '1000px',
            height: '1000px',
            top: '50%',
            left: '-550px',
            transform: 'translateY(-50%)',
            backgroundColor: '#EAA221'
          }}
        />
        {/* Dark brown circle - overlapping gold, centered on gold */}
        <div
          className="absolute rounded-full"
          style={{
            width: '500px',
            height: '500px',
            top: '50%',
            left: '-300px',
            transform: 'translateY(-50%)',
            backgroundColor: '#2a1a0f'
          }}
        />
      </div>

      {/* Login content - positioned slightly off-center to the right */}
      <div className="relative z-10 w-full max-w-[550px] flex flex-col items-center justify-center" style={{ marginLeft: '42%' }}>
        <LoginForm />
      </div>
    </div>
  );
}
