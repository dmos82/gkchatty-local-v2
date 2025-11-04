'use client';

// Import polyfills first - before any other imports
import '@/lib/polyfills';

// import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/toast';
import { AuthProvider } from '@/context/AuthContext';
import { PersonaProvider } from '@/contexts/PersonaContext';
import { SearchModeProvider } from '@/contexts/SearchModeContext';
// import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
// import { pdfjs } from 'react-pdf'; // pdfjs likely not needed directly here if worker setup is removed
// import { SessionProvider } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ErrorBoundary from '@/components/ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
// TODO: SettingsProvider import commented out - file not found
// import { SettingsProvider } from '@/contexts/SettingsContext';
// import { SpeedInsights } from "@vercel/speed-insights/next"
import { Header } from '@/components/layout/Header';
// No PdfWorkerSetup import here anymore

const inter = Inter({ subsets: ['latin'] });

// Metadata must be in a separate file or accessed via route segment config
// when using 'use client' directive
// export const metadata: Metadata = {
//   title: 'GKChatty - Client Portal',
//   description: 'Chat with your Gold Key Insurance documents.',
// };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>GKChatty - Client Portal</title>
        <meta name="description" content="Chat with your Gold Key Insurance documents." />

        {/* Mobile Optimization */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#FFD700" />

        {/* Touch Icons */}
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico" />
      </head>
      <body className={inter.className}>
        {/* TODO: SettingsProvider commented out - implementation not found */}
        {/* <SettingsProvider> */}
          <AuthProvider>
            <SearchModeProvider>
              <PersonaProvider>
                <ThemeProvider
                  attribute="class"
                  defaultTheme="system"
                  enableSystem
                  disableTransitionOnChange
                >
                  <ErrorBoundary>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={pathname}
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.4, ease: 'easeInOut' }}
                      >
                        <div vaul-drawer-wrapper="" className="bg-background">
                          <div className="relative flex min-h-screen w-full flex-col">
                            <Header />
                            <main>
                              {children}
                            </main>
                          </div>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </ErrorBoundary>
                  <Toaster />
                </ThemeProvider>
              </PersonaProvider>
            </SearchModeProvider>
          </AuthProvider>
        {/* </SettingsProvider> */}
        {/* <SpeedInsights /> */}
      </body>
    </html>
  );
}
