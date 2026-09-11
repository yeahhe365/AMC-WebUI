export const copySelectionTextToClipboardEvent = (event: ClipboardEvent, text: string): boolean => {
  if (!text || !event.clipboardData) {
    return false;
  }

  event.preventDefault();
  event.clipboardData.setData('text/plain', text);
  return true;
};
