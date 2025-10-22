'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { API_BASE_URL_CLIENT as API_BASE_URL } from '@/lib/config';

interface ForcePasswordChangeModalProps {
  isOpen: boolean;
  onPasswordChanged: () => void;
}

export function ForcePasswordChangeModal({
  isOpen,
  onPasswordChanged,
}: ForcePasswordChangeModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChanging, setIsChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handlePasswordChange = async () => {
    // Reset error
    setError(null);

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsChanging(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/me/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to change password');
      }

      console.log('[ForcePasswordChange] Password changed successfully');

      toast({
        title: 'Password Changed',
        description:
          'Your password has been changed successfully. You can now access the application.',
      });

      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Notify parent component
      onPasswordChanged();
    } catch (error) {
      console.error('[ForcePasswordChange] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to change password';
      setError(errorMessage);
    } finally {
      setIsChanging(false);
    }
  };

  // Handle Enter key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isChanging) {
      handlePasswordChange();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[425px]" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Password Change Required</DialogTitle>
          <DialogDescription>
            You must change your password before continuing. Please enter your current password and
            choose a new secure password.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="current-password" className="text-right">
              Current
            </Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="col-span-3"
              disabled={isChanging}
              placeholder="Enter current password"
              onKeyDown={handleKeyPress}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="new-password" className="text-right">
              New
            </Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="col-span-3"
              disabled={isChanging}
              placeholder="Enter new password"
              onKeyDown={handleKeyPress}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="confirm-password" className="text-right">
              Confirm
            </Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="col-span-3"
              disabled={isChanging}
              placeholder="Confirm new password"
              onKeyDown={handleKeyPress}
            />
          </div>
          {error && <p className="col-span-4 text-sm text-red-600 text-center">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={handlePasswordChange} disabled={isChanging} className="w-full">
            {isChanging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Changing Password...
              </>
            ) : (
              'Change Password'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
