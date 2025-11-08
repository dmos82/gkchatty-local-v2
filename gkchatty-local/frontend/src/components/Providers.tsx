'use client';

import * as React from 'react';
import { ThemeProvider } from 'next-themes';
// Remove AuthProvider import if it's not used directly here anymore
// import { AuthProvider } from '@/context/AuthContext';
import { TooltipProvider } from '@/components/ui/tooltip';
// Removed pdfjs import as worker is configured in layout
// import { pdfjs } from 'react-pdf';
// Removed problematic import
// import pdfjsVersion from 'pdfjs-dist/package.json';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // Removed useEffect configuring worker source here
  // React.useEffect(() => {
  //   pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.js`;
  //   console.log('[Providers] Configured pdfjs worker source (client):', pdfjs.GlobalWorkerOptions.workerSrc);
  // }, []);

  return (
    <>
      {/* App Theme & Tooltips */}
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {/* Remove AuthProvider wrapper from here */}
        <TooltipProvider>{children}</TooltipProvider>
        {/* End remove AuthProvider wrapper */}
      </ThemeProvider>
    </>
  );
}
