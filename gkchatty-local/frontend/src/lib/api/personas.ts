import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  Persona,
  PersonaListResponse,
  PersonaResponse,
  CreatePersonaRequest,
  UpdatePersonaRequest,
} from 'types';

/**
 * Fetch all personas for the authenticated user
 */
export async function getPersonas(): Promise<Persona[]> {
  const response = await fetchWithAuth('/api/personas', {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch personas: ${response.status}`);
  }

  const data: PersonaListResponse = await response.json();
  if (!data.success) {
    throw new Error('Failed to fetch personas');
  }

  return data.personas;
}

/**
 * Fetch a single persona by its ID
 */
export async function getPersonaById(personaId: string): Promise<Persona> {
  const response = await fetchWithAuth(`/api/personas/${personaId}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})); // Attempt to parse error
    if (response.status === 404) {
      throw new Error('Persona not found'); // Specific error for 404
    }
    throw new Error(
      errorData.message || `Failed to fetch persona ${personaId}: ${response.status}`
    );
  }

  const data: PersonaResponse = await response.json();
  if (!data.success) {
    throw new Error(data.message || `Failed to retrieve persona ${personaId}`);
  }
  return data.persona;
}

/**
 * Create a new persona
 */
export async function createPersona(personaData: CreatePersonaRequest): Promise<Persona> {
  const response = await fetchWithAuth('/api/personas', {
    method: 'POST',
    body: JSON.stringify(personaData),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to create persona: ${response.status}`);
  }

  const data: PersonaResponse = await response.json();
  if (!data.success) {
    throw new Error(data.message || 'Failed to create persona');
  }

  return data.persona;
}

/**
 * Update an existing persona
 */
export async function updatePersona(
  personaId: string,
  updates: UpdatePersonaRequest
): Promise<Persona> {
  const response = await fetchWithAuth(`/api/personas/${personaId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to update persona: ${response.status}`);
  }

  const data: PersonaResponse = await response.json();
  if (!data.success) {
    throw new Error(data.message || 'Failed to update persona');
  }

  return data.persona;
}

/**
 * Delete a persona
 */
export async function deletePersona(personaId: string): Promise<{ wasActive: boolean }> {
  const response = await fetchWithAuth(`/api/personas/${personaId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to delete persona: ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || 'Failed to delete persona');
  }

  return { wasActive: data.wasActive };
}

/**
 * Activate a persona
 */
export async function activatePersona(personaId: string): Promise<Persona> {
  const response = await fetchWithAuth(`/api/personas/${personaId}/activate`, {
    method: 'PUT',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to activate persona: ${response.status}`);
  }

  const data: PersonaResponse = await response.json();
  if (!data.success) {
    throw new Error(data.message || 'Failed to activate persona');
  }

  return data.persona;
}

/**
 * Deactivate the current active persona
 */
export async function deactivatePersona(): Promise<void> {
  const response = await fetchWithAuth('/api/personas/deactivate', {
    method: 'PUT',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to deactivate persona: ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || 'Failed to deactivate persona');
  }
}
