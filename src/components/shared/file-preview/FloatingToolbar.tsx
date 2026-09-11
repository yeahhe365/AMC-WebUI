import React from 'react';

interface FloatingToolbarProps {
  children: React.ReactNode;
  className?: string;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({ children, className = '' }) => {
  return (
    <div
      className={`bg-[#121316] border border-white/15 shadow-2xl shadow-black/60 transition-all duration-200 rounded-full p-1.5 flex items-center gap-1 ${className}`}
    >
      {children}
    </div>
  );
};

interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  danger?: boolean;
}

export const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ children, className = '', active, danger, disabled, ...props }, ref) => {
    const baseClass =
      'p-1.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center';

    let colorClass = 'text-white/80 hover:text-white hover:bg-white/15 active:scale-95';

    if (active) {
      colorClass = 'bg-white/20 text-white';
    } else if (danger) {
      colorClass = 'text-white/80 hover:bg-red-500/25 hover:text-red-300 active:scale-95';
    }

    return (
      <button ref={ref} className={`${baseClass} ${colorClass} ${className}`} disabled={disabled} {...props}>
        {children}
      </button>
    );
  },
);
ToolbarButton.displayName = 'ToolbarButton';

export const ToolbarDivider: React.FC = () => <div className="w-px h-5 bg-white/10 mx-1"></div>;
