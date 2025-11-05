'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FolderOpen, 
  File, 
  Upload, 
  Plus, 
  Trash2,
  Grid3x3,
  List,
  FolderTree,
  Search,
  MoreVertical,
  Edit,
  Move,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import useFileTreeStore, { FileNode } from '@/stores/fileTreeStore';

const FileTreeManager: React.FC = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<FileNode[]>([]);

  const {
    fileTree,
    expandedFolders,
    selectedItems,
    viewMode,
    isLoading,
    error,
    searchQuery,
    selectedKnowledgeBase,
    knowledgeBases,
    toggleFolder,
    selectItem,
    clearSelection,
    setViewMode,
    setSearchQuery,
    setSelectedKnowledgeBase,
    fetchFileTree,
    createFolder,
    deleteItems,
    moveItems,
    renameItem,
    uploadFiles,
    fetchKnowledgeBases
  } = useFileTreeStore();

  // Dialog states
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [contextItem, setContextItem] = useState<FileNode | null>(null);
  
  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [draggedItems, setDraggedItems] = useState<string[]>([]);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  // Build flat list of all items for shift-click selection
  useEffect(() => {
    const flattenTree = (nodes: FileNode[]): FileNode[] => {
      const result: FileNode[] = [];
      const traverse = (node: FileNode) => {
        result.push(node);
        if (node.children && expandedFolders.has(node._id)) {
          node.children.forEach(traverse);
        }
      };
      nodes.forEach(traverse);
      return result;
    };
    setAllItems(flattenTree(fileTree));
  }, [fileTree, expandedFolders]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      console.log('[FileTreeManager] Loading initial data...');
      try {
        await fetchKnowledgeBases();
        console.log('[FileTreeManager] Knowledge bases fetched, now fetching tree...');
        await fetchFileTree();
        console.log('[FileTreeManager] Tree fetch completed');
      } catch (error) {
        console.error('[FileTreeManager] Error loading data:', error);
      }
    };
    loadData();
  }, []); // Remove dependencies to only run once on mount

  // Debug fileTree state
  useEffect(() => {
    console.log('[FileTreeManager] fileTree state updated:', fileTree);
    console.log('[FileTreeManager] fileTree length:', fileTree.length);
    if (fileTree.length > 0) {
      console.log('[FileTreeManager] First item:', fileTree[0]);
    }
  }, [fileTree]);

  // Debug effect to see when fileTree actually changes
  useEffect(() => {
    console.log('[FileTreeManager] fileTree changed:', fileTree);
    if (fileTree.length > 0) {
      console.log('[FileTreeManager] First tree item details:', {
        name: fileTree[0].name,
        type: fileTree[0].type,
        childrenCount: fileTree[0].children?.length || 0,
        children: fileTree[0].children?.slice(0, 3).map(c => c.name)
      });
    }
  }, [fileTree]);

  // Handle KB change - DISABLED for system KB view
  // This was causing a second fetch that overwrote the initial data
  // Comment out to prevent double-fetching
  // useEffect(() => {
  //   if (selectedKnowledgeBase) {
  //     fetchFileTree(selectedKnowledgeBase);
  //   }
  // }, [selectedKnowledgeBase, fetchFileTree]);

  // Handle errors
  useEffect(() => {
    if (error) {
      toast({
        title: 'Error',
        description: error,
        variant: 'destructive'
      });
    }
  }, [error, toast]);

  // Handle item selection with Shift and Ctrl/Cmd support
  const handleItemSelect = useCallback((itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (e.shiftKey && lastSelectedId && lastSelectedId !== itemId) {
      // Shift-click: select range
      const startIndex = allItems.findIndex(item => item._id === lastSelectedId);
      const endIndex = allItems.findIndex(item => item._id === itemId);

      if (startIndex !== -1 && endIndex !== -1) {
        const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const newSelection = new Set(selectedItems);

        for (let i = start; i <= end; i++) {
          newSelection.add(allItems[i]._id);
        }

        // Update selection in store
        clearSelection();
        newSelection.forEach(id => selectItem(id, true));
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd-click: toggle single item
      selectItem(itemId, true);
    } else {
      // Regular click: select only this item
      clearSelection();
      selectItem(itemId, false);
    }

    setLastSelectedId(itemId);
  }, [allItems, lastSelectedId, selectedItems, selectItem, clearSelection]);

  // File upload handler
  const handleFileUpload = useCallback(async (files: FileList, folderId?: string | null) => {
    if (files.length === 0) return;
    
    try {
      await uploadFiles(files, folderId);
      toast({
        title: 'Success',
        description: `${files.length} file(s) uploaded successfully`
      });
      // Refresh the tree to show newly uploaded files
      await fetchFileTree(selectedKnowledgeBase || undefined);
    } catch (error) {
      toast({
        title: 'Upload Failed',
        description: 'Failed to upload files',
        variant: 'destructive'
      });
    }
  }, [uploadFiles, toast, fetchFileTree, selectedKnowledgeBase]);

  // Create folder handler
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      toast({
        title: 'Error',
        description: 'Folder name cannot be empty',
        variant: 'destructive'
      });
      return;
    }

    try {
      // If a folder is selected, create inside it; otherwise use selectedFolder from dialog
      const parentId = selectedFolder || (selectedItems.size === 1 ?
        Array.from(selectedItems).find(id => {
          const item = allItems.find(i => i._id === id);
          return item?.type === 'folder';
        }) : null);

      const newFolder = await createFolder(newFolderName, parentId);

      // The expanded folders state is now handled in the store

      setIsCreateFolderOpen(false);
      setNewFolderName('');
      setSelectedFolder(null);

      // Clear any drag state to ensure clean state for new folders
      setDragOverFolder(null);
      setIsDragging(false);
      setDraggedItems([]);

      toast({
        title: 'Success',
        description: 'Folder created successfully'
      });

      // Force a small delay to ensure DOM is updated before drag operations
      setTimeout(() => {
        // This ensures the DOM has time to render the new folder
      }, 100);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create folder',
        variant: 'destructive'
      });
    }
  }, [newFolderName, selectedFolder, selectedItems, allItems, createFolder, toast]);

  // Delete handler
  const handleDelete = useCallback(async () => {
    const itemsToDelete = selectedItems.size > 0
      ? Array.from(selectedItems)
      : contextItem ? [contextItem._id] : [];

    if (itemsToDelete.length === 0) return;

    if (!confirm(`Are you sure you want to delete ${itemsToDelete.length} item(s)?`)) {
      return;
    }

    try {
      await deleteItems(itemsToDelete);
      toast({
        title: 'Success',
        description: `${itemsToDelete.length} item(s) deleted successfully`
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete items',
        variant: 'destructive'
      });
    }
  }, [selectedItems, contextItem, deleteItems, toast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if we're in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl/Cmd + A: Select all visible items
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !e.shiftKey) {
        e.preventDefault();
        const allItemIds = allItems.map(item => item._id);
        clearSelection();
        allItemIds.forEach(id => selectItem(id, true));
      }

      // F2: Rename selected item
      if (e.key === 'F2' && selectedItems.size === 1) {
        e.preventDefault();
        const selectedId = Array.from(selectedItems)[0];
        const selectedItem = allItems.find(item => item._id === selectedId);
        if (selectedItem) {
          setContextItem(selectedItem);
          setRenameValue(selectedItem.name);
          setIsRenameOpen(true);
        }
      }

      // Delete key: Delete selected items
      if (e.key === 'Delete' && selectedItems.size > 0) {
        e.preventDefault();
        handleDelete();
      }

      // Escape: Clear selection
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allItems, selectedItems, clearSelection, selectItem, handleDelete]);

  // Rename handler
  const handleRename = useCallback(async () => {
    if (!renameValue.trim() || !contextItem) return;
    
    try {
      await renameItem(contextItem._id, renameValue);
      setIsRenameOpen(false);
      setRenameValue('');
      setContextItem(null);
      toast({
        title: 'Success',
        description: 'Item renamed successfully'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to rename item',
        variant: 'destructive'
      });
    }
  }, [renameValue, contextItem, renameItem, toast]);

  // Move handler
  const handleMove = useCallback(async () => {
    const itemsToMove = selectedItems.size > 0 
      ? Array.from(selectedItems) 
      : contextItem ? [contextItem._id] : [];
    
    if (itemsToMove.length === 0) return;
    
    try {
      await moveItems(itemsToMove, moveTarget);
      setIsMoveOpen(false);
      setMoveTarget(null);
      toast({
        title: 'Success',
        description: `${itemsToMove.length} item(s) moved successfully`
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to move items',
        variant: 'destructive'
      });
    }
  }, [selectedItems, contextItem, moveTarget, moveItems, toast]);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, node: FileNode) => {
    setIsDragging(true);
    const itemsToMove = selectedItems.has(node._id) 
      ? Array.from(selectedItems)
      : [node._id];
    setDraggedItems(itemsToMove);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDraggedItems([]);
    setDragOverFolder(null);
  };

  const handleDragOver = (e: React.DragEvent, nodeId?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Set visual feedback for folder being hovered
    if (nodeId && nodeId !== dragOverFolder) {
      setDragOverFolder(nodeId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the actual element, not entering a child
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverFolder(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetNode?: FileNode) => {
    e.preventDefault();
    e.stopPropagation();

    // Only process drop for folders
    if (!targetNode || targetNode.type !== 'folder') {
      handleDragEnd();
      return;
    }

    const targetId = targetNode._id;

    // Don't allow dropping items into themselves or their children
    if (draggedItems.length > 0 && targetId && !draggedItems.includes(targetId)) {
      // Check if any dragged item is a parent of the target
      const isValidDrop = !draggedItems.some(draggedId => {
        const draggedNode = allItems.find(item => item._id === draggedId);
        if (draggedNode?.type === 'folder') {
          // Simple check - prevent dropping a folder into itself
          return targetNode._id === draggedId;
        }
        return false;
      });

      if (isValidDrop) {
        try {
          await moveItems(draggedItems, targetId);
          toast({
            title: 'Success',
            description: `${draggedItems.length} item(s) moved successfully`
          });
        } catch (error) {
          toast({
            title: 'Error',
            description: 'Failed to move items',
            variant: 'destructive'
          });
        }
      }
    }

    handleDragEnd();
  };

  // Render tree node
  const renderTreeNode = (node: FileNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node._id);
    const isSelected = selectedItems.has(node._id);
    const isFolder = node.type === 'folder';
    
    return (
      <div key={node._id} className="select-none">
        <div
          data-node-id={node._id}
          data-node-type={node.type}
          className={cn(
            "flex items-center gap-1 px-2 py-1 hover:bg-accent rounded cursor-pointer transition-all",
            isSelected && "bg-accent",
            isDragging && draggedItems.includes(node._id) && "opacity-50",
            isFolder && dragOverFolder === node._id && "bg-blue-500/20 ring-2 ring-blue-500"
          )}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
          onClick={(e) => handleItemSelect(node._id, e)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextItem(node);
            // If right-clicking on unselected item, select it
            if (!selectedItems.has(node._id)) {
              clearSelection();
              selectItem(node._id, false);
            }
          }}
          draggable
          onDragStart={(e) => handleDragStart(e, node)}
          onDragOver={(e) => isFolder && handleDragOver(e, node._id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => isFolder && handleDrop(e, node)}
        >
          {isFolder && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(node._id);
              }}
              className="p-0.5"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
          {isFolder ? (
            isExpanded ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />
          ) : (
            <File className="h-4 w-4" />
          )}
          <span className="flex-1 truncate text-sm">{node.name}</span>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isFolder && (
                <>
                  <DropdownMenuItem onClick={() => {
                    setSelectedFolder(node._id);
                    setIsCreateFolderOpen(true);
                  }}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Folder
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    console.log('[FileTreeManager] Setting selectedFolder to:', node._id, node.name);
                    setSelectedFolder(node._id);
                    // Use setTimeout to ensure state is updated before triggering file input
                    setTimeout(() => {
                      fileInputRef.current?.click();
                    }, 100);
                  }}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Files
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => {
                setContextItem(node);
                setRenameValue(node.name);
                setIsRenameOpen(true);
              }}>
                <Edit className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                setContextItem(node);
                setIsMoveOpen(true);
              }}>
                <Move className="mr-2 h-4 w-4" />
                Move
              </DropdownMenuItem>
              {!isFolder && (
                <DropdownMenuItem>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => {
                  setContextItem(node);
                  handleDelete();
                }}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {isFolder && node.children && (
          <div>
            {node.children.map(child => {
              // Always show folders, only show files when parent is expanded
              if (child.type === 'folder') {
                return renderTreeNode(child, level + 1);
              } else if (isExpanded) {
                return renderTreeNode(child, level + 1);
              }
              return null;
            })}
          </div>
        )}
      </div>
    );
  };

  // Render grid view
  const renderGridView = () => {
    const flattenTree = (nodes: FileNode[]): FileNode[] => {
      const result: FileNode[] = [];
      nodes.forEach(node => {
        if (searchQuery && !node.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return;
        }
        result.push(node);
        if (node.children) {
          result.push(...flattenTree(node.children));
        }
      });
      return result;
    };
    
    const items = flattenTree(fileTree);
    
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4">
        {items.map(item => (
          <div
            key={item._id}
            className={cn(
              "flex flex-col items-center p-4 rounded-lg hover:bg-accent cursor-pointer",
              selectedItems.has(item._id) && "bg-accent"
            )}
            onClick={(e) => handleItemSelect(item._id, e)}
            onDoubleClick={() => item.type === 'folder' && toggleFolder(item._id)}
          >
            {item.type === 'folder' ? (
              <Folder className="h-12 w-12 mb-2 text-blue-500" />
            ) : (
              <File className="h-12 w-12 mb-2 text-gray-500" />
            )}
            <span className="text-sm text-center truncate w-full">{item.name}</span>
          </div>
        ))}
      </div>
    );
  };

  // Render list view
  const renderListView = () => {
    const flattenTree = (nodes: FileNode[]): FileNode[] => {
      const result: FileNode[] = [];
      nodes.forEach(node => {
        if (searchQuery && !node.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return;
        }
        result.push(node);
        if (node.children) {
          result.push(...flattenTree(node.children));
        }
      });
      return result;
    };
    
    const items = flattenTree(fileTree);
    
    return (
      <div className="space-y-1 p-2">
        {items.map(item => (
          <div
            key={item._id}
            className={cn(
              "flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer",
              selectedItems.has(item._id) && "bg-accent"
            )}
            onClick={(e) => handleItemSelect(item._id, e)}
          >
            {item.type === 'folder' ? (
              <Folder className="h-4 w-4" />
            ) : (
              <File className="h-4 w-4" />
            )}
            <span className="flex-1 text-sm">{item.name}</span>
            {item.size && (
              <span className="text-xs text-muted-foreground">
                {(item.size / 1024 / 1024).toFixed(2)} MB
              </span>
            )}
            {item.uploadTimestamp && (
              <span className="text-xs text-muted-foreground">
                {new Date(item.uploadTimestamp).toLocaleDateString()}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              // If a single folder is selected, it will be the parent for the new folder
              const selectedFolder = selectedItems.size === 1 ?
                Array.from(selectedItems).find(id => {
                  const item = allItems.find(i => i._id === id);
                  return item?.type === 'folder';
                }) : null;
              setSelectedFolder(selectedFolder || null);
              setIsCreateFolderOpen(true);
            }}
            title={selectedItems.size === 1 && allItems.find(i => selectedItems.has(i._id))?.type === 'folder' ?
              "New Folder (inside selected)" : "New Folder"}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            title="Upload Files"
          >
            <Upload className="h-4 w-4" />
          </Button>
          {selectedItems.size > 0 && (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                title={`Delete ${selectedItems.size} item(s)`}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                title="Clear selection"
              >
                Clear
              </Button>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-64"
            />
          </div>
          
          <div className="flex border rounded-lg">
            <Button
              variant={viewMode === 'tree' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('tree')}
            >
              <FolderTree className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('grid')}
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div 
        className="flex-1 overflow-auto"
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e)}
      >
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : fileTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Folder className="h-12 w-12 mb-2" />
            <p>No files or folders</p>
            <p className="text-sm">Create a folder or upload files to get started</p>
          </div>
        ) : viewMode === 'tree' ? (
          <div className="p-2">
            {fileTree.map(node => renderTreeNode(node))}
          </div>
        ) : viewMode === 'grid' ? (
          renderGridView()
        ) : (
          renderListView()
        )}
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            console.log('[FileTreeManager] File input onChange, selectedFolder:', selectedFolder);
            handleFileUpload(e.target.files, selectedFolder);
            e.target.value = '';
            setSelectedFolder(null);
          }
        }}
      />
      
      {/* Create Folder Dialog */}
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="folder-name" className="text-right">
                Name
              </Label>
              <Input
                id="folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="col-span-3"
                placeholder="New Folder"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateFolderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Rename Dialog */}
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Item</DialogTitle>
            <DialogDescription>
              Enter a new name for {contextItem?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="rename" className="text-right">
                Name
              </Label>
              <Input
                id="rename"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="col-span-3"
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Move Dialog */}
      <Dialog open={isMoveOpen} onOpenChange={setIsMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Items</DialogTitle>
            <DialogDescription>
              Select the destination folder
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-auto py-4">
            <div
              className={cn(
                "p-2 rounded cursor-pointer hover:bg-accent",
                moveTarget === null && "bg-accent"
              )}
              onClick={() => setMoveTarget(null)}
            >
              <Folder className="inline h-4 w-4 mr-2" />
              Root
            </div>
            {/* Simplified folder tree for move target selection */}
            {fileTree.filter(n => n.type === 'folder').map(folder => (
              <div
                key={folder._id}
                className={cn(
                  "p-2 rounded cursor-pointer hover:bg-accent ml-4",
                  moveTarget === folder._id && "bg-accent"
                )}
                onClick={() => setMoveTarget(folder._id)}
              >
                <Folder className="inline h-4 w-4 mr-2" />
                {folder.name}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMoveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMove}>Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FileTreeManager;