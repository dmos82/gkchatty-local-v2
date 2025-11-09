import { create } from 'zustand';
import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config';
import { authFetch } from '@/lib/api';

export interface UserDocNode {
  _id: string;
  name: string;
  type: 'file' | 'folder';
  parentId?: string | null;
  children?: UserDocNode[];
  size?: number;
  mimeType?: string;
  uploadTimestamp?: string;
  path?: string;
  s3Key?: string;
  isExpanded?: boolean;
}

interface UserDocTreeState {
  // Tree structure
  fileTree: UserDocNode[];
  expandedFolders: Set<string>;
  selectedItems: Set<string>;

  // UI state
  viewMode: 'tree' | 'grid' | 'list';
  isLoading: boolean;
  error: string | null;
  searchQuery: string;

  // Actions
  setFileTree: (tree: UserDocNode[]) => void;
  toggleFolder: (folderId: string) => void;
  selectItem: (itemId: string, multiSelect?: boolean) => void;
  clearSelection: () => void;
  setViewMode: (mode: 'tree' | 'grid' | 'list') => void;
  setSearchQuery: (query: string) => void;

  // API actions
  fetchFileTree: () => Promise<void>;
  createFolder: (name: string, parentId?: string | null) => Promise<void>;
  deleteItems: (itemIds: string[]) => Promise<void>;
  moveItems: (itemIds: string[], targetFolderId: string | null) => Promise<void>;
  renameItem: (itemId: string, newName: string) => Promise<void>;
  uploadFiles: (files: FileList, folderId?: string | null) => Promise<void>;
}

const useUserDocTreeStore = create<UserDocTreeState>((set, get) => ({
  // Initial state
  fileTree: [],
  expandedFolders: new Set<string>(),
  selectedItems: new Set<string>(),
  viewMode: 'tree',
  isLoading: false,
  error: null,
  searchQuery: '',

  // Basic actions
  setFileTree: (tree) => set({ fileTree: tree }),

  toggleFolder: (folderId) => set((state) => {
    const newExpanded = new Set(state.expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    return { expandedFolders: newExpanded };
  }),

  selectItem: (itemId, multiSelect = false) => set((state) => {
    const newSelection = multiSelect ? new Set(state.selectedItems) : new Set<string>();
    if (newSelection.has(itemId)) {
      newSelection.delete(itemId);
    } else {
      newSelection.add(itemId);
    }
    return { selectedItems: newSelection };
  }),

  clearSelection: () => set({ selectedItems: new Set<string>() }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  // API actions - USER DOCUMENTS ENDPOINTS
  fetchFileTree: async () => {
    set({ isLoading: true, error: null });
    try {
      const endpoint = `${API_BASE_URL}/api/folders/tree?sourceType=user`;

      console.log('[UserDocTreeStore] Fetching tree from:', endpoint);
      const response = await authFetch(endpoint);

      if (!response.ok) {
        console.error('[UserDocTreeStore] Response not OK:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('[UserDocTreeStore] Error response:', errorText);
        throw new Error(`Failed to fetch file tree: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[UserDocTreeStore] fetchFileTree response:', data);

      const treeToSet = data.tree || [];
      console.log('[UserDocTreeStore] Setting fileTree with', treeToSet.length, 'items');

      set((state) => {
        console.log('[UserDocTreeStore] Current state before set:', state.fileTree.length);
        console.log('[UserDocTreeStore] Setting new tree with:', treeToSet.length);
        return { ...state, fileTree: treeToSet };
      });
    } catch (error: any) {
      set({ error: error.message });
      console.error('[UserDocTreeStore] Failed to fetch file tree:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  createFolder: async (name: string, parentId?: string | null) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authFetch(`${API_BASE_URL}/api/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          parentId
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to create folder: ${response.statusText}`);
      }

      const newFolder = await response.json();

      // Store current expanded folders before refresh
      const currentExpanded = new Set(get().expandedFolders);

      // If created inside a folder, ensure parent is expanded
      if (parentId) {
        currentExpanded.add(parentId);
      }

      // Refresh the tree
      await get().fetchFileTree();

      // Restore expanded folders state
      set({ expandedFolders: currentExpanded });

      return newFolder;
    } catch (error: any) {
      set({ error: error.message });
      console.error('Failed to create folder:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  deleteItems: async (itemIds: string[]) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authFetch(`${API_BASE_URL}/api/folders/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds })
      });

      if (!response.ok) {
        throw new Error(`Failed to delete items: ${response.statusText}`);
      }

      // Clear selection and refresh
      set({ selectedItems: new Set<string>() });
      await get().fetchFileTree();
    } catch (error: any) {
      set({ error: error.message });
      console.error('Failed to delete items:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  moveItems: async (itemIds: string[], targetFolderId: string | null) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authFetch(`${API_BASE_URL}/api/folders/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds, targetFolderId })
      });

      if (!response.ok) {
        throw new Error(`Failed to move items: ${response.statusText}`);
      }

      // Store current expanded folders before refresh
      const currentExpanded = new Set(get().expandedFolders);

      // If moving to a folder, ensure it's expanded to show the moved items
      if (targetFolderId) {
        currentExpanded.add(targetFolderId);
      }

      // Clear selection and refresh
      set({ selectedItems: new Set<string>() });
      await get().fetchFileTree();

      // Restore expanded folders state
      set({ expandedFolders: currentExpanded });
    } catch (error: any) {
      set({ error: error.message });
      console.error('Failed to move items:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  renameItem: async (itemId: string, newName: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authFetch(`${API_BASE_URL}/api/folders/${itemId}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      });

      if (!response.ok) {
        throw new Error(`Failed to rename item: ${response.statusText}`);
      }

      await get().fetchFileTree();
    } catch (error: any) {
      set({ error: error.message });
      console.error('Failed to rename item:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  uploadFiles: async (files: FileList, folderId?: string | null) => {
    set({ isLoading: true, error: null });
    console.log('[UserDocTreeStore] uploadFiles called with folderId:', folderId);

    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      if (folderId) {
        console.log('[UserDocTreeStore] Appending folderId to formData:', folderId);
        formData.append('folderId', folderId);
      } else {
        console.log('[UserDocTreeStore] No folderId provided, uploading to root');
      }

      console.log('[UserDocTreeStore] Uploading files to:', `${API_BASE_URL}/api/documents/upload`);
      const response = await authFetch(`${API_BASE_URL}/api/documents/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Failed to upload files: ${response.statusText}`);
      }

      const uploadResult = await response.json();
      console.log('[UserDocTreeStore] Upload result:', uploadResult);

      // Wait a bit for backend processing then refresh
      console.log('[UserDocTreeStore] Refreshing tree after upload...');
      setTimeout(async () => {
        await get().fetchFileTree();
      }, 500);
    } catch (error: any) {
      set({ error: error.message });
      console.error('Failed to upload files:', error);
    } finally {
      set({ isLoading: false });
    }
  }
}));

export default useUserDocTreeStore;
