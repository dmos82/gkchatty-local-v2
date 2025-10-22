import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { PdfDebugTool } from '@/components/debug/PdfDebugTool';

export default function DebugPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto py-8">
          <h1 className="text-3xl font-bold mb-8">PDF API Debug Tool</h1>
          <PdfDebugTool />
        </div>
      </div>
    </ProtectedRoute>
  );
}
