import React from 'react';
import { type ChatMessage } from '@/types';

interface MessageListFooterProps {
  messages: ChatMessage[];
  chatInputHeight: number;
}

const getStableSpacerHeight = (chatInputHeight: number) => Math.ceil(chatInputHeight) + 20;
const getLoadingSpacerHeight = (chatInputHeight: number) => `calc(${getStableSpacerHeight(chatInputHeight)}px + 52svh)`;
const getLoadingSpacerMaxHeight = (chatInputHeight: number) =>
  `calc(${getStableSpacerHeight(chatInputHeight)}px + 24rem)`;

export const MessageListFooter: React.FC<MessageListFooterProps> = React.memo(({ messages, chatInputHeight }) => {
  const lastMsg = messages[messages.length - 1];
  const isLastMessageLoading = lastMsg?.role === 'model' && lastMsg?.isLoading;

  const heightStyle: React.CSSProperties = {
    height: isLastMessageLoading
      ? getLoadingSpacerHeight(chatInputHeight || 140)
      : chatInputHeight
        ? `${getStableSpacerHeight(chatInputHeight)}px`
        : '160px',
    maxHeight: isLastMessageLoading ? getLoadingSpacerMaxHeight(chatInputHeight || 140) : undefined,
    // Ease the loading→stable collapse so the viewport isn't yanked when the
    // model finishes generating (Virtuoso re-measures continuously).
    transition: 'height 180ms ease-out, max-height 180ms ease-out',
    overflowAnchor: 'none',
  };

  return <div style={heightStyle} />;
});
