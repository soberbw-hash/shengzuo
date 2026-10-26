import { createHash } from "node:crypto";

import type { GeneratedAudioAssessment } from "./generatedAudioQuality";

export interface ContinuationCandidate {
  baselineKey: string;
  fingerprint: string;
  fileSha256: string;
  durationSeconds: number;
  speed?: number;
  assessment: GeneratedAudioAssessment;
}

// Reuse an early, clean, complete audio/text pair. Never recursively promote
// every generated chunk to a new prompt, or crop audio without its transcript.
export const selectContinuationAnchor = <T extends ContinuationCandidate>(
  candidates: readonly T[],
  baselineKey: string,
): T | undefined =>
  candidates.find(
    (candidate) =>
      candidate.baselineKey === baselineKey &&
      !candidate.assessment.critical &&
      candidate.assessment.issues.length === 0 &&
      Number.isFinite(candidate.durationSeconds) &&
      Number.isFinite(candidate.speed ?? 1) &&
      candidate.durationSeconds * (candidate.speed ?? 1) >= 2 &&
      candidate.durationSeconds * (candidate.speed ?? 1) <= 30,
  );

export const continuationFingerprint = (
  anchor: ContinuationCandidate,
): string =>
  createHash("sha256")
    .update(JSON.stringify([anchor.fingerprint, anchor.fileSha256]))
    .digest("hex");
