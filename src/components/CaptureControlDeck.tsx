import type { ChangeEvent, RefObject } from "react";
import {
  AppWindow,
  BarChart2,
  Captions,
  ClipboardPaste,
  Download,
  ExternalLink,
  Headphones,
  HelpCircle,
  Mic,
  Monitor,
  MonitorSpeaker,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Sparkles,
  Square,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { SurfaceType } from "../types";

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
  isHeadphones: boolean;
}

interface CaptureControlDeckProps {
  isRecording: boolean;
  isPaused: boolean;
  isTestingMic: boolean;
  isLiveTranscribing: boolean;
  elapsedTime: string;
  audioSourceLabel: string;
  surfaceType: SurfaceType;
  recordedAudioUrl: string | null;
  includeMic: boolean;
  browserSpeechEnabled: boolean;
  missingAudioBanner: boolean;
  singleTabBanner: boolean;
  silentSystemBanner: boolean;
  captureErrorBanner: string | null;
  micDevices: AudioInputDevice[];
  loopbackDevices: AudioInputDevice[];
  outputDevices: AudioOutputDevice[];
  selectedMicId: string;
  selectedLoopbackId: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  sysLevelBarRef: RefObject<HTMLDivElement | null>;
  micLevelBarRef: RefObject<HTMLDivElement | null>;
  onStartSystemCapture: () => void;
  onStartHeadsetCapture: () => void;
  onStartLoopbackCapture: () => void;
  onStartMicCapture: () => void;
  onToggleTestMic: () => void;
  onDetectDevices: () => void;
  onSelectMicId: (deviceId: string) => void;
  onSelectLoopbackId: (deviceId: string) => void;
  onRefreshDevices: () => void;
  onPauseResume: () => void;
  onStop: () => void;
  onUploadAudio: (e: ChangeEvent<HTMLInputElement>) => void;
  onOpenQuickPaste: () => void;
  onDownloadAudio: () => void;
  onToggleIncludeMic: (checked: boolean) => void;
  onToggleBrowserSpeech: (checked: boolean) => void;
  onDismissMissingAudio: () => void;
  onContinueMicOnly: () => void;
  onSwitchToWholeSystem: () => void;
  onDismissSingleTab: () => void;
  onDismissSilentSystem: () => void;
  onDismissCaptureError: () => void;
  onOpenAudioGuide: () => void;
}

export function CaptureControlDeck({
  isRecording,
  isPaused,
  isTestingMic,
  isLiveTranscribing,
  elapsedTime,
  audioSourceLabel,
  surfaceType,
  recordedAudioUrl,
  includeMic,
  browserSpeechEnabled,
  missingAudioBanner,
  singleTabBanner,
  silentSystemBanner,
  captureErrorBanner,
  micDevices,
  loopbackDevices,
  outputDevices,
  selectedMicId,
  selectedLoopbackId,
  canvasRef,
  sysLevelBarRef,
  micLevelBarRef,
  onStartSystemCapture,
  onStartHeadsetCapture,
  onStartLoopbackCapture,
  onStartMicCapture,
  onToggleTestMic,
  onDetectDevices,
  onSelectMicId,
  onSelectLoopbackId,
  onRefreshDevices,
  onPauseResume,
  onStop,
  onUploadAudio,
  onOpenQuickPaste,
  onDownloadAudio,
  onToggleIncludeMic,
  onToggleBrowserSpeech,
  onDismissMissingAudio,
  onContinueMicOnly,
  onSwitchToWholeSystem,
  onDismissSingleTab,
  onDismissSilentSystem,
  onDismissCaptureError,
  onOpenAudioGuide,
}: CaptureControlDeckProps) {
  const surfaceTextColor =
    surfaceType === "monitor" && isRecording
      ? "text-emerald-600 dark:text-emerald-400 font-semibold"
      : surfaceType === "window" && isRecording
      ? "text-indigo-600 dark:text-indigo-400 font-semibold"
      : surfaceType === "browser" && isRecording
      ? "text-sky-600 dark:text-sky-400 font-semibold"
      : isRecording || isTestingMic
      ? "text-indigo-600 dark:text-indigo-400 font-semibold"
      : "text-slate-500 dark:text-slate-400 font-medium";

  const isInIframe =
    typeof window !== "undefined" && window.self !== window.top;

  const detectedHeadphone = outputDevices.find((o) => o.isHeadphones);
  const labeledOutput = outputDevices.find((o) => Boolean(o.label));
  const activeOutputName = detectedHeadphone
    ? detectedHeadphone.label
    : labeledOutput
    ? labeledOutput.label
    : outputDevices.length > 0
    ? `${outputDevices.length} output ${outputDevices.length === 1 ? "device" : "devices"} (click Detect)`
    : "Default System Output";

  return (
    <div className="space-y-4">
      {captureErrorBanner && (
        <div
          role="alert"
          className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800/80 p-4"
        >
          <div className="flex items-start gap-3">
            <VolumeX className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                Audio Capture Blocked or Unavailable
              </h3>
              <p className="text-xs text-rose-800 dark:text-rose-300/90 mt-1 leading-relaxed">
                {captureErrorBanner}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {loopbackDevices.length > 0 && (
                  <button
                    type="button"
                    onClick={onStartLoopbackCapture}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    <span>Capture via App/Headphone Loopback</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onStartMicCapture}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Record Microphone Instead</span>
                </button>
                {isInIframe && (
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open App in Full Tab</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={onDismissCaptureError}
                  className="px-3.5 py-1.5 rounded-lg text-rose-800 dark:text-rose-300 hover:bg-rose-200/60 dark:hover:bg-rose-900/50 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {missingAudioBanner && (
        <div
          role="alert"
          className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 p-4"
        >
          <div className="flex items-start gap-3">
            <VolumeX className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                No System / Headphone Audio Track Detected
              </h3>
              <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-1 leading-relaxed">
                Your screen or window was shared, but{" "}
                <strong>&ldquo;Also share system audio&rdquo;</strong> (or{" "}
                <strong>&ldquo;Share tab audio&rdquo;</strong>) was unchecked in
                the browser popup. To capture other apps and sound playing in
                your headphones, choose <strong>Entire Screen</strong> (or{" "}
                <strong>Chrome Tab</strong>) and enable the audio switch.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onStartSystemCapture}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Retry &amp; Check Audio Box
                </button>
                <button
                  type="button"
                  onClick={onContinueMicOnly}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Record Microphone Only</span>
                </button>
                <button
                  type="button"
                  onClick={onDismissMissingAudio}
                  className="px-3.5 py-1.5 rounded-lg text-amber-800 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-900/50 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {silentSystemBanner && (
        <div
          role="status"
          className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 p-4"
        >
          <div className="flex items-start gap-3">
            <Headphones className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                No Sound Signal Detected Yet from Other Apps or Headphones
              </h3>
              <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-1 leading-relaxed">
                Audio capture is active, but the System meter is still at 0%. If
                sound is playing in your headphones or another app: (1) check
                that your Bluetooth headset isn&apos;t routed to a separate{" "}
                <em>Hands-Free</em> endpoint, (2) ensure the other app outputs to
                your default headphone/speaker device, or (3) switch to{" "}
                <strong>Entire Screen</strong> with{" "}
                <strong>Also share system audio</strong>.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onSwitchToWholeSystem}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <MonitorSpeaker className="w-3.5 h-3.5" />
                  <span>Re-pick Entire Screen</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenAudioGuide}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Headphone Setup Tips</span>
                </button>
                <button
                  type="button"
                  onClick={onDismissSilentSystem}
                  className="px-3.5 py-1.5 rounded-lg text-amber-800 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-900/50 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {singleTabBanner && (
        <div
          role="status"
          className="rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800/80 p-4"
        >
          <div className="flex items-start gap-3">
            <AppWindow className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-sky-900 dark:text-sky-200">
                Single Browser Tab Detected (Tab-Only Audio)
              </h3>
              <p className="text-xs text-sky-800 dark:text-sky-300/90 mt-1 leading-relaxed">
                Other desktop apps (Zoom, Teams, Spotify, Discord, media
                players) and external headphone audio outside this browser tab
                will not be captured. Switch to <strong>Entire Screen</strong>{" "}
                (or an <strong>App Window</strong>) and check{" "}
                <strong>Also share system audio</strong> to capture them.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onSwitchToWholeSystem}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <MonitorSpeaker className="w-3.5 h-3.5" />
                  <span>Switch to Entire Screen</span>
                </button>
                <button
                  type="button"
                  onClick={onDismissSingleTab}
                  className="px-3.5 py-1.5 rounded-lg text-sky-800 dark:text-sky-300 hover:bg-sky-200/60 dark:hover:bg-sky-900/50 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Keep Single Tab
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="bg-white dark:bg-[#131A26] rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            {!isRecording ? (
              <>
                <button
                  type="button"
                  onClick={onStartHeadsetCapture}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="Transcribe audio playing inside your headset (automatically uses loopback if installed, or system/tab audio while protecting Bluetooth stereo)"
                >
                  <Headphones className="w-4 h-4" />
                  <span>Transcribe Headset Sound</span>
                </button>

                <button
                  type="button"
                  onClick={onStartSystemCapture}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="Capture audio from other desktop apps, browser tabs, and sound playing in your headphones"
                >
                  <MonitorSpeaker className="w-4 h-4" />
                  <span>Capture System &amp; Apps</span>
                </button>

                {loopbackDevices.length > 0 && (
                  <button
                    type="button"
                    onClick={onStartLoopbackCapture}
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-sky-700 dark:text-sky-300 border border-slate-200 dark:border-slate-700 font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    title="Capture other apps and headphone output directly via detected Stereo Mix / Loopback device without screen sharing"
                  >
                    <Radio className="w-4 h-4" />
                    <span>Loopback Input</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onStartMicCapture}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  <span>Record Mic</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onPauseResume}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isPaused ? (
                    <>
                      <Play className="w-4 h-4" />
                      <span>Resume</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>Pause</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onStop}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop &amp; Finalize</span>
                </button>
              </>
            )}

            <label
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0"
              title="Upload MP3, WAV, M4A, or WebM audio"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-500" />
              <span>Upload Audio</span>
              <input
                type="file"
                accept="audio/*,video/webm,video/mp4"
                onChange={onUploadAudio}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={onOpenQuickPaste}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Paste raw text to run Grammar Correction & Summary without recording"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-emerald-500" />
              <span>Quick Paste Text</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {recordedAudioUrl && (
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-[#0B0F17] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <audio
                  src={recordedAudioUrl}
                  controls
                  className="h-7 max-w-[200px] sm:max-w-[230px]"
                />
                <button
                  type="button"
                  onClick={onDownloadAudio}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-600 dark:text-indigo-300 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="Download recorded audio (.webm)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>.webm</span>
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 bg-slate-50 dark:bg-[#0B0F17] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isRecording
                      ? isPaused
                        ? "bg-amber-500"
                        : "bg-rose-500 animate-pulse"
                      : isTestingMic
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-slate-400 dark:bg-slate-600"
                  }`}
                />
                <span className="font-mono text-sm sm:text-base font-semibold tracking-wider tabular-nums text-slate-900 dark:text-slate-100">
                  {elapsedTime}
                </span>
              </div>
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
              <div className={`flex items-center gap-1.5 text-xs ${surfaceTextColor}`}>
                <Monitor className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="whitespace-nowrap">{audioSourceLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Audio Devices, Headphones & App Loopback Detection Row */}
        <div className="flex flex-col gap-2.5 text-xs bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2.5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <label
                htmlFor="mic-device-select"
                className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
              >
                <Mic className="w-3.5 h-3.5 text-emerald-500" />
                <span>Mic:</span>
              </label>
              <select
                id="mic-device-select"
                value={selectedMicId}
                onChange={(e) => onSelectMicId(e.target.value)}
                disabled={isRecording}
                className="max-w-[230px] truncate text-xs font-medium px-2.5 py-1.5 rounded-md bg-white dark:bg-[#131A26] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 outline-none focus:border-indigo-500 disabled:opacity-60 cursor-pointer"
              >
                <option value="">Default System Microphone</option>
                {micDevices.map((dev, idx) => (
                  <option key={dev.deviceId || idx} value={dev.deviceId}>
                    {dev.label || `Microphone ${idx + 1} (Click Detect to view)`}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={onRefreshDevices}
                disabled={isRecording}
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
                title="Refresh detected audio devices"
                aria-label="Refresh detected audio devices"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {!isRecording && (
                <button
                  type="button"
                  onClick={onToggleTestMic}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isTestingMic
                      ? "bg-emerald-600 text-white hover:bg-emerald-500"
                      : "bg-white dark:bg-[#131A26] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {isTestingMic ? "Stop Mic Test" : "Test Mic"}
                </button>
              )}

              {!isRecording && (
                <button
                  type="button"
                  onClick={onDetectDevices}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white dark:bg-[#131A26] text-sky-700 dark:text-sky-300 border border-slate-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-sky-950/30 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="Scan connected headphones, Bluetooth headsets, microphones, and Stereo Mix / BlackHole loopback devices"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Detect Headphones &amp; Apps</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400 min-w-0">
              <div
                className="flex items-center gap-1.5 min-w-0 max-w-[300px]"
                title={activeOutputName}
              >
                <Headphones
                  className={`w-3.5 h-3.5 shrink-0 ${
                    detectedHeadphone
                      ? "text-sky-500"
                      : "text-slate-400 dark:text-slate-500"
                  }`}
                />
                <span className="truncate">
                  {detectedHeadphone ? "Headphones: " : "Output: "}
                  <strong className="font-medium text-slate-800 dark:text-slate-200">
                    {activeOutputName}
                  </strong>
                </span>
              </div>

              {loopbackDevices.length > 0 && (
                <>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                    |
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <select
                      value={selectedLoopbackId}
                      onChange={(e) => onSelectLoopbackId(e.target.value)}
                      disabled={isRecording}
                      aria-label="Select loopback audio device"
                      className="max-w-[200px] truncate text-[11px] font-medium px-2 py-1 rounded bg-white dark:bg-[#131A26] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 outline-none focus:border-indigo-500 disabled:opacity-60 cursor-pointer"
                    >
                      {loopbackDevices.map((dev, idx) => (
                        <option key={dev.deviceId || idx} value={dev.deviceId}>
                          {dev.label || `Loopback ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            To capture <strong>other apps (Zoom, Teams, Spotify, VLC)</strong>{" "}
            and <strong>sound in your headphones</strong>: click{" "}
            <strong>Capture System &amp; Apps</strong>, choose{" "}
            <strong>Entire Screen</strong> (or an App Window), and check{" "}
            <strong>Share system audio</strong> — audio continues playing in
            your headphones normally.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-5">
            <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeMic}
                onChange={(e) => onToggleIncludeMic(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 relative" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-indigo-500" />
                <span>Include Mic with System Sound</span>
              </span>
            </label>

            <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 select-none">
              <Sparkles
                className={`w-3.5 h-3.5 ${
                  isLiveTranscribing ? "animate-spin" : ""
                }`}
              />
              <span>
                {isLiveTranscribing
                  ? "Live Transcribing & Correcting Lines (≤3s)..."
                  : "Live Transcribe & Line Corrections: Always On (≤3s)"}
              </span>
            </div>

            <label
              className="inline-flex items-center gap-2.5 cursor-pointer select-none"
              title="Instant local browser speech recognition captions for your microphone"
            >
              <input
                type="checkbox"
                checked={browserSpeechEnabled}
                onChange={(e) => onToggleBrowserSpeech(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600 relative" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Captions className="w-3.5 h-3.5 text-sky-500" />
                <span>Instant Mic Captions</span>
              </span>
            </label>
          </div>

          <div className="flex items-center gap-4 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5" title="Live System, Other Apps & Headphone Input Level">
              <Volume2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Apps / Headphones</span>
              <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  ref={sysLevelBarRef}
                  className="h-full w-0 bg-emerald-500 transition-all duration-75"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5" title="Live Microphone Input Level">
              <Mic className="w-3.5 h-3.5 text-indigo-500" />
              <span>Mic</span>
              <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  ref={micLevelBarRef}
                  className="h-full w-0 bg-indigo-500 transition-all duration-75"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="relative w-full h-16 rounded-lg bg-slate-950 overflow-hidden border border-slate-800 flex items-center justify-center">
          <canvas ref={canvasRef} className="w-full h-full block" />
          {!isRecording && !isTestingMic && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-slate-400 pointer-events-none px-4 text-center">
              <BarChart2 className="w-4 h-4 text-indigo-400 shrink-0" />
              <p className="text-xs font-medium">
                Real-time audio spectrum — Captures other apps, headphone
                output, and mic (≤3s live delay)
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
