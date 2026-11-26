export type GrammarTone = "standard" | "professional";
export type LayoutMode = "split" | "tabs";
export type WorkspaceTab = "raw" | "grammar" | "summary";
export type GrammarViewMode = "lines" | "translation" | "clean" | "diff";
export type AppStatusMode = "idle" | "recording" | "paused" | "processing";
export type SurfaceType = "monitor" | "browser" | "window" | "unknown";
export type ToastKind = "success" | "warning" | "error" | "info";

export interface PronunciationIssue {
  spoken: string;
  intended: string;
  note: string;
}

export interface GrammarFix {
  original: string;
  corrected: string;
  reason: string;
  kind?: "grammar" | "pronunciation";
}

export interface SentenceCorrection {
  lineNumber: number;
  timestamp: string;
  speaker: string;
  rawLine: string;
  correctedLine: string;
  hasChanges: boolean;
  reason: string;
  pronunciationIssues?: PronunciationIssue[];
  detectedLanguage?: string;
  isTranslated?: boolean;
  translatedLine?: string;
}

export interface ActionItem {
  text: string;
  done: boolean;
}

export interface NoteSession {
  id: string;
  title: string;
  createdAt: string;
  duration: string;
  transcript: string;
  grammarCorrected: string;
  grammarFixes: GrammarFix[];
  sentenceCorrections: SentenceCorrection[];
  detectedLanguages?: string[];
  translatedText?: string;
  execSummary: string;
  keyTakeaways: string;
  actionItems: ActionItem[];
  keyTerms: string;
}

export interface StructuredAiResponse {
  suggestedTitle?: string;
  verbatimTranscript: string;
  grammarCorrectedText: string;
  grammarFixes?: GrammarFix[];
  sentenceCorrections: SentenceCorrection[];
  detectedLanguages?: string[];
  translatedText?: string;
  executiveSummary?: string;
  keyTakeaways?: string[];
  actionItems?: string[];
  keyTerms?: string[];
  silentAudio?: boolean;
}

export interface ToastMessage {
  id: string;
  message: string;
  kind: ToastKind;
}
