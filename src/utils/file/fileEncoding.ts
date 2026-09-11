export const decodeBase64ToArrayBuffer = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const byteLength = binaryString.length;
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

/**
 * Converts an ArrayBuffer or TypedArray/ArrayBufferView to a Base64 string.
 * Uses 32KB chunking to avoid call-stack overflow on large buffers.
 */
export const arrayBufferToBase64 = (buffer: ArrayBuffer | ArrayBufferView): string => {
  const bytes =
    buffer instanceof Uint8Array
      ? buffer
      : ArrayBuffer.isView(buffer)
        ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        : new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

/**
 * Reads a Blob or File and returns it as a data URL (e.g. data:image/png;base64,...).
 */
export const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = (reader.result ?? (event?.target as FileReader | null)?.result) as string | null | undefined;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Failed to convert blob to data URL.'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read blob as data URL.'));
    };
    reader.readAsDataURL(blob);
  });
};

/**
 * Reads a Blob or File and returns it as a Base64 string (without the data URI prefix).
 * Used primarily just before sending data to the API.
 */
export const blobToBase64 = async (blob: Blob): Promise<string> => {
  const dataUrl = await blobToDataUrl(blob);
  const base64Data = dataUrl.split(',')[1];
  if (base64Data) {
    return base64Data;
  }
  throw new Error('Failed to extract base64 data from blob.');
};

export const fileToString = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = (reader.result ?? (event?.target as FileReader | null)?.result) as string | null | undefined;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Failed to read file as text.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file as text.'));
    reader.readAsText(file);
  });
};

export const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteArray = decodeBase64ToArrayBuffer(base64);
  const buffer = new ArrayBuffer(byteArray.byteLength);
  new Uint8Array(buffer).set(byteArray);
  return new Blob([buffer], { type: mimeType });
};
