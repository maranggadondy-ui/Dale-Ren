import { useEffect, useState } from "react";
import { ClipboardPaste, Sparkles, X } from "lucide-react";
import type { GrammarTone } from "../types";

interface QuickPasteModalProps {
  open: boolean;
  initialText: string;
  initialTone: GrammarTone;
  onClose: () => void;
  onSubmit: (text: string, tone: GrammarTone) => void;
}

export function QuickPasteModal({
  open,
  initialText,
  initialTone,
  onClose,
  onSubmit,
}: QuickPasteModalProps) {
  const [text, setText] = useState(initialText);
  const [tone, setTone] = useState<GrammarTone>(initialTone);

  useEffect(() => {
    if (open) {
      setText(initialText);
      setTone(initialTone);
    }
  }, [open, initialText, initialTone]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-paste-title"
    >
      <div className="bg-white dark:bg-[#131A26] border border-slate-200 dark:border-slate-800 rounded-xl max-w-xl w-full p-6 shadow-xl space-y-4">
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <ClipboardPaste className="w-5 h-5 text-emerald-500 shrink-0" />
            <div>
              <h3 id="quick-paste-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Quick Paste Raw Transcript
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Paste rough notes or a transcript to correct grammar and generate a summary
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close quick paste dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          autoFocus
          placeholder="Paste your raw meeting notes, lecture transcript, or rough draft here..."
          className="w-full p-3.5 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 text-sm leading-relaxed text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <label
              htmlFor="modal-grammar-tone"
              className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
            >
              Correction Tone:
            </label>
            <select
              id="modal-grammar-tone"
              value={tone}
              onChange={(e) => setTone(e.target.value as GrammarTone)}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#0B0F17] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="standard">Standard Clean-Up</option>
              <option value="professional">Professional Polish</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSubmit(text, tone)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Correct Grammar & Summarize</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
