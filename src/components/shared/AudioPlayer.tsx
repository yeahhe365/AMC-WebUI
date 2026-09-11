import React, { useEffect, useRef, useState } from 'react';
import H5AudioPlayer, { RHAP_UI } from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
import { Play, Pause, Download } from 'lucide-react';
import { triggerDownload } from '@/utils/export/core';
import { useI18n } from '@/contexts/I18nContext';

interface AudioPlayerProps {
  src: string;
  autoPlay?: boolean;
  className?: string;
  audioClassName?: string;
}

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2];

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, autoPlay = false, className = '', audioClassName }) => {
  const { t } = useI18n();
  const playerRef = useRef<H5AudioPlayer>(null);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (playerRef.current?.audio.current && audioClassName) {
      playerRef.current.audio.current.className = audioClassName;
    }
  }, [audioClassName]);

  const toggleSpeed = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate);
    const nextSpeed = PLAYBACK_SPEEDS[(currentIndex + 1) % PLAYBACK_SPEEDS.length];
    setPlaybackRate(nextSpeed);
    if (playerRef.current?.audio.current) {
      playerRef.current.audio.current.playbackRate = nextSpeed;
    }
  };

  const handleDownload = () => {
    triggerDownload(src, `audio-${Date.now()}.wav`);
  };

  const playLabel = t('audioPlayerPlay') || 'Play';
  const pauseLabel = t('audioPlayerPause') || 'Pause';

  return (
    <H5AudioPlayer
      ref={playerRef}
      src={src}
      autoPlay={autoPlay}
      showJumpControls={true}
      showSkipControls={false}
      showDownloadProgress={true}
      progressJumpSteps={{ backward: 5000, forward: 5000 }}
      layout="stacked"
      className={`amc-audio-player ${className}`}
      customIcons={{
        play: <Play size={18} fill="currentColor" className="ml-0.5" />,
        pause: <Pause size={18} fill="currentColor" />,
      }}
      i18nAriaLabels={{
        play: playLabel,
        pause: pauseLabel,
      }}
      customProgressBarSection={[RHAP_UI.CURRENT_TIME, RHAP_UI.PROGRESS_BAR, RHAP_UI.DURATION]}
      customControlsSection={[RHAP_UI.MAIN_CONTROLS, RHAP_UI.ADDITIONAL_CONTROLS, RHAP_UI.VOLUME_CONTROLS]}
      customAdditionalControls={[
        <button
          key="speed"
          type="button"
          onClick={toggleSpeed}
          className="px-1.5 py-1 rounded text-xs font-bold text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors min-w-[2rem] focus:outline-none"
          title={t('audioPlayerPlaybackSpeed')}
          aria-label={t('audioPlayerPlaybackSpeed')}
        >
          {playbackRate}x
        </button>,
        <button
          key="download"
          type="button"
          onClick={handleDownload}
          className="p-1.5 rounded text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors focus:outline-none"
          title={t('audioPlayerDownload')}
          aria-label={t('audioPlayerDownload')}
        >
          <Download size={14} />
        </button>,
      ]}
    />
  );
};
