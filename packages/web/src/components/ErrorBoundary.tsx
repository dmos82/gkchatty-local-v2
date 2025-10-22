'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryComponent extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public resetError = (): void => {
    this.setState({ hasError: false, error: null });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
          <div className="bg-red-50 border border-red-200 p-6 rounded-lg max-w-md">
            <h2 className="text-xl font-semibold text-red-800 mb-4">Something went wrong</h2>
            <p className="text-gray-600 mb-6">
              The application encountered an unexpected error. You can try to reload the page or
              return to the home page.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="outline" onClick={() => window.location.reload()}>
                Reload Page
              </Button>
              <Button
                onClick={() => {
                  this.resetError();
                  window.location.href = '/';
                }}
              >
                Go to Home
              </Button>
            </div>
            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <div className="mt-6 p-4 bg-gray-100 rounded text-left overflow-auto text-xs">
                <p className="font-medium mb-2">Error details:</p>
                <pre className="text-red-700">{this.state.error.toString()}</pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// This wrapper enables us to use hooks within the error boundary context
export const ErrorBoundary = ({ children, fallback }: Props): JSX.Element => {
  // Here we could use hooks like useToast if needed
  return <ErrorBoundaryComponent fallback={fallback}>{children}</ErrorBoundaryComponent>;
};

export default ErrorBoundary;
