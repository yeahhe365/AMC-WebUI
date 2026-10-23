import { useMemo, useRef } from 'react';
import type { ChatMessage } from '@/types';

const PROMPT_PREVIEW_LIMIT = 50;
const RESPONSE_PREVIEW_LIMIT = 120;

export interface TurnNavigationItem {
  readonly turn: number;
  readonly messageIndex: number;
  readonly messageId: string;
  readonly prompt: string;
  readonly response: string;
  readonly anchor?:
    { readonly kind: 'loaded'; readonly key?: string } | { readonly kind: 'unloaded'; readonly seq?: number };
}

function normalizeSnippet(text: string, maxLength: number = 140): string {
  if (!text) return '';
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/```[a-zA-Z0-9_-]*\n?/g, ' ')
    .replace(/```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/^[ \t]*[#>*+-]+[ \t]*/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trimEnd()}…`;
}

type SnippetCache = Map<string, { text: string; limit: number; snippet: string }>;

function buildTurnNavigationItems(messages: readonly ChatMessage[], cache: SnippetCache): TurnNavigationItem[] {
  const nextCache: SnippetCache = new Map();
  const snippetFor = (message: ChatMessage, text: string, limit: number) => {
    const cached = cache.get(message.id);
    const entry =
      cached?.text === text && cached.limit === limit
        ? cached
        : { text, limit, snippet: normalizeSnippet(text, limit) };
    nextCache.set(message.id, entry);
    return entry.snippet;
  };
  const items: TurnNavigationItem[] = [];
  let currentItem: {
    turn: number;
    messageIndex: number;
    messageId: string;
    prompt: string;
    response: string;
    anchor: { kind: 'loaded'; key: string };
  } | null = null;
  let turnNumber = 0;

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role === 'user') {
      turnNumber += 1;
      currentItem = {
        turn: turnNumber,
        messageIndex: index,
        messageId: message.id,
        prompt: snippetFor(message, message.content, PROMPT_PREVIEW_LIMIT),
        response: '',
        anchor: { kind: 'loaded', key: message.id },
      };
      items.push(currentItem);
    } else if (message.role === 'model' && currentItem !== null) {
      if (currentItem.response === '') {
        const text = message.content || message.thoughts || '';
        currentItem.response = snippetFor(message, text, RESPONSE_PREVIEW_LIMIT);
      }
    }
  }

  cache.clear();
  nextCache.forEach((value, key) => cache.set(key, value));
  return items;
}

export function extractTurnNavigationItems(messages: readonly ChatMessage[]): TurnNavigationItem[] {
  return buildTurnNavigationItems(messages, new Map());
}

export function useTurnNavigationItems(messages: readonly ChatMessage[]): TurnNavigationItem[] {
  const cache = useRef<SnippetCache>(new Map());
  return useMemo(() => buildTurnNavigationItems(messages, cache.current), [messages]);
}
