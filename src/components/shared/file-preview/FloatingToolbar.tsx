import React from 'react';

interface FloatingToolbarProps {
  children: React.ReactNode;
  className?: string;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({ children, className = '' }) => {
  return (
    <div
      className={`bg-[#101113] border border-white/15 shadow-xl transition-all duration-200 rounded-full p-1.5 flex items-center gap-1 ${className}`}
    >
      {children}
    </div>
  );
};

interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  danger?: boolean;
}

export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  children,
  className = '',
  active,
  danger,
  disabled,
  ...props
}) => {
  const baseClass =
    'p-1.5 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center';

  let colorClass = 'text-white/80 hover:text-white hover:bg-white/10';

  if (active) {
    colorClass = 'bg-white/20 text-white';
  } else if (danger) {
    colorClass = 'text-white/80 hover:bg-red-500/20 hover:text-red-400';
  }

  return (
    <button className={`${baseClass} ${colorClass} ${className}`} disabled={disabled} {...props}>
      {children}
    </button>
  );
};

export const ToolbarDivider: React.FC = () => <div className="w-px h-5 bg-white/10 mx-1"></div>;

export const ToolbarLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <div className={`px-2 font-mono text-xs font-medium text-white/90 select-none ${className}`}>{children}</div>;
