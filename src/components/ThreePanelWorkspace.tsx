import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  BookOpen,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Columns3,
  Copy,
  File,
  FileText,
  Languages,
  LayoutList,
  Lightbulb,
  ListChecks,
  Loader2,
  Plus,
  Sparkles,
  SpellCheck,
  Users,
  Wand2,
  X,
} from "lucide-react";
import type {
  GrammarTone,
  GrammarViewMode,
  LayoutMode,
  NoteSession,
  SentenceCorrection,
  WorkspaceTab,
} from "../types";
import {
  buildFormattedSummaryText,
  computeWordDiffSegments,
} from "../utils/diff";

const TARGET_LANGUAGE_OPTIONS = [
  "English",
  "Spanish",
  "French",
  "German",
  "Japanese",
  "Korean",
  "Chinese (Simplified)",
  "Portuguese",
  "Tagalog",
  "Indonesian",
  "Hindi",
  "Arabic",
  "Original (Detect Only)",
] as const;

interface ThreePanelWorkspaceProps {
  note: NoteSession;
  saveStatus: string;
  layoutMode: LayoutMode;
  activeTab: WorkspaceTab;
  grammarViewMode: GrammarViewMode;
  grammarTone: GrammarTone;
  targetLanguage: string;
  isRecording: boolean;
  isLiveTranscribing: boolean;
  liveInterimText?: string;
  isProcessingAI: boolean;
  aiProgressText: string;
  onLayoutChange: (mode: LayoutMode) => void;
  onTabChange: (tab: WorkspaceTab) => void;
  onGrammarViewChange: (mode: GrammarViewMode) => void;
  onGrammarToneChange: (tone: GrammarTone) => void;
  onTargetLanguageChange: (language: string) => void;
  onUpdateField: <K extends keyof NoteSession>(
    field: K,
    value: NoteSession[K]
  ) => void;
  onRerunAI: () => void;
  onExport: (ext: "md" | "txt") => void;
  onCopy: (text: string, label: string) => void;
}

function getSpeakerColorClass(speaker: string): string {
  const palette = [
    "text-indigo-600 dark:text-indigo-400",
    "text-emerald-600 dark:text-emerald-400",
    "text-amber-600 dark:text-amber-400",
    "text-sky-600 dark:text-sky-400",
    "text-rose-600 dark:text-rose-400",
  ];
  const match = speaker.match(/(\d+)/);
  if (match) {
    const idx = Math.max(0, Number.parseInt(match[1], 10) - 1) % palette.length;
    return palette[idx];
  }
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = (hash * 31 + speaker.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

function parseTranscriptLineMeta(line: string): {
  timestamp: string;
  speaker: string;
  text: string;
} {
  let remaining = line.trim();
  let timestamp = "";
  let speaker = "";

  const tsMatch = remaining.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/);
  if (tsMatch) {
    timestamp = tsMatch[1];
    remaining = tsMatch[2].trim();
  }

  const spkMatch = remaining.match(
    /^(P\d+|Speaker\s*\d+|[A-Z][a-zA-Z0-9 _-]{0,20}):\s+(.*)$/
  );
  if (spkMatch) {
    speaker = spkMatch[1].replace(/^Speaker\s+(\d+)$/i, "P$1").trim();
    remaining = spkMatch[2].trim();
  }

  return { timestamp, speaker, text: remaining };
}

interface SpeakerTurn {
  speaker: string;
  timestamp: string;
  lines: { timestamp: string; text: string }[];
}

export function ThreePanelWorkspace({
  note,
  saveStatus,
  layoutMode,
  activeTab,
  grammarViewMode,
  grammarTone,
  targetLanguage,
  isRecording,
  isLiveTranscribing,
  liveInterimText = "",
  isProcessingAI,
  aiProgressText,
  onLayoutChange,
  onTabChange,
  onGrammarViewChange,
  onGrammarToneChange,
  onTargetLanguageChange,
  onUpdateField,
  onRerunAI,
  onExport,
  onCopy,
}: ThreePanelWorkspaceProps) {
  const [fixesLogExpanded, setFixesLogExpanded] = useState(false);
  const [rawViewMode, setRawViewMode] = useState<"text" | "speakers">("text");
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>("ALL");
  const rawTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rawSpeakersScrollRef = useRef<HTMLDivElement | null>(null);
  const linesScrollRef = useRef<HTMLDivElement | null>(null);

  const displayedRawTranscript = useMemo(() => {
    const liveClean = liveInterimText.trim();
    if (!isRecording || !liveClean) return note.transcript;
    const base = note.transcript.trimEnd();
    return base ? `${base}\n\n${liveClean}` : liveClean;
  }, [isRecording, liveInterimText, note.transcript]);

  const wordCount = useMemo(() => {
    const trimmed = displayedRawTranscript.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [displayedRawTranscript]);

  const diffSegments = useMemo(() => {
    if (grammarViewMode !== "diff") return [];
    return computeWordDiffSegments(note.transcript, note.grammarCorrected);
  }, [grammarViewMode, note.transcript, note.grammarCorrected]);

  // Build sentence/line pairs from AI structured output, or derive line-by-line fallback from raw/corrected text
  const resolvedSentenceLines = useMemo<SentenceCorrection[]>(() => {
    if (note.sentenceCorrections && note.sentenceCorrections.length > 0) {
      return note.sentenceCorrections;
    }
    const rawLines = note.transcript
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const corrLines = note.grammarCorrected
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const maxLen = Math.max(rawLines.length, corrLines.length);
    const derived: SentenceCorrection[] = [];

    for (let i = 0; i < maxLen; i++) {
      const parsedRaw = parseTranscriptLineMeta(rawLines[i] ?? "");
      const parsedCorr = parseTranscriptLineMeta(corrLines[i] ?? "");
      const rawLine = parsedRaw.text;
      const correctedLine = parsedCorr.text || rawLine;
      const hasChanges = Boolean(
        rawLine && correctedLine && rawLine !== correctedLine
      );
      derived.push({
        lineNumber: i + 1,
        timestamp: parsedRaw.timestamp || parsedCorr.timestamp,
        speaker: parsedRaw.speaker || parsedCorr.speaker,
        rawLine,
        correctedLine,
        hasChanges,
        reason: hasChanges
          ? "Grammar or punctuation adjusted"
          : "Grammatically clean",
      });
    }
    return derived;
  }, [note.grammarCorrected, note.sentenceCorrections, note.transcript]);

  const speakerTurns = useMemo<SpeakerTurn[]>(() => {
    const entries: { timestamp: string; speaker: string; text: string }[] = [];

    if (note.sentenceCorrections && note.sentenceCorrections.length > 0) {
      for (const item of note.sentenceCorrections) {
        if (!item.rawLine.trim()) continue;
        entries.push({
          timestamp: item.timestamp || "",
          speaker: item.speaker?.trim() || "P1",
          text: item.rawLine.trim(),
        });
      }
    } else {
      const lines = note.transcript
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        const parsed = parseTranscriptLineMeta(line);
        if (!parsed.text) continue;
        entries.push({
          timestamp: parsed.timestamp,
          speaker: parsed.speaker || "P1",
          text: parsed.text,
        });
      }
    }

    const turns: SpeakerTurn[] = [];
    for (const entry of entries) {
      const last = turns[turns.length - 1];
      if (last && last.speaker === entry.speaker) {
        last.lines.push({ timestamp: entry.timestamp, text: entry.text });
      } else {
        turns.push({
          speaker: entry.speaker,
          timestamp: entry.timestamp,
          lines: [{ timestamp: entry.timestamp, text: entry.text }],
        });
      }
    }
    return turns;
  }, [note.sentenceCorrections, note.transcript]);

  const detectedSpeakers = useMemo(() => {
    const seen = new Set<string>();
    for (const turn of speakerTurns) {
      if (turn.speaker) seen.add(turn.speaker);
    }
    return Array.from(seen);
  }, [speakerTurns]);

  const activeSpeakerFilter =
    selectedSpeaker === "ALL" || detectedSpeakers.includes(selectedSpeaker)
      ? selectedSpeaker
      : "ALL";

  const filteredSpeakerTurns = useMemo(() => {
    if (activeSpeakerFilter === "ALL") return speakerTurns;
    return speakerTurns.filter((t) => t.speaker === activeSpeakerFilter);
  }, [activeSpeakerFilter, speakerTurns]);

  const filteredGrammarLines = useMemo(() => {
    if (activeSpeakerFilter === "ALL") return resolvedSentenceLines;
    return resolvedSentenceLines.filter(
      (l) => (l.speaker?.trim() || "P1") === activeSpeakerFilter
    );
  }, [activeSpeakerFilter, resolvedSentenceLines]);

  const changedLineCount = useMemo(
    () => resolvedSentenceLines.filter((l) => l.hasChanges).length,
    [resolvedSentenceLines]
  );

  const translatedLineCount = useMemo(
    () =>
      resolvedSentenceLines.filter(
        (l) => Boolean(l.isTranslated && l.translatedLine?.trim())
      ).length,
    [resolvedSentenceLines]
  );

  const detectedLanguagesList = useMemo(() => {
    const langs = new Set<string>(
      (note.detectedLanguages ?? []).map((l) => l.trim()).filter(Boolean)
    );
    for (const line of resolvedSentenceLines) {
      if (line.detectedLanguage?.trim()) {
        langs.add(line.detectedLanguage.trim());
      }
    }
    return Array.from(langs);
  }, [note.detectedLanguages, resolvedSentenceLines]);

  const allPronunciationIssues = useMemo(
    () =>
      resolvedSentenceLines.flatMap((line) =>
        (line.pronunciationIssues ?? []).map((issue) => ({
          ...issue,
          lineNumber: line.lineNumber,
          speaker: line.speaker,
        }))
      ),
    [resolvedSentenceLines]
  );

  // Auto-scroll live transcript & line-by-line corrections while recording
  useEffect(() => {
    if (!isRecording) return;
    if (rawTextareaRef.current) {
      rawTextareaRef.current.scrollTop = rawTextareaRef.current.scrollHeight;
    }
    if (rawSpeakersScrollRef.current) {
      rawSpeakersScrollRef.current.scrollTop =
        rawSpeakersScrollRef.current.scrollHeight;
    }
    if (linesScrollRef.current) {
      linesScrollRef.current.scrollTop = linesScrollRef.current.scrollHeight;
    }
  }, [
    isRecording,
    displayedRawTranscript,
    speakerTurns.length,
    resolvedSentenceLines.length,
  ]);

  const formattedDate = useMemo(() => {
    const dateObj = new Date(note.createdAt);
    return dateObj.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [note.createdAt]);

  const isSplitDesktop = layoutMode === "split";

  const showRaw = isSplitDesktop
    ? activeTab === "raw"
      ? "flex"
      : "hidden lg:flex"
    : activeTab === "raw"
    ? "flex"
    : "hidden";

  const showGrammar = isSplitDesktop
    ? activeTab === "grammar"
      ? "flex"
      : "hidden lg:flex"
    : activeTab === "grammar"
    ? "flex"
    : "hidden";

  const showSummary = isSplitDesktop
    ? activeTab === "summary"
      ? "flex"
      : "hidden lg:flex"
    : activeTab === "summary"
    ? "flex"
    : "hidden";

  const handleToggleActionItem = (idx: number, done: boolean) => {
    const next = [...note.actionItems];
    next[idx] = { ...next[idx], done };
    onUpdateField("actionItems", next);
  };

  const handleEditActionItem = (idx: number, text: string) => {
    const next = [...note.actionItems];
    next[idx] = { ...next[idx], text };
    onUpdateField("actionItems", next);
  };

  const handleDeleteActionItem = (idx: number) => {
    const next = note.actionItems.filter((_, i) => i !== idx);
    onUpdateField("actionItems", next);
  };

  const handleAddActionItem = () => {
    const next = [
      ...note.actionItems,
      { text: "New follow-up task...", done: false },
    ];
    onUpdateField("actionItems", next);
  };

  return (
    <section className="bg-white dark:bg-[#131A26] rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4 flex-1 flex flex-col">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={note.title}
            onChange={(e) => onUpdateField("title", e.target.value)}
            placeholder="Enter session, class, or meeting title..."
            className="w-full text-lg sm:text-xl font-semibold bg-transparent border-none outline-none focus:ring-0 text-slate-900 dark:text-slate-100 placeholder-slate-400 truncate"
          />
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span>{formattedDate}</span>
            <span aria-hidden="true">·</span>
            <span>{note.duration || "00:00"} duration</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {saveStatus}
            </span>
            {isLiveTranscribing && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                  Updating live lines...
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden lg:inline-flex rounded-lg bg-slate-100 dark:bg-[#0B0F17] p-1 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onLayoutChange("split")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                layoutMode === "split"
                  ? "bg-white dark:bg-[#1A2232] text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
              title="View all 3 panels side-by-side"
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Split View</span>
            </button>
            <button
              type="button"
              onClick={() => onLayoutChange("tabs")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                layoutMode === "tabs"
                  ? "bg-white dark:bg-[#1A2232] text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
              title="Focus on one tab at a time"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Tabs</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onRerunAI}
            disabled={isProcessingAI}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Re-run Sentence-by-Sentence Grammar Corrector & Smart Summary on current text"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Re-run Grammar &amp; Summary</span>
          </button>

          <button
            type="button"
            onClick={() => onExport("md")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Download all 3 sections as Markdown"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-500" />
            <span>.MD</span>
          </button>

          <button
            type="button"
            onClick={() => onExport("txt")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Download all 3 sections as Plain Text"
          >
            <File className="w-3.5 h-3.5 text-emerald-500" />
            <span>.TXT</span>
          </button>
        </div>
      </div>

      {/* Tab selector bar (visible on mobile or when desktop layoutMode === 'tabs') */}
      <div
        className={`${
          layoutMode === "tabs" ? "flex" : "flex lg:hidden"
        } items-center gap-1 bg-slate-100 dark:bg-[#0B0F17] p-1 rounded-lg border border-slate-200 dark:border-slate-800`}
      >
        <button
          type="button"
          onClick={() => onTabChange("raw")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === "raw"
              ? "bg-white dark:bg-[#1A2232] text-indigo-600 dark:text-indigo-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          <AlignLeft className="w-3.5 h-3.5" />
          <span>1. Raw Lines</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange("grammar")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === "grammar"
              ? "bg-white dark:bg-[#1A2232] text-emerald-600 dark:text-emerald-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          <SpellCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>2. Line Corrections</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange("summary")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === "summary"
              ? "bg-white dark:bg-[#1A2232] text-indigo-600 dark:text-indigo-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          <ListChecks className="w-3.5 h-3.5 text-indigo-500" />
          <span>3. Smart Summary</span>
        </button>
      </div>

      {isProcessingAI && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/35 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-200 text-xs">
          <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
          <span className="font-medium">{aiProgressText}</span>
        </div>
      )}

      {/* Three-panel workspace */}
      <div
        className={`grid grid-cols-1 ${
          isSplitDesktop ? "lg:grid-cols-3" : "lg:grid-cols-1"
        } gap-4 flex-1 min-h-[520px]`}
      >
        {/* PANEL 1: RAW TRANSCRIPT (LIVE + SPEAKER SEPARATED) */}
        <div
          className={`${showRaw} flex-col rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0F17] overflow-hidden`}
        >
          <div className="px-3.5 py-2.5 bg-slate-100 dark:bg-[#151D2B] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlignLeft className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
              <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                01. Live Raw Transcript
              </h2>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {wordCount} {wordCount === 1 ? "word" : "words"}
              </span>
              <button
                type="button"
                onClick={() =>
                  onCopy(
                    activeSpeakerFilter === "ALL"
                      ? displayedRawTranscript
                      : filteredSpeakerTurns
                          .map(
                            (t) =>
                              `${t.speaker}: ${t.lines
                                .map((l) => l.text)
                                .join(" ")}`
                          )
                          .join("\n\n"),
                    activeSpeakerFilter === "ALL"
                      ? "Raw Transcript"
                      : `${activeSpeakerFilter} Transcript`
                  )
                }
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-medium border border-slate-200 dark:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Copy Original Transcript"
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </button>
            </div>
          </div>

          <div className="px-3.5 py-2 bg-slate-100/60 dark:bg-[#101622] border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-md bg-slate-200/80 dark:bg-[#0B0F17] p-0.5 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setRawViewMode("text")}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  rawViewMode === "text"
                    ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                Live Stream
              </button>
              <button
                type="button"
                onClick={() => setRawViewMode("speakers")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  rawViewMode === "speakers"
                    ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                <Users className="w-3 h-3" />
                <span>By Person (P1, P2)</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums">
              {detectedLanguagesList.length > 0 && (
                <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-sans font-medium">
                  <Languages className="w-3 h-3 shrink-0" />
                  <span>{detectedLanguagesList.join(" · ")}</span>
                </span>
              )}
              {detectedSpeakers.length > 0 ? (
                <>
                  {detectedLanguagesList.length > 0 && (
                    <span aria-hidden="true" className="text-slate-400">
                      |
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedSpeaker("ALL")}
                    className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                      activeSpeakerFilter === "ALL"
                        ? "bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    All ({detectedSpeakers.length})
                  </button>
                  {detectedSpeakers.map((spk) => (
                    <button
                      key={spk}
                      type="button"
                      onClick={() => {
                        setSelectedSpeaker(spk);
                        setRawViewMode("speakers");
                      }}
                      className={`px-1.5 py-0.5 rounded font-semibold transition-colors cursor-pointer ${getSpeakerColorClass(
                        spk
                      )} ${
                        activeSpeakerFilter === spk
                          ? "bg-white dark:bg-slate-800 shadow-2xs"
                          : "hover:bg-slate-200/70 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      {spk}
                    </button>
                  ))}
                </>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">
                  Auto-detects P1, P2...
                </span>
              )}
            </div>
          </div>

          {rawViewMode === "text" ? (
            <textarea
              ref={rawTextareaRef}
              value={displayedRawTranscript}
              readOnly={Boolean(isRecording && liveInterimText.trim())}
              onChange={(e) => onUpdateField("transcript", e.target.value)}
              placeholder={`Live verbatim transcript with detected speakers (P1, P2, ...) will stream directly here while recording...\n\nTip: Type or paste unpunctuated text here — automated periods and grammar correction run automatically.`}
              className="flex-1 w-full p-4 bg-transparent resize-none outline-none leading-relaxed text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 font-mono text-[12.5px] min-h-[340px]"
            />
          ) : (
            <div
              ref={rawSpeakersScrollRef}
              className="flex-1 w-full p-3.5 overflow-y-auto space-y-2.5 min-h-[340px] max-h-[560px]"
            >
              {filteredSpeakerTurns.length === 0 && !liveInterimText.trim() ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-10 px-4">
                  <Users className="w-6 h-6 text-slate-400 dark:text-slate-600 mb-2" />
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                    Each speaker&apos;s dialogue will be separated automatically
                    as P1, P2, P3... while recording or after pasting text.
                  </p>
                </div>
              ) : (
                <>
                  {filteredSpeakerTurns.map((turn, idx) => (
                    <div
                      key={`${turn.speaker}-${idx}`}
                      className="rounded-lg bg-white dark:bg-[#131A26] border border-slate-200 dark:border-slate-800 p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-2 font-mono tabular-nums">
                          <span
                            className={`font-bold ${getSpeakerColorClass(
                              turn.speaker
                            )}`}
                          >
                            {turn.speaker}
                          </span>
                          {turn.timestamp && (
                            <>
                              <span
                                aria-hidden="true"
                                className="text-slate-400"
                              >
                                ·
                              </span>
                              <span className="text-slate-500 dark:text-slate-400">
                                {turn.timestamp}
                              </span>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onCopy(
                              turn.lines.map((l) => l.text).join(" "),
                              `${turn.speaker} turn`
                            )
                          }
                          className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                          title={`Copy ${turn.speaker} speech`}
                          aria-label={`Copy ${turn.speaker} turn`}
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="space-y-1">
                        {turn.lines.map((l, lIdx) => (
                          <p
                            key={lIdx}
                            className="text-[13px] leading-relaxed text-slate-800 dark:text-slate-200"
                          >
                            {l.text}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                  {isRecording && liveInterimText.trim() && (
                    <div className="rounded-lg bg-white dark:bg-[#131A26] border border-dashed border-sky-300 dark:border-sky-700/70 p-3 space-y-1">
                      <div className="text-[11px] font-mono font-semibold text-sky-600 dark:text-sky-400">
                        Live Capturing...
                      </div>
                      <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {liveInterimText}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* PANEL 2: SENTENCE & LINE-BY-LINE GRAMMAR CORRECTIONS */}
        <div
          className={`${showGrammar} flex-col rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0F17] overflow-hidden`}
        >
          <div className="px-3.5 py-2.5 bg-slate-100 dark:bg-[#151D2B] border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SpellCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                02. Grammar-Corrected
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={targetLanguage}
                onChange={(e) => onTargetLanguageChange(e.target.value)}
                aria-label="Auto-translation target language"
                title="Automatically detect foreign languages and translate to target language"
                className="text-[11px] font-medium px-2 py-1 rounded-md bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 border border-slate-200 dark:border-slate-700 outline-none focus:border-sky-500 cursor-pointer"
              >
                {TARGET_LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang === "Original (Detect Only)"
                      ? "Detect Only"
                      : `Auto → ${lang}`}
                  </option>
                ))}
              </select>

              <select
                value={grammarTone}
                onChange={(e) =>
                  onGrammarToneChange(e.target.value as GrammarTone)
                }
                aria-label="Grammar correction tone"
                className="text-[11px] font-medium px-2 py-1 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="standard">Standard Clean-Up</option>
                <option value="professional">Professional Polish</option>
              </select>

              <button
                type="button"
                onClick={() =>
                  grammarViewMode === "translation" && note.translatedText
                    ? onCopy(note.translatedText, `${targetLanguage} Translation`)
                    : onCopy(note.grammarCorrected, "Grammar-Corrected Text")
                }
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title={
                  grammarViewMode === "translation"
                    ? `Copy ${targetLanguage} Translation`
                    : "Copy Clean Grammar-Corrected Text"
                }
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </button>
            </div>
          </div>

          <div className="px-3.5 py-2 bg-slate-100/60 dark:bg-[#101622] border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex flex-wrap rounded-md bg-slate-200/80 dark:bg-[#0B0F17] p-0.5 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => onGrammarViewChange("lines")}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  grammarViewMode === "lines"
                    ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-300 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                By Sentence / Line
              </button>
              <button
                type="button"
                onClick={() => onGrammarViewChange("translation")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  grammarViewMode === "translation"
                    ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-300 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                <Languages className="w-3 h-3" />
                <span>
                  Translation
                  {translatedLineCount > 0 ? ` (${translatedLineCount})` : ""}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onGrammarViewChange("diff")}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  grammarViewMode === "diff"
                    ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-300 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                Inline Diff
              </button>
              <button
                type="button"
                onClick={() => onGrammarViewChange("clean")}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  grammarViewMode === "clean"
                    ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-300 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                Clean Text
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums">
              {detectedSpeakers.length >= 2 && (
                <div className="flex items-center gap-1 mr-1">
                  <button
                    type="button"
                    onClick={() => setSelectedSpeaker("ALL")}
                    className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                      activeSpeakerFilter === "ALL"
                        ? "bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    All
                  </button>
                  {detectedSpeakers.map((spk) => (
                    <button
                      key={`g-${spk}`}
                      type="button"
                      onClick={() => setSelectedSpeaker(spk)}
                      className={`px-1.5 py-0.5 rounded font-semibold transition-colors cursor-pointer ${getSpeakerColorClass(
                        spk
                      )} ${
                        activeSpeakerFilter === spk
                          ? "bg-white dark:bg-slate-800 shadow-2xs"
                          : "hover:bg-slate-200/70 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      {spk}
                    </button>
                  ))}
                </div>
              )}
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                {filteredGrammarLines.length}{" "}
                {filteredGrammarLines.length === 1 ? "line" : "lines"} ·{" "}
                {changedLineCount} polished
                {translatedLineCount > 0
                  ? ` · 🌐 ${translatedLineCount}`
                  : ""}
                {allPronunciationIssues.length > 0
                  ? ` · 🔈 ${allPronunciationIssues.length}`
                  : ""}
              </span>
            </div>
          </div>

          {grammarViewMode === "lines" ? (
            <div
              ref={linesScrollRef}
              className="flex-1 w-full p-3.5 overflow-y-auto space-y-2.5 min-h-[260px] max-h-[520px]"
            >
              {filteredGrammarLines.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-10 px-4">
                  <SpellCheck className="w-6 h-6 text-slate-400 dark:text-slate-600 mb-2" />
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                    Each spoken sentence and line will appear here live with
                    automatic grammar polish, periods, commas, ❌ incorrect
                    grammar, ✅ highlighted corrections, and 🔈 pronunciation.
                  </p>
                </div>
              ) : (
                filteredGrammarLines.map((item, idx) => {
                  const lineDiff = item.hasChanges
                    ? computeWordDiffSegments(item.rawLine, item.correctedLine)
                    : [];
                  const pronunciationList = item.pronunciationIssues ?? [];
                  const prevSpeaker =
                    idx > 0 ? filteredGrammarLines[idx - 1]?.speaker : "";
                  const speakerChanged =
                    Boolean(item.speaker) &&
                    idx > 0 &&
                    item.speaker !== prevSpeaker;

                  return (
                    <div key={`${item.lineNumber}-${idx}`} className="space-y-1.5">
                      {speakerChanged && (
                        <div className="flex items-center gap-2 pt-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                          <span className="flex items-center gap-1.5">
                            {prevSpeaker && (
                              <>
                                <span className={getSpeakerColorClass(prevSpeaker)}>
                                  {prevSpeaker}
                                </span>
                                <span aria-hidden="true">→</span>
                              </>
                            )}
                            <span className={getSpeakerColorClass(item.speaker)}>
                              {item.speaker}
                            </span>
                            <span>· Turn</span>
                          </span>
                          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                        </div>
                      )}
                      <div className="rounded-lg bg-white dark:bg-[#131A26] border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center gap-2 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              L{String(item.lineNumber || idx + 1).padStart(2, "0")}
                            </span>
                            {item.timestamp && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{item.timestamp}</span>
                              </>
                            )}
                            {item.speaker && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={`font-bold ${getSpeakerColorClass(
                                    item.speaker
                                  )}`}
                                >
                                  {item.speaker}
                                </span>
                              </>
                            )}
                            {item.detectedLanguage && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-sans text-sky-600 dark:text-sky-400 font-medium">
                                  {item.detectedLanguage}
                                </span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {item.hasChanges ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                ✅ Corrected
                              </span>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400">
                                ✅ Clean
                              </span>
                            )}
                            {pronunciationList.length > 0 && (
                              <span className="text-amber-600 dark:text-amber-400 font-medium">
                                · 🔈 {pronunciationList.length}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                onCopy(
                                  item.correctedLine,
                                  `Line ${item.lineNumber || idx + 1}`
                                )
                              }
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                              title="Copy corrected sentence"
                              aria-label={`Copy line ${item.lineNumber || idx + 1}`}
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {item.hasChanges ? (
                          <div className="space-y-1.5">
                            <div className="flex items-start gap-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300 bg-rose-50/60 dark:bg-rose-950/20 rounded-md px-2.5 py-1.5 border border-rose-200/70 dark:border-rose-900/50">
                              <span
                                className="shrink-0 select-none"
                                aria-label="Incorrect grammar"
                              >
                                ❌
                              </span>
                              <div className="min-w-0">
                                {lineDiff.map((seg, sIdx) => {
                                  if (seg.type === "ins") return null;
                                  if (seg.type === "del") {
                                    return (
                                      <span key={sIdx} className="diff-del">
                                        {seg.text}
                                      </span>
                                    );
                                  }
                                  return <span key={sIdx}>{seg.text}</span>;
                                })}
                              </div>
                            </div>

                            <div className="flex items-start gap-2 text-sm leading-relaxed text-slate-900 dark:text-slate-100 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-md px-2.5 py-1.5 border border-emerald-200/70 dark:border-emerald-900/50">
                              <span
                                className="shrink-0 select-none text-xs mt-0.5"
                                aria-label="Corrected grammar"
                              >
                                ✅
                              </span>
                              <div className="min-w-0">
                                {lineDiff.map((seg, sIdx) => {
                                  if (seg.type === "del") return null;
                                  if (seg.type === "ins") {
                                    return (
                                      <mark key={sIdx} className="diff-ins">
                                        {seg.text}
                                      </mark>
                                    );
                                  }
                                  return <span key={sIdx}>{seg.text}</span>;
                                })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="flex items-start gap-2 text-sm leading-relaxed text-slate-900 dark:text-slate-100">
                            <span
                              className="shrink-0 select-none text-xs mt-0.5"
                              aria-label="Correct grammar"
                            >
                              ✅
                            </span>
                            <span>{item.correctedLine}</span>
                          </p>
                        )}

                        {item.isTranslated && item.translatedLine && (
                          <div className="rounded-md bg-sky-50/70 dark:bg-sky-950/25 border border-sky-200/80 dark:border-sky-800/60 px-2.5 py-2 space-y-1">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-semibold text-sky-700 dark:text-sky-300">
                                🌐 {item.detectedLanguage || "Detected"} →{" "}
                                {targetLanguage}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onCopy(
                                    item.translatedLine || "",
                                    `Line ${item.lineNumber || idx + 1} translation`
                                  )
                                }
                                className="p-0.5 rounded text-sky-500 hover:text-sky-700 dark:hover:text-sky-200 transition-colors cursor-pointer"
                                title="Copy translated sentence"
                                aria-label={`Copy line ${item.lineNumber || idx + 1} translation`}
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="text-sm leading-relaxed text-slate-900 dark:text-slate-100">
                              {item.translatedLine}
                            </p>
                          </div>
                        )}

                        {pronunciationList.length > 0 && (
                          <div className="rounded-md bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-800/60 px-2.5 py-2 space-y-1 text-xs">
                            {pronunciationList.map((issue, pIdx) => (
                              <div
                                key={pIdx}
                                className="flex items-start gap-1.5 leading-relaxed"
                              >
                                <span
                                  className="shrink-0 select-none"
                                  aria-label="Incorrect pronunciation"
                                >
                                  🔈
                                </span>
                                <div className="min-w-0 text-slate-700 dark:text-slate-300">
                                  <span className="font-medium text-amber-800 dark:text-amber-300">
                                    &ldquo;{issue.spoken}&rdquo;
                                  </span>{" "}
                                  <span className="text-slate-400">→</span>{" "}
                                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                                    ✅ &ldquo;{issue.intended}&rdquo;
                                  </span>
                                  {issue.note && (
                                    <span className="text-slate-500 dark:text-slate-400">
                                      {" "}
                                      — {issue.note}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {item.reason && item.hasChanges && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                            {item.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : grammarViewMode === "translation" ? (
            <div className="flex-1 flex flex-col min-h-[260px] overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-100/40 dark:bg-[#101622] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <Languages className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span>
                    {detectedLanguagesList.length > 0
                      ? `Detected: ${detectedLanguagesList.join(", ")}`
                      : "Auto-detecting language"}
                    {targetLanguage !== "Original (Detect Only)"
                      ? ` → ${targetLanguage}`
                      : " (Translation paused)"}
                  </span>
                </div>
                {note.translatedText && (
                  <button
                    type="button"
                    onClick={() =>
                      onCopy(
                        note.translatedText || "",
                        `${targetLanguage} Translation`
                      )
                    }
                    className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium hover:underline cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy Translation</span>
                  </button>
                )}
              </div>
              {targetLanguage === "Original (Detect Only)" ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-xs text-slate-500 dark:text-slate-400">
                  Select a target language (e.g., Auto → English) above to translate detected languages automatically.
                </div>
              ) : note.translatedText ? (
                <textarea
                  value={note.translatedText}
                  onChange={(e) =>
                    onUpdateField("translatedText", e.target.value)
                  }
                  placeholder={`Accurate ${targetLanguage} translation will appear here...`}
                  className="flex-1 w-full p-4 bg-transparent resize-none outline-none text-sm leading-relaxed text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 min-h-[260px]"
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-1.5">
                  <Languages className="w-6 h-6 text-slate-400 dark:text-slate-600" />
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                    {note.transcript.trim()
                      ? `Detected speech is already in ${targetLanguage}. Switch the target language above to translate this session into another language.`
                      : `Speak or paste text in any language — languages are detected automatically and translated accurately into ${targetLanguage}.`}
                  </p>
                </div>
              )}
            </div>
          ) : grammarViewMode === "clean" ? (
            <textarea
              value={note.grammarCorrected}
              onChange={(e) =>
                onUpdateField("grammarCorrected", e.target.value)
              }
              placeholder="Automated grammar, punctuation, and fluency-corrected text (one sentence per line) will appear here..."
              className="flex-1 w-full p-4 bg-transparent resize-none outline-none text-sm leading-relaxed text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 min-h-[260px]"
            />
          ) : (
            <div className="flex-1 flex flex-col min-h-[260px] overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-100/40 dark:bg-[#101622] flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400">
                <span>❌ Incorrect grammar</span>
                <span aria-hidden="true">·</span>
                <span>✅ Corrected grammar</span>
                <span aria-hidden="true">·</span>
                <span>🔈 Incorrect pronunciation</span>
              </div>
              <div className="flex-1 w-full p-4 overflow-y-auto text-sm leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap space-y-4">
                {diffSegments.length === 0 ? (
                  <span className="text-slate-400 italic">
                    No text available to compare.
                  </span>
                ) : (
                  <div>
                    {diffSegments.map((seg, i) => {
                      if (seg.type === "del") {
                        return (
                          <span key={i} className="diff-del">
                            ❌ {seg.text}
                          </span>
                        );
                      }
                      if (seg.type === "ins") {
                        return (
                          <mark key={i} className="diff-ins">
                            ✅ {seg.text}
                          </mark>
                        );
                      }
                      return <span key={i}>{seg.text}</span>;
                    })}
                  </div>
                )}

                {allPronunciationIssues.length > 0 && (
                  <div className="rounded-lg bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-800/60 p-3 space-y-1.5 text-xs">
                    <div className="font-semibold text-amber-800 dark:text-amber-300">
                      🔈 Pronunciation Notes
                    </div>
                    {allPronunciationIssues.map((issue, idx) => (
                      <div
                        key={idx}
                        className="text-slate-700 dark:text-slate-300"
                      >
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mr-1.5">
                          L{String(issue.lineNumber).padStart(2, "0")}
                        </span>
                        🔈 &ldquo;{issue.spoken}&rdquo; → ✅ &ldquo;
                        {issue.intended}&rdquo;
                        {issue.note ? ` — ${issue.note}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-[#101622]">
            <button
              type="button"
              onClick={() => setFixesLogExpanded((prev) => !prev)}
              className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>
                  Grammar &amp; Pronunciation Fixes (
                  {note.grammarFixes.length + allPronunciationIssues.length})
                </span>
              </span>
              {fixesLogExpanded ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {fixesLogExpanded && (
              <div className="max-h-40 overflow-y-auto px-3.5 pb-3 space-y-2 text-xs">
                {note.grammarFixes.length === 0 &&
                allPronunciationIssues.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">
                    No grammar or pronunciation corrections logged yet.
                  </p>
                ) : (
                  <>
                    {note.grammarFixes.map((fix, idx) => (
                      <div
                        key={`g-${idx}`}
                        className="p-2.5 rounded-md bg-white dark:bg-[#131A26] border border-slate-200 dark:border-slate-800 space-y-1"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="diff-del">
                            {fix.kind === "pronunciation" ? "🔈" : "❌"}{" "}
                            {fix.original}
                          </span>
                          <span className="text-slate-400">→</span>
                          <mark className="diff-ins">✅ {fix.corrected}</mark>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                          {fix.reason}
                        </p>
                      </div>
                    ))}
                    {allPronunciationIssues.map((issue, idx) => (
                      <div
                        key={`p-${idx}`}
                        className="p-2.5 rounded-md bg-white dark:bg-[#131A26] border border-amber-200/80 dark:border-amber-800/60 space-y-1"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="text-amber-700 dark:text-amber-300 font-medium">
                            🔈 {issue.spoken}
                          </span>
                          <span className="text-slate-400">→</span>
                          <mark className="diff-ins">✅ {issue.intended}</mark>
                        </div>
                        {issue.note && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                            {issue.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* PANEL 3: SMART SUMMARY */}
        <div
          className={`${showSummary} flex-col rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0F17] overflow-hidden`}
        >
          <div className="px-3.5 py-2.5 bg-slate-100 dark:bg-[#151D2B] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-indigo-500 shrink-0" />
              <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                03. Smart Summary
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                onCopy(
                  buildFormattedSummaryText({
                    execSummary: note.execSummary,
                    keyTakeaways: note.keyTakeaways,
                    actionItems: note.actionItems,
                    keyTerms: note.keyTerms,
                  }),
                  "Smart Summary"
                )
              }
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Copy Smart Summary"
            >
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>Executive Summary</span>
              </h3>
              <textarea
                value={note.execSummary}
                onChange={(e) => onUpdateField("execSummary", e.target.value)}
                rows={4}
                placeholder="Concise overview of the captured audio or text..."
                className="w-full p-2.5 rounded-lg bg-white dark:bg-[#131A26] border border-slate-200 dark:border-slate-800 text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 outline-none focus:border-indigo-500 resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" />
                <span>Key Takeaways</span>
              </h3>
              <textarea
                value={note.keyTakeaways}
                onChange={(e) => onUpdateField("keyTakeaways", e.target.value)}
                rows={4}
                placeholder="• Bullet points of major insights..."
                className="w-full p-2.5 rounded-lg bg-white dark:bg-[#131A26] border border-slate-200 dark:border-slate-800 text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 outline-none focus:border-emerald-500 resize-y"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Action Items</span>
                </h3>
                <button
                  type="button"
                  onClick={handleAddActionItem}
                  className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Task</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {note.actionItems.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    Action items with interactive checkboxes will appear here.
                  </p>
                ) : (
                  note.actionItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 p-2 rounded-lg bg-white dark:bg-[#131A26] border border-slate-200 dark:border-slate-800 group"
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={(e) =>
                          handleToggleActionItem(idx, e.target.checked)
                        }
                        className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={item.text}
                        onChange={(e) =>
                          handleEditActionItem(idx, e.target.value)
                        }
                        className={`flex-1 bg-transparent border-none outline-none text-xs sm:text-[13px] ${
                          item.done
                            ? "line-through text-slate-400"
                            : "text-slate-800 dark:text-slate-200"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteActionItem(idx)}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-rose-500 p-0.5 transition-opacity cursor-pointer"
                        title="Remove task"
                        aria-label="Remove task"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Key Terms &amp; Definitions</span>
              </h3>
              <textarea
                value={note.keyTerms}
                onChange={(e) => onUpdateField("keyTerms", e.target.value)}
                rows={3}
                placeholder="Important vocabulary, tools, or concepts mentioned..."
                className="w-full p-2.5 rounded-lg bg-white dark:bg-[#131A26] border border-slate-200 dark:border-slate-800 text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 outline-none focus:border-sky-500 resize-y"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
