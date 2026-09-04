import React from 'react';
import {
  HelpCircle,
  UploadCloud,
  Trash2,
  Settings,
  Wand2,
  Globe,
  Terminal,
  Link,
  Pin,
  RefreshCw,
  Bot,
  ImageIcon,
  SquarePen,
  PictureInPicture,
  Bookmark,
  Telescope,
  Zap,
  MapPin,
  Paperclip,
} from 'lucide-react';
import { IconStop, IconNewChat } from './groups/GeneralIcons';

export const CommandIcon: React.FC<{ icon: string }> = ({ icon }) => {
  const iconProps = { size: 18, strokeWidth: 2.2 };
  switch (icon) {
    case 'bot':
      return <Bot {...iconProps} />;
    case 'help':
      return <HelpCircle {...iconProps} />;
    case 'edit':
      return <SquarePen {...iconProps} />;
    case 'pin':
      return <Pin {...iconProps} />;
    case 'retry':
      return <RefreshCw {...iconProps} />;
    case 'stop':
      return <IconStop size={14} color="currentColor" />;
    case 'search':
      return <Globe {...iconProps} />;
    case 'maps':
      return <MapPin {...iconProps} />;
    case 'deep':
      return <Telescope {...iconProps} />;
    case 'code':
      return <Terminal {...iconProps} />;
    case 'url':
      return <Link {...iconProps} />;
    case 'file':
      return <UploadCloud {...iconProps} />;
    case 'paperclip':
      return <Paperclip {...iconProps} />;
    case 'clear':
      return <Trash2 {...iconProps} />;
    case 'new':
      return <IconNewChat size={18} strokeWidth={2.2} />;
    case 'settings':
      return <Settings {...iconProps} />;
    case 'artifacts':
      return <Wand2 {...iconProps} />;
    case 'image':
      return <ImageIcon {...iconProps} />;
    case 'pip':
      return <PictureInPicture {...iconProps} />;
    case 'fast':
      return <Zap {...iconProps} />;
    case 'default':
      return <Bookmark {...iconProps} />;
    default:
      return <Bot {...iconProps} />;
  }
};
