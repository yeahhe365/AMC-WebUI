import React, { useMemo, useState, useRef, useEffect } from 'react';
import { MapPin, ChevronDown, ChevronUp, ExternalLink, Maximize2, X, MessageSquareQuote } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { buildMapsEmbedUrl, type MapsPlace } from '@/utils/groundingMetadata';
import { SETTINGS_SECTION_LABEL_CLASS } from '@/constants/designTokens';

interface MapsWidgetProps {
  places: MapsPlace[];
}

/**
 * Renders an interactive Google Maps embed alongside the list of grounded
 * places. Uses a single persistent <iframe> so expanding to fullscreen never
 * triggers an iframe reload or white flash.
 */
export const MapsWidget: React.FC<MapsWidgetProps> = ({ places }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [selectedPlace, setSelectedPlace] = useState<string>(places[0]?.uri ?? '');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const COLLAPSED_LIMIT = 6;
  const visiblePlaces = listExpanded ? places : places.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = places.length - COLLAPSED_LIMIT;

  // Fall back to the first place when the stored selection no longer exists
  // (e.g. the message was regenerated with a different place list).
  const effectiveSelectedPlace = places.some((p) => p.uri === selectedPlace) ? selectedPlace : (places[0]?.uri ?? '');
  const activePlace = places.find((p) => p.uri === effectiveSelectedPlace) ?? places[0];

  const embedSrc = useMemo(() => {
    if (!activePlace) return '';
    return buildMapsEmbedUrl(activePlace);
  }, [activePlace]);

  // Keep isFullscreen in sync with native Fullscreen API when available
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNative = document.fullscreenElement === containerRef.current;
      setIsFullscreen(isNative);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handle Escape key for windowed fullscreen fallback
  useEffect(() => {
    if (!isFullscreen) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          setIsFullscreen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const handleToggleFullscreen = async () => {
    if (!isFullscreen) {
      if (containerRef.current?.requestFullscreen) {
        try {
          await containerRef.current.requestFullscreen();
          return;
        } catch {
          // Fallback to windowed fullscreen
        }
      }
      setIsFullscreen(true);
    } else {
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
          return;
        } catch {
          // Fallback
        }
      }
      setIsFullscreen(false);
    }
  };

  if (!places || places.length === 0) return null;

  const renderPlaceItem = (place: MapsPlace, isActive: boolean) => (
    <div
      key={`maps-place-${place.chunkIndex}`}
      className={`flex flex-col gap-1.5 p-2 rounded-lg border transition-all cursor-pointer ${
        isActive
          ? 'bg-[var(--theme-bg-tertiary)]/60 border-[var(--theme-border-focus)]'
          : 'bg-[var(--theme-bg-tertiary)]/20 border-[var(--theme-border-secondary)]/30 hover:bg-[var(--theme-bg-tertiary)]/60'
      }`}
      onClick={() => setSelectedPlace(place.uri)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setSelectedPlace(place.uri);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <MapPin
          size={14}
          className={`flex-shrink-0 ${isActive ? 'text-[var(--theme-text-link)]' : 'text-[var(--theme-text-tertiary)]'}`}
          strokeWidth={2}
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-[var(--theme-text-primary)] truncate leading-tight">
            {place.title}
          </div>
        </div>
        <a
          href={place.uri}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-link)] transition-colors"
          title={t('mapsViewOnGoogleMaps')}
          aria-label={t('mapsViewOnGoogleMaps')}
        >
          <ExternalLink size={12} strokeWidth={2} />
        </a>
        {/* Use chunkIndex+1 to match the [N] citation markers in the text body. */}
        <span className="text-xs font-mono font-medium text-[var(--theme-text-tertiary)] opacity-40">
          [{place.chunkIndex + 1}]
        </span>
      </div>

      {place.text && place.text !== place.title && (
        <p className="text-[11px] text-[var(--theme-text-secondary)] line-clamp-2 leading-relaxed pl-5">{place.text}</p>
      )}

      {place.reviewSnippets && place.reviewSnippets.length > 0 && (
        <div className="mt-0.5 pt-1.5 border-t border-[var(--theme-border-secondary)]/25 space-y-1 pl-5">
          {place.reviewSnippets.map((snippet, sIdx) => (
            <a
              key={snippet.reviewId || `snippet-${sIdx}`}
              href={snippet.googleMapsUri || place.uri}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="group/review flex items-start gap-1.5 text-[11px] text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-link)] transition-colors"
              title={snippet.title}
            >
              <MessageSquareQuote
                size={12}
                className="flex-shrink-0 mt-0.5 opacity-60 group-hover/review:opacity-100"
              />
              <span className="italic leading-snug line-clamp-2">"{snippet.title}"</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="mt-3 pt-2 border-t border-[var(--theme-border-secondary)]/30 animate-in fade-in slide-in-from-top-1 duration-200">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 mb-2 cursor-pointer"
        aria-expanded={expanded}
      >
        <img
          src="https://www.google.com/images/branding/product/ico/web_maps_icon_32dp.ico"
          alt="Google Maps"
          className="w-3.5 h-3.5 object-contain flex-shrink-0"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
        <h4 className={SETTINGS_SECTION_LABEL_CLASS}>{t('mapsSourcesTitle')}</h4>
        <span
          translate="no"
          className="text-[11px] font-normal text-[var(--theme-text-tertiary)] opacity-80 whitespace-nowrap"
          style={{ fontFamily: 'Roboto, sans-serif' }}
        >
          Google Maps
        </span>
        <ChevronDown
          size={14}
          className={`ml-auto text-[var(--theme-text-tertiary)] transition-transform ${expanded ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>

      {expanded && (
        <div className="space-y-2">
          {embedSrc && (
            <div
              ref={containerRef}
              className={
                isFullscreen
                  ? 'fixed inset-0 z-[9999] flex flex-col bg-[var(--theme-bg-primary)] overflow-hidden w-screen h-screen'
                  : 'group relative overflow-hidden rounded-xl border border-[var(--theme-border-secondary)]/40'
              }
            >
              {isFullscreen && (
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border-secondary)]/40 flex-shrink-0 bg-[var(--theme-bg-primary)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src="https://www.google.com/images/branding/product/ico/web_maps_icon_32dp.ico"
                      alt="Google Maps"
                      className="w-4 h-4 object-contain flex-shrink-0"
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                    <span className="text-sm font-medium text-[var(--theme-text-primary)] truncate">
                      {activePlace?.title}
                    </span>
                    {activePlace?.uri && (
                      <a
                        href={activePlace.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--theme-text-link)] hover:underline flex items-center gap-1 ml-2 whitespace-nowrap flex-shrink-0"
                        title={t('mapsViewOnGoogleMaps')}
                      >
                        <span translate="no">Google Maps</span>
                        <ExternalLink size={11} strokeWidth={2} />
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleFullscreen}
                    className="flex-shrink-0 p-1.5 rounded-lg text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
                    title={t('close')}
                    aria-label={t('close')}
                  >
                    <X size={18} strokeWidth={2} />
                  </button>
                </div>
              )}

              <div className={isFullscreen ? 'flex-1 min-h-0 flex' : 'w-full'}>
                <div className={isFullscreen ? 'flex-1 min-w-0 h-full' : 'w-full'}>
                  <iframe
                    title={t('mapsSourcesTitle')}
                    src={embedSrc}
                    className="w-full h-full"
                    style={{ border: 0, aspectRatio: isFullscreen ? undefined : '16 / 9' }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                </div>

                {isFullscreen && places.length > 1 && (
                  <div className="w-64 sm:w-72 md:w-80 flex-shrink-0 border-l border-[var(--theme-border-secondary)]/40 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-[var(--theme-bg-secondary)]/30 hidden sm:block">
                    <div className="text-xs font-semibold text-[var(--theme-text-secondary)] px-1 mb-1">
                      {t('mapsSourcesTitle')} ({places.length})
                    </div>
                    {places.map((place) => (
                      <div key={`fullscreen-place-${place.chunkIndex}`}>
                        {renderPlaceItem(place, place.uri === effectiveSelectedPlace)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!isFullscreen && (
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/50 text-white text-xs font-medium opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/70 cursor-pointer shadow-sm"
                  title={t('mapsExpand')}
                >
                  <Maximize2 size={12} strokeWidth={2} />
                  <span>{t('mapsExpand')}</span>
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {visiblePlaces.map((place) => renderPlaceItem(place, place.uri === effectiveSelectedPlace))}
          </div>

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setListExpanded((prev) => !prev)}
              className="flex items-center justify-center gap-1 w-full py-1.5 text-xs font-medium text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)] transition-colors cursor-pointer"
            >
              {listExpanded ? (
                <>
                  <ChevronUp size={13} strokeWidth={2} />
                  {t('mapsShowLess')}
                </>
              ) : (
                <>
                  <ChevronDown size={13} strokeWidth={2} />
                  {t('mapsShowMore')} ({hiddenCount})
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
