import React, { useState, useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Modal } from '@/components/shared/Modal';
import { MapPinned, Navigation, X } from 'lucide-react';
import { PRESET_LOCATIONS, requestBrowserLocation, type PresetLocation } from '@/utils/geolocation';
import type { GeoLocationCoordinates } from '@/types';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import { useSettingsStore } from '@/stores/settingsStore';

interface GoogleMapsLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  location?: GeoLocationCoordinates;
  onSave: (location: GeoLocationCoordinates | undefined) => void;
}

export const GoogleMapsLocationModal: React.FC<GoogleMapsLocationModalProps> = ({
  isOpen,
  onClose,
  location,
  onSave,
}) => {
  const { t } = useI18n();
  const [draftName, setDraftName] = useState(location?.name ?? '');
  const [draftLat, setDraftLat] = useState(location?.latitude !== undefined ? String(location.latitude) : '');
  const [draftLng, setDraftLng] = useState(location?.longitude !== undefined ? String(location.longitude) : '');
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraftName(location?.name ?? '');
      setDraftLat(location?.latitude !== undefined ? String(location.latitude) : '');
      setDraftLng(location?.longitude !== undefined ? String(location.longitude) : '');
      setIsLocating(false);
      setLocateError(null);
      setSetAsDefault(false);
    }
  }, [isOpen, location]);

  const parsedLat = parseFloat(draftLat);
  const parsedLng = parseFloat(draftLng);
  const hasCoordinatesInput = draftLat.trim() !== '' || draftLng.trim() !== '';
  const isCoordinatesValid =
    !Number.isNaN(parsedLat) &&
    !Number.isNaN(parsedLng) &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLng >= -180 &&
    parsedLng <= 180;

  const handleDetectLocation = async () => {
    setIsLocating(true);
    setLocateError(null);
    try {
      const position = await requestBrowserLocation();
      setDraftLat(String(position.latitude));
      setDraftLng(String(position.longitude));
      setDraftName(position.name || '当前位置');
    } catch {
      setLocateError(t('mapsLocationLocateFailed'));
    } finally {
      setIsLocating(false);
    }
  };

  const handleSelectPreset = (preset: PresetLocation) => {
    setDraftLat(String(preset.latitude));
    setDraftLng(String(preset.longitude));
    setDraftName(preset.name);
    setLocateError(null);
  };

  const handleClear = () => {
    setDraftLat('');
    setDraftLng('');
    setDraftName('');
    onSave(undefined);
    if (setAsDefault) {
      useSettingsStore.getState().setAppSettings((prev) => ({
        ...prev,
        googleMapsLocation: undefined,
      }));
    }
    onClose();
  };

  const handleSave = () => {
    let nextLocation: GeoLocationCoordinates | undefined;
    if (hasCoordinatesInput && isCoordinatesValid) {
      nextLocation = {
        latitude: parsedLat,
        longitude: parsedLng,
        name: draftName.trim() || undefined,
      };
    }

    onSave(nextLocation);

    if (setAsDefault) {
      useSettingsStore.getState().setAppSettings((prev) => ({
        ...prev,
        googleMapsLocation: nextLocation,
      }));
    }

    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-[var(--theme-bg-primary)] p-6 shadow-2xl border border-[var(--theme-border-secondary)]">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--theme-border-secondary)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--theme-bg-accent)]/10 text-[var(--theme-text-link)]">
              <MapPinned size={20} strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--theme-text-primary)]">{t('mapsLocationTitle')}</h2>
              <p className="text-xs text-[var(--theme-text-secondary)] mt-0.5">{t('mapsLocationDesc')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors focus:outline-none"
            aria-label={t('close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
          <button
            type="button"
            onClick={handleDetectLocation}
            disabled={isLocating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Navigation
              size={16}
              className={isLocating ? 'animate-spin text-[var(--theme-text-link)]' : 'text-[var(--theme-text-link)]'}
            />
            <span>{isLocating ? t('mapsLocationLocating') : t('mapsLocationCurrentBtn')}</span>
          </button>

          {locateError && (
            <div className="text-xs text-[var(--theme-text-danger)] bg-[var(--theme-bg-danger)]/10 rounded-lg p-2.5">
              {locateError}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-[var(--theme-text-secondary)] mb-2 block">
              {t('mapsLocationPresetCities')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_LOCATIONS.map((preset) => {
                const isSelected =
                  draftLat !== '' &&
                  draftLng !== '' &&
                  Math.abs(Number(draftLat) - preset.latitude) < 0.001 &&
                  Math.abs(Number(draftLng) - preset.longitude) < 0.001;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors border ${
                      isSelected
                        ? 'bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] border-[var(--theme-bg-accent)]'
                        : 'bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] border-[var(--theme-border-secondary)]'
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-[var(--theme-border-secondary)]">
            <label className="text-xs font-medium text-[var(--theme-text-secondary)] block">
              {t('mapsLocationCoordinates')}
            </label>

            <div>
              <label className="text-xs text-[var(--theme-text-secondary)] mb-1 block">{t('mapsLocationName')}</label>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="如：北京、办公室、家"
                className={SETTINGS_INPUT_CLASS}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--theme-text-secondary)] mb-1 block">
                  {t('mapsLocationLatitude')}
                </label>
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={draftLat}
                  onChange={(e) => setDraftLat(e.target.value)}
                  placeholder="39.9042"
                  className={SETTINGS_INPUT_CLASS}
                />
              </div>
              <div>
                <label className="text-xs text-[var(--theme-text-secondary)] mb-1 block">
                  {t('mapsLocationLongitude')}
                </label>
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={draftLng}
                  onChange={(e) => setDraftLng(e.target.value)}
                  placeholder="116.4074"
                  className={SETTINGS_INPUT_CLASS}
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--theme-text-secondary)] select-none">
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={(e) => setSetAsDefault(e.target.checked)}
                className="rounded border-[var(--theme-border-secondary)] text-[var(--theme-bg-accent)] focus:ring-0"
              />
              <span>{t('mapsLocationSetDefault')}</span>
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between pt-4 border-b-0 border-t border-[var(--theme-border-secondary)]">
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-icon-error)] transition-colors"
          >
            {t('mapsLocationClear')}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg font-medium text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={hasCoordinatesInput && !isCoordinatesValid}
              className="px-4 py-1.5 text-xs rounded-lg font-medium bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {t('mapsLocationApply')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
