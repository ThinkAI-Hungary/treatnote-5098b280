// @ts-ignore
import fixWebmDuration from 'fix-webm-duration';
import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVoiceRecorderOptions {
  onRecordingComplete?: (blob: Blob, duration: number) => void;
  onError?: (error: Error) => void;
}

interface UseVoiceRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  finalDuration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  resetRecording: () => void;
  audioBlob: Blob | null;
  audioUrl: string | null;
}

export function useVoiceRecorder({
  onRecordingComplete,
  onError,
}: UseVoiceRecorderOptions = {}): UseVoiceRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [finalDuration, setFinalDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // Keep the stream alive between recordings — avoids repeated permission prompts
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const segmentStartRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);

  // Stable refs so callbacks don't force re-creation of startRecording
  const onRecordingCompleteRef = useRef(onRecordingComplete);
  const onErrorRef = useRef(onError);
  useEffect(() => { onRecordingCompleteRef.current = onRecordingComplete; }, [onRecordingComplete]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // Release the microphone when the component unmounts
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    segmentStartRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      const segmentSecs = (Date.now() - segmentStartRef.current) / 1000;
      setDuration(Math.floor(accumulatedRef.current + segmentSecs));
    }, 100);
  }, [clearTimer]);

  /** Returns an active MediaStream — reuses the existing one if still alive */
  const getStream = useCallback(async (): Promise<MediaStream> => {
    // Reuse if all tracks are still live
    if (streamRef.current && streamRef.current.getTracks().every(t => t.readyState === 'live')) {
      return streamRef.current;
    }
    // Request a fresh stream (shows permission dialog only if not yet granted)
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;
    return stream;
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // Reset audio state
      chunksRef.current = [];
      setAudioBlob(null);
      setAudioUrl(null);
      setDuration(0);
      setFinalDuration(0);
      accumulatedRef.current = 0;

      const stream = await getStream();

      const mediaRecorder = new MediaRecorder(stream, {
        audioBitsPerSecond: 128000,
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // ⚠️  Do NOT stop stream tracks here — keep the stream alive for the
        // next recording so the browser won't re-prompt for microphone access.

        const segmentSecs = segmentStartRef.current
          ? (Date.now() - segmentStartRef.current) / 1000
          : 0;
        const total = Math.floor(accumulatedRef.current + segmentSecs);
        setFinalDuration(total);
        clearTimer();

        const rawBlob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });

        if (mediaRecorder.mimeType.includes('webm')) {
          fixWebmDuration(rawBlob, total * 1000, { logger: false })
            .then((fixedBlob: Blob) => {
              setAudioBlob(fixedBlob);
              setAudioUrl(URL.createObjectURL(fixedBlob));
              onRecordingCompleteRef.current?.(fixedBlob, total);
            })
            .catch((err: any) => {
              console.error('Failed to fix WebM duration', err);
              setAudioBlob(rawBlob);
              setAudioUrl(URL.createObjectURL(rawBlob));
              onRecordingCompleteRef.current?.(rawBlob, total);
            });
        } else {
          setAudioBlob(rawBlob);
          setAudioUrl(URL.createObjectURL(rawBlob));
          onRecordingCompleteRef.current?.(rawBlob, total);
        }
      };

      mediaRecorder.onerror = () => {
        onErrorRef.current?.(new Error('Recording error occurred'));
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsPaused(false);
      startTimer();
    } catch (error) {
      console.error('Error starting recording:', error);
      onErrorRef.current?.(error as Error);
    }
  }, [getStream, startTimer, clearTimer]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
    }
  }, [isRecording]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      const segmentSecs = (Date.now() - segmentStartRef.current) / 1000;
      accumulatedRef.current += segmentSecs;
      segmentStartRef.current = 0;
      clearTimer();
      setIsPaused(true);
    }
  }, [isRecording, isPaused, clearTimer]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      startTimer();
    }
  }, [isRecording, isPaused, startTimer]);

  const resetRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    clearTimer();
    chunksRef.current = [];
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setFinalDuration(0);
    setIsRecording(false);
    setIsPaused(false);
    accumulatedRef.current = 0;
    segmentStartRef.current = 0;
    // Stream stays alive — no need to release it here
  }, [audioUrl, clearTimer]);

  return {
    isRecording,
    isPaused,
    duration,
    finalDuration,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    audioBlob,
    audioUrl,
  };
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
