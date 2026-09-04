import { type Theme, type ThemeColors } from '@/types/theme';

/**
 * Design rationale:
 * - `bgAccent` is reserved for interactive states (selected, focused, primary buttons).
 * - `bgUserMessage` uses a neutral tint, NOT the accent color, to avoid visual confusion
 *   between "selected" UI elements and user message bubbles.
 * - All three themes share the same semantic mapping: accent = blue family, user message = neutral tint.
 * - `textLink` is always distinguishable from body text in every theme.
 *
 * v2: Refined palettes with warmer darks, cooler lights, and better contrast ratios.
 */

const ONYX_THEME_COLORS: ThemeColors = {
  // Backgrounds — deep neutral with subtle warm undertone
  bgPrimary: '#0c0c0e', // Main content area — slightly warmer than pure black
  bgSecondary: '#08080a', // Sidebar / header — darker for depth framing
  bgTertiary: '#1c1c20', // Hover / raised surfaces — lifted for visibility
  bgAccent: '#4f7cf5', // Softer blue 500 — easier on eyes in dark mode
  bgAccentHover: '#3b6bed', // Blue 600
  bgDanger: '#7f1d1d',
  bgDangerHover: '#991b1b',
  bgInput: '#141418', // Input fields — subtle lift from bgPrimary
  bgCodeBlock: '#141418',
  bgCodeBlockHeader: '#1e1e24',
  bgUserMessage: '#202028', // Neutral raised tint with slight warmth
  bgModelMessage: 'transparent',
  bgErrorMessage: 'rgba(127, 29, 29, 0.25)',
  bgSuccess: 'rgba(6, 78, 59, 0.25)',
  textSuccess: '#4ade80',
  bgInfo: 'rgba(30, 58, 138, 0.25)',
  textInfo: '#60a5fa',
  bgWarning: 'rgba(120, 53, 15, 0.25)',
  bgWarningStrong: '#b45309',
  bgWarningStrongHover: '#92400e',
  textWarning: '#fbbf24',

  // Text
  textPrimary: '#f5f5f7', // Near-white with slight warmth
  textSecondary: '#a8a8b3', // Zinc 400 — lifted for readability
  textTertiary: '#78787f', // Muted but readable
  textAccent: '#ffffff',
  textDanger: '#fca5a5',
  textLink: '#6ba3fc', // Blue 400 — brighter for dark bg
  textCode: '#e4e4e7',
  bgUserMessageText: '#f5f5f7',
  bgModelMessageText: '#e4e4e7',
  bgErrorMessageText: '#fca5a5',

  // Borders
  borderPrimary: '#1e1e24', // Subtle separation
  borderSecondary: '#2c2c34', // Visible borders
  borderFocus: '#4f7cf5', // Matches accent

  // Scrollbar
  scrollbarThumb: '#2c2c34',
  scrollbarTrack: 'transparent',

  // Selection
  selectionBg: 'rgba(79, 124, 245, 0.35)',
  selectionText: '#f5f5f7',

  // Icons
  iconUser: '#a8a8b3',
  iconModel: '#6ba3fc',
  iconError: '#ef4444',
  iconThought: '#78787f',
  iconSettings: '#a8a8b3',
  iconClearChat: '#f5f5f7',
  iconSend: '#ffffff',
  iconAttach: '#a8a8b3',
  iconStop: '#ffffff',
  iconEdit: '#a8a8b3',
  iconHistory: '#a8a8b3',
};

const PEARL_THEME_COLORS: ThemeColors = {
  // Backgrounds — clean whites with cool undertone
  bgPrimary: '#fefefe', // Near-pure white
  bgSecondary: '#f6f7f9', // Cool light gray for sidebar
  bgTertiary: '#edeef2', // Raised surfaces
  bgAccent: '#2563eb', // Blue 600 — brand-feel accent
  bgAccentHover: '#1d4ed8', // Blue 700
  bgDanger: '#dc2626',
  bgDangerHover: '#b91c1c',
  bgInput: '#ffffff',
  bgCodeBlock: '#f6f7f9',
  bgCodeBlockHeader: 'rgba(237, 238, 242, 0.9)',
  bgUserMessage: '#eef0f5', // Neutral light tint — NOT accent
  bgModelMessage: '#fefefe',
  bgErrorMessage: '#fef2f2',
  bgSuccess: 'rgba(22, 163, 74, 0.1)',
  textSuccess: '#16a34a',
  bgInfo: 'rgba(37, 99, 235, 0.06)',
  textInfo: '#2563eb',
  bgWarning: 'rgba(212, 167, 44, 0.1)',
  bgWarningStrong: '#d97706',
  bgWarningStrongHover: '#b45309',
  textWarning: '#825f0a',

  // Text
  textPrimary: '#1a1a1f', // Near-black with slight warmth
  textSecondary: '#4a4a55', // Zinc 700
  textTertiary: '#75757f', // Zinc 500
  textAccent: '#ffffff',
  textDanger: '#dc2626',
  textLink: '#2563eb', // Blue 600 — clearly distinguishable
  textCode: '#1a1a1f',
  bgUserMessageText: '#1a1a1f',
  bgModelMessageText: '#1a1a1f',
  bgErrorMessageText: '#dc2626',

  // Borders
  borderPrimary: '#eaeaef',
  borderSecondary: '#d5d5dc',
  borderFocus: '#2563eb',

  // Scrollbar
  scrollbarThumb: '#d5d5dc',
  scrollbarTrack: '#f6f7f9',

  // Selection
  selectionBg: 'rgba(37, 99, 235, 0.15)',
  selectionText: '#1a1a1f',

  // Icons
  iconUser: '#4a4a55',
  iconModel: '#2563eb',
  iconError: '#dc2626',
  iconThought: '#75757f',
  iconSettings: '#4a4a55',
  iconClearChat: '#ffffff',
  iconSend: '#ffffff',
  iconAttach: '#4a4a55',
  iconStop: '#ffffff',
  iconEdit: '#4a4a55',
  iconHistory: '#4a4a55',
};

const GRAPHITE_THEME_COLORS: ThemeColors = {
  // Backgrounds — warm graphite spectrum
  bgPrimary: '#2b2b2e', // Main content
  bgSecondary: '#1f1f22', // Sidebar
  bgTertiary: '#3c3c40', // Raised surfaces
  bgAccent: '#4f7cf5', // Blue — consistent with Onyx
  bgAccentHover: '#3b6bed',
  bgDanger: '#7f1d1d',
  bgDangerHover: '#991b1b',
  bgInput: '#343438',
  bgCodeBlock: '#252528',
  bgCodeBlockHeader: '#313134',
  bgUserMessage: '#3c3c40', // Neutral raised tint
  bgModelMessage: 'transparent',
  bgErrorMessage: 'rgba(127, 29, 29, 0.28)',
  bgSuccess: 'rgba(6, 95, 70, 0.28)',
  textSuccess: '#86efac',
  bgInfo: 'rgba(37, 99, 235, 0.22)',
  textInfo: '#93c5fd',
  bgWarning: 'rgba(120, 53, 15, 0.28)',
  bgWarningStrong: '#b45309',
  bgWarningStrongHover: '#92400e',
  textWarning: '#fde68a',

  // Text
  textPrimary: '#f2f2f4',
  textSecondary: '#b8b8be',
  textTertiary: '#88888f',
  textAccent: '#ffffff',
  textDanger: '#fca5a5',
  textLink: '#6ba3fc',
  textCode: '#f2f2f4',
  bgUserMessageText: '#f2f2f4',
  bgModelMessageText: '#f2f2f4',
  bgErrorMessageText: '#fecaca',

  // Borders
  borderPrimary: '#3c3c40',
  borderSecondary: '#4c4c52',
  borderFocus: '#4f7cf5',

  // Scrollbar
  scrollbarThumb: '#4c4c52',
  scrollbarTrack: 'transparent',

  // Selection
  selectionBg: 'rgba(79, 124, 245, 0.35)',
  selectionText: '#f2f2f4',

  // Icons
  iconUser: '#b8b8be',
  iconModel: '#6ba3fc',
  iconError: '#f87171',
  iconThought: '#88888f',
  iconSettings: '#b8b8be',
  iconClearChat: '#f2f2f4',
  iconSend: '#ffffff',
  iconAttach: '#b8b8be',
  iconStop: '#ffffff',
  iconEdit: '#b8b8be',
  iconHistory: '#b8b8be',
};

export const AVAILABLE_THEMES: Theme[] = [
  { id: 'onyx', name: 'Onyx (Dark)', isDark: true, colors: ONYX_THEME_COLORS },
  { id: 'graphite', name: 'Graphite (Gray)', isDark: true, colors: GRAPHITE_THEME_COLORS },
  { id: 'pearl', name: 'Pearl (Light)', isDark: false, colors: PEARL_THEME_COLORS },
];

export const DEFAULT_THEME_ID = 'pearl';
