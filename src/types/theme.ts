export interface ThemeColors {
  // Backgrounds
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgAccent: string;
  bgAccentHover: string;
  bgDanger: string;
  bgDangerHover: string;
  bgInput: string;
  bgCodeBlock: string;
  bgCodeBlockHeader: string;
  bgUserMessage: string;
  bgModelMessage: string;
  bgErrorMessage: string;
  bgSuccess: string;
  textSuccess: string;
  bgInfo: string;
  textInfo: string;
  bgWarning: string;
  bgWarningStrong: string;
  bgWarningStrongHover: string;
  textWarning: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textAccent: string;
  textDanger: string;
  textLink: string;
  textCode: string;
  bgUserMessageText: string;
  bgModelMessageText: string;
  bgErrorMessageText: string;

  // Borders
  borderPrimary: string;
  borderSecondary: string;
  borderFocus: string;

  // Scrollbar
  scrollbarThumb: string;
  scrollbarTrack: string;

  // Text selection (theme-aware highlight)
  selectionBg: string;
  selectionText: string;

  // Icons
  iconUser: string;
  iconModel: string;
  iconError: string;
  iconThought: string;
  iconSettings: string;
  iconClearChat: string;
  iconSend: string;
  iconAttach: string;
  iconStop: string;
  iconEdit: string;
  iconHistory: string;
}

export interface Theme {
  id: string;
  name: string;
  /** Governs the Tailwind `dark:` variant alongside the theme-* body class. */
  isDark: boolean;
  colors: ThemeColors;
}
