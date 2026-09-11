import React, { useState } from 'react';
import { getThirdPartyTemplateLogo } from '@/components/shared/ModelIcon';
import type { ThirdPartyTemplateId } from '@/types';
import { generateColorFromChar, getFirstCharacter } from '@/utils/thirdPartyApiProviders';

interface ProviderAvatarProps {
  name: string;
  templateId?: ThirdPartyTemplateId | string;
  size?: number;
  className?: string;
}

export const ProviderAvatar: React.FC<ProviderAvatarProps> = ({ name, templateId, size = 28, className = '' }) => {
  const [imageError, setImageError] = useState(false);
  const logoUrl = templateId ? getThirdPartyTemplateLogo(templateId as ThirdPartyTemplateId) : null;
  const isCustomOrGeneric =
    !templateId || templateId === 'custom-openai' || templateId === 'custom-anthropic' || templateId === 'custom';

  if (logoUrl && !isCustomOrGeneric && !imageError) {
    return (
      <div
        className={`flex-shrink-0 flex items-center justify-center rounded-full overflow-hidden bg-[var(--theme-bg-tertiary)]/50 ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src={logoUrl}
          alt={name}
          width={size * 0.75}
          height={size * 0.75}
          draggable={false}
          onError={() => setImageError(true)}
          className="object-contain"
          style={{ width: size * 0.75, height: size * 0.75 }}
        />
      </div>
    );
  }

  const bgColor = generateColorFromChar(name);
  const initial = getFirstCharacter(name);
  const fontSize = Math.max(10, Math.round(size * 0.46));

  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center rounded-full font-semibold text-white select-none shadow-xs ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: bgColor,
        fontSize: `${fontSize}px`,
      }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
};
