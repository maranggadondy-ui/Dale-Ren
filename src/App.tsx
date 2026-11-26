import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  AlertCircle,
  AudioWaveform,
  CheckCircle2,
  HelpCircle,
  Info,
  Moon,
  PanelLeft,
  Sun,
  X,
} from "lucide-react";
import { AudioSetupModal } from "./components/AudioSetupModal";
import {
  CaptureControlDeck,
  type AudioInputDevice,
  type AudioOutputDevice,
} from "./components/CaptureControlDeck";
import { QuickPasteModal } from "./components/QuickPasteModal";
import { SessionsSidebar } from "./components/SessionsSidebar";
import { ThreePanelWorkspace } from "./components/ThreePanelWorkspace";
import type {
  AppStatusMode,
  GrammarTone,
  GrammarViewMode,
  LayoutMode,
  NoteSession,
  StructuredAiResponse,
  SurfaceType,
  ToastKind,
  ToastMessage,
  WorkspaceTab,
} from "./types";
import { processAudioOnServer, processTextOnServer } from "./utils/api";
import {
  buildFormattedSummaryText,
  buildFullExportContent,
  formatDuration,
  formatLiveUtteranceWithPeriod,
} from "./utils/diff";

const STORAGE_KEY = "sant_studio_sessions_v2";
const THEME_KEY = "sant_theme";
const LIVE_CHUNK_TIMESLICE_MS = 500;
const LIVE_FIRST_CHUNK_MS = 1200;
const LIVE_POLL_INTERVAL_MS = 2500;
const LIVE_REQUEST_TIMEOUT_MS = 25000;

function createEmptyNote(): NoteSession {
  const now = new Date();
  return {
    id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: `Session — ${now.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    createdAt: now.toISOString(),
    duration: "00:00",
    transcript: "",
    grammarCorrected: "",
    detectedLanguages: [],
    translatedText: "",
    grammarFixes: [],
    sentenceCorrections: [],
    execSummary: "",
    keyTakeaways: "",
    actionItems: [],
    keyTerms: "",
  };
}

function loadInitialNotes(): NoteSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as NoteSession[]) : [];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((n) => ({
        ...createEmptyNote(),
        ...n,
        detectedLanguages: Array.isArray(n.detectedLanguages)
          ? n.detectedLanguages
          : [],
        translatedText:
          typeof n.translatedText === "string" ? n.translatedText : "",
        grammarFixes: Array.isArray(n.grammarFixes) ? n.grammarFixes : [],
        sentenceCorrections: Array.isArray(n.sentenceCorrections)
          ? n.sentenceCorrections
          : [],
        actionItems: Array.isArray(n.actionItems) ? n.actionItems : [],
      }));
    }
  } catch {
    // Fallback to a fresh note session
  }
  return [createEmptyNote()];
}

function computeAudioLevelPercent(analyser: AnalyserNode | null): number {
  if (!analyser) return 0;
  const arr = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(arr);
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = Math.abs((arr[i] - 128) / 128);
    sum += v * v;
    if (v > peak) peak = v;
  }
  const rms = Math.sqrt(sum / arr.length);
  const blended = Math.max(rms * 420, peak * 180);
  return Math.min(100, Math.round(blended));
}

function isLoopbackDeviceLabel(label: string): boolean {
  return /stereo mix|loopback|blackhole|soundflower|vb-audio|vb-cable|cable output|voicemeeter|monitor of|wave out|what u hear|virtual audio|system audio/i.test(
    label
  );
}

function isHeadphoneOutputLabel(label: string): boolean {
  return /headphone|headset|earphone|earbud|airpod|buds|bluetooth|wh-|wf-|bose|sony|jabra|usb audio|dac|logitech|razer|hyperx|steelseries/i.test(
    label
  );
}

function isBluetoothHfpMicLabel(label: string): boolean {
  return /hands-free|ag audio/i.test(label);
}

function connectBoostedSystemMix(
  audioCtx: AudioContext,
  source: AudioNode,
  destination: MediaStreamAudioDestinationNode
) {
  const boostGain = audioCtx.createGain();
  boostGain.gain.value = 1.25;
  source.connect(boostGain);
  boostGain.connect(destination);
}

function describeMediaError(err: unknown, context: "display" | "mic"): string {
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("permissions policy") || lower.includes("disallowed")) {
    return context === "display"
      ? "Screen/system audio capture is blocked by the embedded preview frame's permissions policy. Open this app in a full browser tab for System Sound, or click 'Record Microphone Instead' below."
      : "Microphone access is blocked by browser permissions policy. Check site permissions or open this app in a full browser tab.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return context === "mic"
      ? "No microphone device was detected on your system. Connect a mic or headset and click refresh."
      : "No screen or audio capture source was found.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return context === "mic"
      ? "Microphone permission was denied. Allow microphone access in your browser's address bar site settings and retry."
      : "System audio capture permission was denied or cancelled. Make sure to select a screen or tab and enable audio sharing.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Your audio device is currently in use by another app or could not be read by the browser.";
  }
  if (name === "AbortError") {
    return "Audio capture was aborted before starting.";
  }
  return msg || "Unexpected audio capture error.";
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_KEY) !== "light";
    } catch {
      return true;
    }
  });

  const [notes, setNotes] = useState<NoteSession[]>(loadInitialNotes);
  const [activeNoteId, setActiveNoteId] = useState<string>(
    () => notes[0]?.id ?? ""
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [saveStatus, setSaveStatus] = useState("Saved");

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [quickPasteOpen, setQuickPasteOpen] = useState(false);

  const [layoutMode, setLayoutMode] = useState<LayoutMode>("split");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("raw");
  const [grammarViewMode, setGrammarViewMode] =
    useState<GrammarViewMode>("lines");
  const [grammarTone, setGrammarTone] = useState<GrammarTone>("professional");
  const [targetLanguage, setTargetLanguage] = useState<string>("English");

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [isLiveTranscribing, setIsLiveTranscribing] = useState(false);
  const [elapsedTime, setElapsedTime] = useState("00:00");
  const [audioSourceLabel, setAudioSourceLabel] = useState("Idle");
  const [surfaceType, setSurfaceType] = useState<SurfaceType>("unknown");
  const [appStatus, setAppStatus] = useState<{
    text: string;
    mode: AppStatusMode;
  }>({ text: "Ready", mode: "idle" });

  const [includeMic, setIncludeMic] = useState(true);
  const [browserSpeechEnabled, setBrowserSpeechEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const win = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
  });
  const [liveInterimText, setLiveInterimText] = useState("");

  const [micDevices, setMicDevices] = useState<AudioInputDevice[]>([]);
  const [loopbackDevices, setLoopbackDevices] = useState<AudioInputDevice[]>(
    []
  );
  const [outputDevices, setOutputDevices] = useState<AudioOutputDevice[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");
  const [selectedLoopbackId, setSelectedLoopbackId] = useState("");

  const [missingAudioBanner, setMissingAudioBanner] = useState(false);
  const [singleTabBanner, setSingleTabBanner] = useState(false);
  const [silentSystemBanner, setSilentSystemBanner] = useState(false);
  const [captureErrorBanner, setCaptureErrorBanner] = useState<string | null>(
    null
  );

  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiProgressText, setAiProgressText] = useState(
    "Transcribing audio, running sentence-by-sentence grammar correction, and building summary..."
  );
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sysLevelBarRef = useRef<HTMLDivElement | null>(null);
  const micLevelBarRef = useRef<HTMLDivElement | null>(null);

  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sysAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  const recordedUrlRef = useRef<string | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");

  const animFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const liveTimeoutRef = useRef<number | null>(null);
  const sysSignalWatchdogRef = useRef<number | null>(null);
  const sysSignalDetectedRef = useRef(false);
  const lastProcessedChunkCountRef = useRef(0);
  const liveAbortControllerRef = useRef<AbortController | null>(null);
  const livePendingFinalRef = useRef("");
  const autoCorrectTimeoutRef = useRef<number | null>(null);
  const lastAutoProcessedTextRef = useRef("");
  const speechRecRef = useRef<BrowserSpeechRecognition | null>(null);
  const pendingFinalAudioRef = useRef<{ blob: Blob; noteId: string } | null>(
    null
  );
  const lastLiveErrorToastAtRef = useRef(0);

  const startTimeRef = useRef(0);
  const pausedDurationRef = useRef(0);
  const lastPauseStartRef = useRef(0);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const isTestingMicRef = useRef(false);
  const isProcessingRef = useRef(false);
  const activeNoteIdRef = useRef(activeNoteId);
  const grammarToneRef = useRef(grammarTone);
  const targetLanguageRef = useRef(targetLanguage);
  const elapsedTimeRef = useRef(elapsedTime);

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId]);

  useEffect(() => {
    grammarToneRef.current = grammarTone;
  }, [grammarTone]);

  useEffect(() => {
    targetLanguageRef.current = targetLanguage;
  }, [targetLanguage]);

  useEffect(() => {
    elapsedTimeRef.current = elapsedTime;
  }, [elapsedTime]);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) ?? notes[0],
    [notes, activeNoteId]
  );

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem(THEME_KEY, "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem(THEME_KEY, "light");
    }
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      setSaveStatus("Saved");
    } catch {
      setSaveStatus("Storage full");
    }
  }, [notes]);

  const showToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return null;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const allInputs = devices
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label,
        }));

      const loopbacks = allInputs.filter((d) =>
        isLoopbackDeviceLabel(d.label)
      );
      const mics = allInputs.filter((d) => !isLoopbackDeviceLabel(d.label));

      const outputs = devices
        .filter((d) => d.kind === "audiooutput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label,
          isHeadphones: isHeadphoneOutputLabel(d.label),
        }))
        .sort((a, b) => Number(b.isHeadphones) - Number(a.isHeadphones));

      setMicDevices(mics.length > 0 ? mics : allInputs);
      setLoopbackDevices(loopbacks);
      setOutputDevices(outputs);
      setSelectedLoopbackId((prev) =>
        prev && loopbacks.some((l) => l.deviceId === prev)
          ? prev
          : loopbacks[0]?.deviceId ?? ""
      );

      return { mics, loopbacks, outputs };
    } catch {
      return null;
    }
  }, []);

  const handleDetectHeadphonesAndDevices = useCallback(async () => {
    setCaptureErrorBanner(null);
    try {
      let current = await refreshAudioDevices();
      const needsPermission =
        !current ||
        (current.mics.every((m) => !m.label) &&
          current.outputs.every((o) => !o.label));

      if (needsPermission && navigator.mediaDevices?.getUserMedia) {
        const tempStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        tempStream.getTracks().forEach((t) => t.stop());
        current = await refreshAudioDevices();
      }

      if (!current) {
        showToast("Unable to enumerate audio devices in this browser.", "warning");
        return;
      }

      const headphones = current.outputs.filter((o) => o.isHeadphones);
      const outputSummary =
        headphones.length > 0
          ? `Headphones: ${headphones[0].label}`
          : current.outputs.find((o) => o.label)?.label
          ? `Output: ${current.outputs.find((o) => o.label)?.label}`
          : "Audio output detected";

      const loopbackSummary =
        current.loopbacks.length > 0
          ? `App/Loopback input ready (${current.loopbacks[0].label})`
          : "Use 'Capture System & Apps' for headphone & app audio";

      showToast(`${outputSummary} · ${loopbackSummary}`, "success");
    } catch (err: unknown) {
      const friendly = describeMediaError(err, "mic");
      showToast(friendly, "warning");
    }
  }, [refreshAudioDevices, showToast]);

  useEffect(() => {
    void refreshAudioDevices();
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    const handleDeviceChange = () => {
      void refreshAudioDevices();
    };
    mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [refreshAudioDevices]);

  const updateNoteField = useCallback(
    <K extends keyof NoteSession>(
      noteId: string,
      field: K,
      value: NoteSession[K]
    ) => {
      setSaveStatus("Saving...");
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, [field]: value } : n))
      );
    },
    []
  );

  const applyStructuredResult = useCallback(
    (
      targetNoteId: string,
      parsed: StructuredAiResponse,
      isLivePreview: boolean,
      preserveRawTranscript = false
    ) => {
      if (parsed.silentAudio) {
        if (!isLivePreview) {
          showToast(
            "No speech was detected in the captured audio.",
            "warning"
          );
        }
        return;
      }

      if (parsed.verbatimTranscript && parsed.verbatimTranscript.trim()) {
        livePendingFinalRef.current = "";
        setLiveInterimText("");
        if (!preserveRawTranscript) {
          lastAutoProcessedTextRef.current = parsed.verbatimTranscript.trim();
        }
      }

      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== targetNoteId) return n;

          const existingDone = new Map(
            n.actionItems.map((item) => [item.text, item.done])
          );
          const nextActionItems = Array.isArray(parsed.actionItems)
            ? parsed.actionItems.map((text) => ({
                text,
                done: existingDone.get(text) ?? false,
              }))
            : n.actionItems;

          const nextTakeaways = Array.isArray(parsed.keyTakeaways)
            ? parsed.keyTakeaways
                .map((t) => (t.startsWith("•") ? t : `• ${t}`))
                .join("\n")
            : n.keyTakeaways;

          const nextTerms = Array.isArray(parsed.keyTerms)
            ? parsed.keyTerms
                .map((t) => (t.startsWith("•") ? t : `• ${t}`))
                .join("\n")
            : n.keyTerms;

          const shouldUpdateTitle =
            !isLivePreview &&
            Boolean(parsed.suggestedTitle) &&
            n.title.startsWith("Session —");

          return {
            ...n,
            title:
              shouldUpdateTitle && parsed.suggestedTitle
                ? parsed.suggestedTitle
                : n.title,
            transcript:
              !preserveRawTranscript && parsed.verbatimTranscript !== undefined
                ? parsed.verbatimTranscript
                : n.transcript,
            grammarCorrected:
              parsed.grammarCorrectedText !== undefined
                ? parsed.grammarCorrectedText
                : n.grammarCorrected,
            detectedLanguages: Array.isArray(parsed.detectedLanguages)
              ? parsed.detectedLanguages
              : n.detectedLanguages,
            translatedText:
              parsed.translatedText !== undefined
                ? parsed.translatedText
                : n.translatedText,
            grammarFixes: Array.isArray(parsed.grammarFixes)
              ? parsed.grammarFixes
              : n.grammarFixes,
            sentenceCorrections: Array.isArray(parsed.sentenceCorrections)
              ? parsed.sentenceCorrections
              : n.sentenceCorrections,
            execSummary:
              parsed.executiveSummary !== undefined
                ? parsed.executiveSummary
                : n.execSummary,
            keyTakeaways: nextTakeaways,
            actionItems: nextActionItems,
            keyTerms: nextTerms,
          };
        })
      );
    },
    [showToast]
  );

  const runAudioProcessing = useCallback(
    async (
      audioBlob: Blob,
      isLivePreview: boolean,
      targetNoteId = activeNoteIdRef.current
    ) => {
      if (!isLivePreview && liveAbortControllerRef.current) {
        liveAbortControllerRef.current.abort();
        liveAbortControllerRef.current = null;
      }

      if (isProcessingRef.current) {
        if (!isLivePreview) {
          pendingFinalAudioRef.current = { blob: audioBlob, noteId: targetNoteId };
          setIsProcessingAI(true);
          setAppStatus({
            text: "Finalizing Transcription...",
            mode: "processing",
          });
          setAiProgressText(
            "Finishing live pass and running final sentence-by-sentence transcription & correction..."
          );
        }
        return;
      }

      isProcessingRef.current = true;
      let abortController: AbortController | null = null;
      let timeoutId: number | null = null;

      if (isLivePreview) {
        setIsLiveTranscribing(true);
        abortController = new AbortController();
        liveAbortControllerRef.current = abortController;
        timeoutId = window.setTimeout(() => {
          abortController?.abort();
        }, LIVE_REQUEST_TIMEOUT_MS);
      } else {
        setIsProcessingAI(true);
        setAppStatus({
          text: "Transcribing, Correcting & Summarizing...",
          mode: "processing",
        });
        setAiProgressText(
          "Transcribing audio, running sentence-by-sentence grammar correction, and building your summary..."
        );
      }

      try {
        const result = await processAudioOnServer({
          audioBlob,
          tone: grammarToneRef.current,
          targetLanguage: targetLanguageRef.current,
          isLivePreview,
          signal: abortController?.signal,
        });
        if (isLivePreview && !isRecordingRef.current) return;
        applyStructuredResult(targetNoteId, result, isLivePreview);
        if (!isLivePreview && !result.silentAudio) {
          showToast(
            "Audio transcribed, translated, and corrected sentence by sentence.",
            "success"
          );
        }
      } catch (err: unknown) {
        const isAborted =
          err instanceof DOMException && err.name === "AbortError";
        if (!isAborted) {
          const msg = err instanceof Error ? err.message : "Processing failed";
          if (!isLivePreview) {
            showToast(`AI processing error: ${msg}`, "error");
          } else {
            const now = Date.now();
            if (now - lastLiveErrorToastAtRef.current > 10000) {
              lastLiveErrorToastAtRef.current = now;
              showToast(`Live transcribe error: ${msg}`, "warning");
            }
          }
        }
      } finally {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        if (abortController && liveAbortControllerRef.current === abortController) {
          liveAbortControllerRef.current = null;
        }
        isProcessingRef.current = false;
        setIsLiveTranscribing(false);

        const pendingFinal = pendingFinalAudioRef.current;
        if (pendingFinal) {
          pendingFinalAudioRef.current = null;
          void runAudioProcessing(pendingFinal.blob, false, pendingFinal.noteId);
        } else if (!isLivePreview) {
          setIsProcessingAI(false);
          setAppStatus({ text: "Ready", mode: "idle" });
        }
      }
    },
    [applyStructuredResult, showToast]
  );

  const runTextProcessing = useCallback(
    async (
      rawText: string,
      toneOverride?: GrammarTone,
      targetNoteId = activeNoteIdRef.current,
      options?: {
        preserveRawTranscript?: boolean;
        silent?: boolean;
        targetLanguageOverride?: string;
      }
    ) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      const preserveRawTranscript = options?.preserveRawTranscript ?? false;
      const silent = options?.silent ?? false;
      const effectiveTargetLang =
        options?.targetLanguageOverride ?? targetLanguageRef.current;

      if (!silent) {
        setIsProcessingAI(true);
        setAppStatus({
          text: "Correcting Grammar & Translating...",
          mode: "processing",
        });
        setAiProgressText(
          "Detecting languages, translating accurately, adding automated punctuation, and correcting grammar..."
        );
      } else {
        setIsLiveTranscribing(true);
      }

      try {
        lastAutoProcessedTextRef.current = rawText.trim();
        const result = await processTextOnServer({
          text: rawText,
          tone: toneOverride ?? grammarToneRef.current,
          targetLanguage: effectiveTargetLang,
        });
        applyStructuredResult(
          targetNoteId,
          result,
          silent,
          preserveRawTranscript
        );
        if (!silent) {
          showToast(
            "Language detection, translation, punctuation, and grammar polish applied.",
            "success"
          );
        }
      } catch (err: unknown) {
        if (!silent) {
          const msg = err instanceof Error ? err.message : "Processing failed";
          showToast(`Failed to process text: ${msg}`, "error");
        }
      } finally {
        isProcessingRef.current = false;
        setIsLiveTranscribing(false);
        if (!silent) {
          setIsProcessingAI(false);
          setAppStatus({ text: "Ready", mode: "idle" });
        }
      }
    },
    [applyStructuredResult, showToast]
  );

  const resizeVisualizerCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
    canvas.height = Math.max(
      1,
      Math.floor(rect.height * window.devicePixelRatio)
    );
  }, []);

  useEffect(() => {
    resizeVisualizerCanvas();
    window.addEventListener("resize", resizeVisualizerCanvas);
    return () => window.removeEventListener("resize", resizeVisualizerCanvas);
  }, [resizeVisualizerCanvas]);

  const stopVisualizer = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (sysLevelBarRef.current) sysLevelBarRef.current.style.width = "0%";
    if (micLevelBarRef.current) micLevelBarRef.current.style.width = "0%";
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const startVisualizer = useCallback(
    (analyser: AnalyserNode) => {
      resizeVisualizerCanvas();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        if (sysLevelBarRef.current) {
          const sysPct = isPausedRef.current
            ? 0
            : computeAudioLevelPercent(sysAnalyserRef.current);
          sysLevelBarRef.current.style.width = `${sysPct}%`;
          if (sysPct >= 2 && !sysSignalDetectedRef.current) {
            sysSignalDetectedRef.current = true;
            setSilentSystemBanner(false);
          }
        }
        if (micLevelBarRef.current) {
          micLevelBarRef.current.style.width = `${
            isPausedRef.current
              ? 0
              : computeAudioLevelPercent(micAnalyserRef.current)
          }%`;
        }

        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        const barCount = 72;
        const step = Math.max(1, Math.floor(bufferLength / barCount));
        const totalBarSpace = width / barCount;
        const barWidth = Math.max(
          2 * window.devicePixelRatio,
          totalBarSpace * 0.62
        );

        for (let i = 0; i < barCount; i++) {
          const val = dataArray[i * step] || 0;
          const percent = val / 255;
          const barHeight = Math.max(
            3 * window.devicePixelRatio,
            percent * (height * 0.82)
          );

          const x = i * totalBarSpace + (totalBarSpace - barWidth) / 2;
          const y = (height - barHeight) / 2;

          const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
          gradient.addColorStop(0, "#818cf8");
          gradient.addColorStop(0.5, "#6366f1");
          gradient.addColorStop(1, "#10b981");

          ctx.fillStyle = isPausedRef.current
            ? "rgba(245, 158, 11, 0.55)"
            : gradient;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 4 * window.devicePixelRatio);
          ctx.fill();
        }
      };

      draw();
    },
    [resizeVisualizerCanvas]
  );

  const stopBrowserSpeechRecognition = useCallback(() => {
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // Ignore
      }
      speechRecRef.current = null;
    }
    livePendingFinalRef.current = "";
    setLiveInterimText("");
  }, []);

  const startBrowserSpeechRecognition = useCallback(
    (silentIfUnsupported = false) => {
      const win = window as unknown as {
        SpeechRecognition?: new () => BrowserSpeechRecognition;
        webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
      };
      const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (!SpeechRec) {
        if (!silentIfUnsupported) {
          showToast(
            "Browser SpeechRecognition API is not supported in this browser.",
            "warning"
          );
        }
        setBrowserSpeechEnabled(false);
        return;
      }

      if (speechRecRef.current) return;

      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";

      let lastResultAt = Date.now();
      recognition.onresult = (event) => {
        if (isPausedRef.current) return;
        const now = Date.now();
        const pauseMs = now - lastResultAt;
        lastResultAt = now;

        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const chunk = event.results[i][0].transcript.trim();
          if (!chunk) continue;
          if (event.results[i].isFinal) {
            const punctuated = formatLiveUtteranceWithPeriod(chunk);
            const prev = livePendingFinalRef.current;
            if (prev && pauseMs >= 900 && pauseMs < 2000 && !/[.!?]$/.test(prev)) {
              livePendingFinalRef.current = `${prev}, ${punctuated.charAt(0).toLowerCase()}${punctuated.slice(1)}`;
            } else {
              livePendingFinalRef.current = prev
                ? `${prev}\n${punctuated}`
                : punctuated;
            }
          } else {
            interim += (interim ? " " : "") + chunk;
          }
        }
        const interimCap = interim
          ? interim.charAt(0).toUpperCase() + interim.slice(1)
          : "";
        const combined = [livePendingFinalRef.current, interimCap]
          .filter(Boolean)
          .join("\n");
        setLiveInterimText(combined);
      };

      recognition.onerror = () => {};
      recognition.onend = () => {
        if (isRecordingRef.current && speechRecRef.current) {
          try {
            recognition.start();
          } catch {
            // Ignore
          }
        }
      };

      try {
        recognition.start();
        speechRecRef.current = recognition;
      } catch {
        // Ignore
      }
    },
    [showToast]
  );

  const handleToggleBrowserSpeech = useCallback(
    (checked: boolean) => {
      setBrowserSpeechEnabled(checked);
      if (isRecordingRef.current) {
        if (checked) {
          startBrowserSpeechRecognition(false);
        } else {
          stopBrowserSpeechRecognition();
        }
      }
    },
    [startBrowserSpeechRecognition, stopBrowserSpeechRecognition]
  );

  const cleanupStreams = useCallback(() => {
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (liveTimeoutRef.current !== null) {
      clearTimeout(liveTimeoutRef.current);
      liveTimeoutRef.current = null;
    }
    if (sysSignalWatchdogRef.current !== null) {
      clearTimeout(sysSignalWatchdogRef.current);
      sysSignalWatchdogRef.current = null;
    }
    if (liveAbortControllerRef.current) {
      liveAbortControllerRef.current.abort();
      liveAbortControllerRef.current = null;
    }
    stopBrowserSpeechRecognition();
    stopVisualizer();

    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    micGainRef.current = null;
    destinationRef.current = null;
    sysAnalyserRef.current = null;
    micAnalyserRef.current = null;
    analyserRef.current = null;
  }, [stopBrowserSpeechRecognition, stopVisualizer]);

  useEffect(() => {
    return () => {
      if (autoCorrectTimeoutRef.current !== null) {
        clearTimeout(autoCorrectTimeoutRef.current);
      }
      cleanupStreams();
      if (recordedUrlRef.current) {
        URL.revokeObjectURL(recordedUrlRef.current);
      }
    };
  }, [cleanupStreams]);

  const acquireMicStream = useCallback(async (): Promise<MediaStream> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone capture is not supported in this browser.");
    }
    const chosenMic = micDevices.find((d) => d.deviceId === selectedMicId);
    const isLoopback = Boolean(
      chosenMic?.label && isLoopbackDeviceLabel(chosenMic.label)
    );
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: !isLoopback,
      noiseSuppression: !isLoopback,
      autoGainControl: !isLoopback,
      ...(isLoopback ? { channelCount: 2 } : {}),
      ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {}),
    };
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
    });
    void refreshAudioDevices();
    return stream;
  }, [micDevices, refreshAudioDevices, selectedMicId]);

  const stopMicTest = useCallback(() => {
    if (!isTestingMicRef.current) return;
    isTestingMicRef.current = false;
    setIsTestingMic(false);
    cleanupStreams();
    setAudioSourceLabel("Idle");
    setAppStatus({ text: "Ready", mode: "idle" });
  }, [cleanupStreams]);

  const handleToggleTestMic = useCallback(async () => {
    if (isRecordingRef.current) return;
    if (isTestingMicRef.current) {
      stopMicTest();
      return;
    }

    setCaptureErrorBanner(null);
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioCtxRef.current = audioCtx;

      const micStream = await acquireMicStream();
      micStreamRef.current = micStream;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;

      const micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 256;
      micAnalyser.smoothingTimeConstant = 0.75;

      const silentSink = audioCtx.createGain();
      silentSink.gain.value = 0;
      silentSink.connect(audioCtx.destination);

      const micSource = audioCtx.createMediaStreamSource(micStream);
      micSource.connect(analyser);
      micSource.connect(micAnalyser);
      analyser.connect(silentSink);

      analyserRef.current = analyser;
      micAnalyserRef.current = micAnalyser;
      sysAnalyserRef.current = null;

      isTestingMicRef.current = true;
      setIsTestingMic(true);
      const trackLabel = micStream.getAudioTracks()[0]?.label || "Microphone";
      setAudioSourceLabel(`Mic Test · ${trackLabel}`);
      setAppStatus({ text: "Testing Microphone", mode: "recording" });
      startVisualizer(analyser);
      showToast(`Detected microphone: ${trackLabel}`, "success");
    } catch (err: unknown) {
      cleanupStreams();
      const friendly = describeMediaError(err, "mic");
      setCaptureErrorBanner(friendly);
      showToast(friendly, "error");
    }
  }, [
    acquireMicStream,
    cleanupStreams,
    showToast,
    startVisualizer,
    stopMicTest,
  ]);

  const handleRecordingStopped = useCallback(async () => {
    if (audioChunksRef.current.length === 0) {
      setAppStatus({ text: "Ready", mode: "idle" });
      return;
    }

    const blob = new Blob(audioChunksRef.current, {
      type: mimeTypeRef.current,
    });
    recordedBlobRef.current = blob;

    if (recordedUrlRef.current) {
      URL.revokeObjectURL(recordedUrlRef.current);
    }
    const url = URL.createObjectURL(blob);
    recordedUrlRef.current = url;
    setRecordedAudioUrl(url);

    const finalDuration = elapsedTimeRef.current;
    const targetId = activeNoteIdRef.current;
    updateNoteField(targetId, "duration", finalDuration);

    await runAudioProcessing(blob, false, targetId);
  }, [runAudioProcessing, updateNoteField]);

  const stopRecordingAndTranscribe = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    isPausedRef.current = false;
    setIsRecording(false);
    setIsPaused(false);
    setSingleTabBanner(false);
    setSilentSystemBanner(false);
    setAudioSourceLabel("Recorded");
    setSurfaceType("unknown");

    if (liveAbortControllerRef.current) {
      liveAbortControllerRef.current.abort();
      liveAbortControllerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.requestData();
      } catch {
        // Ignore if unsupported
      }
      recorder.stop();
    } else {
      cleanupStreams();
    }
  }, [cleanupStreams]);

  const beginRecordingSession = useCallback(
    async (params: {
      audioCtx: AudioContext;
      destination: MediaStreamAudioDestinationNode;
      recordingStream?: MediaStream;
      analyser: AnalyserNode;
      sourceLabel: string;
      statusText: string;
      toastText: string;
    }) => {
      if (params.audioCtx.state === "suspended") {
        await params.audioCtx.resume();
      }
      destinationRef.current = params.destination;

      const silentSink = params.audioCtx.createGain();
      silentSink.gain.value = 0;
      params.analyser.connect(silentSink);
      silentSink.connect(params.audioCtx.destination);

      const streamToRecord = params.recordingStream ?? params.destination.stream;

      const supportedTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      const chosenMime =
        supportedTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      mimeTypeRef.current = chosenMime || "audio/webm";

      audioChunksRef.current = [];
      lastProcessedChunkCountRef.current = 0;

      const recorder = chosenMime
        ? new MediaRecorder(streamToRecord, { mimeType: chosenMime })
        : new MediaRecorder(streamToRecord);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        cleanupStreams();
        void handleRecordingStopped();
      };
      recorder.start(LIVE_CHUNK_TIMESLICE_MS);
      mediaRecorderRef.current = recorder;

      isRecordingRef.current = true;
      isPausedRef.current = false;
      startTimeRef.current = Date.now();
      pausedDurationRef.current = 0;

      setIsRecording(true);
      setIsPaused(false);
      setElapsedTime("00:00");
      setAudioSourceLabel(params.sourceLabel);
      startVisualizer(params.analyser);

      timerIntervalRef.current = window.setInterval(() => {
        if (isPausedRef.current) return;
        const elapsedSec = Math.floor(
          (Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000
        );
        setElapsedTime(formatDuration(elapsedSec));
      }, 500);

      // Immediate live audio transcription & line-by-line grammar corrections (<=3s delay)
      const scheduleLiveTick = (delayMs: number) => {
        if (liveTimeoutRef.current !== null) {
          clearTimeout(liveTimeoutRef.current);
        }
        liveTimeoutRef.current = window.setTimeout(async () => {
          if (!isRecordingRef.current) return;
          if (isPausedRef.current || isProcessingRef.current) {
            scheduleLiveTick(400);
            return;
          }
          const chunkCount = audioChunksRef.current.length;
          if (chunkCount < 2 || chunkCount <= lastProcessedChunkCountRef.current) {
            scheduleLiveTick(400);
            return;
          }

          const snapshotBlob = new Blob(audioChunksRef.current, {
            type: mimeTypeRef.current,
          });
          if (snapshotBlob.size < 1000) {
            scheduleLiveTick(400);
            return;
          }
          if (snapshotBlob.size > 9 * 1024 * 1024) return;

          lastProcessedChunkCountRef.current = chunkCount;
          const startedAt = Date.now();
          await runAudioProcessing(snapshotBlob, true, activeNoteIdRef.current);
          if (!isRecordingRef.current) return;

          const elapsed = Date.now() - startedAt;
          const nextDelay = Math.max(400, LIVE_POLL_INTERVAL_MS - elapsed);
          scheduleLiveTick(nextDelay);
        }, delayMs);
      };
      scheduleLiveTick(LIVE_FIRST_CHUNK_MS);

      if (browserSpeechEnabled && micStreamRef.current) {
        startBrowserSpeechRecognition(true);
      }

      setAppStatus({ text: params.statusText, mode: "recording" });
      showToast(params.toastText, "success");
    },
    [
      browserSpeechEnabled,
      cleanupStreams,
      handleRecordingStopped,
      runAudioProcessing,
      showToast,
      startBrowserSpeechRecognition,
      startVisualizer,
    ]
  );

  const startMicOnlyCapture = useCallback(async () => {
    stopMicTest();
    setMissingAudioBanner(false);
    setSingleTabBanner(false);
    setCaptureErrorBanner(null);

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioCtxRef.current = audioCtx;

      const micStream = await acquireMicStream();
      micStreamRef.current = micStream;

      const destination = audioCtx.createMediaStreamDestination();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;

      const micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 256;
      micAnalyser.smoothingTimeConstant = 0.75;

      const micGain = audioCtx.createGain();
      micGain.gain.value = 1;
      micGainRef.current = micGain;

      const micSource = audioCtx.createMediaStreamSource(micStream);
      micSource.connect(micGain);
      micGain.connect(destination);
      micGain.connect(analyser);
      micGain.connect(micAnalyser);

      analyserRef.current = analyser;
      micAnalyserRef.current = micAnalyser;
      sysAnalyserRef.current = null;
      setSurfaceType("unknown");

      const trackLabel = micStream.getAudioTracks()[0]?.label || "Microphone";
      await beginRecordingSession({
        audioCtx,
        destination,
        analyser,
        sourceLabel: `Mic · ${trackLabel}`,
        statusText: "Listening · Live Transcribe",
        toastText: `Recording from ${trackLabel} with live sentence corrections.`,
      });
    } catch (err: unknown) {
      cleanupStreams();
      const friendly = describeMediaError(err, "mic");
      setCaptureErrorBanner(friendly);
      showToast(friendly, "error");
    }
  }, [
    acquireMicStream,
    beginRecordingSession,
    cleanupStreams,
    showToast,
    stopMicTest,
  ]);

  const startLoopbackCapture = useCallback(async () => {
    stopMicTest();
    setMissingAudioBanner(false);
    setSingleTabBanner(false);
    setSilentSystemBanner(false);
    setCaptureErrorBanner(null);

    const targetId = selectedLoopbackId || loopbackDevices[0]?.deviceId;
    if (!targetId || !navigator.mediaDevices?.getUserMedia) {
      showToast(
        "No Stereo Mix / BlackHole loopback device detected. Use 'Capture System & Apps' instead.",
        "warning"
      );
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new AudioCtx();

      const loopbackStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: targetId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
        },
      });
      displayStreamRef.current = loopbackStream;

      let micStream: MediaStream | null = null;
      if (includeMic && selectedMicId !== targetId) {
        try {
          micStream = await acquireMicStream();
          micStreamRef.current = micStream;
        } catch (micErr: unknown) {
          showToast(
            `${describeMediaError(micErr, "mic")} Continuing with App/Headphone Loopback only.`,
            "warning"
          );
        }
      }

      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioCtxRef.current = audioCtx;

      const destination = audioCtx.createMediaStreamDestination();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;

      const sysAnalyser = audioCtx.createAnalyser();
      sysAnalyser.fftSize = 256;
      sysAnalyser.smoothingTimeConstant = 0.75;

      const loopbackSource = audioCtx.createMediaStreamSource(loopbackStream);
      connectBoostedSystemMix(audioCtx, loopbackSource, destination);
      loopbackSource.connect(analyser);
      loopbackSource.connect(sysAnalyser);
      sysAnalyserRef.current = sysAnalyser;
      micAnalyserRef.current = null;

      const hasMic = Boolean(
        micStream && micStream.getAudioTracks().length > 0
      );
      if (hasMic && micStream) {
        const micAnalyser = audioCtx.createAnalyser();
        micAnalyser.fftSize = 256;
        micAnalyser.smoothingTimeConstant = 0.75;

        const micGain = audioCtx.createGain();
        micGain.gain.value = 1;
        micGainRef.current = micGain;

        const micSource = audioCtx.createMediaStreamSource(micStream);
        micSource.connect(micGain);
        micGain.connect(destination);
        micGain.connect(analyser);
        micGain.connect(micAnalyser);
        micAnalyserRef.current = micAnalyser;
      }

      analyserRef.current = analyser;
      setSurfaceType("monitor");
      sysSignalDetectedRef.current = false;

      if (sysSignalWatchdogRef.current !== null) {
        clearTimeout(sysSignalWatchdogRef.current);
      }
      sysSignalWatchdogRef.current = window.setTimeout(() => {
        if (
          isRecordingRef.current &&
          !isPausedRef.current &&
          !sysSignalDetectedRef.current
        ) {
          setSilentSystemBanner(true);
        }
      }, 4500);

      const deviceName =
        loopbackStream.getAudioTracks()[0]?.label || "App/Headphone Loopback";

      await beginRecordingSession({
        audioCtx,
        destination,
        recordingStream: hasMic ? destination.stream : loopbackStream,
        analyser,
        sourceLabel: hasMic
          ? `🎧 Headset Loopback (${deviceName}) + Mic`
          : `🎧 Headset Loopback · ${deviceName}`,
        statusText: "Listening · Headset Sound",
        toastText: `Transcribing headset sound via ${deviceName}.`,
      });
    } catch (err: unknown) {
      cleanupStreams();
      const friendly = describeMediaError(err, "mic");
      setCaptureErrorBanner(friendly);
      showToast(friendly, "error");
    }
  }, [
    acquireMicStream,
    beginRecordingSession,
    cleanupStreams,
    includeMic,
    loopbackDevices,
    selectedLoopbackId,
    selectedMicId,
    showToast,
    stopMicTest,
  ]);

  const startSystemAudioCapture = useCallback(async (headsetMode = false) => {
    stopMicTest();
    setMissingAudioBanner(false);
    setSingleTabBanner(false);
    setSilentSystemBanner(false);
    setCaptureErrorBanner(null);

    if (!navigator.mediaDevices?.getDisplayMedia) {
      const msg =
        "System & headset playback capture (getDisplayMedia) is not supported in this browser. You can record with a Loopback device or your headset microphone instead.";
      setCaptureErrorBanner(msg);
      showToast(msg, "error");
      return;
    }

    try {
      let displayStream: MediaStream;
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          systemAudio: "include",
          windowAudio: "system",
          suppressLocalAudioPlayback: false,
          monitorTypeSurfaces: "include",
          surfaceSwitching: "include",
          selfBrowserSurface: "exclude",
        } as DisplayMediaStreamOptions);
      } catch (constraintErr: unknown) {
        if (
          constraintErr instanceof TypeError ||
          (constraintErr instanceof DOMException &&
            constraintErr.name === "OverconstrainedError")
        ) {
          try {
            displayStream = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              },
              systemAudio: "include",
            } as DisplayMediaStreamOptions);
          } catch (fallbackErr: unknown) {
            if (fallbackErr instanceof TypeError) {
              displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true,
              });
            } else {
              throw fallbackErr;
            }
          }
        } else {
          throw constraintErr;
        }
      }

      const videoTrack = displayStream.getVideoTracks()[0];
      const videoSettings = videoTrack ? videoTrack.getSettings() : {};
      const detectedSurface = (videoSettings.displaySurface ||
        "unknown") as SurfaceType;
      setSurfaceType(detectedSurface);

      if (videoTrack) {
        videoTrack.onended = () => {
          if (isRecordingRef.current) {
            stopRecordingAndTranscribe();
          }
        };
      }

      const systemAudioTracks = displayStream.getAudioTracks();
      if (systemAudioTracks.length === 0) {
        displayStream.getTracks().forEach((t) => t.stop());
        setMissingAudioBanner(true);
        showToast(
          "No system audio track found. Check 'Also share system audio' or 'Share tab audio' in the popup.",
          "warning"
        );
        return;
      }

      systemAudioTracks[0].enabled = true;
      displayStreamRef.current = displayStream;

      systemAudioTracks[0].onended = () => {
        if (isRecordingRef.current) {
          stopRecordingAndTranscribe();
        }
      };
      systemAudioTracks[0].onunmute = () => {
        setSilentSystemBanner(false);
      };

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new AudioCtx();

      const activeHeadphone = outputDevices.find((d) => d.isHeadphones);
      const selectedMicObj = micDevices.find(
        (d) => d.deviceId === selectedMicId
      );
      const isHfpMic = Boolean(
        (selectedMicObj && isBluetoothHfpMicLabel(selectedMicObj.label)) ||
          (!selectedMicId &&
            micDevices.some((d) => isBluetoothHfpMicLabel(d.label)))
      );
      const skipMicToProtectBluetooth =
        headsetMode && Boolean(activeHeadphone) && isHfpMic;

      let micStream: MediaStream | null = null;
      if (includeMic && !skipMicToProtectBluetooth) {
        try {
          micStream = await acquireMicStream();
          micStreamRef.current = micStream;
        } catch (micErr: unknown) {
          const micMsg = describeMediaError(micErr, "mic");
          showToast(
            `${micMsg} Continuing with Headset/System Sound only.`,
            "warning"
          );
          setIncludeMic(false);
        }
      } else if (skipMicToProtectBluetooth) {
        showToast(
          "Recording headset playback cleanly (Hands-Free mic skipped to keep stereo audio active).",
          "info"
        );
      }

      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioCtxRef.current = audioCtx;

      const destination = audioCtx.createMediaStreamDestination();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;

      const sysAnalyser = audioCtx.createAnalyser();
      sysAnalyser.fftSize = 256;
      sysAnalyser.smoothingTimeConstant = 0.75;

      const rawSystemStream = new MediaStream(systemAudioTracks);
      const systemSource = audioCtx.createMediaStreamSource(rawSystemStream);
      connectBoostedSystemMix(audioCtx, systemSource, destination);
      systemSource.connect(analyser);
      systemSource.connect(sysAnalyser);
      sysAnalyserRef.current = sysAnalyser;
      micAnalyserRef.current = null;

      const hasMic = Boolean(
        micStream && micStream.getAudioTracks().length > 0
      );
      if (hasMic && micStream) {
        const micAnalyser = audioCtx.createAnalyser();
        micAnalyser.fftSize = 256;
        micAnalyser.smoothingTimeConstant = 0.75;

        const micGain = audioCtx.createGain();
        micGain.gain.value = 1;
        micGainRef.current = micGain;

        const micSource = audioCtx.createMediaStreamSource(micStream);
        micSource.connect(micGain);
        micGain.connect(destination);
        micGain.connect(analyser);
        micGain.connect(micAnalyser);
        micAnalyserRef.current = micAnalyser;
      }

      analyserRef.current = analyser;
      sysSignalDetectedRef.current = false;

      if (sysSignalWatchdogRef.current !== null) {
        clearTimeout(sysSignalWatchdogRef.current);
      }
      sysSignalWatchdogRef.current = window.setTimeout(() => {
        if (
          isRecordingRef.current &&
          !isPausedRef.current &&
          !sysSignalDetectedRef.current
        ) {
          setSilentSystemBanner(true);
        }
      }, 4500);

      if (detectedSurface === "browser") {
        setSingleTabBanner(true);
      }

      const headphoneSuffix = activeHeadphone
        ? ` · 🎧 ${activeHeadphone.label}`
        : headsetMode
        ? " · 🎧 Headset"
        : "";

      const sourceLabel =
        headsetMode
          ? hasMic
            ? `🎧 Headset + Mic${activeHeadphone ? ` (${activeHeadphone.label})` : ""}`
            : `🎧 Headset Sound${activeHeadphone ? ` (${activeHeadphone.label})` : ""}`
          : detectedSurface === "monitor"
          ? hasMic
            ? `Whole System + Mic${headphoneSuffix}`
            : `Whole System Audio${headphoneSuffix}`
          : detectedSurface === "window"
          ? hasMic
            ? `App Window + Mic${headphoneSuffix}`
            : `App Window Audio${headphoneSuffix}`
          : detectedSurface === "browser"
          ? hasMic
            ? "Single Tab + Mic"
            : "Single Browser Tab"
          : hasMic
          ? `System + Mic${headphoneSuffix}`
          : `System Audio${headphoneSuffix}`;

      const statusText = headsetMode
        ? "Listening · Headset Sound"
        : detectedSurface === "monitor"
        ? "Listening · Whole System & Headphones"
        : detectedSurface === "window"
        ? "Listening · App Window"
        : detectedSurface === "browser"
        ? "Listening · Tab Audio"
        : "Listening · System & Headphones";

      const toastText = headsetMode
        ? "Transcribing headset sound live with sentence corrections."
        : detectedSurface === "browser"
        ? "Tab audio capture active with live sentence corrections."
        : detectedSurface === "window"
        ? "App window capture active with live sentence corrections."
        : hasMic
        ? "Capturing system/headphone sound & mic with live corrections."
        : "System & headphone audio capture active with live corrections.";

      await beginRecordingSession({
        audioCtx,
        destination,
        recordingStream: hasMic ? destination.stream : rawSystemStream,
        analyser,
        sourceLabel,
        statusText,
        toastText,
      });
    } catch (err: unknown) {
      cleanupStreams();
      const friendly = describeMediaError(err, "display");
      setCaptureErrorBanner(friendly);
      showToast(friendly, "error");
    }
  }, [
    acquireMicStream,
    beginRecordingSession,
    cleanupStreams,
    includeMic,
    micDevices,
    outputDevices,
    selectedMicId,
    showToast,
    stopMicTest,
    stopRecordingAndTranscribe,
  ]);

  const startHeadsetSoundCapture = useCallback(async () => {
    const refreshed = await refreshAudioDevices();
    const availableLoopbacks = refreshed?.loopbacks ?? loopbackDevices;
    if (availableLoopbacks.length > 0) {
      await startLoopbackCapture();
      return;
    }
    await startSystemAudioCapture(true);
  }, [
    loopbackDevices,
    refreshAudioDevices,
    startLoopbackCapture,
    startSystemAudioCapture,
  ]);

  const handleToggleIncludeMic = useCallback(
    async (checked: boolean) => {
      setIncludeMic(checked);

      if (!isRecordingRef.current || !audioCtxRef.current || !analyserRef.current) {
        return;
      }

      if (micGainRef.current) {
        micGainRef.current.gain.value = checked ? 1 : 0;
        if (micStreamRef.current) {
          micStreamRef.current
            .getAudioTracks()
            .forEach((t) => (t.enabled = checked));
        }
        showToast(
          checked ? "Microphone unmuted in mix." : "Microphone muted in mix.",
          "info"
        );
      } else if (checked) {
        try {
          const micStream = await acquireMicStream();
          micStreamRef.current = micStream;
          const audioCtx = audioCtxRef.current;
          const analyser = analyserRef.current;
          if (!audioCtx || !analyser) return;

          const micAnalyser = audioCtx.createAnalyser();
          micAnalyser.fftSize = 256;
          micAnalyser.smoothingTimeConstant = 0.75;

          const micGain = audioCtx.createGain();
          micGain.gain.value = 1;
          micGainRef.current = micGain;

          const micSource = audioCtx.createMediaStreamSource(micStream);
          micSource.connect(micGain);
          if (destinationRef.current) {
            micGain.connect(destinationRef.current);
          }
          micGain.connect(analyser);
          micGain.connect(micAnalyser);
          micAnalyserRef.current = micAnalyser;
          showToast("Microphone added to live capture.", "success");
        } catch (err: unknown) {
          setIncludeMic(false);
          showToast(describeMediaError(err, "mic"), "warning");
        }
      }
    },
    [acquireMicStream, showToast]
  );

  const handleSwitchToWholeSystem = useCallback(async () => {
    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      isPausedRef.current = false;
      setIsRecording(false);
      setIsPaused(false);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      cleanupStreams();
    }
    await startSystemAudioCapture();
  }, [cleanupStreams, startSystemAudioCapture]);

  const handleTogglePauseResume = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!isRecordingRef.current || !recorder) return;

    if (!isPausedRef.current) {
      recorder.pause();
      isPausedRef.current = true;
      lastPauseStartRef.current = Date.now();
      setIsPaused(true);
      setAppStatus({ text: "Recording Paused", mode: "paused" });
    } else {
      recorder.resume();
      isPausedRef.current = false;
      pausedDurationRef.current += Date.now() - lastPauseStartRef.current;
      setIsPaused(false);
      setAppStatus({ text: "Listening · Live Transcribe", mode: "recording" });
    }
  }, []);

  const handleUploadAudio = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (isRecordingRef.current) {
        showToast(
          "Stop current recording before uploading an audio file.",
          "warning"
        );
        return;
      }
      stopMicTest();

      recordedBlobRef.current = file;
      mimeTypeRef.current = file.type || "audio/webm";
      if (recordedUrlRef.current) {
        URL.revokeObjectURL(recordedUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      recordedUrlRef.current = url;
      setRecordedAudioUrl(url);
      setAudioSourceLabel("Uploaded File");

      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      updateNoteField(activeNote.id, "title", cleanName);

      showToast(`Loaded "${file.name}". Processing audio...`, "info");
      await runAudioProcessing(file, false, activeNote.id);
      e.target.value = "";
    },
    [activeNote.id, runAudioProcessing, showToast, stopMicTest, updateNoteField]
  );

  const handleDownloadAudio = useCallback(() => {
    const blob = recordedBlobRef.current;
    const url = recordedUrlRef.current;
    if (!blob || !url) {
      showToast("No recorded audio available to download.", "warning");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = (activeNote.title || "system-audio")
      .replace(/[^a-z0-9-_]+/gi, "_")
      .toLowerCase();
    a.download = `${safeTitle}.webm`;
    a.click();
  }, [activeNote.title, showToast]);

  const handleCreateNote = useCallback(() => {
    if (isRecordingRef.current) {
      showToast(
        "Stop the current recording before starting a new session.",
        "warning"
      );
      return;
    }
    const fresh = createEmptyNote();
    setNotes((prev) => [fresh, ...prev]);
    setActiveNoteId(fresh.id);
    setMobileSidebarOpen(false);
    recordedBlobRef.current = null;
    if (recordedUrlRef.current) {
      URL.revokeObjectURL(recordedUrlRef.current);
      recordedUrlRef.current = null;
    }
    setRecordedAudioUrl(null);
    setElapsedTime("00:00");
    setAudioSourceLabel("Idle");
    showToast("Started a new session.", "success");
  }, [showToast]);

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      setNotes((prev) => {
        const remaining = prev.filter((n) => n.id !== noteId);
        if (remaining.length === 0) {
          const fresh = createEmptyNote();
          setActiveNoteId(fresh.id);
          return [fresh];
        }
        if (activeNoteId === noteId) {
          setActiveNoteId(remaining[0].id);
        }
        return remaining;
      });
      showToast("Session deleted.", "info");
    },
    [activeNoteId, showToast]
  );

  const handleCopy = useCallback(
    async (text: string, label: string) => {
      if (!text || !text.trim()) {
        showToast(`No ${label} available to copy.`, "warning");
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        showToast(`${label} copied to clipboard.`, "success");
      } catch {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        try {
          document.execCommand("copy");
          showToast(`${label} copied to clipboard.`, "success");
        } catch {
          showToast("Unable to copy to clipboard.", "error");
        }
        document.body.removeChild(area);
      }
    },
    [showToast]
  );

  const handleExport = useCallback(
    (extension: "md" | "txt") => {
      const dateLabel = new Date(activeNote.createdAt).toLocaleDateString(
        undefined,
        {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      );

      const summaryText = buildFormattedSummaryText({
        execSummary: activeNote.execSummary,
        keyTakeaways: activeNote.keyTakeaways,
        actionItems: activeNote.actionItems,
        keyTerms: activeNote.keyTerms,
      });

      const content = buildFullExportContent({
        title: activeNote.title,
        dateLabel,
        duration: activeNote.duration || "00:00",
        detectedLanguages: activeNote.detectedLanguages,
        summaryText,
        grammarCorrected: activeNote.grammarCorrected,
        translatedText: activeNote.translatedText,
        rawTranscript: activeNote.transcript,
      });

      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeTitle = (activeNote.title || "system-audio-note")
        .replace(/[^a-z0-9-_]+/gi, "_")
        .toLowerCase();
      a.href = url;
      a.download = `${safeTitle}.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(
        `Exported all sections as ${safeTitle}.${extension}`,
        "success"
      );
    },
    [activeNote, showToast]
  );

  const handleRerunAI = useCallback(async () => {
    const currentText = activeNote.transcript.trim();
    if (currentText) {
      await runTextProcessing(currentText, grammarTone, activeNote.id);
    } else if (recordedBlobRef.current) {
      await runAudioProcessing(recordedBlobRef.current, false, activeNote.id);
    } else {
      showToast("Record audio or paste text first.", "warning");
    }
  }, [
    activeNote.id,
    activeNote.transcript,
    grammarTone,
    runAudioProcessing,
    runTextProcessing,
    showToast,
  ]);

  const handleGrammarToneChange = useCallback(
    async (nextTone: GrammarTone) => {
      setGrammarTone(nextTone);
      const currentText = activeNote.transcript.trim();
      if (currentText && !isProcessingRef.current) {
        await runTextProcessing(currentText, nextTone, activeNote.id);
      }
    },
    [activeNote.id, activeNote.transcript, runTextProcessing]
  );

  const handleTargetLanguageChange = useCallback(
    async (nextLang: string) => {
      setTargetLanguage(nextLang);
      targetLanguageRef.current = nextLang;
      const currentText = activeNote.transcript.trim();
      if (
        currentText &&
        !isRecordingRef.current &&
        !isProcessingRef.current
      ) {
        await runTextProcessing(
          currentText,
          grammarToneRef.current,
          activeNote.id,
          { targetLanguageOverride: nextLang }
        );
      }
    },
    [activeNote.id, activeNote.transcript, runTextProcessing]
  );

  const handleQuickPasteSubmit = useCallback(
    async (rawText: string, tone: GrammarTone) => {
      const trimmed = rawText.trim();
      if (!trimmed) {
        showToast("Please paste or type some text first.", "warning");
        return;
      }
      setGrammarTone(tone);
      updateNoteField(activeNote.id, "transcript", trimmed);
      setQuickPasteOpen(false);
      await runTextProcessing(trimmed, tone, activeNote.id);
    },
    [activeNote.id, runTextProcessing, showToast, updateNoteField]
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100 transition-colors duration-200">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#0B0F17]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Open saved sessions"
            >
              <PanelLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                <AudioWaveform className="w-4 h-4" />
              </div>
              <span className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                System Audio Note Taker
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600 dark:text-slate-400">
            <button
              type="button"
              onClick={handleCreateNote}
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              New Session
            </button>
            <button
              type="button"
              onClick={() => setQuickPasteOpen(true)}
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Quick Paste
            </button>
            <button
              type="button"
              onClick={() => setGuideModalOpen(true)}
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Audio Setup
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
              {appStatus.mode === "recording" && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
              {appStatus.mode === "paused" && (
                <span className="w-2 h-2 rounded-full bg-amber-500" />
              )}
              {appStatus.mode === "processing" && (
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              )}
              <span>{appStatus.text}</span>
            </div>

            <button
              type="button"
              onClick={() => setGuideModalOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
              aria-label="Audio setup guide"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsDark((prev) => !prev)}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
              title="Toggle Light/Dark Mode"
              aria-label="Toggle Light/Dark Mode"
            >
              {isDark ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Container */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto flex relative overflow-hidden">
        <SessionsSidebar
          notes={notes}
          activeNoteId={activeNote.id}
          searchQuery={searchQuery}
          mobileOpen={mobileSidebarOpen}
          onSearchChange={setSearchQuery}
          onSelectNote={(id) => {
            const target = notes.find((n) => n.id === id);
            lastAutoProcessedTextRef.current = target?.transcript.trim() ?? "";
            setActiveNoteId(id);
          }}
          onCreateNote={handleCreateNote}
          onDeleteNote={handleDeleteNote}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <main className="flex-1 flex flex-col min-w-0 p-4 sm:p-6 space-y-5 overflow-y-auto">
          <CaptureControlDeck
            isRecording={isRecording}
            isPaused={isPaused}
            isTestingMic={isTestingMic}
            isLiveTranscribing={isLiveTranscribing}
            elapsedTime={elapsedTime}
            audioSourceLabel={audioSourceLabel}
            surfaceType={surfaceType}
            recordedAudioUrl={recordedAudioUrl}
            includeMic={includeMic}
            browserSpeechEnabled={browserSpeechEnabled}
            missingAudioBanner={missingAudioBanner}
            singleTabBanner={singleTabBanner}
            silentSystemBanner={silentSystemBanner}
            captureErrorBanner={captureErrorBanner}
            micDevices={micDevices}
            loopbackDevices={loopbackDevices}
            outputDevices={outputDevices}
            selectedMicId={selectedMicId}
            selectedLoopbackId={selectedLoopbackId}
            canvasRef={canvasRef}
            sysLevelBarRef={sysLevelBarRef}
            micLevelBarRef={micLevelBarRef}
            onStartSystemCapture={() => void startSystemAudioCapture(false)}
            onStartHeadsetCapture={() => void startHeadsetSoundCapture()}
            onStartLoopbackCapture={startLoopbackCapture}
            onStartMicCapture={startMicOnlyCapture}
            onToggleTestMic={handleToggleTestMic}
            onDetectDevices={() => void handleDetectHeadphonesAndDevices()}
            onSelectMicId={setSelectedMicId}
            onSelectLoopbackId={setSelectedLoopbackId}
            onRefreshDevices={() => void refreshAudioDevices()}
            onPauseResume={handleTogglePauseResume}
            onStop={stopRecordingAndTranscribe}
            onUploadAudio={handleUploadAudio}
            onOpenQuickPaste={() => setQuickPasteOpen(true)}
            onDownloadAudio={handleDownloadAudio}
            onToggleIncludeMic={handleToggleIncludeMic}
            onToggleBrowserSpeech={handleToggleBrowserSpeech}
            onDismissMissingAudio={() => setMissingAudioBanner(false)}
            onContinueMicOnly={() => {
              setMissingAudioBanner(false);
              void startMicOnlyCapture();
            }}
            onSwitchToWholeSystem={handleSwitchToWholeSystem}
            onDismissSingleTab={() => setSingleTabBanner(false)}
            onDismissSilentSystem={() => setSilentSystemBanner(false)}
            onDismissCaptureError={() => setCaptureErrorBanner(null)}
            onOpenAudioGuide={() => setGuideModalOpen(true)}
          />

          <ThreePanelWorkspace
            note={activeNote}
            saveStatus={saveStatus}
            layoutMode={layoutMode}
            activeTab={activeTab}
            grammarViewMode={grammarViewMode}
            grammarTone={grammarTone}
            targetLanguage={targetLanguage}
            isRecording={isRecording}
            isLiveTranscribing={isLiveTranscribing}
            liveInterimText={liveInterimText}
            isProcessingAI={isProcessingAI}
            aiProgressText={aiProgressText}
            onLayoutChange={setLayoutMode}
            onTabChange={setActiveTab}
            onGrammarViewChange={setGrammarViewMode}
            onGrammarToneChange={handleGrammarToneChange}
            onTargetLanguageChange={handleTargetLanguageChange}
            onUpdateField={(field, value) => {
              updateNoteField(activeNote.id, field, value);
              if (field === "transcript" && !isRecordingRef.current) {
                const rawText = String(value);
                const trimmed = rawText.trim();
                if (autoCorrectTimeoutRef.current !== null) {
                  clearTimeout(autoCorrectTimeoutRef.current);
                  autoCorrectTimeoutRef.current = null;
                }
                if (
                  trimmed.length >= 6 &&
                  trimmed.split(/\s+/).length >= 2 &&
                  trimmed !== lastAutoProcessedTextRef.current
                ) {
                  const targetId = activeNote.id;
                  autoCorrectTimeoutRef.current = window.setTimeout(() => {
                    if (isRecordingRef.current || isProcessingRef.current) {
                      return;
                    }
                    void runTextProcessing(
                      trimmed,
                      grammarToneRef.current,
                      targetId,
                      { preserveRawTranscript: true, silent: true }
                    );
                  }, 1100);
                }
              }
            }}
            onRerunAI={handleRerunAI}
            onExport={handleExport}
            onCopy={handleCopy}
          />
        </main>
      </div>

      <QuickPasteModal
        open={quickPasteOpen}
        initialText={activeNote.transcript}
        initialTone={grammarTone}
        onClose={() => setQuickPasteOpen(false)}
        onSubmit={handleQuickPasteSubmit}
      />

      <AudioSetupModal
        open={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
      />

      {/* Toast Stack */}
      <div
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const borderAndIcon =
            toast.kind === "success"
              ? "border-emerald-300 dark:border-emerald-700/70 text-emerald-700 dark:text-emerald-300"
              : toast.kind === "warning"
              ? "border-amber-300 dark:border-amber-700/70 text-amber-700 dark:text-amber-300"
              : toast.kind === "error"
              ? "border-rose-300 dark:border-rose-700/70 text-rose-700 dark:text-rose-300"
              : "border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-300";

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-2.5 p-3.5 rounded-lg bg-white dark:bg-[#131A26] border shadow-lg text-xs ${borderAndIcon}`}
            >
              {toast.kind === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : toast.kind === "warning" || toast.kind === "error" ? (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <p className="flex-1 text-slate-800 dark:text-slate-100 leading-relaxed">
                {toast.message}
              </p>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
