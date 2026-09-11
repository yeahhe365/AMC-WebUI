import {
  Languages,
  MousePointer2,
  ScanText,
  AudioWaveform,
  Captions,
  Lightbulb,
  FileQuestion,
  FileText,
  Sparkles,
  AppWindow,
  Palette,
  Scan,
  ScanSearch,
  BoxSelect,
  BookOpenText,
  AudioLines,
  MonitorPlay,
  Clapperboard,
  Image as ImageIcon,
} from 'lucide-react';

import { IconPdf } from '@/components/icons';

export const SuggestionIcon = ({ iconName, className }: { iconName?: string; className?: string }) => {
  const size = 13;
  switch (iconName) {
    case 'AppWindow':
      return <AppWindow className={className} size={size} />;
    case 'Palette':
      return <Palette className={className} size={size} />;
    case 'Languages':
      return <Languages className={className} size={size} />;
    case 'MousePointer2':
      return <MousePointer2 className={className} size={size} />;
    case 'ScanText':
      return <ScanText className={className} size={size} />;
    case 'Scan':
      return <Scan className={className} size={size} />;
    case 'ScanSearch':
      return <ScanSearch className={className} size={size} />;
    case 'BoxSelect':
      return <BoxSelect className={className} size={size} />;
    case 'BookOpenText':
      return <BookOpenText className={className} size={size} />;
    case 'MonitorPlay':
      return <MonitorPlay className={className} size={size} />;
    case 'AudioLines':
      return <AudioLines className={className} size={size} />;
    case 'Clapperboard':
      return <Clapperboard className={className} size={size} />;
    case 'AudioWaveform':
      return <AudioWaveform className={className} size={size} />;
    case 'Captions':
      return <Captions className={className} size={size} />;
    case 'Lightbulb':
      return <Lightbulb className={className} size={size} />;
    case 'FileQuestion':
      return <FileQuestion className={className} size={size} />;
    case 'FileText':
      return <FileText className={className} size={size} />;
    case 'Pdf':
    case 'IconPdf':
      return <IconPdf className={className} size={size} />;
    case 'Image':
      return <ImageIcon className={className} size={size} />;
    default:
      return <Sparkles className={className} size={size} />;
  }
};
