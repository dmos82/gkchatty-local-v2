'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config';

export function RegisterForm() {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isLoading: isAuthLoading } = useAuth();
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    // Basic validation
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords don't match");
      setIsSubmitting(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setIsSubmitting(false);
      return;
    }

    const apiUrl = `${API_BASE_URL}/api/auth/register`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Registration failed (Status: ${response.status})`);
      }

      setSuccess('Registration successful! You can now log in.');

      // Clear form after successful registration
      setFormData({
        username: '',
        password: '',
        confirmPassword: '',
      });

      // Redirect to login page after a short delay
      setTimeout(() => {
        router.push('/auth');
      }, 2000);
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine overall disabled state
  const isDisabled = isSubmitting || isAuthLoading;

  return (
    <Card className="w-full max-w-sm h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <CardTitle>Create Account</CardTitle>
        <CardDescription>Enter your details to register a new account</CardDescription>
      </CardHeader>
      <form onSubmit={handleRegister} className="flex flex-col flex-grow">
        <CardContent className="space-y-4 flex-grow">
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="register-username">Username</Label>
              <Input
                id="register-username"
                name="username"
                placeholder="Choose a username"
                value={formData.username}
                onChange={handleChange}
                required
                disabled={isDisabled}
              />
            </div>
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="register-password">Password</Label>
              <Input
                id="register-password"
                name="password"
                type="password"
                placeholder="Create a password (min 6 characters)"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={isDisabled}
              />
            </div>
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="register-confirm-password">Confirm Password</Label>
              <Input
                id="register-confirm-password"
                name="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                disabled={isDisabled}
              />
            </div>
          </div>
          {error && (
            <p className="text-sm font-medium text-destructive text-center px-1 pt-2">{error}</p>
          )}
          {success && (
            <p className="text-sm font-medium text-green-600 text-center px-1 pt-2">{success}</p>
          )}
        </CardContent>
        <CardFooter className="flex-shrink-0">
          <Button type="submit" className="w-full" disabled={isDisabled}>
            {isSubmitting ? 'Registering...' : 'Register'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default RegisterForm;
