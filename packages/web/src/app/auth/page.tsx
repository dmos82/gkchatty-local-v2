'use client'; // Required if LoginForm uses client hooks like useState

import React from 'react';
import Image from 'next/image';
import LoginForm from '@/components/auth/LoginForm';

export default function AuthPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background dark:bg-neutral-800">
      {/* Goldkey Logo */}
      <div className="mb-4">
        <Image
          src="/gk_logo_new.png"
          alt="Gold Key Insurance Logo"
          width={216}
          height={60}
          priority
          unoptimized
        />
      </div>
      {/* Title - Apply color to GK */}
      <h1 className="text-2xl font-semibold mb-2 text-foreground">
        <span className="text-yellow-500">GK</span> CHATTY
      </h1>
      {/* Website Link */}
      <a
        href="https://goldkeyinsurance.ca"
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-muted-foreground hover:text-primary underline mb-8 block text-center"
      >
        Visit GoldkeyInsurance.ca
      </a>
      {/* Centered Login Form */}
      <div className="w-full max-w-sm flex justify-center px-4">
        <LoginForm />
      </div>
    </div>
  );
}
