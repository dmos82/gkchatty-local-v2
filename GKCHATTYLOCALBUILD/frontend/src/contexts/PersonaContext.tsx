'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Persona } from 'types';
import { getPersonas } from '@/lib/api/personas';
import { useAuth } from '@/hooks/useAuth';

interface PersonaContextType {
  activePersona: Persona | null;
  personas: Persona[];
  isLoading: boolean;
  error: string | null;
  refreshPersonas: () => Promise<void>;
  setActivePersonaLocal: (persona: Persona | null) => void;
}

const PersonaContext = createContext<PersonaContextType | undefined>(undefined);

interface PersonaProviderProps {
  children: ReactNode;
}

export function PersonaProvider({ children }: PersonaProviderProps) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activePersona, setActivePersona] = useState<Persona | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPersonas = async () => {
    if (!user || isAuthLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log('[PersonaContext] Fetching personas...');
      const fetchedPersonas = await getPersonas();
      console.log('[PersonaContext] Fetched personas:', fetchedPersonas);

      setPersonas(fetchedPersonas);

      // Find and set the active persona
      const activePersonaFromList = fetchedPersonas.find(p => p.isActive) || null;
      setActivePersona(activePersonaFromList);

      console.log('[PersonaContext] Active persona:', activePersonaFromList);
    } catch (err) {
      console.error('[PersonaContext] Error fetching personas:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch personas';
      setError(errorMessage);
      setPersonas([]);
      setActivePersona(null);
    } finally {
      setIsLoading(false);
    }
  };

  const setActivePersonaLocal = (persona: Persona | null) => {
    console.log('[PersonaContext] setActivePersonaLocal called with:', persona);
    setActivePersona(persona);
    // Also update the personas array to reflect the active state
    setPersonas(prev =>
      prev.map(p => ({
        ...p,
        isActive: p._id === persona?._id,
      }))
    );
  };

  // Fetch personas when user becomes available
  useEffect(() => {
    if (user && !isAuthLoading) {
      refreshPersonas();
    } else if (!user) {
      // Clear state when user is not available
      setPersonas([]);
      setActivePersona(null);
      setError(null);
    }
  }, [user, isAuthLoading]);

  const value: PersonaContextType = {
    activePersona,
    personas,
    isLoading,
    error,
    refreshPersonas,
    setActivePersonaLocal,
  };

  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona() {
  const context = useContext(PersonaContext);
  if (context === undefined) {
    throw new Error('usePersona must be used within a PersonaProvider');
  }
  return context;
}

export default PersonaContext;
