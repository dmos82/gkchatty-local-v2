'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      console.log('[LoginForm] handleLogin triggered for:', { username });

      await login(username, password);
      const loginSuccess = true;

      if (loginSuccess) {
        console.log('[LoginForm] AuthContext login successful. Redirecting to /');
        setTimeout(() => {
          router.push('/');
        }, 100);
      } else {
        console.log('[LoginForm] AuthContext login failed.');
        setError('Invalid username or password.');
        setPassword('');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('[LoginForm] Error during login attempt:', error);
      setError('An error occurred. Please try again.');
      setPassword('');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* GK Circle Logo - replacing LOGIN text */}
      <div className="mb-8">
        <div
          className="rounded-full overflow-hidden"
          style={{
            width: '160px',
            height: '160px',
            boxShadow: '0 0 30px 10px rgba(255, 221, 0, 0.5), 0 0 60px 20px rgba(255, 221, 0, 0.2)'
          }}
        >
          <img
            src="/GKCIRCLELOGO.JPG"
            alt="GK Circle Logo"
            className="object-cover w-full h-full rounded-full"
          />
        </div>
      </div>

      <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
        {/* Username input - Figma design */}
        <input
          id="login-username"
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
          disabled={isSubmitting}
          autoComplete="off"
          className="w-full h-10 px-3 bg-transparent border border-[#B9B9B9] rounded-[5px] text-white placeholder-[#808080] focus:outline-none focus:border-white transition-colors text-sm"
          style={{
            fontFamily: 'M PLUS 2, sans-serif'
          }}
        />

        {/* Password input - Figma design */}
        <input
          id="login-password"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          disabled={isSubmitting}
          autoComplete="new-password"
          className="w-full h-10 px-3 bg-transparent border border-[#B9B9B9] rounded-[5px] text-white placeholder-[#808080] focus:outline-none focus:border-white transition-colors text-sm"
          style={{
            fontFamily: 'M PLUS 2, sans-serif'
          }}
        />

        {error && (
          <p className="text-sm font-medium text-red-400 text-center">{error}</p>
        )}

        {/* LOGIN button - Figma design */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-10 rounded-[5px] transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            backgroundColor: '#EAA221',
            color: '#252525',
            fontFamily: 'M PLUS 2, sans-serif',
            fontSize: '24px',
            fontWeight: 700
          }}
        >
          {isSubmitting ? 'LOGGING IN...' : 'LOGIN'}
        </button>
      </form>
    </div>
  );
}

export default LoginForm;
