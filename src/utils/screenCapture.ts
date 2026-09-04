import { logService } from '@/services/logService';
import { toastError } from '@/stores/toastStore';
import { getErrorMessage } from './errorMessage';
/**
 * Captures the current screen content as an image Blob.
 * Handles browser support checks, stream acquisition, and fallback to video element capture.
 */
interface ScreenImageCapture {
  grabFrame: () => Promise<ImageBitmap>;
}

type ScreenImageCaptureConstructor = new (track: MediaStreamTrack) => ScreenImageCapture;

type DisplayMediaVideoConstraints = MediaTrackConstraints & {
  mediaSource?: 'screen' | 'window' | 'application' | 'browser';
};

interface ScreenCaptureMessages {
  unsupported: string;
  startFailed: (message: string) => string;
}

const VIDEO_METADATA_TIMEOUT_MS = 3000;

const getScreenImageCaptureConstructor = (): ScreenImageCaptureConstructor | undefined => {
  const imageCapture: unknown = Reflect.get(globalThis, 'ImageCapture');
  return typeof imageCapture === 'function' ? (imageCapture as ScreenImageCaptureConstructor) : undefined;
};

export const captureScreenImage = async (messages: ScreenCaptureMessages): Promise<Blob | null> => {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.getDisplayMedia) {
    toastError(messages.unsupported);
    return null;
  }

  let stream: MediaStream;
  try {
    stream = await mediaDevices.getDisplayMedia({
      video: { mediaSource: 'screen' } as DisplayMediaVideoConstraints,
      audio: false,
    });
  } catch (error) {
    const errorName = error instanceof DOMException ? error.name : undefined;
    const errorMessage = getErrorMessage(error);
    logService.error('Error starting screen capture:', error);
    if (errorName !== 'NotAllowedError') {
      toastError(messages.startFailed(errorMessage));
    }
    return null;
  }

  const track = stream.getVideoTracks()[0];
  if (!track) {
    logService.error('No video track found in the stream.');
    stream.getTracks().forEach((t) => t.stop());
    return null;
  }

  return new Promise<Blob | null>((resolve) => {
    let isSettled = false;
    const cleanup = () => stream.getTracks().forEach((t) => t.stop());
    const finish = (blob: Blob | null) => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      cleanup();
      resolve(blob);
    };

    const processBitmap = (bitmap: ImageBitmap) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (!context || canvas.width === 0 || canvas.height === 0) {
          finish(null);
          return;
        }
        context.drawImage(bitmap, 0, 0);
        canvas.toBlob((blob) => {
          finish(blob);
        }, 'image/png');
      } catch (drawError) {
        logService.error('Error drawing bitmap:', drawError);
        finish(null);
      }
    };

    // Attempt to use ImageCapture API (Chrome/Edge)
    const ImageCaptureCtor = getScreenImageCaptureConstructor();
    if (ImageCaptureCtor) {
      const imageCapture = new ImageCaptureCtor(track);
      imageCapture
        .grabFrame()
        .then(processBitmap)
        .catch((error: unknown) => {
          logService.warn('ImageCapture failed, falling back to video element:', error);
          fallbackToVideo();
        });
    } else {
      fallbackToVideo();
    }

    function fallbackToVideo() {
      let video: HTMLVideoElement | null = null;
      let metadataTimeout: number | undefined;
      const clearFallbackTimeout = () => {
        if (metadataTimeout !== undefined) {
          window.clearTimeout(metadataTimeout);
          metadataTimeout = undefined;
        }
      };
      const removeVideo = () => {
        clearFallbackTimeout();
        video?.pause();
        video?.remove();
        video = null;
      };

      const fail = (error?: unknown) => {
        if (error) {
          logService.warn('Video fallback failed:', error);
        }
        removeVideo();
        finish(null);
      };

      try {
        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        metadataTimeout = window.setTimeout(() => {
          fail(new Error('Timed out waiting for captured video metadata.'));
        }, VIDEO_METADATA_TIMEOUT_MS);
        video.onloadedmetadata = async () => {
          try {
            if (!video) {
              finish(null);
              return;
            }

            await video.play();
            await new Promise((painted) => requestAnimationFrame(painted));

            if (!video.videoWidth || !video.videoHeight) {
              fail(new Error('Captured video stream did not provide a drawable frame.'));
              return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            if (!context) {
              fail(new Error('Could not create canvas context for screenshot.'));
              return;
            }

            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
              removeVideo();
              finish(blob);
            }, 'image/png');
          } catch (error) {
            fail(error);
          }
        };
        video.onerror = () => fail();
      } catch (captureError) {
        fail(captureError);
      }
    }
  });
};
