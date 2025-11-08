'use client';

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, File, Plus, Trash2, FolderPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

export interface TreeNode {
  _id: string;
  name: string;
  type: 'folder' | 'file';
  parentId?: string | null;
  path?: string;
  children?: TreeNode[];
  size?: number;
  mimeType?: string;
  uploadTimestamp?: string;
}

interface FolderTreeProps {
  tree: TreeNode[];
  selectedId?: string;
  onSelect: (node: TreeNode) => void;
  onCreateFolder?: (parentId: string | null) => void;
  onDeleteItem?: (itemId: string, type: 'folder' | 'file') => void;
  onMoveItem?: (itemId: string, targetFolderId: string | null) => void;
}

interface TreeItemProps {
  node: TreeNode;
  level: number;
  selectedId?: string;
  onSelect: (node: TreeNode) => void;
  onCreateFolder?: (parentId: string | null) => void;
  onDeleteItem?: (itemId: string, type: 'folder' | 'file') => void;
}

const TreeItem: React.FC<TreeItemProps> = ({
  node,
  level,
  selectedId,
  onSelect,
  onCreateFolder,
  onDeleteItem,
}) => {
  const [isExpanded, setIsExpanded] = useState(level === 0); // Root expanded by default
  const isSelected = selectedId === node._id;
  const hasChildren = node.type === 'folder' && node.children && node.children.length > 0;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'folder') {
      setIsExpanded(!isExpanded);
    }
  };

  const handleSelect = () => {
    onSelect(node);
  };

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors',
              isSelected && 'bg-amber-50 dark:bg-amber-900/20',
              'group'
            )}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={handleSelect}
          >
            {/* Expand/Collapse Icon */}
            {node.type === 'folder' && (
              <button
                onClick={handleToggle}
                className="p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                )}
              </button>
            )}
            {node.type === 'file' && <div className="w-5" />} {/* Spacer for alignment */}

            {/* Icon */}
            {node.type === 'folder' ? (
              <Folder
                className={cn(
                  'h-4 w-4',
                  isExpanded ? 'text-amber-500' : 'text-neutral-500 dark:text-neutral-400'
                )}
              />
            ) : (
              <File className="h-4 w-4 text-blue-500" />
            )}

            {/* Name */}
            <span
              className={cn(
                'text-sm truncate flex-1',
                isSelected && 'font-medium text-amber-900 dark:text-amber-100'
              )}
            >
              {node.name}
            </span>

            {/* File size (for files only) */}
            {node.type === 'file' && node.size && (
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                {(node.size / 1024).toFixed(1)} KB
              </span>
            )}

            {/* Children count (for folders) */}
            {node.type === 'folder' && hasChildren && (
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                {node.children?.length}
              </span>
            )}
          </div>
        </ContextMenuTrigger>

        {/* Context Menu */}
        <ContextMenuContent>
          {node.type === 'folder' && (
            <ContextMenuItem onClick={() => onCreateFolder?.(node._id)}>
              <FolderPlus className="h-4 w-4 mr-2" />
              New Folder
            </ContextMenuItem>
          )}
          <ContextMenuItem
            onClick={() => onDeleteItem?.(node._id, node.type)}
            className="text-red-600 dark:text-red-400"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Children */}
      {node.type === 'folder' && isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeItem
              key={child._id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreateFolder={onCreateFolder}
              onDeleteItem={onDeleteItem}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FolderTree: React.FC<FolderTreeProps> = ({
  tree,
  selectedId,
  onSelect,
  onCreateFolder,
  onDeleteItem,
}) => {
  return (
    <div className="border rounded-lg p-2 bg-white dark:bg-neutral-900 max-h-[600px] overflow-y-auto">
      {/* Root level "Create Folder" button */}
      <div className="mb-2 px-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCreateFolder?.(null)}
          className="w-full justify-start text-neutral-600 dark:text-neutral-400 hover:text-amber-600 dark:hover:text-amber-400"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Folder
        </Button>
      </div>

      {/* Tree */}
      {tree.length === 0 ? (
        <div className="text-center py-8 text-neutral-400 dark:text-neutral-500">
          <Folder className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No documents yet</p>
        </div>
      ) : (
        tree.map((node) => (
          <TreeItem
            key={node._id}
            node={node}
            level={0}
            selectedId={selectedId}
            onSelect={onSelect}
            onCreateFolder={onCreateFolder}
            onDeleteItem={onDeleteItem}
          />
        ))
      )}
    </div>
  );
};
