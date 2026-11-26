import { MonitorSpeaker, X } from "lucide-react";

interface AudioSetupModalProps {
  open: boolean;
  onClose: () => void;
}

export function AudioSetupModal({ open, onClose }: AudioSetupModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audio-setup-title"
    >
      <div className="bg-white dark:bg-[#131A26] border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <MonitorSpeaker className="w-5 h-5 text-indigo-500 shrink-0" />
            <h3
              id="audio-setup-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Capturing Other Apps &amp; Headphone Sound
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close setup guide"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
          <p className="leading-relaxed">
            You can capture sound from other desktop applications (Zoom, Teams,
            Spotify, VLC, games) and sound playing inside wired, USB, or
            Bluetooth headphones:
          </p>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/70 dark:bg-[#0B0F17]">
            <div className="p-4 flex items-start gap-3">
              <span className="w-6 h-6 rounded-md bg-indigo-600 text-white text-xs font-semibold tabular-nums flex items-center justify-center shrink-0 mt-0.5">
                1
              </span>
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  Capture Other Apps via Screen / Window Audio
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Click <strong>Capture System &amp; Apps</strong>, select{" "}
                  <strong>Entire Screen</strong> (captures all running apps and
                  your headphone output) or an <strong>App Window</strong>, and
                  enable <strong>Also share system audio</strong>.
                </p>
              </div>
            </div>

            <div className="p-4 flex items-start gap-3">
              <span className="w-6 h-6 rounded-md bg-sky-600 text-white text-xs font-semibold tabular-nums flex items-center justify-center shrink-0 mt-0.5">
                2
              </span>
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  Bluetooth &amp; USB Headphones Tip
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Sound stays audible in your headphones while recording. If you
                  use Bluetooth headphones and hear no sound on Windows, make
                  sure both your app and Windows output use the{" "}
                  <strong>Headphones (Stereo)</strong> device rather than{" "}
                  <em>Hands-Free AG Audio</em>.
                </p>
              </div>
            </div>

            <div className="p-4 flex items-start gap-3">
              <span className="w-6 h-6 rounded-md bg-emerald-600 text-white text-xs font-semibold tabular-nums flex items-center justify-center shrink-0 mt-0.5">
                3
              </span>
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  Direct Loopback (No Screen Sharing Needed)
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  If you enable <strong>Stereo Mix</strong> (Windows),{" "}
                  <strong>BlackHole</strong> (macOS), or{" "}
                  <strong>VB-Audio Virtual Cable</strong>, click{" "}
                  <strong>Detect Headphones &amp; Apps</strong> — a{" "}
                  <strong>Capture Headphone Loopback</strong> button will
                  appear automatically.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
