import React from 'react';
import { MATERIAL_ICONS } from './materialIcons.generated';

interface MaterialIconProps {
  name: string;
  size?: number;
  className?: string;
}

// Renders one icon from the committed material-icon-theme subset. The body is a
// static SVG fragment from the icon package, so dangerouslySetInnerHTML is safe
// here (same pattern as GraphvizBlock/MermaidBlock).
export const MaterialIcon: React.FC<MaterialIconProps> = ({ name, size = 20, className }) => {
  const icon = MATERIAL_ICONS[name];
  if (!icon) {
    return null;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${icon.width} ${icon.height}`}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
};
