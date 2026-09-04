import { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render/providerRenderer';
import { AudioRecorder } from './AudioRecorder';

const { mockUseAudioRecorder, mockUseAudioAnalyser, mockUseLiveTranscription } = vi.hoisted(() => ({
  mockUseAudioRecorder: vi.fn(),
  mockUseAudioAnalyser: vi.fn(),
  mockUseLiveTranscription: vi.fn(),
}));

vi.mock('@/features/audio/useAudioRecorder', () => ({
  useAudioRecorder: mockUseAudioRecorder,
}));

vi.mock('@/features/audio/useAudioAnalyser', () => ({
  useAudioAnalyser: mockUseAudioAnalyser,
}));

vi.mock('@/hooks/live-api/useLiveTranscription', () => ({
  useLiveTranscription: mockUseLiveTranscription,
}));

vi.mock('@/components/audio/AudioVisualizer', () => ({
  AudioVisualizer: () => <div data-testid="audio-visualizer" />,
}));

vi.mock('@/components/shared/AudioPlayer', () => ({
  AudioPlayer: () => <div data-testid="audio-player" />,
}));

describe('AudioRecorder', () => {
  const recorderState = {
    viewState: 'idle' as 'idle' | 'recording' | 'review',
    isInitializing: false,
    isPaused: false,
    recordingTime: 0,
    audioBlob: null as Blob | null,
    audioUrl: null as string | null,
    error: null as string | null,
    errorKind: null as 'permission' | 'device' | 'unsupported' | 'unknown' | null,
    recordedMimeType: null as string | null,
    hasHitDurationLimit: false,
    audioInputDevices: [] as MediaDeviceInfo[],
    selectedDeviceId: undefined as string | undefined,
    setSelectedDeviceId: vi.fn(),
    stream: null as MediaStream | null,
    status: 'idle' as 'idle' | 'recording' | 'paused',
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    discardRecording: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    recorderState.viewState = 'idle';
    recorderState.isInitializing = false;
    recorderState.isPaused = false;
    recorderState.recordingTime = 0;
    recorderState.audioBlob = null;
    recorderState.audioUrl = null;
    recorderState.error = null;
    recorderState.errorKind = null;
    recorderState.recordedMimeType = null;
    recorderState.hasHitDurationLimit = false;
    recorderState.audioInputDevices = [];
    recorderState.selectedDeviceId = undefined;
    recorderState.setSelectedDeviceId = vi.fn();
    recorderState.stream = null;
    recorderState.status = 'idle';
    recorderState.startRecording = vi.fn();
    recorderState.stopRecording = vi.fn();
    recorderState.pauseRecording = vi.fn();
    recorderState.resumeRecording = vi.fn();
    recorderState.discardRecording = vi.fn();

    mockUseAudioRecorder.mockImplementation(() => recorderState);
    mockUseAudioAnalyser.mockImplementation(() => ({ analyser: null, isSilent: false }));
    mockUseLiveTranscription.mockImplementation(() => ({
      isListening: false,
      interimText: '',
      finalText: '',
      volume: 0,
      error: null,
      startListening: vi.fn(),
      stopListening: vi.fn().mockResolvedValue('Transcribed text'),
      cancelListening: vi.fn(),
    }));
  });

  it('starts microphone recording automatically when the recorder opens', () => {
    renderWithProviders(<AudioRecorder onRecord={vi.fn()} onCancel={vi.fn()} />);

    expect(recorderState.startRecording).toHaveBeenCalledTimes(1);
    expect(recorderState.startRecording).toHaveBeenCalledWith();
  });

  it('starts microphone recording only once even when idle re-renders', () => {
    const { rerender } = renderWithProviders(<AudioRecorder onRecord={vi.fn()} onCancel={vi.fn()} />);

    rerender(<AudioRecorder onRecord={vi.fn()} onCancel={vi.fn()} />);

    expect(recorderState.startRecording).toHaveBeenCalledTimes(1);
  });

  it('offers a manual retry button that restarts microphone recording', () => {
    renderWithProviders(<AudioRecorder onRecord={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /record microphone/i }));

    expect(recorderState.startRecording).toHaveBeenCalledTimes(2);
  });

  it('closes straight away when nothing has been recorded yet', () => {
    const onCancel = vi.fn();
    renderWithProviders(<AudioRecorder onRecord={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation before discarding audio that was already captured', () => {
    recorderState.viewState = 'recording';
    recorderState.status = 'recording';
    recorderState.recordingTime = 42;
    const onCancel = vi.fn();

    renderWithProviders(<AudioRecorder onRecord={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel recording/i }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByText('Discard this recording?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^discard$/i }));

    expect(recorderState.discardRecording).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('exposes pause and resume while a session is in progress', () => {
    recorderState.viewState = 'recording';
    recorderState.status = 'recording';

    const { rerender } = renderWithProviders(<AudioRecorder onRecord={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(recorderState.pauseRecording).toHaveBeenCalledTimes(1);

    recorderState.isPaused = true;
    recorderState.status = 'paused';
    rerender(<AudioRecorder onRecord={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(recorderState.resumeRecording).toHaveBeenCalledTimes(1);
  });

  it('names the saved file after the mime type the browser actually recorded', async () => {
    const blob = new Blob(['audio'], { type: 'audio/mp4' });
    recorderState.viewState = 'review';
    recorderState.status = 'idle';
    recorderState.audioBlob = blob;
    recorderState.audioUrl = 'blob:recording';
    recorderState.recordedMimeType = 'audio/mp4';
    const onRecord = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(<AudioRecorder onRecord={onRecord} onCancel={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save recording/i }));
    });

    expect(onRecord).toHaveBeenCalledTimes(1);
    const savedFile = onRecord.mock.calls[0][0] as File;
    expect(savedFile.type).toBe('audio/mp4');
    expect(savedFile.name).toMatch(/^rec-\d{4}-\d{6}\.m4a$/);
  });

  it('warns when the recording hit the duration cap', () => {
    recorderState.viewState = 'review';
    recorderState.audioBlob = new Blob(['audio'], { type: 'audio/webm' });
    recorderState.audioUrl = 'blob:recording';
    recorderState.hasHitDurationLimit = true;

    renderWithProviders(<AudioRecorder onRecord={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/reached the 1:00:00 limit/i)).toBeInTheDocument();
  });

  it('surfaces a silence warning when the analyser reports no input', () => {
    recorderState.viewState = 'recording';
    recorderState.status = 'recording';
    mockUseAudioAnalyser.mockImplementation(() => ({ analyser: null, isSilent: true }));

    renderWithProviders(<AudioRecorder onRecord={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/no sound detected/i)).toBeInTheDocument();
  });

  it('renders the recorder in Chinese when the app language is Chinese', () => {
    renderWithProviders(<AudioRecorder onRecord={vi.fn()} onCancel={vi.fn()} />, { language: 'zh' });

    expect(screen.getByRole('heading', { name: '录音' })).toBeInTheDocument();
    expect(recorderState.startRecording).toHaveBeenCalledWith();
  });

  it('switches to live streaming tab and displays dictation interface', () => {
    renderWithProviders(<AudioRecorder onRecord={vi.fn()} onCancel={vi.fn()} />);

    const liveTabButton = screen.getByRole('button', { name: /实时流式听写/i });
    expect(liveTabButton).toBeInTheDocument();

    fireEvent.click(liveTabButton);

    expect(screen.getByText('Smart 智能')).toBeInTheDocument();
    expect(screen.getByText('逐字')).toBeInTheDocument();
  });
});
