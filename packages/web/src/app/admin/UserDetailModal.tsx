import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, Eye, Trash2 } from 'lucide-react'; // Import icons
import PdfViewerModal from '@/components/admin/PdfViewerModal'; // Import the new component
// Import AlertDialog components
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
// Import Tooltip components
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// --- START: Define Local Frontend Types ---
interface AdminUser {
  _id: string;
  username: string;
  email?: string | null; // Optional since some users may not have email
  role: string;
  createdAt: string; // Or Date
}

// Keep local AdminSubmission as it's not in packages/types/auth
export interface AdminSubmission {
  _id: string;
  originalFilename: string;
  status: string;
  submittedAt?: string; // Or Date
  fileSizeBytes?: number;
  mimeType?: string;
  submittedByUserId?: string;
}
// --- END: Define Local Frontend Types ---

interface UserDetailModalProps {
  user: AdminUser | null; // Uses IMPORTED AdminUser
  submissions: AdminSubmission[]; // Uses local AdminSubmission
  onClose: () => void;
  onSubmissionDeleted?: (deletedId: string) => void; // ADDED callback prop
}

const UserDetailModal = ({
  user,
  submissions,
  onClose,
  onSubmissionDeleted,
}: UserDetailModalProps) => {
  // --- START: Log props on change ---
  useEffect(() => {
    console.log('[UserDetailModal Props Update] Received User:', user);
    console.log('[UserDetailModal Props Update] Received Submissions Count:', submissions?.length);
  }, [user, submissions]);
  // --- END: Log props on change ---

  // --- START: State for PDF Viewer ---
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null);
  const [pdfTitle, setPdfTitle] = useState<string>(''); // For modal title
  // --- END: State for PDF Viewer ---

  // --- START: State for Deletion Target ---
  const [submissionToDelete, setSubmissionToDelete] = useState<string | null>(null);
  // --- END: State for Deletion Target ---

  if (!user) return null;

  const filteredSubmissions = submissions.filter(sub => {
    const userIdString = String(user?._id);
    const subUserIdString = String(sub?.submittedByUserId);

    const isMatch = userIdString === subUserIdString;
    return isMatch;
  });

  console.log('[UserDetailModal] Final filteredSubmissions:', filteredSubmissions);

  // --- START: Handler for View Button ---
  const handleViewPdf = (submission: AdminSubmission) => {
    const url = `/api/submissions/file/${submission._id}`;
    console.log('[UserDetailModal] Setting PDF viewer URL:', url);
    setPdfFileUrl(url);
    setPdfTitle(submission.originalFilename); // Set title
    setPdfViewerOpen(true);
  };
  // --- END: Handler for View Button ---

  // --- START: Handler for Delete Confirmation ---
  const handleDeleteConfirm = async () => {
    if (!submissionToDelete) return;

    const idToDelete = submissionToDelete; // Capture id before clearing state
    setSubmissionToDelete(null); // Close dialog immediately

    console.log('Confirmed delete for submission:', idToDelete);
    try {
      const response = await fetch(`/api/submissions/${idToDelete}`, {
        method: 'DELETE',
        // Add credentials: 'include' if needed based on API setup
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      console.log('Submission deleted successfully via API:', idToDelete);

      // Call the callback passed from the parent page to update its state
      if (onSubmissionDeleted) {
        onSubmissionDeleted(idToDelete);
      }

      // Optionally show success toast
      // toast({ title: "Deleted", description: "Submission removed." });
    } catch (error) {
      console.error('Failed to delete submission:', error);
      // Optionally show error toast
      // toast({ title: "Error", description: `Failed to delete: ${error.message}`, variant: "destructive" });
    }
    // Removed finally block clearing state, do it immediately on confirm
  };
  // --- END: Handler for Delete Confirmation ---

  // --- RENDER LOGIC (Using Corrected Types) ---
  return (
    <>
      <Dialog open={!!user} onOpenChange={isOpen => !isOpen && onClose()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>User Details: {user.username}</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-2">User Information</h3>
            <p>
              <strong>ID:</strong> {user._id}
            </p>
            <p>
              <strong>Email:</strong> {user.email ?? 'N/A'}
            </p>
            <p>
              <strong>Role:</strong> {user.role}
            </p>
            <p>
              <strong>Joined:</strong> {new Date(user.createdAt).toLocaleDateString()}
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-2">
              Submitted Documents ({filteredSubmissions.length})
            </h3>
            <TooltipProvider delayDuration={100}>
              {filteredSubmissions.length > 0 ? (
                <div className="overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Original Filename</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Submitted At</TableHead>
                        <TableHead>File Size (Bytes)</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSubmissions.map(sub => (
                        <TableRow key={sub._id}>
                          <TableCell
                            className="font-medium truncate max-w-xs"
                            title={sub.originalFilename}
                          >
                            {sub.originalFilename}
                          </TableCell>
                          <TableCell>{sub.status}</TableCell>
                          <TableCell>
                            {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : 'N/A'}
                          </TableCell>
                          <TableCell>{sub.fileSizeBytes?.toLocaleString() ?? 'N/A'}</TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={`/api/submissions/file/${sub._id}`}
                                    download
                                    className="p-1.5 rounded hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                    title={`Download ${sub.originalFilename}`}
                                  >
                                    <Download className="h-4 w-4 text-blue-600" />
                                    <span className="sr-only">Download</span>
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Download</p>
                                </TooltipContent>
                              </Tooltip>

                              {/* Conditional View Icon Button with Tooltip */}
                              {sub.mimeType === 'application/pdf' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm" // Use standard size
                                      className="h-7 w-7 p-0" // Control size via className and padding
                                      onClick={() => handleViewPdf(sub)}
                                    >
                                      <Eye className="h-4 w-4 text-green-600" />
                                      <span className="sr-only">View</span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>View</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}

                              {/* Delete Icon Button with Tooltip */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm" // Use standard size
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive/80" // Control size and apply color
                                    onClick={e => {
                                      e.stopPropagation();
                                      setSubmissionToDelete(sub._id);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Delete</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Delete</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground italic">
                  No documents submitted by this user found.
                </p>
              )}
            </TooltipProvider>
          </div>
        </DialogContent>
      </Dialog>

      {/* Render the PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={pdfViewerOpen}
        onClose={() => {
          setPdfViewerOpen(false);
          setPdfFileUrl(null); // Clear URL on close
          setPdfTitle('');
        }}
        fileUrl={pdfFileUrl}
        title={pdfTitle}
      />

      {/* --- START: AlertDialog for Delete Confirmation --- */}
      <AlertDialog
        open={!!submissionToDelete}
        onOpenChange={open => {
          if (!open) setSubmissionToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the submission record and
              attempt to delete the associated file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSubmissionToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* --- END: AlertDialog for Delete Confirmation --- */}
    </>
  );
};

export default UserDetailModal;
