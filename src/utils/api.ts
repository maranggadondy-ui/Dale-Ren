import type { GrammarTone, StructuredAiResponse } from "../types";

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const parts = result.split(",");
      resolve(parts[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Failed to read audio stream."));
    reader.readAsDataURL(blob);
  });
}

export async function processAudioOnServer(params: {
  audioBlob: Blob;
  tone: GrammarTone;
  targetLanguage?: string;
  isLivePreview: boolean;
  signal?: AbortSignal;
}): Promise<StructuredAiResponse> {
  const audioBase64 = await blobToBase64(params.audioBlob);
  const response = await fetch("/api/process-audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: params.signal,
    body: JSON.stringify({
      audioBase64,
      mimeType: params.audioBlob.type || "audio/webm",
      tone: params.tone,
      targetLanguage: params.targetLanguage ?? "English",
      isLivePreview: params.isLivePreview,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Server error (${response.status})`);
  }
  return data as StructuredAiResponse;
}

export async function processTextOnServer(params: {
  text: string;
  tone: GrammarTone;
  targetLanguage?: string;
}): Promise<StructuredAiResponse> {
  const response = await fetch("/api/process-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: params.text,
      tone: params.tone,
      targetLanguage: params.targetLanguage ?? "English",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Server error (${response.status})`);
  }
  return data as StructuredAiResponse;
}
