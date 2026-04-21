// @ts-ignore
import fixWebmDuration from 'fix-webm-duration';
import { useState, useRef, useCallback } from 'react';

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
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  // When recording started (ms), updated after each resume
  const segmentStartRef = useRef<number>(0);
  // Total elapsed seconds before current segment
  const accumulatedRef = useRef<number>(0);

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

  const startRecording = useCallback(async () => {
    try {
      // Reset state
      chunksRef.current = [];
      setAudioBlob(null);
      setAudioUrl(null);
      setDuration(0);
      setFinalDuration(0);
      accumulatedRef.current = 0;

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

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
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        // Capture final duration before clearing timer
        const segmentSecs = segmentStartRef.current
          ? (Date.now() - segmentStartRef.current) / 1000
          : 0;
        const total = Math.floor(accumulatedRef.current + segmentSecs);
        setFinalDuration(total);
        clearTimer();

        // Create blob
        const rawBlob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        
        // Fix duration if it's a WebM blob, ensuring cross-browser playback
        if (mediaRecorder.mimeType.includes('webm')) {
          fixWebmDuration(rawBlob, total * 1000, { logger: false }).then((fixedBlob: Blob) => {
            setAudioBlob(fixedBlob);
            const url = URL.createObjectURL(fixedBlob);
            setAudioUrl(url);
            onRecordingComplete?.(fixedBlob, total);
          }).catch((err: any) => {
            console.error('Failed to fix WebM duration', err);
            // Fallback to raw blob
            setAudioBlob(rawBlob);
            const url = URL.createObjectURL(rawBlob);
            setAudioUrl(url);
            onRecordingComplete?.(rawBlob, total);
          });
        } else {
          setAudioBlob(rawBlob);
          const url = URL.createObjectURL(rawBlob);
          setAudioUrl(url);
          onRecordingComplete?.(rawBlob, total);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        onError?.(new Error('Recording error occurred'));
      };

      // Start recording
      mediaRecorder.start(); // Collect single chunk to avoid WebM duration bugs
      setIsRecording(true);
      setIsPaused(false);

      // Start duration timer
      startTimer();
    } catch (error) {
      console.error('Error starting recording:', error);
      onError?.(error as Error);
    }
  }, [onRecordingComplete, onError, startTimer, clearTimer]);

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
      // Accumulate elapsed time from this segment
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
    // Clean up any existing URL
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    clearTimer();

    // Reset all state
    chunksRef.current = [];
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setFinalDuration(0);
    setIsRecording(false);
    setIsPaused(false);
    accumulatedRef.current = 0;
    segmentStartRef.current = 0;
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
