import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const TRANSCRIBE_MODEL = "gemini-3.5-transcribe";
const TEXT_MODEL = "gemini-4-hydrogen";

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Add it in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let delay = 800;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes("429") ||
        msg.includes("500") ||
        msg.includes("503") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("UNAVAILABLE");
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("Exhausted retry attempts.");
}

function getToneInstruction(tone: string): string {
  if (tone === "professional") {
    return "Apply 'Automatic Grammar Polish': automatically polish all grammar, verb tenses, subject-verb agreement, articles, prepositions, spelling, filler words (um, uh, like), and run-on clauses into crisp, fluent, publication-ready prose while preserving exact meaning and speaker voice. Convert spoken pauses into proper commas, em-dashes, and sentence-ending periods.";
  }
  return "Apply 'Standard Clean-Up': fix grammar, spelling, capitalization, commas for pauses, and automated periods while keeping natural conversational phrasing.";
}

function getTranslationInstruction(targetLanguage: string): string {
  const cleanTarget = (targetLanguage || "English").trim() || "English";
  if (cleanTarget === "Original (Detect Only)") {
    return `Language Detection Only: Detect all spoken/written languages accurately in "detectedLanguages" and per-line "detectedLanguage". Do NOT translate: set "isTranslated": false, "translatedLine": "", and "translatedText": "" for all entries, and write summaries/titles in the primary detected language.`;
  }
  return `Auto-Language Detection & Most Accurate Translation (Target Language: "${cleanTarget}"):
- Accurately detect the language(s) of the input in "detectedLanguages" (e.g. ["Spanish"] or ["Japanese", "English"]) and for each line in "detectedLanguage" (e.g. "Spanish").
- Keep "verbatimTranscript", "grammarCorrectedText", "rawLine", and "correctedLine" in each line's ORIGINAL spoken/written language (polishing grammar and punctuation in that original language).
- For EVERY line whose detected language differs from "${cleanTarget}" (or includes non-${cleanTarget} phrases/code-switching), set "isTranslated": true and write the MOST ACCURATE, natural, context-aware, idiom-faithful, grammatically polished translation into "${cleanTarget}" in "translatedLine" (without speaker/timestamp prefix, ending with proper punctuation).
- For lines already 100% in "${cleanTarget}", set "isTranslated": false and "translatedLine": "".
- For "translatedText": If any part of the transcript is not in "${cleanTarget}", provide the complete, seamless conversation translated into "${cleanTarget}" with speaker labels ("P1: ...", blank line between speaker turns), integrating any lines already in "${cleanTarget}" cleanly so the full conversation reads naturally. If the entire transcript is already in "${cleanTarget}", set "translatedText": "".
- Write "executiveSummary", "keyTakeaways", "actionItems", "keyTerms", and "suggestedTitle" in "${cleanTarget}".`;
}

const sentenceCorrectionItemSchema = {
  type: Type.OBJECT,
  properties: {
    lineNumber: { type: Type.INTEGER },
    timestamp: { type: Type.STRING },
    speaker: { type: Type.STRING },
    detectedLanguage: { type: Type.STRING },
    rawLine: { type: Type.STRING },
    correctedLine: { type: Type.STRING },
    isTranslated: { type: Type.BOOLEAN },
    translatedLine: { type: Type.STRING },
    hasChanges: { type: Type.BOOLEAN },
    reason: { type: Type.STRING },
    pronunciationIssues: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          spoken: { type: Type.STRING },
          intended: { type: Type.STRING },
          note: { type: Type.STRING },
        },
        required: ["spoken", "intended", "note"],
      },
    },
  },
  required: [
    "lineNumber",
    "timestamp",
    "speaker",
    "detectedLanguage",
    "rawLine",
    "correctedLine",
    "isTranslated",
    "translatedLine",
    "hasChanges",
    "reason",
    "pronunciationIssues",
  ],
};

const liveNoteSchema = {
  type: Type.OBJECT,
  properties: {
    detectedLanguages: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    verbatimTranscript: { type: Type.STRING },
    grammarCorrectedText: { type: Type.STRING },
    translatedText: { type: Type.STRING },
    sentenceCorrections: {
      type: Type.ARRAY,
      items: sentenceCorrectionItemSchema,
    },
  },
  required: [
    "detectedLanguages",
    "verbatimTranscript",
    "grammarCorrectedText",
    "translatedText",
    "sentenceCorrections",
  ],
};

const structuredNoteSchema = {
  type: Type.OBJECT,
  properties: {
    suggestedTitle: { type: Type.STRING },
    detectedLanguages: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    verbatimTranscript: { type: Type.STRING },
    grammarCorrectedText: { type: Type.STRING },
    translatedText: { type: Type.STRING },
    sentenceCorrections: {
      type: Type.ARRAY,
      items: sentenceCorrectionItemSchema,
    },
    grammarFixes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          original: { type: Type.STRING },
          corrected: { type: Type.STRING },
          reason: { type: Type.STRING },
          kind: { type: Type.STRING },
        },
        required: ["original", "corrected", "reason", "kind"],
      },
    },
    executiveSummary: { type: Type.STRING },
    keyTakeaways: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    actionItems: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    keyTerms: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "suggestedTitle",
    "detectedLanguages",
    "verbatimTranscript",
    "grammarCorrectedText",
    "translatedText",
    "sentenceCorrections",
    "grammarFixes",
    "executiveSummary",
    "keyTakeaways",
    "actionItems",
    "keyTerms",
  ],
};

function formatApiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("GEMINI_API_KEY is not configured")) {
    return { status: 500, message: raw };
  }
  if (
    raw.includes("403") ||
    raw.includes("PERMISSION_DENIED") ||
    raw.includes("API_KEY_INVALID")
  ) {
    return {
      status: 403,
      message:
        "API key permission error. Please verify GEMINI_API_KEY in Settings > Secrets.",
    };
  }
  if (raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED")) {
    return {
      status: 429,
      message:
        "Rate limit or quota reached. Please wait a moment and try again.",
    };
  }
  return { status: 500, message: raw || "Unexpected server error." };
}

async function analyzeLiveTranscriptText(
  ai: GoogleGenAI,
  rawText: string,
  tone: string,
  targetLanguage = "English"
) {
  const toneInstruction = getToneInstruction(tone);
  const translationInstruction = getTranslationInstruction(targetLanguage);
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: `Observe the conversation between speakers (P1, P2, P3, ...), automatically detect language(s), polish grammar, apply automatic sentence periods, commas, and pause punctuation line by line, and translate non-target languages accurately:

${translationInstruction}

Formatting & Line Rules:
1. "detectedLanguages": Ordered array of unique detected language names (e.g. ["Spanish"] or ["Japanese", "English"]).
2. "verbatimTranscript": Format one spoken sentence/utterance per line ("\\n" separated) in the ORIGINAL spoken language(s), keeping [MM:SS] timestamps and speaker labels (P1:, P2:, P3:, ...). Keep spoken "[pause]" markers if present in verbatim text, and remove any "(pronunciation: ...)" helper tags. Insert a blank line ("\\n\\n") whenever the speaker changes so conversation turns are clearly separated.
3. "grammarCorrectedText": Matching automatically grammar-polished and punctuated sentences in their ORIGINAL language(s), one per line, prefixed with the speaker label (e.g. "P1: ..."), with a blank line whenever the speaker changes. ${toneInstruction} Ensure EVERY sentence starts with a capital letter, places commas accurately at pauses/clauses/introductory phrases, converts "[pause]" markers into natural commas, em-dashes, or new sentences, and ends with proper sentence-ending punctuation (".", "?", "!", or native equivalent like "。").
4. "translatedText": Full speaker-labeled translation into "${targetLanguage}" if any line needed translation, otherwise "".
5. "sentenceCorrections": Ordered array for EVERY spoken line (never merge different speakers onto one line):
   - "lineNumber", "timestamp", "speaker" ("P1", "P2", etc. — preserve conversational back-and-forth turns accurately)
   - "detectedLanguage": Exact language name for this line (e.g. "English", "Spanish", "Japanese", "Tagalog")
   - "rawLine": Verbatim spoken sentence WITHOUT timestamp/speaker prefix or "(pronunciation: ...)" tags
   - "correctedLine": Automatically polished grammar & punctuated sentence in the original language WITHOUT timestamp/speaker prefix or "[pause]" tags
   - "isTranslated": boolean (true if translated into "${targetLanguage}", false if already in "${targetLanguage}" or translation disabled)
   - "translatedLine": Most accurate translation of this line into "${targetLanguage}" if "isTranslated" is true, otherwise ""
   - "hasChanges": true if correctedLine differs from rawLine (including grammar polish, added commas, pauses converted to punctuation, or added periods)
   - "reason": Short note on grammar polish & punctuation applied (e.g. "Polished verb tense, added comma after pause, and added period", or "Grammatically clean")
   - "pronunciationIssues": Array of any mispronounced or phonetically off words in that line (from "(pronunciation: ...)" tags or obvious phonetic errors like "expresso", "pacifically", "libary", "aksed"), each with "spoken", "intended", and "note" (empty array [] if none).

Input:
${rawText}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: liveNoteSchema,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const jsonStr = (response.text ?? "{}").trim();
  return JSON.parse(jsonStr);
}

async function analyzeTranscriptText(
  ai: GoogleGenAI,
  rawText: string,
  tone: string,
  targetLanguage = "English",
  maxRetries = 3
) {
  const toneInstruction = getToneInstruction(tone);
  const translationInstruction = getTranslationInstruction(targetLanguage);
  const response = await callWithRetry(
    () =>
      ai.models.generateContent({
        model: TEXT_MODEL,
        contents: `Observe the conversation between speakers, automatically detect languages, accurately translate any non-target languages, polish grammar, insert automated periods, commas, and pause punctuation, and break the transcript down sentence by sentence and line by line. Return a structured JSON response:

${translationInstruction}

Detailed Field Rules:
1. "detectedLanguages": Ordered array of unique detected language names in the transcript (e.g. ["English"], ["Korean", "English"]).
2. "verbatimTranscript": Format the input verbatim text cleanly in the ORIGINAL spoken/written language(s) with ONE sentence or utterance per line ("\\n" separated), keeping timestamps (e.g. [00:12]) and speaker labels (P1:, P2:, P3:, ...). Strip any "(pronunciation: ...)" helper tags out of verbatimTranscript while keeping "[pause]" pause cues if present. Insert a blank line ("\\n\\n") whenever the speaker changes so each speaker's part in the conversation is clearly separated. If speaker labels are missing, infer conversational turns and assign P1, P2, P3, etc.
3. "grammarCorrectedText": Format the automatically grammar-polished and punctuated text in its ORIGINAL language(s) with ONE matching sentence per line, prefixed with the speaker label (e.g. "P1: ..."), and insert a blank line whenever the speaker changes. ${toneInstruction} Split run-on unpunctuated speech into clear sentences, capitalize sentence starts, insert commas at natural clauses and spoken pauses, convert "[pause]" cues into proper commas/em-dashes/sentence breaks, and end every sentence with proper punctuation (".", "?", "!", or native equivalent).
4. "translatedText": Complete, context-accurate translation into "${targetLanguage}" with speaker labels ("P1: ...", blank line between speaker turns) whenever any part is in a language other than "${targetLanguage}", otherwise "".
5. "sentenceCorrections": An ordered array covering EVERY sentence/line from start to finish (never merge two different speakers into one entry). For each entry:
   - "lineNumber": 1-based sequential line number (1, 2, 3...)
   - "timestamp": Timestamp string like "00:12" if present, otherwise ""
   - "speaker": Speaker label like "P1", "P2", "P3" (observing speaker transitions and replies in the conversation)
   - "detectedLanguage": Detected language name for this line (e.g. "Spanish", "English", "French", "Japanese")
   - "rawLine": The verbatim spoken sentence/line (WITHOUT timestamp, speaker prefix, or "(pronunciation: ...)" tags)
   - "correctedLine": The automatically polished grammar-, comma-, pause-, and period-corrected sentence/line in its original language (WITHOUT timestamp, speaker prefix, or "[pause]" tags)
   - "isTranslated": boolean (true if translated into "${targetLanguage}", false if already in "${targetLanguage}" or translation is disabled)
   - "translatedLine": Most accurate, natural, idiom-aware translation of the line into "${targetLanguage}" if "isTranslated" is true, otherwise ""
   - "hasChanges": true if correctedLine differs from rawLine (including grammar polish, commas, pause punctuation, or periods), false if rawLine was already clean and properly punctuated
   - "reason": Brief explanation of the grammar polish & punctuation applied (e.g., "Polished phrasing, added comma at pause, and ended with period"), or "Grammatically clean" if hasChanges is false
   - "pronunciationIssues": Array of any mispronounced, slurred, or phonetically substituted words on that line (either flagged by "(pronunciation: ...)" tags from audio or clear phonetic errors like "pacifically" -> "specifically", "expresso" -> "espresso", "aksed" -> "asked", "libary" -> "library"). Each item has "spoken", "intended", and "note" (e.g., "Pronounced /eks-pres-oh/ instead of /es-pres-oh/"). Empty array [] if none.
6. "grammarFixes": Up to 15 notable phrase-level fixes, each with "original", "corrected", "reason", and "kind" ("grammar" or "pronunciation").
7. "executiveSummary": A concise 2-4 sentence summary (in "${targetLanguage}", or dominant source language if translation is disabled).
8. "keyTakeaways": Bullet list of the main points and insights (in "${targetLanguage}", or dominant source language if translation is disabled).
9. "actionItems": Specific tasks or action items mentioned (empty array if none).
10. "keyTerms": Key vocabulary, concepts, or terms with brief definitions.
11. "suggestedTitle": A concise 4-to-7 word descriptive title.

Input Text:
${rawText}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: structuredNoteSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
    maxRetries
  );

  const jsonStr = (response.text ?? "{}").trim();
  return JSON.parse(jsonStr);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "35mb" }));

  app.post("/api/process-audio", async (req: Request, res: Response) => {
    try {
      const {
        audioBase64,
        mimeType,
        tone = "standard",
        targetLanguage = "English",
        isLivePreview = false,
      } = req.body ?? {};

      if (!audioBase64 || typeof audioBase64 !== "string") {
        res.status(400).json({ error: "Missing base64 audio payload." });
        return;
      }

      const cleanMime =
        typeof mimeType === "string" && mimeType.trim()
          ? mimeType.split(";")[0].trim()
          : "audio/webm";

      const ai = getAiClient();
      const retries = isLivePreview ? 0 : 3;

      const transcribeResponse = await callWithRetry(
        () =>
          ai.models.generateContent({
            model: TRANSCRIBE_MODEL,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMime,
                    data: audioBase64,
                  },
                },
                {
                  text: "Transcribe this audio verbatim in the exact original language(s) spoken (the speakers may speak any language or switch between multiple languages — NEVER translate during transcription). Note that voices may come from headset/headphone playback (remote call participants, videos, lectures) and/or a local headset microphone. Carefully observe the conversation between speakers—listen for voice shifts, turn-taking, question-and-answer replies, and pauses—and assign consistent speaker labels: P1 for the first speaker, P2 for the second speaker, P3 for the third speaker, and so on (use P1 if only one person speaks). Automatically transcribe natural commas at short pauses, periods (or ? / ! / native sentence endings) at completed sentences, and mark noticeable >1s silent pauses as '[pause]'. Format one sentence per line as '[MM:SS] P1: <verbatim sentence>', and insert a blank line whenever the speaker changes. If a speaker noticeably mispronounces a word, write the word as spoken followed immediately by '(pronunciation: \"<spoken>\" -> \"<intended>\")'. If there is no intelligible speech, return an empty string.",
                },
              ],
            },
          }),
        retries
      );

      const transcript = (transcribeResponse.text ?? "").trim();

      if (!transcript) {
        res.json({
          detectedLanguages: [],
          verbatimTranscript: "",
          grammarCorrectedText: "",
          translatedText: "",
          sentenceCorrections: [],
          silentAudio: true,
        });
        return;
      }

      let parsed: Record<string, unknown>;
      if (isLivePreview) {
        try {
          parsed = await analyzeLiveTranscriptText(
            ai,
            transcript,
            tone,
            targetLanguage
          );
        } catch {
          const fallbackLines = transcript
            .split(/\n+/)
            .map((l) => l.trim())
            .filter(Boolean)
            .map((line, idx) => {
              const tsMatch = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/);
              const timestamp = tsMatch ? tsMatch[1] : "";
              const rest = tsMatch ? tsMatch[2] : line;
              const spkMatch = rest.match(/^(P\d+):\s*(.*)$/);
              const speaker = spkMatch ? spkMatch[1] : "P1";
              const text = (spkMatch ? spkMatch[2] : rest).trim();
              return {
                lineNumber: idx + 1,
                timestamp,
                speaker,
                detectedLanguage: "",
                rawLine: text,
                correctedLine: text,
                isTranslated: false,
                translatedLine: "",
                hasChanges: false,
                reason: "Live transcript",
                pronunciationIssues: [],
              };
            });
          parsed = {
            detectedLanguages: [],
            verbatimTranscript: transcript,
            grammarCorrectedText: transcript,
            translatedText: "",
            sentenceCorrections: fallbackLines,
          };
        }
      } else {
        parsed = await analyzeTranscriptText(
          ai,
          transcript,
          tone,
          targetLanguage,
          retries
        );
      }
      parsed.verbatimTranscript = parsed.verbatimTranscript || transcript;
      res.json(parsed);
    } catch (err: unknown) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  app.post("/api/process-text", async (req: Request, res: Response) => {
    try {
      const { text, tone = "standard", targetLanguage = "English" } =
        req.body ?? {};
      if (!text || typeof text !== "string" || !text.trim()) {
        res.status(400).json({ error: "Please provide text to process." });
        return;
      }

      const ai = getAiClient();
      const parsed = await analyzeTranscriptText(
        ai,
        text.trim(),
        tone,
        targetLanguage,
        3
      );
      res.json(parsed);
    } catch (err: unknown) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Application build not found.");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`System Audio Note Taker server listening on port ${PORT}`);
  });
}

startServer();
