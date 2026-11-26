import type { ActionItem } from "../types";

export interface DiffSegment {
  type: "eq" | "del" | "ins";
  text: string;
}

export function computeWordDiffSegments(
  originalText: string,
  correctedText: string
): DiffSegment[] {
  if (!originalText && !correctedText) return [];
  if (!originalText) return [{ type: "ins", text: correctedText }];
  if (!correctedText) return [{ type: "eq", text: originalText }];

  const origTokens = originalText.split(/(\s+)/);
  const corrTokens = correctedText.split(/(\s+)/);

  if (origTokens.length * corrTokens.length > 2_000_000) {
    return computeSentenceDiffSegments(originalText, correctedText);
  }

  const n = origTokens.length;
  const m = corrTokens.length;
  const dp: Int32Array[] = Array.from(
    { length: n + 1 },
    () => new Int32Array(m + 1)
  );

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (origTokens[i] === corrTokens[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (origTokens[i] === corrTokens[j]) {
      segments.push({ type: "eq", text: origTokens[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      const tok = origTokens[i];
      segments.push({
        type: /^\s+$/.test(tok) ? "eq" : "del",
        text: tok,
      });
      i++;
    } else {
      const tok = corrTokens[j];
      segments.push({
        type: /^\s+$/.test(tok) ? "eq" : "ins",
        text: tok,
      });
      j++;
    }
  }

  while (i < n) {
    const tok = origTokens[i++];
    segments.push({ type: /^\s+$/.test(tok) ? "eq" : "del", text: tok });
  }
  while (j < m) {
    const tok = corrTokens[j++];
    segments.push({ type: /^\s+$/.test(tok) ? "eq" : "ins", text: tok });
  }

  return coalesceDiffSegments(segments);
}

function coalesceDiffSegments(segments: DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = [];
  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx];
    const prev = merged[merged.length - 1];
    if (prev && prev.type === seg.type) {
      prev.text += seg.text;
      continue;
    }
    if (
      prev &&
      (prev.type === "del" || prev.type === "ins") &&
      seg.type === "eq" &&
      /^\s+$/.test(seg.text) &&
      segments[idx + 1]?.type === prev.type
    ) {
      prev.text += seg.text + segments[idx + 1].text;
      idx++;
      continue;
    }
    merged.push({ ...seg });
  }
  return merged;
}

function computeSentenceDiffSegments(
  originalText: string,
  correctedText: string
): DiffSegment[] {
  const origSents = originalText.split(/(?<=[.!?])\s+/);
  const corrSents = correctedText.split(/(?<=[.!?])\s+/);
  const maxLen = Math.max(origSents.length, corrSents.length);
  const segments: DiffSegment[] = [];

  for (let k = 0; k < maxLen; k++) {
    const o = origSents[k] || "";
    const c = corrSents[k] || "";
    if (k > 0) segments.push({ type: "eq", text: " " });
    if (o === c) {
      segments.push({ type: "eq", text: c });
    } else {
      if (o) segments.push({ type: "del", text: o });
      if (o && c) segments.push({ type: "eq", text: " " });
      if (c) segments.push({ type: "ins", text: c });
    }
  }

  return segments;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatLiveUtteranceWithPeriod(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  if (/[.!?…]$/.test(capitalized)) return capitalized;
  return `${capitalized}.`;
}

export function buildFormattedSummaryText(params: {
  execSummary: string;
  keyTakeaways: string;
  actionItems: ActionItem[];
  keyTerms: string;
}): string {
  const exec = params.execSummary.trim();
  const takeaways = params.keyTakeaways.trim();
  const actions = params.actionItems
    .map((a) => `- [${a.done ? "x" : " "}] ${a.text}`)
    .join("\n");
  const terms = params.keyTerms.trim();

  return [
    exec ? `### Executive Summary\n${exec}` : "",
    takeaways ? `### Key Takeaways\n${takeaways}` : "",
    actions ? `### Action Items\n${actions}` : "",
    terms ? `### Key Terms & Definitions\n${terms}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildFullExportContent(params: {
  title: string;
  dateLabel: string;
  duration: string;
  summaryText: string;
  grammarCorrected: string;
  rawTranscript: string;
  detectedLanguages?: string[];
  translatedText?: string;
}): string {
  const title = params.title.trim() || "Untitled System Audio Session";
  const langLine =
    params.detectedLanguages && params.detectedLanguages.length > 0
      ? ` | Languages: ${params.detectedLanguages.join(", ")}`
      : "";
  const translationBlock = params.translatedText?.trim()
    ? `
---

## Auto-Translation

${params.translatedText.trim()}
`
    : "";

  return `# ${title}
Date: ${params.dateLabel} | ${params.duration} duration${langLine}

---

## Smart Summary

${params.summaryText || "_No summary generated._"}
${translationBlock}
---

## Grammar-Corrected Text

${params.grammarCorrected.trim() || "_No grammar-corrected text available._"}

---

## Raw Verbatim Transcript

${params.rawTranscript.trim() || "_No transcript available._"}
`;
}
