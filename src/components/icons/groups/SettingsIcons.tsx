import React from 'react';
import { Command } from 'lucide-react';
import {
  type IconProps,
  StrokeIcon,
  defaultSize,
  defaultStroke,
  defaultColor,
} from '@/components/icons/iconPrimitives';

// Data Management Icon (Database Stack)
export const IconData: React.FC<IconProps> = (props) => (
  <StrokeIcon {...props}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </StrokeIcon>
);

// About Icon (Info Circle)
export const IconAbout: React.FC<IconProps> = (props) => (
  <StrokeIcon {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </StrokeIcon>
);

// Shortcuts Icon — 借鉴 Cherry Studio SettingsPage.tsx: icon={<Command />} (⌘)
export const IconKeyboard: React.FC<IconProps> = ({
  size = defaultSize,
  strokeWidth = defaultStroke,
  className,
  color = defaultColor,
}) => <Command size={size} strokeWidth={strokeWidth} className={className} color={color} />;
