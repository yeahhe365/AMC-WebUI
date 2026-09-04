import React from 'react';
import { HardDriveUpload, Crop } from 'lucide-react';
import {
  type IconProps,
  StrokeIcon,
  defaultSize,
  defaultStroke,
  defaultColor,
} from '@/components/icons/iconPrimitives';

export const IconUpload: React.FC<IconProps> = ({
  size = defaultSize,
  strokeWidth = defaultStroke,
  className,
  color = defaultColor,
}) => <HardDriveUpload size={size} strokeWidth={strokeWidth} className={className} color={color} />;

export const IconGallery: React.FC<IconProps> = (props) => (
  <StrokeIcon {...props}>
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </StrokeIcon>
);

export const IconCamera: React.FC<IconProps> = (props) => (
  <StrokeIcon {...props}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </StrokeIcon>
);

// 借鉴 Cherry Studio SettingsPage.tsx: icon={<Crop />} (截图)
export const IconScreenshot: React.FC<IconProps> = ({
  size = defaultSize,
  strokeWidth = defaultStroke,
  className,
  color = defaultColor,
}) => <Crop size={size} strokeWidth={strokeWidth} className={className} color={color} />;

export const IconMicrophone: React.FC<IconProps> = (props) => (
  <StrokeIcon {...props}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="23" />
    <line x1="8" x2="16" y1="23" y2="23" />
  </StrokeIcon>
);

export const IconLink: React.FC<IconProps> = (props) => (
  <StrokeIcon {...props}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </StrokeIcon>
);

export const IconYoutube: React.FC<IconProps> = ({ color, ...props }) => (
  <StrokeIcon color={color} {...props}>
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <path d="m10 15 5-3-5-3z" fill={color ?? 'currentColor'} fillOpacity={0.1} />
  </StrokeIcon>
);

export const IconFileEdit: React.FC<IconProps> = (props) => (
  <StrokeIcon {...props}>
    <path d="M4 13.5V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2h-5.5" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z" />
  </StrokeIcon>
);

export const IconZip: React.FC<IconProps> = (props) => (
  <StrokeIcon {...props}>
    <path d="m7.5 4.27 9 5.15" />
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </StrokeIcon>
);

export const IconMarkdown: React.FC<IconProps> = ({ size = defaultSize, className, color = defaultColor }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 208 128"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill={color}
      d="M193 128H15a15 15 0 0 1-15-15V15A15 15 0 0 1 15 0h178a15 15 0 0 1 15 15v98a15 15 0 0 1-15 15zM50 98V59l20 25 20-25v39h20V30H90L70 55 50 30H30v68zm134-34h-20V30h-20v34h-20l30 35z"
    />
  </svg>
);

/**
 * 官方 Adobe Acrobat / PDF 矢量图标
 */
export const IconPdf: React.FC<IconProps> = ({ size = defaultSize, className, color = defaultColor }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
    <path
      fill={color ?? 'currentColor'}
      d="M31.464 20.49c-.948-1.01-2.885-1.594-5.63-1.594c-1.469 0-3.167.146-5.016.49a26.7 26.7 0 0 1-3.073-3.625c-.708-.984-1.328-2.026-1.896-3.052c1.083-3.385 1.609-6.146 1.609-8.135c0-2.229-.807-4.552-3.12-4.552c-.714 0-1.422.432-1.802 1.068c-1.042 1.875-.573 5.99 1.224 10.052a96 96 0 0 1-2.266 6.141a73 73 0 0 1-2.568 5.458C3.723 24.856.353 27.319.041 29.257c-.141.729.099 1.396.609 1.932c.177.146.844.724 1.974.724c3.453 0 7.089-5.703 8.943-9.146c1.417-.479 2.839-.917 4.255-1.354a47 47 0 0 1 4.542-1.016c3.646 3.339 6.859 3.865 8.474 3.865c1.99 0 2.698-.823 2.938-1.495c.375-.87.094-1.828-.333-2.323l.026.052zm-1.844 1.406c-.141.724-.854 1.208-1.849 1.208c-.281 0-.521-.052-.807-.094c-1.813-.438-3.51-1.359-5.203-2.813a24 24 0 0 1 3.974-.333c.984 0 1.839.047 2.411.193c.656.141 1.698.583 1.464 1.844h.026zM19.589 19.62a69 69 0 0 0-3.927.922a54 54 0 0 0-3.359 1.031a57 57 0 0 0 1.609-3.474c.573-1.359 1.042-2.76 1.516-4.063c.464.818.984 1.641 1.505 2.375c.854 1.161 1.745 2.266 2.641 3.229v-.026zM13.385 1.641a1.04 1.04 0 0 1 .906-.583c.995 0 1.182 1.156 1.182 2.083c0 1.557-.474 3.922-1.281 6.62c-1.417-3.76-1.51-6.906-.802-8.12zM8.182 24.172c-2.411 4.057-4.729 6.573-6.151 6.573c-.276 0-.516-.099-.703-.24c-.286-.292-.427-.63-.333-1.016c.286-1.453 2.984-3.484 7.193-5.318z"
    />
  </svg>
);
