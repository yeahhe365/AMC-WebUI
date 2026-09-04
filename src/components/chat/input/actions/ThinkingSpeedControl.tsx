import React, { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Gauge, Zap } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useChatInputContext } from '@/components/chat/input/ChatInputContext';
import { usePortaledMenu } from '@/hooks/ui/usePortaledMenu';
import { getCachedModelCapabilities } from '@/stores/modelCapabilitiesStore';
import type { ThinkingLevel } from '@/types';

const LEVEL_LABEL_KEYS: Record<ThinkingLevel, string> = {
  MINIMAL: 'thinkingLevelMinimal',
  LOW: 'thinkingLevelLow',
  MEDIUM: 'thinkingLevelMedium',
  HIGH: 'thinkingLevelHigh',
};

const LEVEL_FALLBACK: Record<ThinkingLevel, string> = {
  MINIMAL: '最小',
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
};

const WHEEL_STEP_THRESHOLD = 40;
const WHEEL_IDLE_RESET_MS = 120;

function normalizeWheelDelta(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) return event.deltaY;
  return Math.sign(event.deltaY) * WHEEL_STEP_THRESHOLD;
}

interface WheelStepControlProps {
  children: React.ReactNode;
  className?: string;
  min: number;
  max: number;
  value: number;
  onValueChange: (value: number) => void;
}

const WheelStepControl: React.FC<WheelStepControlProps> = ({ children, className, min, max, value, onValueChange }) => {
  const wheelDeltaRef = useRef(0);
  const wheelIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.deltaY === 0) return;
      const normalizedDelta = normalizeWheelDelta(event);
      const direction = normalizedDelta < 0 ? 1 : -1;
      const nextValue = Math.min(Math.max(value + direction, min), max);
      if (nextValue === value) {
        wheelDeltaRef.current = 0;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (Math.sign(wheelDeltaRef.current) !== Math.sign(normalizedDelta)) wheelDeltaRef.current = 0;
      wheelDeltaRef.current += normalizedDelta;
      if (wheelIdleTimerRef.current) clearTimeout(wheelIdleTimerRef.current);
      wheelIdleTimerRef.current = setTimeout(() => {
        wheelDeltaRef.current = 0;
      }, WHEEL_IDLE_RESET_MS);
      if (Math.abs(wheelDeltaRef.current) < WHEEL_STEP_THRESHOLD) return;
      wheelDeltaRef.current = 0;
      onValueChange(nextValue);
    },
    [max, min, onValueChange, value],
  );

  const setWheelTargetRef = useCallback(
    (wheelTarget: HTMLDivElement | null) => {
      if (!wheelTarget) return;
      wheelTarget.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        wheelTarget.removeEventListener('wheel', handleWheel);
        wheelDeltaRef.current = 0;
        if (wheelIdleTimerRef.current) clearTimeout(wheelIdleTimerRef.current);
        wheelIdleTimerRef.current = null;
      };
    },
    [handleWheel],
  );

  return (
    <div ref={setWheelTargetRef} className={className}>
      {children}
    </div>
  );
};

export const ThinkingSpeedControl: React.FC = () => {
  const { t } = useI18n();
  const { chatInput } = useChatInputContext();
  const { currentChatSettings, setCurrentChatSettings } = chatInput;
  const modelId = currentChatSettings.modelId;

  const caps = getCachedModelCapabilities(modelId);
  const isGemma = caps.isGemmaModel;
  const supportsThinkingLevel = caps.supportsThinkingLevel || isGemma;
  const activeCapabilities = caps;

  if (!supportsThinkingLevel || activeCapabilities.isTtsModel) return null;

  const isFlash3 = activeCapabilities.isGemini3FlashModel;
  const isRobotics = activeCapabilities.isGeminiRoboticsModel;
  const isImageThinkingLevelOnly = activeCapabilities.isGemini31FlashImageModel;

  let supportedLevels: ThinkingLevel[];
  if (isImageThinkingLevelOnly) {
    supportedLevels = ['MINIMAL', 'HIGH'];
  } else if (supportsThinkingLevel) {
    // gemini-3.7-flash / gemini-3.8-flash rejects MINIMAL with an API error — only offer it where supported.
    supportedLevels =
      (isFlash3 || isRobotics) && activeCapabilities.supportsMinimalThinkingLevel
        ? ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH']
        : ['LOW', 'MEDIUM', 'HIGH'];
  } else {
    supportedLevels = [];
  }

  if (isGemma) supportedLevels = ['MINIMAL', 'HIGH'];

  if (supportedLevels.length === 0) return null;

  const thinkingLevel = (currentChatSettings.thinkingLevel as ThinkingLevel | undefined) ?? 'HIGH';
  const currentIndex = supportedLevels.indexOf(thinkingLevel);
  const safeIndex = currentIndex >= 0 ? currentIndex : supportedLevels.indexOf('HIGH');
  const displayIndex = safeIndex >= 0 ? safeIndex : 0;
  const displayLevel = supportedLevels[displayIndex] ?? 'HIGH';

  const levelLabel = (level: ThinkingLevel) => {
    const key = LEVEL_LABEL_KEYS[level];
    const translated = t(key);
    if (!translated || translated === key) return LEVEL_FALLBACK[level] ?? level;
    return translated;
  };

  const triggerLabel = levelLabel(displayLevel);
  const headerLabel = triggerLabel;

  const handleLevelChange = (index: number) => {
    const next = supportedLevels[index];
    if (next) setCurrentChatSettings((prev) => ({ ...prev, thinkingLevel: next }));
  };

  const handleResetDefault = () => {
    setCurrentChatSettings((prev) => ({ ...prev, thinkingLevel: 'HIGH' as ThinkingLevel }));
  };

  const isDefault = displayLevel === 'HIGH';

  const intensityLabel = t('thinkingIntensity');
  const intensityText = intensityLabel !== 'thinkingIntensity' ? intensityLabel : '强度';
  const defaultLabel = t('thinkingDefault');
  const defaultText = defaultLabel !== 'thinkingDefault' ? defaultLabel : '默认';
  const fasterLabel = t('thinkingFaster');
  const fasterText = fasterLabel !== 'thinkingFaster' ? fasterLabel : '更快';
  const smarterLabel = t('thinkingSmarter');
  const smarterText = smarterLabel !== 'thinkingSmarter' ? smarterLabel : '更智能';
  const settingsThinkingModeLabel = t('settingsThinkingMode');
  const fastAriaLabel = t('thinkingFaster') !== 'thinkingFaster' ? t('thinkingFaster') : '极速';

  const supportsFast = (isFlash3 || isRobotics) && activeCapabilities.supportsMinimalThinkingLevel;
  const isFastActive = supportsFast && displayLevel === 'MINIMAL';
  const handleToggleFast = () => {
    setCurrentChatSettings((prev) => ({
      ...prev,
      thinkingLevel: isFastActive ? ('HIGH' as ThinkingLevel) : ('MINIMAL' as ThinkingLevel),
    }));
  };

  return (
    <ThinkingSpeedControlUI
      supportedLevels={supportedLevels}
      displayLevel={displayLevel}
      displayIndex={displayIndex}
      triggerLabel={triggerLabel}
      headerLabel={headerLabel}
      isDefault={isDefault}
      onLevelChange={handleLevelChange}
      onResetDefault={handleResetDefault}
      levelLabel={levelLabel}
      intensityText={intensityText}
      defaultText={defaultText}
      fasterText={fasterText}
      smarterText={smarterText}
      settingsThinkingModeLabel={settingsThinkingModeLabel}
      supportsFast={supportsFast}
      isFastActive={isFastActive}
      onToggleFast={handleToggleFast}
      fastAriaLabel={fastAriaLabel}
    />
  );
};

const ThinkingSpeedControlUI: React.FC<{
  supportedLevels: ThinkingLevel[];
  displayLevel: ThinkingLevel;
  displayIndex: number;
  triggerLabel: string;
  headerLabel: string;
  isDefault: boolean;
  onLevelChange: (index: number) => void;
  onResetDefault: () => void;
  levelLabel: (l: ThinkingLevel) => string;
  intensityText: string;
  defaultText: string;
  fasterText: string;
  smarterText: string;
  settingsThinkingModeLabel: string;
  supportsFast: boolean;
  isFastActive: boolean;
  onToggleFast: () => void;
  fastAriaLabel: string;
}> = ({
  supportedLevels,
  displayIndex,
  triggerLabel,
  headerLabel,
  isDefault,
  onLevelChange,
  onResetDefault,
  levelLabel,
  intensityText,
  defaultText,
  fasterText,
  smarterText,
  settingsThinkingModeLabel,
  supportsFast,
  isFastActive,
  onToggleFast,
  fastAriaLabel,
}) => {
  const { isOpen, menuPosition, containerRef, buttonRef, menuRef, targetWindow, toggleMenu, closeMenu } =
    usePortaledMenu({ menuWidth: 224, gap: 8 });

  const showSlider = supportedLevels.length > 2;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        className="h-8 gap-1 rounded-md px-2.5 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] bg-transparent hover:bg-[var(--theme-bg-tertiary)] inline-flex items-center transition-colors"
        aria-label={settingsThinkingModeLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Gauge size={14} className="shrink-0" />
        <span>{triggerLabel}</span>
        <ChevronDown size={13} className="shrink-0 text-[var(--theme-text-secondary)]" />
      </button>

      {isOpen &&
        targetWindow &&
        createPortal(
          <div
            ref={menuRef}
            style={menuPosition}
            className="fixed w-56 overflow-hidden rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] p-1.5 text-xs shadow-xl z-[9999] animate-in fade-in slide-in-from-bottom-1 duration-150"
            role="dialog"
            aria-label={settingsThinkingModeLabel}
          >
            <div className="flex h-10 items-center px-2">
              <div className="flex min-w-0 items-baseline gap-1 text-xs">
                <span className="shrink-0 text-[var(--theme-text-secondary)]">{intensityText}:</span>
                <span
                  className="truncate font-medium text-[var(--theme-text-primary)]"
                  data-testid="composer-effort-slider-label"
                  aria-live="polite"
                >
                  {headerLabel}
                </span>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                {showSlider ? (
                  <button
                    type="button"
                    onClick={onResetDefault}
                    className={`h-7 rounded-md px-2 text-xs transition-colors ${isDefault ? 'text-[var(--theme-bg-accent)] hover:text-[var(--theme-bg-accent)]' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'}`}
                    aria-pressed={isDefault}
                  >
                    {defaultText}
                  </button>
                ) : null}
                {supportsFast ? (
                  <button
                    type="button"
                    onClick={onToggleFast}
                    className={`h-7 w-7 flex items-center justify-center rounded-full transition-colors ${isFastActive ? 'text-[var(--theme-bg-accent)] hover:text-[var(--theme-bg-accent)]' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'}`}
                    aria-label={fastAriaLabel}
                    aria-pressed={isFastActive}
                  >
                    <Zap size={14} fill={isFastActive ? 'currentColor' : 'none'} />
                  </button>
                ) : null}
              </div>
            </div>

            {showSlider ? (
              <div className="mx-2.5 mt-1 mb-2">
                <div className="flex items-center justify-between text-[11px] font-medium" aria-hidden="true">
                  <span className="text-[var(--theme-text-secondary)]">{fasterText}</span>
                  <span className="text-[var(--theme-bg-accent)]">{smarterText}</span>
                </div>
                <WheelStepControl
                  value={displayIndex}
                  min={0}
                  max={supportedLevels.length - 1}
                  className="relative mt-1.5 h-8"
                  onValueChange={onLevelChange}
                >
                  <input
                    type="range"
                    min={0}
                    max={supportedLevels.length - 1}
                    step={1}
                    value={displayIndex}
                    onChange={(e) => onLevelChange(parseInt(e.target.value, 10))}
                    className="w-full h-8 accent-[var(--theme-bg-accent)] cursor-pointer [&::-webkit-slider-runnable-track]:h-2.5 [&::-webkit-slider-runnable-track]:bg-[var(--theme-bg-tertiary)] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:shadow-inner [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[var(--theme-border-secondary)] [&::-webkit-slider-thumb]:bg-[var(--theme-bg-primary)] [&::-webkit-slider-thumb]:shadow-sm appearance-none bg-transparent"
                    aria-label={intensityText}
                  />
                  <div className="pointer-events-none absolute inset-x-3 top-1/2 z-10 h-0">
                    {supportedLevels.map((lvl, idx) =>
                      idx === displayIndex ? null : (
                        <span
                          key={lvl}
                          data-slot="composer-effort-step"
                          className="absolute size-1 rounded-full bg-[var(--theme-bg-primary)] -translate-x-1/2 -translate-y-1/2"
                          style={{
                            left: `${(idx / (supportedLevels.length - 1)) * 100}%`,
                          }}
                        />
                      ),
                    )}
                  </div>
                </WheelStepControl>
              </div>
            ) : (
              <div className="px-2 py-1.5 flex gap-1">
                {supportedLevels.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => onLevelChange(supportedLevels.indexOf(lvl))}
                    className={`flex-1 h-8 rounded-lg text-xs font-medium transition-colors ${displayIndex === supportedLevels.indexOf(lvl) ? 'bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)]' : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'}`}
                  >
                    {levelLabel(lvl)}
                  </button>
                ))}
              </div>
            )}

            <button type="button" onClick={closeMenu} className="sr-only" tabIndex={-1} aria-hidden="true">
              close
            </button>
          </div>,
          targetWindow.document.body,
        )}
    </div>
  );
};
