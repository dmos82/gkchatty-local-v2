'use client';

import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { IMContainer } from './IMContainer';

/**
 * Wrapper that only renders IMContainer for authenticated users.
 * This prevents socket connections and API calls for non-logged-in users.
 */
export const AuthenticatedIMContainer: React.FC = () => {
  const { user, loading } = useAuth();

  // Don't render anything while checking auth or if not logged in
  if (loading || !user) {
    return null;
  }

  return <IMContainer />;
};

export default AuthenticatedIMContainer;
