'use client';

import React, { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext'; // Adjust path as needed
import { Loader2 } from 'lucide-react'; // Example loading icon

interface AdminProtectedRouteProps {
  children: ReactNode;
}

const AdminProtectedRoute: React.FC<AdminProtectedRouteProps> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Only check and redirect AFTER authentication status is known
    if (!isLoading) {
      // If there's no user OR the user is not an admin, redirect
      if (!user || user.role !== 'admin') {
        console.log('[AdminProtectedRoute] Access denied or not logged in. Redirecting...');
        router.push('/auth'); // Redirect to login or denied page
      }
    }
  }, [isLoading, user, router]);

  // While loading, show nothing or a loader
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Verifying access...</span>
      </div>
    );
  }

  // If loading is done and user is admin, render children
  if (user && user.role === 'admin') {
    return <>{children}</>;
  }

  // If loading is done and user is not admin (or no user),
  // the useEffect should have redirected. Return null as a fallback.
  return null;
};

export default AdminProtectedRoute;
