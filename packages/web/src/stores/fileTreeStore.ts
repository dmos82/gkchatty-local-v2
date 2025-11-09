import { create } from 'zustand';
import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config';
import { authFetch } from '@/lib/api';

export interface FileNode {
  _id: string;
  name: string;
  type: 'file' | 'folder';
  parentId?: string | null;
  children?: FileNode[];
  size?: number;
  mimeType?: string;
  uploadTimestamp?: string;
  path?: string;
  s3Key?: string;
  isExpanded?: boolean;
  knowledgeBaseId?: string;
}

export interface KnowledgeBase {
  _id: string;
  name: string;
  description?: string;
  documentCount?: number;
}

interface FileTreeState {
  // Tree structure
  fileTree: FileNode[];
  expandedFolders: Set<string>;
  selectedItems: Set<string>;
  
  // Knowledge bases
  knowledgeBases: KnowledgeBase[];
  selectedKnowledgeBase: string | null;
  
  // UI state
  viewMode: 'tree' | 'grid' | 'list';
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  
  // Actions
  setFileTree: (tree: FileNode[]) => void;
  toggleFolder: (folderId: string) => void;
  selectItem: (itemId: string, multiSelect?: boolean) => void;
  clearSelection: () => void;
  setViewMode: (mode: 'tree' | 'grid' | 'list') => void;
  setSearchQuery: (query: string) => void;
  setSelectedKnowledgeBase: (kbId: string | null) => void;
  
  // API actions
  fetchFileTree: (kbId?: string) => Promise<void>;
  createFolder: (name: string, parentId?: string | null) => Promise<void>;
  deleteItems: (itemIds: string[]) => Promise<void>;
  moveItems: (itemIds: string[], targetFolderId: string | null) => Promise<void>;
  renameItem: (itemId: string, newName: string) => Promise<void>;
  uploadFiles: (files: FileList, folderId?: string | null) => Promise<void>;
  fetchKnowledgeBases: () => Promise<void>;
}

const useFileTreeStore = create<FileTreeState>((set, get) => ({
  // Initial state
  fileTree: [],
  expandedFolders: new Set<string>(),
  selectedItems: new Set<string>(),
  knowledgeBases: [],
  selectedKnowledgeBase: null,
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
  setSelectedKnowledgeBase: (kbId) => set({ selectedKnowledgeBase: kbId }),

  // API actions
  fetchFileTree: async (kbId?: string) => {
    set({ isLoading: true, error: null });
    try {
      const kb = kbId || get().selectedKnowledgeBase;
      const endpoint = kb
        ? `${API_BASE_URL}/api/admin/system-folders/tree?knowledgeBase=${kb}`
        : `${API_BASE_URL}/api/admin/system-folders/tree`;

      console.log('[FileTreeStore] Fetching tree from:', endpoint);
      const response = await authFetch(endpoint);
      
      if (!response.ok) {
        console.error('[FileTreeStore] Response not OK:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('[FileTreeStore] Error response:', errorText);
        throw new Error(`Failed to fetch file tree: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[FileTreeStore] fetchFileTree response:', data);
      console.log('[FileTreeStore] Tree data type:', typeof data.tree);
      console.log('[FileTreeStore] Tree is array?:', Array.isArray(data.tree));
      console.log('[FileTreeStore] Tree length:', data.tree?.length);
      
      if (data.tree && data.tree.length > 0) {
        console.log('[FileTreeStore] First 3 items:', data.tree.slice(0, 3).map((item: any) => ({
          name: item.name,
          type: item.type,
          hasChildren: item.children ? item.children.length : 0
        })));
        console.log('[FileTreeStore] All item names:', data.tree.map((item: any) => item.name));
      }
      
      // Check what we're about to set
      const treeToSet = data.tree || [];
      console.log('[FileTreeStore] About to set fileTree with', treeToSet.length, 'items');
      console.log('[FileTreeStore] Tree to set:', treeToSet);
      
      // Try setting with a callback to ensure we're not having state issues
      set((state) => {
        console.log('[FileTreeStore] Current state before set:', state.fileTree.length);
        console.log('[FileTreeStore] Setting new tree with:', treeToSet.length);
        return { ...state, fileTree: treeToSet };
      });
    } catch (error: any) {
      set({ error: error.message });
      console.error('[FileTreeStore] Failed to fetch file tree:', error);
      console.error('[FileTreeStore] Error details:', {
        message: error.message,
        stack: error.stack
      });
    } finally {
      set({ isLoading: false });
    }
  },

  createFolder: async (name: string, parentId?: string | null) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authFetch(`${API_BASE_URL}/api/admin/system-folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          parentId,
          knowledgeBaseId: get().selectedKnowledgeBase
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
      const response = await authFetch(`${API_BASE_URL}/api/admin/system-folders/delete`, {
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
      const response = await authFetch(`${API_BASE_URL}/api/admin/system-folders/move`, {
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
      const response = await authFetch(`${API_BASE_URL}/api/admin/system-folders/${itemId}/rename`, {
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
    console.log('[FileTreeStore] uploadFiles called with folderId:', folderId);
    
    try {
      // Use existing upload endpoint with folder metadata
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });
      
      if (folderId) {
        console.log('[FileTreeStore] Appending folderId to formData:', folderId);
        formData.append('folderId', folderId);
      } else {
        console.log('[FileTreeStore] No folderId provided, uploading to root');
      }
      
      if (get().selectedKnowledgeBase) {
        formData.append('knowledgeBaseId', get().selectedKnowledgeBase!);
      }
      
      console.log('[FileTreeStore] Uploading files to:', `${API_BASE_URL}/api/admin/system-kb/upload`);
      const response = await authFetch(`${API_BASE_URL}/api/admin/system-kb/upload`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Failed to upload files: ${response.statusText}`);
      }
      
      const uploadResult = await response.json();
      console.log('[FileTreeStore] Upload result:', uploadResult);
      
      // Wait a bit for backend processing then refresh
      console.log('[FileTreeStore] Refreshing tree after upload...');
      setTimeout(async () => {
        await get().fetchFileTree();
      }, 500);
    } catch (error: any) {
      set({ error: error.message });
      console.error('Failed to upload files:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchKnowledgeBases: async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/admin/tenant-kb`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch knowledge bases: ${response.statusText}`);
      }
      
      const data = await response.json();
      set({ knowledgeBases: data.knowledgeBases || [] });
      
      // Don't auto-select KB for system admin view
      // This was causing filtered results to overwrite the full tree
      // if (!get().selectedKnowledgeBase && data.knowledgeBases?.length > 0) {
      //   set({ selectedKnowledgeBase: data.knowledgeBases[0]._id });
      // }
    } catch (error: any) {
      console.error('Failed to fetch knowledge bases:', error);
    }
  }
}));

export default useFileTreeStore;