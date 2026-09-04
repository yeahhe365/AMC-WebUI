import React, { useMemo, useState } from 'react';
import { MapPin, ChevronDown, ChevronUp, ExternalLink, Maximize2, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { buildMapsEmbedUrl, type MapsPlace } from '@/utils/groundingMetadata';
import { Modal } from '@/components/shared/Modal';
import { SETTINGS_SECTION_LABEL_CLASS } from '@/constants/designTokens';

interface MapsWidgetProps {
  places: MapsPlace[];
}

/**
 * Renders an interactive Google Maps embed alongside the list of grounded
 * places. Uses the keyless `maps.google.com/maps?q=...&output=embed` endpoint
 * so no separate Maps API key is required.
 */
export const MapsWidget: React.FC<MapsWidgetProps> = ({ places }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [selectedPlace, setSelectedPlace] = useState<string>(places[0]?.uri ?? '');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);

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

  if (!places || places.length === 0) return null;

  const renderPlaceItem = (place: MapsPlace, isActive: boolean) => (
    <div
      key={`maps-place-${place.chunkIndex}`}
      className={`flex items-center gap-2 p-1.5 rounded-lg border transition-all cursor-pointer ${
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
      <MapPin
        size={14}
        className={`flex-shrink-0 ${isActive ? 'text-[var(--theme-text-link)]' : 'text-[var(--theme-text-tertiary)]'}`}
        strokeWidth={2}
      />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-[var(--theme-text-primary)] truncate leading-tight">{place.title}</div>
      </div>
      <a
        href={place.uri}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-link)] transition-colors"
        title={place.title}
      >
        <ExternalLink size={12} strokeWidth={2} />
      </a>
      {/* Use chunkIndex+1 to match the [N] citation markers in the text body. */}
      <span className="text-xs font-mono font-medium text-[var(--theme-text-tertiary)] opacity-40">
        [{place.chunkIndex + 1}]
      </span>
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
        <MapPin size={11} className="text-[var(--theme-text-tertiary)]" strokeWidth={2} />
        <h4 className={SETTINGS_SECTION_LABEL_CLASS}>{t('mapsSourcesTitle')}</h4>
        <ChevronDown
          size={14}
          className={`ml-auto text-[var(--theme-text-tertiary)] transition-transform ${expanded ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>

      {expanded && (
        <div className="space-y-2">
          {embedSrc && (
            <div className="group relative overflow-hidden rounded-xl border border-[var(--theme-border-secondary)]/40">
              <iframe
                title={t('mapsSourcesTitle')}
                src={embedSrc}
                className="w-full"
                style={{ border: 0, aspectRatio: '16 / 9' }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/50 text-white text-xs font-medium opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/70 cursor-pointer"
                title={t('mapsExpand')}
              >
                <Maximize2 size={12} strokeWidth={2} />
                <span>{t('mapsExpand')}</span>
              </button>
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

      <Modal
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        noPadding
        contentClassName="w-[95vw] h-[90vh] max-w-[1400px] bg-[var(--theme-bg-primary)] rounded-xl overflow-hidden flex flex-col"
        ariaLabel={t('mapsSourcesTitle')}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border-secondary)]/40 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin size={16} className="text-[var(--theme-text-link)] flex-shrink-0" strokeWidth={2} />
            <span className="text-sm font-medium text-[var(--theme-text-primary)] truncate">{activePlace?.title}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsFullscreen(false)}
            className="flex-shrink-0 p-1.5 rounded-lg text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0">
            {embedSrc && (
              <iframe
                title={t('mapsSourcesTitle')}
                src={embedSrc}
                className="w-full h-full"
                style={{ border: 0 }}
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            )}
          </div>
          {places.length > 1 && (
            <div className="w-64 flex-shrink-0 border-l border-[var(--theme-border-secondary)]/40 overflow-y-auto custom-scrollbar p-2 space-y-1.5 hidden sm:block">
              {places.map((place) => (
                <div key={`modal-place-${place.chunkIndex}`}>
                  {renderPlaceItem(place, place.uri === effectiveSelectedPlace)}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
