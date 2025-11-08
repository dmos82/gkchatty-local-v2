import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContext';
// import { AuthContextType } from 'types'; // REMOVED Invalid import

// Infer the type from the context itself
// import type { AuthContextType } from '@/context/AuthContext'; // REMOVED Unnecessary import

// Type is inferred correctly by useContext
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
