'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Home } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { getApiBaseUrl } from '@/lib/config';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { Textarea } from '@/components/ui/textarea';
import FeedbackPanel from '@/components/admin/FeedbackPanel';
import OpenAiApiConfig from '@/components/admin/OpenAiApiConfig';
import UserList from '@/components/admin/UserList';
import SystemKBManager from '@/components/admin/SystemKBManager';
import SettingsManager from '@/components/admin/SettingsManager';
import ServerInfo from '@/components/admin/ServerInfo';
import AuditLogViewer from '@/components/admin/AuditLogViewer';
import KnowledgeGapsPanel from '@/components/admin/KnowledgeGapsPanel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Define Document Type
interface SystemKbDocument {
  _id: string;
  originalFileName: string;
  fileSize: number;
  uploadTimestamp: string;
}

// Define User Type for frontend display
interface AdminUser {
  _id: string;
  username: string;
  role: string;
  createdAt: string;
  // Add other non-sensitive fields as needed
}

// NEW: Define Usage Data Type
interface AdminUsageData {
  _id: string; // User ID
  username: string;
  role: string;
  usageMonthMarker?: string | null;
  currentMonthPromptTokens?: number;
  currentMonthCompletionTokens?: number;
  currentMonthCost?: number;
  totalTokens?: number; // Added in API response
}

// NEW: Define Grand Total Stats Type
interface SystemGrandTotals {
  totalSystemDocs: number;
  totalUserDocs: number;
  totalChatSessions: number;
  totalMessages: number;
}

// Helper function to format bytes
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// --- START: Dynamic Import for Branded PDF Viewer ---
const BrandedPdfViewer = dynamic(
  () => import('@/components/BrandedPdfViewer').then(mod => mod.default),
  {
    loading: () => (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500" />
          <p className="mt-4 text-gray-600">Loading PDF viewer...</p>
        </div>
      </div>
    ),
    ssr: false,
  }
);
// --- END: Dynamic Import ---

// --- Tab Content Component for Knowledge Base ---

interface KnowledgeBaseContentProps {
  isDocsLoading: boolean;
  documents: SystemKbDocument[];
  isAdminDragging: boolean;
  isUploading: boolean;
  uploadError: string | null;
  uploadProgress: string | null;
  selectedFiles: FileList | null;
  isDeletingAllSystemDocs: boolean;
  handleAdminDragEnter: (e: React.DragEvent<HTMLDivElement>) => void;
  handleAdminDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleAdminDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleAdminDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDeleteAllSystemDocuments: () => void;
  handleViewSystemKbDocument: (docId: string, filename: string) => void;
  handleDeleteDocument: (docId: string) => void;
  formatBytes: (bytes: number) => string;
}

const KnowledgeBaseContent: React.FC<KnowledgeBaseContentProps> = ({
  isDocsLoading,
  documents,
  isAdminDragging,
  isUploading,
  uploadError,
  uploadProgress,
  selectedFiles,
  isDeletingAllSystemDocs,
  handleAdminDragEnter,
  handleAdminDragLeave,
  handleAdminDragOver,
  handleAdminDrop,
  handleFileChange,
  handleDeleteAllSystemDocuments,
  handleViewSystemKbDocument,
  handleDeleteDocument,
  formatBytes,
}) => {
  return (
    <>
      <h2 className="text-2xl font-semibold mb-4">System KB Management</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h3 className="text-xl font-semibold mb-4">Upload System Documents</h3>
          <div
            onDragEnter={handleAdminDragEnter}
            onDragLeave={handleAdminDragLeave}
            onDragOver={handleAdminDragOver}
            onDrop={handleAdminDrop}
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 ease-in-out',
              'border-muted bg-background hover:border-muted-foreground/50', // Default
              isAdminDragging && 'border-primary bg-primary/10', // Dragging
              isUploading && 'opacity-50 cursor-not-allowed' // Uploading
            )}
          >
            <Input
              id="admin-file-upload"
              type="file"
              multiple
              onChange={handleFileChange}
              accept=".pdf,.txt"
              disabled={isUploading}
              className="hidden"
            />
            <Label
              htmlFor="admin-file-upload"
              className={cn(
                'flex flex-col items-center justify-center space-y-2',
                isUploading ? 'cursor-not-allowed' : 'cursor-pointer'
              )}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="font-medium">
                {isAdminDragging
                  ? 'Drop files here...'
                  : selectedFiles && selectedFiles.length > 0
                    ? `${selectedFiles.length} file(s) selected: ${Array.from(selectedFiles)
                        .map(f => f.name)
                        .join(', ')}`
                    : "Drag 'n' drop System KB files here, or click"}
              </span>
              {!selectedFiles && (
                <span className="text-xs text-muted-foreground">PDF or TXT only</span>
              )}
            </Label>

            {uploadError && <p className="mt-3 text-sm text-red-500">{uploadError}</p>}
            {isUploading && (
              <div className="flex flex-col items-center mt-4 space-y-2">
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="bg-primary h-2 animate-pulse"></div>
                </div>
                <div className="flex items-center justify-center">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  <span className="text-sm font-medium">{uploadProgress || 'Uploading...'}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-grow overflow-y-auto max-h-[calc(100vh-30rem)] border border-border rounded-md mt-6">
          <div className="flex justify-between items-center p-4 sticky top-0 bg-card z-10 border-b">
            <h3 className="text-lg font-semibold">
              {isDocsLoading
                ? 'Loading documents...'
                : `Existing System Documents (${documents.length})`}
            </h3>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isDeletingAllSystemDocs || documents.length === 0 || isDocsLoading}
                >
                  {isDeletingAllSystemDocs ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete All System KB Documents?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete all
                    <strong className="px-1">({documents.length})</strong>
                    system knowledge base documents and their associated vector data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeletingAllSystemDocs}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAllSystemDocuments}
                    disabled={isDeletingAllSystemDocs}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    {isDeletingAllSystemDocs ? 'Deleting...' : 'Confirm Delete All'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {isDocsLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : documents.length === 0 ? (
            <p className="p-4 text-center text-muted-foreground">No system documents found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map(doc => (
                  <TableRow key={doc._id}>
                    <TableCell
                      className="font-medium max-w-xs"
                      title={doc.originalFileName}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewSystemKbDocument(doc._id, doc.originalFileName);
                        }}
                        className="cursor-pointer text-primary hover:underline bg-transparent border-none p-0 text-left inline truncate max-w-full"
                      >
                        {doc.originalFileName}
                      </button>
                    </TableCell>
                    <TableCell>{formatBytes(doc.fileSize)}</TableCell>
                    <TableCell>{new Date(doc.uploadTimestamp).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDocument(doc._id);
                        }}
                        title="Delete Document"
                        className="text-destructive hover:text-destructive/80"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </>
  );
};

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoading } = useAuth();
  const isAuthenticated = !isLoading && !!user;

  const [documents, setDocuments] = useState<SystemKbDocument[]>([]);
  const [isDocsLoading, setIsDocsLoading] = useState<boolean>(true);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // --- State for User Management ---
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState<boolean>(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  // --- State for Delete User Dialog ---
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState<string | null>(null);

  // --- State for Change Password Dialog ---
  const [isChangePasswordDialogOpen, setIsChangePasswordDialogOpen] = useState<boolean>(false);
  const [userToUpdate, setUserToUpdate] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState<boolean>(false);

  // --- State for Create User Dialog ---
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState<boolean>(false);
  const [createUserForm, setCreateUserForm] = useState({
    username: '',
    email: '',
    role: 'user' as 'user' | 'admin',
    password: '',
  });
  const [isCreatingUser, setIsCreatingUser] = useState<boolean>(false);
  const [createUserError, setCreateUserError] = useState<string | null>(null);

  // --- State for Deleting All System Documents ---
  const [isDeletingAllSystemDocs, setIsDeletingAllSystemDocs] = useState(false);

  // --- NEW: State for User Usage Tab ---
  const [userUsageData, setUserUsageData] = useState<AdminUsageData[]>([]);
  const [isUsageLoading, setIsUsageLoading] = useState<boolean>(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  // --- NEW: State for System Grand Totals ---
  const [systemGrandTotals, setSystemGrandTotals] = useState<SystemGrandTotals | null>(null);
  const [isGrandTotalsLoading, setIsGrandTotalsLoading] = useState<boolean>(false);
  const [grandTotalsError, setGrandTotalsError] = useState<string | null>(null);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('allTime');

  // --- START NEW: State for Drag & Drop on Admin Page ---
  const [isAdminDragging, setIsAdminDragging] = useState(false);
  // --- END NEW: State for Drag & Drop on Admin Page ---

  // --- Cleanup effect to prevent dialog overlay from persisting on navigation ---
  useEffect(() => {
    return () => {
      // Close all dialogs when component unmounts
      setIsDeleteDialogOpen(false);
      setIsChangePasswordDialogOpen(false);
      setIsCreateUserDialogOpen(false);
      setIsAdminViewerOpen(false);
      // Clean up any lingering Radix UI portal elements
      if (typeof document !== 'undefined') {
        document.querySelectorAll('[data-radix-portal]').forEach(el => el.remove());
      }
    };
  }, []);

  // --- PDF Viewer State (Admin) ---
  const [adminPdfUrl, setAdminPdfUrl] = useState<string | null>(null);
  const [adminViewingDocName, setAdminViewingDocName] = useState<string>('');

  // --- State to control PDF Viewer Dialog ---
  const [isAdminViewerOpen, setIsAdminViewerOpen] = useState<boolean>(false);

  // --- NEW: State for System Prompt ---
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [isSystemPromptLoading, setIsSystemPromptLoading] = useState<boolean>(false);
  const [systemPromptError, setSystemPromptError] = useState<string | null>(null);
  const [isSavingSystemPrompt, setIsSavingSystemPrompt] = useState<boolean>(false);

  // --- START: State for Role Change Loading ---
  const [isUpdatingRole, setIsUpdatingRole] = useState<string | null>(null); // Store user ID being updated
  // --- END ---

  // --- START: State for Knowledge Gap Notification Badge ---
  const [knowledgeGapCount, setKnowledgeGapCount] = useState<number>(0);
  // --- END ---

  // --- Fetch knowledge gap count for notification badge ---
  const fetchKnowledgeGapCount = useCallback(async () => {
    if (!user || user.role !== 'admin') return;

    try {
      const response = await fetchWithAuth('/api/admin/knowledge-gaps/count', {
        method: 'GET',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setKnowledgeGapCount(data.count || 0);
        }
      }
    } catch (error) {
      console.error('[AdminPage] Error fetching knowledge gap count:', error);
    }
  }, [user]);

  // Fetch knowledge gap count on initial load
  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.role === 'admin') {
      fetchKnowledgeGapCount();
    }
  }, [fetchKnowledgeGapCount, isLoading, isAuthenticated, user]);

  // --- Document Fetching Logic (Refactored to standalone function) ---
  const fetchDocuments = useCallback(async () => {
    if (!user || user.role !== 'admin') return;

    console.log('[AdminPage] fetchDocuments: Starting API call for system KB documents');
    setIsDocsLoading(true);

    try {
      const response = await fetchWithAuth(`/api/admin/system-kb/documents`, {
        credentials: 'include',
      });

      if (!response.ok) {
        console.error(`Error fetching documents: ${response.status} ${response.statusText}`);
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Failed to parse error response.' }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }

      const responseData = await response.json(); // Get the full response object
      console.log('[AdminPage] fetchDocuments API response received:', {
        success: responseData.success,
        documentsCount: responseData.documents?.length || 0,
        documents: responseData.documents || [],
      });

      if (responseData.success && Array.isArray(responseData.documents)) {
        // Create a new documents array directly from the response to avoid state updates
        // being lost due to reference equality checks
        const newDocuments = [...responseData.documents];
        console.log('[AdminPage] Setting documents state with', newDocuments.length, 'documents');
        setDocuments(newDocuments);
      } else {
        console.error('[AdminPage] Invalid data structure received:', responseData);
        throw new Error(responseData.message || 'Invalid data structure received from API.');
      }
    } catch (error: unknown) {
      console.error('[AdminPage] Failed to fetch documents:', error);
      toast({
        title: 'Error Fetching Documents',
        description: error instanceof Error ? error.message : String(error) || 'An unexpected error occurred.',
        variant: 'destructive',
      });
      setDocuments([]);
    } finally {
      setIsDocsLoading(false);
      console.log('[AdminPage] fetchDocuments: Complete');
    }
  }, [user, toast]);

  // useEffect hook for initial document fetch - Now calls the standalone function
  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.role === 'admin') {
      console.log('[AdminPage] Initial useEffect calling fetchDocuments()');
      fetchDocuments();
    }
  }, [fetchDocuments, isLoading, isAuthenticated, user]);

  // Authentication/Authorization Check Effect
  useEffect(() => {
    // ProtectedRoute handles the base authentication check (isLoading, !user)
    // We just need to add the role check here
    if (!isLoading && user && user.role !== 'admin') {
      console.log('[AdminPage] User is not admin, redirecting...');
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to access this page.',
        variant: 'destructive',
      });
      router.replace('/'); // Redirect non-admins
    }
  }, [isLoading, user, router, toast]);

  // --- User Fetching Logic ---
  const fetchUsers = useCallback(async () => {
    if (!user || user.role !== 'admin') return;
    setIsUsersLoading(true);
    setUsersError(null);
    try {
      const response = await fetchWithAuth(`/api/admin/users`, { credentials: 'include' });
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Failed to parse error response.' }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }
      const responseData = await response.json();
      if (responseData.success && Array.isArray(responseData.users)) {
        setUsers(responseData.users);
      } else {
        throw new Error(responseData.message || 'Invalid user data structure received.');
      }
    } catch (error: unknown) {
      console.error('Failed to fetch users:', error);
      toast({ title: 'Error Fetching Users', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
      setUsersError(error instanceof Error ? error.message : String(error));
      setUsers([]);
    } finally {
      setIsUsersLoading(false);
    }
  }, [user, toast]);

  // --- NEW: Usage Fetching Logic ---
  const fetchUserUsage = useCallback(async () => {
    if (!user || user.role !== 'admin') return;
    setIsUsageLoading(true);
    setUsageError(null);
    try {
      const response = await fetchWithAuth(`/api/admin/usage`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Failed to parse error response.' }));
        if (response.status === 403) {
          throw new Error(errorData.message || 'Forbidden: Admin access required.');
        }
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }
      const responseData = await response.json();
      if (responseData.success && Array.isArray(responseData.usersUsage)) {
        setUserUsageData(responseData.usersUsage);
      } else {
        throw new Error(responseData.message || 'Invalid user usage data structure received.');
      }
    } catch (error: unknown) {
      console.error('Failed to fetch user usage data:', error);
      toast({
        title: 'Error Fetching Usage Data',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
      setUsageError(error instanceof Error ? error.message : String(error));
      setUserUsageData([]);
    } finally {
      setIsUsageLoading(false);
    }
  }, [user, toast]);

  // --- NEW: System Grand Totals Fetching Logic ---
  const fetchSystemGrandTotals = useCallback(async () => {
    if (!user || user.role !== 'admin') return;
    setIsGrandTotalsLoading(true);
    setGrandTotalsError(null);
    console.log(`[AdminPage] Fetching system grand totals for filter: ${selectedDateFilter}...`);

    let queryString = '';
    const today = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    switch (selectedDateFilter) {
      case 'last7days':
        endDate = new Date(today);
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 6); // 6 days ago to include today as 7th day
        break;
      case 'last30days':
        endDate = new Date(today);
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 29);
        break;
      case 'thisYear':
        endDate = new Date(today);
        startDate = new Date(today.getFullYear(), 0, 1); // January 1st of current year
        break;
      case 'allTime':
      default:
        // No date parameters needed for all time
        break;
    }

    if (startDate && endDate) {
      // Format dates as YYYY-MM-DD for the API query
      const formatDate = (date: Date) => date.toISOString().split('T')[0];
      queryString = `?startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}`;
    }

    try {
      const response = await fetchWithAuth(`/api/admin/stats/summary${queryString}`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Failed to parse error response.' }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }
      const responseData = await response.json();
      if (responseData.success && responseData.data) {
        setSystemGrandTotals(responseData.data);
        console.log('[AdminPage] System grand totals fetched:', responseData.data);
      } else {
        throw new Error(responseData.message || 'Invalid grand totals data structure received.');
      }
    } catch (error: unknown) {
      console.error('Failed to fetch system grand totals:', error);
      toast({
        title: 'Error Fetching Grand Totals',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
      setGrandTotalsError(error instanceof Error ? error.message : String(error));
      setSystemGrandTotals(null);
    } finally {
      setIsGrandTotalsLoading(false);
    }
  }, [user, toast, selectedDateFilter]);

  // useEffect to refetch grand totals when the date filter changes
  useEffect(() => {
    if (user?.role === 'admin') {
      // Check if the usage tab is active or if we want to fetch regardless of active tab for this specific filter change.
      // For now, let's assume we always want to refetch if the filter changes while admin is logged in.
      console.log(
        `[AdminPage] Date filter changed to ${selectedDateFilter}, refetching grand totals.`
      );
      fetchSystemGrandTotals();
    }
  }, [selectedDateFilter, fetchSystemGrandTotals, user]); // fetchSystemGrandTotals is included as it's a useCallback dependency

  // --- NEW: System Prompt Fetching Logic ---
  const fetchSystemPrompt = useCallback(async () => {
    if (!user || user.role !== 'admin') return;

    console.log('[Admin System] Fetching system prompt...');
    setIsSystemPromptLoading(true);
    setSystemPromptError(null);
    try {
      const response = await fetchWithAuth(`/api/settings/system-prompt`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Failed to parse error response.' }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }
      const data = await response.json();
      if (data.success && typeof data.prompt === 'string') {
        setSystemPrompt(data.prompt);
      } else {
        throw new Error(data.message || 'Invalid data structure for system prompt.');
      }
    } catch (error: unknown) {
      console.error('[Admin System] Failed to fetch system prompt:', error);
      setSystemPromptError(error instanceof Error ? error.message : String(error));
      toast({
        title: 'Error Fetching System Prompt',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsSystemPromptLoading(false);
    }
  }, [user, toast]);

  // --- START: Role Update API Call Logic ---
  const handleSetRole = async (userId: string, newRole: 'admin' | 'user') => {
    if (!user || user.role !== 'admin') {
      toast({ title: 'Error', description: 'Only admins can change roles.' });
      return;
    }
    if (user._id === userId) {
      toast({ title: 'Action Denied', description: 'Cannot change your own role.' });
      return; // Prevent API call if UI somehow allowed it
    }

    console.log(`[Admin] Attempting to set role for user ${userId} to ${newRole}`);
    setIsUpdatingRole(userId); // Set loading state for this specific user

    const apiUrl = `/api/admin/users/${userId}/role`;

    try {
      const response = await fetchWithAuth(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ role: newRole }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error(`[Admin Set Role] API Error (${response.status}):`, result);
        throw new Error(result.message || `Failed to update role (HTTP ${response.status})`);
      }

      console.log(`[Admin Set Role] Success for user ${userId}. Result:`, result);
      toast({ title: 'Success', description: `User role updated to ${newRole}.` });

      // Refresh the user list to show the change
      await fetchUsers();
    } catch (error: unknown) {
      console.error(`[Admin Set Role] Failed for user ${userId}:`, error);
      toast({ title: 'Error Updating Role', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
      // Optionally: Revert UI state if doing optimistic updates (not implemented here)
    } finally {
      setIsUpdatingRole(null); // Clear loading state regardless of outcome
    }
  };
  // --- END ---

  // --- Trigger data fetch based on active tab ---
  const handleTabChange = (value: string) => {
    console.log('[AdminPage] Tab changed to:', value);
    if (value === 'users' && users.length === 0) {
      // Fetch users only if tab is selected and not already loaded
      fetchUsers();
    } else if (value === 'system-kb') {
      console.log('[AdminPage] Knowledge base tab selected, fetching documents');
      fetchDocuments(); // Always fetch documents when this tab is selected
    } else if (value === 'usage') {
      // Fetch usage data
      if (userUsageData.length === 0) fetchUserUsage();
      // Always fetch grand totals for usage tab, will respect current filter
      fetchSystemGrandTotals();
    } else if (value === 'settings' && !systemPrompt && !isSystemPromptLoading) {
      // Fetch system prompt - Fixed: was checking for 'system' instead of 'settings'
      fetchSystemPrompt();
    }
    // Add logic for other tabs if needed
  };

  // --- Create User Logic ---
  const handleCreateUser = async () => {
    // Reset error state
    setCreateUserError(null);

    // Validation
    if (!createUserForm.username.trim()) {
      setCreateUserError('Username is required');
      return;
    }

    // Password validation (optional)
    if (createUserForm.password && createUserForm.password.length < 6) {
      setCreateUserError('Password must be at least 6 characters long if provided.');
      return;
    }

    // Basic email validation (only if email provided)
    if (createUserForm.email.trim()) {
      const emailRegex = /^\S+@\S+\.\S+$/;
      if (!emailRegex.test(createUserForm.email)) {
        setCreateUserError('Invalid email format');
        return;
      }
    }

    setIsCreatingUser(true);

    try {
      // Construct payload, conditionally including password
      const payload: {
        username: string;
        email: string;
        role: 'user' | 'admin';
        password?: string;
      } = {
        username: createUserForm.username.trim(),
        email: createUserForm.email.trim(),
        role: createUserForm.role,
      };
      if (createUserForm.password) {
        payload.password = createUserForm.password;
      }

      const response = await fetchWithAuth(`/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || `Failed to create user (HTTP ${response.status})`);
      }

      console.log('[Admin Create User] Success:', result);

      // Show success toast with email status
      toast({
        title: 'User Created Successfully',
        description: result.emailSent
          ? `User "${createUserForm.username}" created and welcome email sent.`
          : `User "${createUserForm.username}" created. Warning: Welcome email could not be sent.`,
        variant: result.emailSent ? 'default' : 'destructive',
      });

      // Reset form and close dialog
      setCreateUserForm({
        username: '',
        email: '',
        role: 'user',
        password: '',
      });
      setIsCreateUserDialogOpen(false);

      // Refresh the user list
      await fetchUsers();
    } catch (error: unknown) {
      console.error('[Admin Create User] Error:', error);
      setCreateUserError(error instanceof Error ? error.message : String(error) || 'Failed to create user');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (
      !window.confirm(
        'Are you sure you want to delete this document? This action cannot be undone.'
      )
    ) {
      return;
    }

    console.log(`[Admin Delete] Attempting to delete document: ${docId}`);

    try {
      const response = await fetchWithAuth(`/api/admin/system-kb/documents/${docId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        console.log(`[Admin Delete] Document ${docId} deleted successfully. Response:`, result);
        toast({
          title: 'Success',
          description: result?.message || 'Document deleted successfully.',
        });

        // Refresh the documents list after deletion instead of just updating the state
        fetchDocuments();
      } else {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Failed to parse error response.' }));
        console.error(
          `[Admin Delete] Error deleting document ${docId}: ${response.status}`,
          errorData
        );
        toast({
          title: 'Error Deleting Document',
          description:
            errorData.message || `Failed to delete document (Status: ${response.status})`,
          variant: 'destructive',
        });
      }
    } catch (error: unknown) {
      console.error(`[Admin Delete] Network or other error deleting document ${docId}:`, error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : String(error) || 'An unexpected error occurred during deletion.',
        variant: 'destructive',
      });
    }
  };

  // Reusable validation logic for admin uploads
  const validateAdminFiles = (files: FileList): boolean => {
    const allowedTypes = ['application/pdf', 'text/plain']; // Define allowed types for system KB
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!allowedTypes.includes(f.type)) {
        setUploadError(`Invalid file type: ${f.name}. Only PDF or TXT allowed for System KB.`);
        setSelectedFiles(null);
        return false;
      }
      // Optional: Add size limit specific to admin uploads if needed
      // if (f.size > 20 * 1024 * 1024) { // Example: 20MB limit
      //   setUploadError(`File too large: ${f.name}. Max size is 20MB.`);
      //   setSelectedFiles(null);
      //   return false;
      // }
    }
    setUploadError(null); // Clear previous errors if validation passes
    return true;
  };

  // Handle file selection from the input button
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      if (validateAdminFiles(files)) {
        setSelectedFiles(files);
        console.log(`[Admin Upload] Selected ${files.length} files via input.`);
        // Automatically trigger upload
        setTimeout(() => {
          const validFiles = event.target.files;
          if (validFiles && validFiles.length > 0) {
            handleUpload(validFiles);
          }
        }, 0);
      }
    } else {
      setSelectedFiles(null);
    }
  };

  // --- START: Drag & Drop Handlers for Admin ---
  const handleAdminDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsAdminDragging(true);
    }
  };

  const handleAdminDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsAdminDragging(false);
  };

  const handleAdminDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleAdminDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsAdminDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      console.log(`[Admin Upload] ${files.length} file(s) dropped.`);
      if (validateAdminFiles(files)) {
        setSelectedFiles(files);
        // Automatically trigger upload
        handleUpload(files);
      }
      if (e.dataTransfer.items) {
        e.dataTransfer.items.clear();
      } else {
        e.dataTransfer.clearData();
      }
    }
  };
  // --- END: Drag & Drop Handlers for Admin ---

  const handleUpload = async (filesToUpload?: FileList | null) => {
    const files = filesToUpload || selectedFiles;
    if (!files || files.length === 0) {
      setUploadError('Please select one or more files to upload.');
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(`Starting upload of ${files.length} file(s)...`);

    let errorCount = 0;
    const uploadErrors: string[] = [];

    // Track successful uploads to potentially add them directly to state
    const successfulUploads: SystemKbDocument[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Uploading file ${i + 1} of ${files.length}: ${file.name}...`);
      console.log(`[Admin Upload] Attempting to upload file: ${file.name}`);

      const formData = new FormData();
      formData.append('file', file);

      // For FormData, manually add Authorization header (fetchWithAuth would add Content-Type which breaks multipart)
      const apiUrl = `${getApiBaseUrl()}/api/admin/system-kb/upload`;
      const token = localStorage.getItem('accessToken');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: formData,
        });

        const result = await response.json();

        if (response.ok && result.success) {
          console.log(`[Admin Upload] File ${file.name} uploaded successfully. Response:`, result);

          // If the API returns the document object, we can use it to update the UI immediately
          if (result.document) {
            successfulUploads.push(result.document);
          }

          toast({
            title: 'Upload Success',
            description: `${file.name}: ${result.message || 'File uploaded successfully.'}`,
          });
        } else {
          console.error(
            `[Admin Upload] Error uploading file ${file.name}: ${response.status}`,
            result
          );
          const errorMsg = `${file.name}: ${result.message || 'Failed to upload file.'}`;
          uploadErrors.push(errorMsg);
          errorCount++;
          toast({
            title: 'Upload Failed',
            description: errorMsg,
            variant: 'destructive',
          });
        }
      } catch (error: unknown) {
        console.error(`[Admin Upload] Network or other error uploading ${file.name}:`, error);
        const errorMsg = `${file.name}: ${error instanceof Error ? error.message : String(error) || 'An unexpected network error occurred.'}`;
        uploadErrors.push(errorMsg);
        errorCount++;
        toast({
          title: 'Upload Error',
          description: errorMsg,
          variant: 'destructive',
        });
      }
    }

    setIsUploading(false);
    setUploadProgress(null);

    if (errorCount > 0) {
      setUploadError(
        `Upload complete with ${errorCount} error(s). See details above or in console.`
      );
    } else {
      setUploadError(null);
    }

    setSelectedFiles(null);
    const fileInput = document.getElementById('system-kb-file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';

    // Optimistic update if we have successful uploads with document data
    if (successfulUploads.length > 0) {
      console.log('[Admin Upload] Adding successful uploads to UI immediately:', successfulUploads);
      setDocuments(prevDocs => [...successfulUploads, ...prevDocs]);
    }

    // Use a short timeout before fetching documents to ensure the backend has time
    // to complete any database operations
    console.log('[Admin Upload] Scheduling document refresh after upload');
    setTimeout(() => {
      console.log('[Admin Upload] Executing delayed document refresh');
      fetchDocuments();
    }, 500);
  };

  // --- Delete User Handlers ---
  const openDeleteUserConfirm = (userObj: AdminUser) => {
    console.log(`[Admin Users] openDeleteUserConfirm called for user: ${userObj.username}`);
    setUserToDelete(userObj);
    setIsDeleteDialogOpen(true);
    console.log('[Admin Users] setIsDeleteDialogOpen set to true. User to delete:', userObj);
  };

  const closeDeleteUserConfirm = () => {
    setUserToDelete(null);
    setIsDeleteDialogOpen(false);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    // Set the loading state for the specific user being deleted
    setIsDeletingUser(userToDelete._id);

    try {
      const response = await fetchWithAuth(`/api/admin/users/${userToDelete._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const result = await response.json(); // Attempt to parse JSON regardless of status

      if (response.ok && result.success) {
        console.log(`[Admin Users] Successfully deleted user: ${userToDelete.username}`);
        toast({ title: 'Success', description: result.message || 'User deleted successfully.' });
        fetchUsers(); // Refresh the user list
        closeDeleteUserConfirm(); // Close the dialog
      } else {
        console.error(
          `[Admin Users] Error deleting user ${userToDelete.username}: ${response.status}`,
          result
        );
        toast({
          title: 'Error Deleting User',
          description: result.message || `Failed to delete user (Status: ${response.status})`,
          variant: 'destructive',
        });
        // Keep dialog open on error?
        // closeDeleteUserConfirm();
      }
    } catch (error: unknown) {
      console.error(
        `[Admin Users] Network or other error deleting user ${userToDelete.username}:`,
        error
      );
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : String(error) || 'An unexpected error occurred during deletion.',
        variant: 'destructive',
      });
      // Keep dialog open on error?
      // closeDeleteUserConfirm();
    } finally {
      // Reset the loading state regardless of success or failure
      setIsDeletingUser(null);
    }
  };

  // --- Change Password Handlers ---
  const openChangePasswordDialog = (userObj: AdminUser) => {
    setUserToUpdate(userObj);
    setNewPassword(''); // Clear fields on open
    setConfirmPassword('');
    setPasswordChangeError(null);
    setIsChangePasswordDialogOpen(true);
  };

  const closeChangePasswordDialog = () => {
    setUserToUpdate(null);
    setIsChangePasswordDialogOpen(false);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordChangeError(null);
  };

  const handleChangePassword = async () => {
    if (!userToUpdate) {
      setPasswordChangeError('Cannot update password. User data missing.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordChangeError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordChangeError('Passwords do not match.');
      return;
    }

    setPasswordChangeError(null);
    setIsUpdatingPassword(true);
    console.log(
      `[Admin Users] Attempting to change password for user: ${userToUpdate.username} (ID: ${userToUpdate._id})`
    );

    try {
      const response = await fetchWithAuth(`/api/admin/users/${userToUpdate._id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ newPassword: newPassword }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log(
          `[Admin Users] Successfully changed password for user: ${userToUpdate.username}`
        );
        toast({
          title: 'Success',
          description: result.message || 'User password updated successfully.',
        });
        closeChangePasswordDialog(); // Close the dialog on success
      } else {
        console.error(
          `[Admin Users] Error changing password for ${userToUpdate.username}: ${response.status}`,
          result
        );
        setPasswordChangeError(
          result.message || `Failed to change password (Status: ${response.status})`
        );
        // Keep dialog open on error
      }
    } catch (error: unknown) {
      console.error(
        `[Admin Users] Network or other error changing password for ${userToUpdate.username}:`,
        error
      );
      setPasswordChangeError(error instanceof Error ? error.message : String(error) || 'An unexpected network error occurred.');
      // Keep dialog open on error
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // --- START: Handler for Deleting ALL System KB Documents ---
  const handleDeleteAllSystemDocuments = async () => {
    if (!user || user?.role !== 'admin') {
      toast({ variant: 'destructive', title: 'Error', description: 'Unauthorized.' });
      return;
    }
    setIsDeletingAllSystemDocs(true);
    console.log('[Admin Delete All System Docs] Initiating deletion...');

    try {
      const response = await fetchWithAuth(`/api/admin/system-kb/all`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const result = await response.json(); // Assume backend sends JSON response

      if (!response.ok) {
        throw new Error(result.message || `Failed to delete documents (${response.status})`);
      }

      console.log('[Admin Delete All System Docs] Success:', result);
      toast({
        title: 'Success',
        description: result.message || 'All System KB documents deleted.',
      });

      // Explicitly refresh the document list after deletion
      fetchDocuments();
    } catch (error: unknown) {
      console.error('[Admin Delete All System Docs] Error:', error);
      toast({
        variant: 'destructive',
        title: 'Error Deleting System KB',
        description: error instanceof Error ? error.message : String(error) || 'An unknown error occurred.',
      });
    } finally {
      setIsDeletingAllSystemDocs(false);
    }
  };
  // --- END: Handler for Deleting ALL System KB Documents ---

  // --- VIEW SYSTEM KB DOC ---
  const handleViewSystemKbDocument = async (docId: string, filename: string) => {
    // Add log at the very start
    console.log(`[Admin Viewer] Attempting to view system doc ID: ${docId}, filename: ${filename}`);
    setAdminPdfUrl(null);
    setAdminViewingDocName(filename);

    // No need to check for token from localStorage since we're using HttpOnly cookies

    // --- CHANGE: Use streaming endpoint to bypass S3 CORS ---
    const fetchUrl = `/api/system-kb/stream/${docId}`;
    // --- END CHANGE ---

    // Log BEFORE fetch
    console.log(`[Admin Viewer] Preparing to fetch from URL: ${fetchUrl}.`);

    try {
      // Fetch only requires credentials option here, GET is default
      const response = await fetchWithAuth(fetchUrl, { credentials: 'include' });

      // Log AFTER fetch, BEFORE check
      console.log(
        `[Admin Viewer] Fetch completed. Status: ${response.status}, OK: ${response.ok}, Type: ${response.type}, Content-Type Header: ${response.headers.get('Content-Type')}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[Admin Viewer] Fetch failed! Status: ${response.status}, Body: ${errorText}`
        );
        throw new Error(`Failed to fetch PDF (${response.status}): ${errorText}`);
      }

      const blob = await response.blob();
      console.log(`[Admin Viewer] Received blob. Type: ${blob.type}, Size: ${blob.size}`);
      if (blob.type !== 'application/pdf') {
        console.warn(`[Admin Viewer] Blob type is not application/pdf. Attempting to load anyway.`);
        // Consider if you need specific error handling for non-PDFs
      }
      const url = URL.createObjectURL(blob);
      setAdminPdfUrl(url);
      // --- Add log after state updates ---
      console.log(`[Admin Viewer State Updated] pdfUrl state should be set now. Name: ${filename}`);
      const objectUrl = URL.createObjectURL(blob);
      console.log(`[Admin Viewer] Created Object URL: ${objectUrl}`);
      setAdminPdfUrl(objectUrl);
      setAdminViewingDocName(filename); // Set name before opening
      setIsAdminViewerOpen(true); // Open the modal
    } catch (err: unknown) {
      console.error('[Admin Viewer] Error during fetch/blob processing:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: 'Error Loading Document',
        description: `Failed to load document: ${errorMessage}`,
        variant: 'destructive',
      });
      setAdminPdfUrl(null);
      setAdminViewingDocName('');
      setIsAdminViewerOpen(false); // Don't open modal on error
    }
  };

  // --- NEW: Save System Prompt Handler ---
  const handleSaveSystemPrompt = async () => {
    if (!systemPrompt.trim()) {
      toast({
        title: 'Validation Error',
        description: 'System prompt cannot be empty.',
        variant: 'destructive',
      });
      return;
    }
    if (!user || user.role !== 'admin') {
      toast({ title: 'Error', description: 'Unauthorized.', variant: 'destructive' });
      return;
    }

    console.log('[Admin System] Saving system prompt...');
    setIsSavingSystemPrompt(true);
    try {
      const response = await fetchWithAuth(`/api/settings/system-prompt`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ prompt: systemPrompt }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log('[Admin System] System prompt saved successfully.');
        toast({ title: 'Success', description: 'System prompt updated successfully.' });
        // Optional: Update state again if response contains updated prompt, though not strictly necessary here
        if (result.prompt) setSystemPrompt(result.prompt);
      } else {
        throw new Error(
          result.message || `Failed to save system prompt (Status: ${response.status})`
        );
      }
    } catch (error: unknown) {
      console.error('[Admin System] Error saving system prompt:', error);
      toast({ title: 'Error Saving Prompt', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setIsSavingSystemPrompt(false);
    }
  };

  // Wrap main content in ProtectedRoute
  return (
    <ProtectedRoute>
      {/* Add a check here to render null or loading *while* the role check effect runs and potentially redirects */}
      {!user || user.role !== 'admin' ? (
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Verifying admin access...</span>
        </div>
      ) : (
        // Render actual admin content only if user exists and role is admin
        <div className="flex flex-col h-screen bg-background">
          {/* Header */}
          <header className="flex items-center justify-between p-4 border-b flex-shrink-0">
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <Link href="/">
              <Button variant="outline" size="sm">
                <Home className="mr-2 h-4 w-4" />
                Back to Chat
              </Button>
            </Link>
          </header>

          {/* Main Content with Scrollable Area */}
          <div className="flex-1 overflow-hidden">
            <Tabs
              defaultValue="system-kb"
              onValueChange={handleTabChange}
              className="h-full flex flex-col"
            >
              <TabsList className="m-4 mb-0 flex-shrink-0">
                <TabsTrigger value="system-kb" data-help-id="admin-system-kb">System KB</TabsTrigger>
                <TabsTrigger value="users" data-help-id="admin-users">Users</TabsTrigger>
                <TabsTrigger value="usage" data-help-id="admin-usage">Usage</TabsTrigger>
                <TabsTrigger value="audit-logs" data-help-id="admin-audit-logs">Audit Logs</TabsTrigger>
                <TabsTrigger value="knowledge-gaps" data-help-id="admin-knowledge-gaps" className="relative">
                  Knowledge Gaps
                  {knowledgeGapCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                      {knowledgeGapCount > 99 ? '99+' : knowledgeGapCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="feedback" data-help-id="admin-feedback">Feedback</TabsTrigger>
                <TabsTrigger value="settings" data-help-id="admin-settings">Settings</TabsTrigger>
              </TabsList>

              {/* Scrollable Tab Content */}
              <div className="flex-1 overflow-y-auto p-4">
                <TabsContent value="system-kb" className="mt-0">
                  <SystemKBManager />
                </TabsContent>

                <TabsContent value="users" className="mt-0">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-semibold">User Management</h2>
                    <Button onClick={() => setIsCreateUserDialogOpen(true)}>Create New User</Button>
                  </div>
                  {isUsersLoading ? (
                    // Skeleton Table for Users
                    <div className="relative overflow-y-auto border rounded-md">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                          <TableRow>
                            <TableHead>Username</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Created At</TableHead>
                            <TableHead className="text-right pr-4">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from({ length: 5 }).map((_, index) => (
                            <TableRow key={`user-skeleton-${index}`}>
                              <TableCell>
                                <Skeleton className="h-6 w-40" />
                              </TableCell>
                              <TableCell>
                                <Skeleton className="h-6 w-20" />
                              </TableCell>
                              <TableCell>
                                <Skeleton className="h-6 w-24" />
                              </TableCell>
                              <TableCell className="text-right space-x-1">
                                <Skeleton className="h-8 w-16 inline-block" />
                                <Skeleton className="h-8 w-16 inline-block" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : usersError ? (
                    <p className="text-red-600">Error loading users: {usersError}</p>
                  ) : users.length === 0 ? (
                    <p>No users found.</p>
                  ) : (
                    // Actual User Table
                    <div className="relative overflow-y-auto border rounded-md">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                          <TableRow>
                            <TableHead>Username</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Created At</TableHead>
                            <TableHead className="text-right pr-4">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.map(rowUser => (
                            <TableRow key={rowUser._id}>
                              <TableCell>{rowUser.username}</TableCell>
                              <TableCell>{rowUser.role}</TableCell>
                              <TableCell>
                                {new Date(rowUser.createdAt).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-right">
                                {/* Conditional Rendering for Role Change Button */}
                                {user &&
                                  user._id !== rowUser._id && ( // Ensure logged-in admin cannot change their own role
                                    <>
                                      {
                                        rowUser.role === 'user' ? (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleSetRole(rowUser._id, 'admin')}
                                            disabled={isUpdatingRole === rowUser._id}
                                            className="mr-2" // Add margin if needed
                                          >
                                            {isUpdatingRole === rowUser._id ? (
                                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : null}
                                            Make Admin
                                          </Button>
                                        ) : rowUser.role === 'admin' ? (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleSetRole(rowUser._id, 'user')}
                                            disabled={isUpdatingRole === rowUser._id}
                                            className="mr-2" // Add margin if needed
                                          >
                                            {isUpdatingRole === rowUser._id ? (
                                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : null}
                                            Make User
                                          </Button>
                                        ) : null /* Render nothing if role is unexpected */
                                      }

                                      {/* Change Password Button (Remains unchanged) */}
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => openChangePasswordDialog(rowUser)}
                                        className="mr-2"
                                      >
                                        Change Password
                                      </Button>

                                      {/* Delete User Button (Remains unchanged) */}
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => openDeleteUserConfirm(rowUser)}
                                        disabled={isDeletingUser === rowUser._id}
                                      >
                                        {isDeletingUser === rowUser._id ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : null}
                                        Delete User
                                      </Button>
                                    </>
                                  )}
                                {/* Add a placeholder or message if the user IS the logged-in admin */}
                                {user && user._id === rowUser._id && (
                                  <span className="text-xs text-muted-foreground italic">
                                    (Current Admin)
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="usage" className="mt-0">
                  <div className="space-y-8">
                    {/* Section for Overall System Stats */}
                    <div className="bg-card p-6 rounded-lg shadow">
                      <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold">Overall System Statistics</h2>
                        <Select value={selectedDateFilter} onValueChange={setSelectedDateFilter}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select date range" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="allTime">All Time</SelectItem>
                            <SelectItem value="last7days">Last 7 Days</SelectItem>
                            <SelectItem value="last30days">Last 30 Days</SelectItem>
                            <SelectItem value="thisYear">This Year</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {isGrandTotalsLoading ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {Array.from({ length: 4 }).map((_, idx) => (
                            <div key={idx} className="p-4 border rounded-lg bg-background">
                              <Skeleton className="h-5 w-3/4 mb-2" />
                              <Skeleton className="h-8 w-1/2" />
                            </div>
                          ))}
                        </div>
                      ) : grandTotalsError ? (
                        <p className="text-destructive">
                          Error loading system totals: {grandTotalsError}
                        </p>
                      ) : systemGrandTotals ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                          <div className="p-4 border rounded-lg bg-background shadow-sm">
                            <p className="text-sm text-muted-foreground">System KB Docs</p>
                            <p className="text-2xl font-bold">
                              {systemGrandTotals.totalSystemDocs.toLocaleString()}
                            </p>
                          </div>
                          <div className="p-4 border rounded-lg bg-background shadow-sm">
                            <p className="text-sm text-muted-foreground">User Docs</p>
                            <p className="text-2xl font-bold">
                              {systemGrandTotals.totalUserDocs.toLocaleString()}
                            </p>
                          </div>
                          <div className="p-4 border rounded-lg bg-background shadow-sm">
                            <p className="text-sm text-muted-foreground">Chat Sessions</p>
                            <p className="text-2xl font-bold">
                              {systemGrandTotals.totalChatSessions.toLocaleString()}
                            </p>
                          </div>
                          <div className="p-4 border rounded-lg bg-background shadow-sm">
                            <p className="text-sm text-muted-foreground">Total Messages</p>
                            <p className="text-2xl font-bold">
                              {systemGrandTotals.totalMessages.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p>No system totals data available.</p>
                      )}
                    </div>

                    {/* Existing Monthly Usage Statistics Section */}
                    <div className="bg-card p-6 rounded-lg shadow">
                      <h2 className="text-xl font-semibold mb-4">
                        Monthly Usage Statistics (Per User)
                      </h2>
                      {isUsageLoading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-8 w-full" />
                          <Skeleton className="h-8 w-full" />
                          <Skeleton className="h-8 w-full" />
                        </div>
                      ) : usageError ? (
                        <p className="text-destructive">Error loading usage data: {usageError}</p>
                      ) : (
                        <>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Username</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Month</TableHead>
                                <TableHead className="text-right">Prompt Tokens</TableHead>
                                <TableHead className="text-right">Completion Tokens</TableHead>
                                <TableHead className="text-right">Total Tokens</TableHead>
                                <TableHead className="text-right">Est. Cost (USD)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {userUsageData.length === 0 ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={7}
                                    className="text-center text-muted-foreground"
                                  >
                                    No usage data available.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                userUsageData.map(usage => (
                                  <TableRow key={usage._id}>
                                    <TableCell className="font-medium">{usage.username}</TableCell>
                                    <TableCell>{usage.role}</TableCell>
                                    <TableCell>{usage.usageMonthMarker || '-'}</TableCell>
                                    <TableCell className="text-right">
                                      {(usage.currentMonthPromptTokens || 0).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {(usage.currentMonthCompletionTokens || 0).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right font-semibold">
                                      {(usage.totalTokens || 0).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      ${(usage.currentMonthCost || 0).toFixed(6)}
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                              {userUsageData.length > 0 && (
                                <TableRow className="bg-muted/50 font-semibold">
                                  <TableCell colSpan={3} className="text-right">
                                    Totals:
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {userUsageData
                                      .reduce((acc, u) => acc + (u.currentMonthPromptTokens || 0), 0)
                                      .toLocaleString()}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {userUsageData
                                      .reduce(
                                        (acc, u) => acc + (u.currentMonthCompletionTokens || 0),
                                        0
                                      )
                                      .toLocaleString()}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {userUsageData
                                      .reduce((acc, u) => acc + (u.totalTokens || 0), 0)
                                      .toLocaleString()}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    $
                                    {userUsageData
                                      .reduce((acc, u) => acc + (u.currentMonthCost || 0), 0)
                                      .toFixed(6)}
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="audit-logs" className="mt-0">
                  <AuditLogViewer />
                </TabsContent>

                <TabsContent value="knowledge-gaps" className="mt-0">
                  <KnowledgeGapsPanel onNewGapCountChange={setKnowledgeGapCount} />
                </TabsContent>

                <TabsContent value="feedback" className="mt-0">
                  <FeedbackPanel />
                </TabsContent>

                <TabsContent value="settings" className="mt-0">
                  <SettingsManager />
                </TabsContent>
              </div>
            </Tabs>

            {/* --- Delete User Confirmation Dialog --- */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the user
                    <strong className="px-1">{userToDelete?.username || ''}</strong>
                    and remove their data from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    onClick={closeDeleteUserConfirm}
                    disabled={isDeletingUser !== null}
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteUser}
                    disabled={isDeletingUser !== null}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeletingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Delete User
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* --- Change Password Dialog --- */}
            <Dialog open={isChangePasswordDialogOpen} onOpenChange={setIsChangePasswordDialogOpen}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Change Password for {userToUpdate?.username || 'User'}</DialogTitle>
                  <DialogDescription>
                    Enter a new password for the user below. Click save when you're done.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="newPassword" className="text-right">
                      New Password
                    </Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="col-span-3"
                      disabled={isUpdatingPassword}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="confirmPassword" className="text-right">
                      Confirm Password
                    </Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="col-span-3"
                      disabled={isUpdatingPassword}
                    />
                  </div>
                  {passwordChangeError && (
                    <p className="col-span-4 text-sm text-red-600 text-center">
                      {passwordChangeError}
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isUpdatingPassword}
                      onClick={closeChangePasswordDialog}
                    >
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    type="submit"
                    onClick={handleChangePassword}
                    disabled={isUpdatingPassword}
                  >
                    {isUpdatingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Changes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Branded PDF Viewer (Used for System KB documents) */}
            {isAdminViewerOpen && adminPdfUrl && (
              <BrandedPdfViewer
                fileUrl={adminPdfUrl}
                title={adminViewingDocName}
                onClose={() => {
                  setIsAdminViewerOpen(false);
                  // Revoke object URL when closing the viewer
                  if (adminPdfUrl) {
                    URL.revokeObjectURL(adminPdfUrl);
                    setAdminPdfUrl(null);
                  }
                }}
                initialPageNumber={1}
                showDownload={true}
              />
            )}

            {/* --- Create User Dialog --- */}
            <Dialog open={isCreateUserDialogOpen} onOpenChange={setIsCreateUserDialogOpen}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Create New User</DialogTitle>
                  <DialogDescription>
                    Fill in the details for the new user. Share credentials directly with the user.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="username-create">Username</Label>
                    <Input
                      id="username-create"
                      value={createUserForm.username}
                      onChange={e =>
                        setCreateUserForm({ ...createUserForm, username: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-create">Email</Label>
                    <Input
                      id="email-create"
                      type="email"
                      value={createUserForm.email}
                      onChange={e =>
                        setCreateUserForm({ ...createUserForm, email: e.target.value })
                      }
                      placeholder="Placeholder email (optional)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password-create">Password</Label>
                    <Input
                      id="password-create"
                      type="password"
                      value={createUserForm.password}
                      onChange={e =>
                        setCreateUserForm({ ...createUserForm, password: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role-create">Role</Label>
                    <Select
                      value={createUserForm.role}
                      onValueChange={(value: 'user' | 'admin') =>
                        setCreateUserForm({ ...createUserForm, role: value })
                      }
                      disabled={isCreatingUser}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {createUserError && (
                    <p className="text-sm text-red-500 dark:text-red-400 font-medium text-center">{createUserError}</p>
                  )}
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isCreatingUser}
                      onClick={() => {
                        setCreateUserForm({ username: '', email: '', role: 'user', password: '' });
                        setCreateUserError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit" onClick={handleCreateUser} disabled={isCreatingUser}>
                    {isCreatingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create User
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
