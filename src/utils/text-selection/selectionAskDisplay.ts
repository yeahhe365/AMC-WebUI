const KNOWN_MODEL_TOKENS: Record<string, string> = {
  gemini: 'Gemini',
  gpt: 'GPT',
  glm: 'GLM',
  deepseek: 'DeepSeek',
  claude: 'Claude',
  qwen: 'Qwen',
  kimi: 'Kimi',
  llama: 'Llama',
  mistral: 'Mistral',
  grok: 'Grok',
  tts: 'TTS',
  flash: 'Flash',
  pro: 'Pro',
  lite: 'Lite',
  nano: 'Nano',
  mini: 'Mini',
  ultra: 'Ultra',
  live: 'Live',
  transcribe: 'Transcribe',
  translate: 'Translate',
  robotics: 'Robotics',
  thinking: 'Thinking',
  preview: 'Preview',
  experimental: 'Experimental',
  exp: 'Exp',
  latest: 'Latest',
  stable: 'Stable',
  chat: 'Chat',
  air: 'Air',
};

/**
 * 把原始 modelId 格式化成可读名称（gemini-3.7-flash → Gemini 3.7 Flash）。
 * 面板 chip 等小空间展示用；未知 token 走首字母大写兜底。
 */
export const formatSelectionAskModelLabel = (modelId: string): string => {
  const cleaned = modelId
    .replace(/^models\//, '')
    .replace(/_+/g, '-')
    .trim();
  if (!cleaned) return modelId;

  return cleaned
    .split('-')
    .map((token) => {
      const known = KNOWN_MODEL_TOKENS[token.toLowerCase()];
      if (known) return known;
      if (/^\d/.test(token)) return token;
      if (token.length <= 3 && !/\d/.test(token)) return token.toUpperCase();
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(' ');
};
