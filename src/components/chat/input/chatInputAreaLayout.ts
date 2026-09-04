import { CHAT_INPUT_MAX_WIDTH_CLASS } from '@/constants/layout';
import { COMPOSER_SHELL_RADIUS_CLASS } from '@/constants/designTokens';

interface ChatInputAreaLayoutParams {
  isPipActive?: boolean;
  isAnimatingSend: boolean;
}

export const getChatInputAreaLayout = ({ isPipActive, isAnimatingSend }: ChatInputAreaLayoutParams) => {
  // Keep composer shell solid and visible without unwanted wrapper-level dimming/opacity drops.
  const wrapperClass = 'bg-transparent';

  const innerContainerClass = `mx-auto w-full ${!isPipActive ? CHAT_INPUT_MAX_WIDTH_CLASS : ''} px-2 sm:px-3 pt-0 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]`;

  const formClass = `relative ${isAnimatingSend ? 'form-send-animate' : ''}`;

  // Full static class strings so Tailwind JIT can detect radius utilities. Match Cherry's inputbar transition-all.
  const inputContainerClass = `flex flex-col gap-1.5 ${COMPOSER_SHELL_RADIUS_CLASS} border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] px-3 py-1.5 sm:px-4 sm:py-2 shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all duration-200 ease-in-out focus-within:border-[var(--theme-border-focus)] focus-within:shadow-[0_8px_30px_rgba(0,0,0,0.08)] relative z-20`;

  const queuedSubmissionContainerClass = 'relative z-10 mx-5 mb-[-22px] -translate-y-1.5';
  const actionsContainerClass = 'flex items-center justify-between pt-1';

  return {
    wrapperClass,
    innerContainerClass,
    formClass,
    inputContainerClass,
    queuedSubmissionContainerClass,
    actionsContainerClass,
  };
};
