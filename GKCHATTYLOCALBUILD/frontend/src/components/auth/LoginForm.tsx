'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

      const loginSuccess = await login({ username, password });

      if (loginSuccess) {
        console.log('[LoginForm] AuthContext login successful. Redirecting to /');
        // Add a small delay to ensure auth state is updated before navigation
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
    <Card className="w-full max-w-sm h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <CardTitle>Login</CardTitle>
      </CardHeader>
      <form onSubmit={handleLogin} className="flex flex-col flex-grow">
        <CardContent className="space-y-4 flex-grow">
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="login-username">Username</Label>
              <Input
                id="login-username"
                placeholder="Your username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                disabled={isSubmitting}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
                autoComplete="new-password"
              />
            </div>
          </div>
          {error && (
            <p className="text-sm font-medium text-destructive text-center px-1 pt-2">{error}</p>
          )}
        </CardContent>
        <CardFooter className="flex-shrink-0">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Logging in...' : 'Login v2'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default LoginForm;
