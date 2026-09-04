import React, { useState, useEffect } from 'react';
import { formatDuration } from '@/utils/durationFormat';

interface ThinkingTimerProps {
  startTimeMs: number;
}

const THINKING_TIMER_POLL_INTERVAL_MS = 1000;

export const ThinkingTimer: React.FC<ThinkingTimerProps> = ({ startTimeMs }) => {
  const [seconds, setSeconds] = useState(() => Math.floor((Date.now() - startTimeMs) / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startTimeMs) / 1000));
    }, THINKING_TIMER_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [startTimeMs]);

  return <span>({formatDuration(seconds)})</span>;
};
