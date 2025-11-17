'use client';

import React, { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, File, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import useFileTreeStore, { FileNode } from '@/stores/fileTreeStore';

interface FileTreeViewProps {
  onDocumentSelect: (documentId: string, filename: string) => void;
  isActive?: boolean;
}

export default function FileTreeView({ onDocumentSelect, isActive }: FileTreeViewProps) {
  const {
    fileTree,
    expandedFolders,
    isLoading,
    error,
    toggleFolder,
    fetchFileTree,
    setMode
  } = useFileTreeStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filteredTree, setFilteredTree] = useState<FileNode[]>([]);

  // Set mode to system and load tree when tab becomes active
  useEffect(() => {
    if (isActive) {
      setMode('system');
      fetchFileTree();
    }
  }, [isActive, setMode, fetchFileTree]);

  // Filter tree based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTree(fileTree);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filterNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.reduce((acc: FileNode[], node) => {
        const nameMatches = node.name.toLowerCase().includes(query);
        const childMatches = node.children ? filterNodes(node.children) : [];
        
        if (nameMatches || childMatches.length > 0) {
          acc.push({
            ...node,
            children: childMatches.length > 0 ? childMatches : node.children
          });
        }
        
        return acc;
      }, []);
    };

    setFilteredTree(filterNodes(fileTree));
  }, [searchQuery, fileTree]);

  // Render a single tree node
  const renderNode = (node: FileNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node._id);
    const isFolder = node.type === 'folder';
    const hasChildren = node.children && node.children.length > 0;

    // Get file icon based on type
    const getFileIcon = () => {
      if (isFolder) {
        return isExpanded ? (
          <FolderOpen className="h-4 w-4 text-blue-500 flex-shrink-0" />
        ) : (
          <Folder className="h-4 w-4 text-blue-500 flex-shrink-0" />
        );
      }
      
      // Check file extension for icon
      const ext = node.name.split('.').pop()?.toLowerCase();
      if (ext === 'pdf') {
        return <FileText className="h-4 w-4 text-red-500 flex-shrink-0" />;
      }
      return <File className="h-4 w-4 text-gray-500 flex-shrink-0" />;
    };

    return (
      <div key={node._id}>
        <div
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 hover:bg-accent rounded-md cursor-pointer transition-colors",
            !isFolder && "hover:bg-blue-50"
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => {
            if (isFolder) {
              toggleFolder(node._id);
            } else {
              // For files, trigger the document selection
              onDocumentSelect(node._id, node.name);
            }
          }}
        >
          {isFolder && hasChildren && (
            <button
              className="p-0.5 hover:bg-gray-200 rounded"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(node._id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
          {(!isFolder || !hasChildren) && <div className="w-4" />}
          
          {getFileIcon()}
          
          <span className="text-sm truncate flex-1">
            {node.name}
          </span>
          
          {node.type === 'file' && node.size && (
            <span className="text-xs text-muted-foreground">
              {(node.size / 1024 / 1024).toFixed(1)} MB
            </span>
          )}
        </div>
        
        {isFolder && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        <p>Error loading documents: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>
      </div>

      {/* File Tree */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full ml-4" />
              <Skeleton className="h-8 w-full ml-4" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full ml-4" />
            </div>
          ) : filteredTree.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {searchQuery ? (
                <p>No documents found matching "{searchQuery}"</p>
              ) : (
                <>
                  <Folder className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No documents available</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredTree.map(node => renderNode(node))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}