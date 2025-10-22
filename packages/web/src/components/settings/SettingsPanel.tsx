import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  user: ReturnType<typeof import('@/hooks/useAuth').useAuth>['user'];
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose, user }) => {
  if (!isOpen || !user) {
    return null;
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 w-[300px] z-50 bg-card border rounded-lg shadow-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Settings</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X size={16} />
        </Button>
      </div>
      <div className="space-y-4">
        <div className="space-y-2 border-t pt-4">
          <Label>Profile Picture</Label>
          <p className="text-sm text-muted-foreground">Feature coming soon.</p>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label>AI Personality</Label>
          <p className="text-sm text-muted-foreground">Feature coming soon.</p>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
