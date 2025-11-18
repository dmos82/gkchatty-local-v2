import React, { useEffect, useRef } from 'react';
import { Folder, Trash2, Edit, Users } from 'lucide-react';

interface FolderContextMenuProps {
  x: number;
  y: number;
  folderId: string;
  folderName: string;
  isSystemFolder?: boolean;
  onClose: () => void;
  onRename: (folderId: string) => void;
  onDelete: (folderId: string) => void;
  onPermissions: (folderId: string) => void;
}

const FolderContextMenu: React.FC<FolderContextMenuProps> = ({
  x,
  y,
  folderId,
  folderName,
  isSystemFolder = false,
  onClose,
  onRename,
  onDelete,
  onPermissions,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu on screen
  const adjustedPosition = { x, y };
  if (menuRef.current) {
    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (x + rect.width > viewportWidth) {
      adjustedPosition.x = x - rect.width;
    }
    if (y + rect.height > viewportHeight) {
      adjustedPosition.y = y - rect.height;
    }
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[200px]"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Folder className="h-3 w-3" />
          <span className="truncate font-medium">{folderName}</span>
        </div>
      </div>

      <button
        onClick={() => {
          onRename(folderId);
          onClose();
        }}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
      >
        <Edit className="h-4 w-4" />
        Rename
      </button>

      <button
        onClick={() => {
          onPermissions(folderId);
          onClose();
        }}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
      >
        <Users className="h-4 w-4" />
        Permissions
      </button>

      <div className="border-t border-gray-100 my-1"></div>

      <button
        onClick={() => {
          onDelete(folderId);
          onClose();
        }}
        className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
      >
        <Trash2 className="h-4 w-4" />
        Delete
      </button>
    </div>
  );
};

export default FolderContextMenu;