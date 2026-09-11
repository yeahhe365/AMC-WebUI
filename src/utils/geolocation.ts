import type { GeoLocationCoordinates } from '@/types';

export interface PresetLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export const PRESET_LOCATIONS: PresetLocation[] = [
  { id: 'beijing', name: '北京', latitude: 39.9042, longitude: 116.4074 },
  { id: 'shanghai', name: '上海', latitude: 31.2304, longitude: 121.4737 },
  { id: 'guangzhou', name: '广州', latitude: 23.1291, longitude: 113.2644 },
  { id: 'shenzhen', name: '深圳', latitude: 22.5431, longitude: 114.0579 },
  { id: 'hangzhou', name: '杭州', latitude: 30.2741, longitude: 120.1551 },
  { id: 'chengdu', name: '成都', latitude: 30.5728, longitude: 104.0668 },
  { id: 'wuhan', name: '武汉', latitude: 30.5928, longitude: 114.3055 },
  { id: 'hongkong', name: '香港', latitude: 22.3193, longitude: 114.1694 },
  { id: 'taipei', name: '台北', latitude: 25.033, longitude: 121.5654 },
  { id: 'tokyo', name: '东京', latitude: 35.6762, longitude: 139.6503 },
  { id: 'newyork', name: '纽约', latitude: 40.7128, longitude: -74.006 },
  { id: 'sanfrancisco', name: '旧金山', latitude: 37.7749, longitude: -122.4194 },
  { id: 'london', name: '伦敦', latitude: 51.5074, longitude: -0.1278 },
  { id: 'paris', name: '巴黎', latitude: 48.8566, longitude: 2.3522 },
  { id: 'singapore', name: '新加坡', latitude: 1.3521, longitude: 103.8198 },
  { id: 'sydney', name: '悉尼', latitude: -33.8688, longitude: 151.2093 },
];

/**
 * Validate that coordinates conform to WGS84 standards (-90..90 lat, -180..180 lng).
 */
export const isValidCoordinates = (coords: unknown): coords is GeoLocationCoordinates => {
  if (!coords || typeof coords !== 'object') {
    return false;
  }
  const { latitude, longitude } = coords as Partial<GeoLocationCoordinates>;
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
};

/**
 * Request device/browser coordinates via the HTML5 Geolocation API.
 */
export const requestBrowserLocation = (
  options: PositionOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
): Promise<GeoLocationCoordinates> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator?.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          name: '当前位置',
        });
      },
      (error) => {
        reject(error);
      },
      options,
    );
  });
};

/**
 * Format coordinates or location name for badge display.
 */
export const formatLocationDisplay = (location: GeoLocationCoordinates | undefined, fallbackText = ''): string => {
  if (!location || !isValidCoordinates(location)) {
    return fallbackText;
  }
  if (location.name?.trim()) {
    return location.name.trim();
  }
  return `${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}`;
};
