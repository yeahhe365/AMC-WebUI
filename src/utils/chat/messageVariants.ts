import type { ChatMessage, SavedChatSession, UploadedFile } from '@/types';

/**
 * Creates a clean snapshot of a message suitable for storage in `variants`.
 * Strips nested variants and currentVariantIndex to prevent recursive data blowup.
 */
const createVariantSnapshot = (message: ChatMessage): ChatMessage => {
  const snapshot = { ...message };
  delete snapshot.variants;
  delete snapshot.currentVariantIndex;
  return snapshot;
};

/**
 * Finds the index of a message in a session by its current active id OR by any of its variant ids.
 */
const findMessageIndexWithVariants = (messages: ChatMessage[], messageId: string): number => {
  return messages.findIndex(
    (message) => message.id === messageId || message.variants?.some((variant) => variant.id === messageId),
  );
};

/**
 * Switches the active variant of a message within a chat session.
 * Saves the current active state of the message into `variants[currentIndex]`
 * and updates the active message with the attributes from `variants[targetIndex]`.
 */
export const switchMessageVariant = (
  session: SavedChatSession,
  messageId: string,
  targetIndex: number,
): SavedChatSession => {
  const msgIndex = findMessageIndexWithVariants(session.messages, messageId);
  if (msgIndex === -1) return session;

  const currentMsg = session.messages[msgIndex];
  const variants = currentMsg.variants;
  if (!variants || targetIndex < 0 || targetIndex >= variants.length) {
    return session;
  }

  const currentIndex = currentMsg.currentVariantIndex ?? variants.length - 1;
  if (currentIndex === targetIndex) return session;

  const updatedVariants = [...variants];
  updatedVariants[currentIndex] = createVariantSnapshot(currentMsg);

  const targetVariant = updatedVariants[targetIndex];
  const nextActiveMsg: ChatMessage = {
    ...targetVariant,
    variants: updatedVariants,
    currentVariantIndex: targetIndex,
  };

  const nextMessages = [...session.messages];
  nextMessages[msgIndex] = nextActiveMsg;

  return {
    ...session,
    messages: nextMessages,
  };
};

/**
 * Attaches a newly created loading message as the next variant of an existing model message.
 * Initializes variants array if this is the first retry.
 */
export const appendModelVariant = (existingMessage: ChatMessage, newLoadingMessage: ChatMessage): ChatMessage => {
  const prevVariants = existingMessage.variants
    ? [...existingMessage.variants]
    : [createVariantSnapshot(existingMessage)];

  const currentIndex = existingMessage.currentVariantIndex ?? prevVariants.length - 1;
  // Ensure the current active state of existingMessage is saved in its variant slot
  prevVariants[currentIndex] = createVariantSnapshot(existingMessage);

  const newVariantIndex = prevVariants.length;
  const newLoadingSnapshot = createVariantSnapshot(newLoadingMessage);
  const updatedVariants = [...prevVariants, newLoadingSnapshot];

  return {
    ...newLoadingMessage,
    variants: updatedVariants,
    currentVariantIndex: newVariantIndex,
  };
};

/** Transform attachments in both the active reply and every stored snapshot.
 * Preserve references when the transform leaves all files untouched.
 */
export const mapMessageFiles = (
  message: ChatMessage,
  map: (files: UploadedFile[], message: ChatMessage) => UploadedFile[] | undefined,
): ChatMessage => {
  const files = message.files ? map(message.files, message) : message.files;
  const variants = message.variants?.map((variant) => mapMessageFiles(variant, map));
  const variantsChanged = variants?.some((variant, index) => variant !== message.variants![index]);
  if (files === message.files && !variantsChanged) return message;
  return { ...message, files, ...(variantsChanged ? { variants } : {}) };
};
