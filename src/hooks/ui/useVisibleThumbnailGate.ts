import { useEffect, useRef, useState } from 'react';

export const useVisibleThumbnailGate = (enabled: boolean) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(() => !enabled || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (!enabled || isVisible) {
      return undefined;
    }

    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => setIsVisible(true));
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, isVisible]);

  return { containerRef, isVisible };
};
