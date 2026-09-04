import { logService } from '@/services/logService';

type NotificationOptionsWithTag = NotificationOptions & {
  renotify?: boolean;
  tag?: string;
};

type WindowWithWebkitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const SUCCESS_FIRST_NOTE_FREQUENCY = 659.25; // E5
const SUCCESS_SECOND_NOTE_FREQUENCY = 523.25; // C5
const ERROR_FIRST_NOTE_FREQUENCY = 329.63; // E4
const ERROR_SECOND_NOTE_FREQUENCY = 261.63; // C4
const FIRST_NOTE_DURATION_S = 0.15;
const SECOND_NOTE_DURATION_S = 0.2;

/** Minimum gap between two plays so stacked completions do not overlap. */
export const COMPLETION_SOUND_COOLDOWN_MS = 800;

export type CompletionSoundVariant = 'success' | 'error';

interface CompletionNoteSpec {
  frequency: number;
  overtoneFrequency: number;
  duration: number;
  peakGain: number;
  type: OscillatorType;
}

const COMPLETION_SOUND_VARIANTS: Record<CompletionSoundVariant, [CompletionNoteSpec, CompletionNoteSpec]> = {
  // Warm two-tone chime: fundamental + quiet octave overtone reads as a soft
  // bell instead of a bare system beep.
  success: [
    {
      frequency: SUCCESS_FIRST_NOTE_FREQUENCY,
      overtoneFrequency: SUCCESS_FIRST_NOTE_FREQUENCY * 2,
      duration: FIRST_NOTE_DURATION_S,
      peakGain: 0.2,
      type: 'sine',
    },
    {
      frequency: SUCCESS_SECOND_NOTE_FREQUENCY,
      overtoneFrequency: SUCCESS_SECOND_NOTE_FREQUENCY * 2,
      duration: SECOND_NOTE_DURATION_S,
      peakGain: 0.2,
      type: 'sine',
    },
  ],
  // Lower, duller descending pair so failures are distinguishable by ear.
  error: [
    {
      frequency: ERROR_FIRST_NOTE_FREQUENCY,
      overtoneFrequency: ERROR_FIRST_NOTE_FREQUENCY * 2,
      duration: FIRST_NOTE_DURATION_S + 0.05,
      peakGain: 0.18,
      type: 'triangle',
    },
    {
      frequency: ERROR_SECOND_NOTE_FREQUENCY,
      overtoneFrequency: ERROR_SECOND_NOTE_FREQUENCY * 2,
      duration: SECOND_NOTE_DURATION_S + 0.05,
      peakGain: 0.18,
      type: 'triangle',
    },
  ],
};

export const showNotification = async (title: string, options?: NotificationOptions) => {
  if (!('Notification' in window)) {
    logService.warn('This browser does not support desktop notification');
    return;
  }

  const show = () => {
    try {
      const notification = new Notification(title, {
        ...options,
        tag: 'amc-webui-response',
        renotify: true,
      } as NotificationOptionsWithTag);

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      setTimeout(() => {
        notification.close();
      }, 7000);
    } catch (error) {
      logService.warn('Failed to create notification.', { error });
    }
  };

  if (Notification.permission === 'granted') {
    show();
  } else if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        show();
      }
    } catch (error) {
      logService.warn('Failed to request notification permission.', { error });
    }
  }
};

let sharedAudioContext: AudioContext | null = null;
let lastSoundPlayedAt = 0;

const getAudioContext = () => {
  if (!sharedAudioContext) {
    const AudioContextClass = window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioContext = new AudioContextClass();
    }
  }
  return sharedAudioContext;
};

export const playCompletionSound = async (variant: CompletionSoundVariant = 'success') => {
  // Debounce stacked completions (parallel sessions finishing together)
  // instead of letting their chimes overlap.
  const now = Date.now();
  if (now - lastSoundPlayedAt < COMPLETION_SOUND_COOLDOWN_MS) {
    return;
  }
  lastSoundPlayedAt = now;

  try {
    const audioContext = getAudioContext();
    if (!audioContext) return;

    if (audioContext.state === 'suspended') {
      await audioContext.resume().catch(() => undefined);
    }

    const playNote = (spec: CompletionNoteSpec, startTime: number) => {
      const playVoice = (frequency: number, gainScale: number) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = spec.type;
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + startTime);

        gainNode.gain.setValueAtTime(0, audioContext.currentTime + startTime);
        gainNode.gain.linearRampToValueAtTime(spec.peakGain * gainScale, audioContext.currentTime + startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + startTime + spec.duration);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start(audioContext.currentTime + startTime);
        oscillator.stop(audioContext.currentTime + startTime + spec.duration);
      };

      playVoice(spec.frequency, 1);
      // Quiet octave overtone warms the timbre (bell-like).
      playVoice(spec.overtoneFrequency, 0.3);
    };

    const [firstNote, secondNote] = COMPLETION_SOUND_VARIANTS[variant];
    playNote(firstNote, 0);
    playNote(secondNote, FIRST_NOTE_DURATION_S);
  } catch (error) {
    logService.error('Error playing completion sound', error);
  }
};
