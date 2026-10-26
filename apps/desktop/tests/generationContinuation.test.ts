import assert from "node:assert/strict";
import test from "node:test";
import {
  continuationFingerprint,
  selectContinuationAnchor,
  type ContinuationCandidate,
} from "../src/main/generationContinuation";

const clean: ContinuationCandidate = {
  baselineKey: "same-speaker-and-style",
  fingerprint: "request",
  fileSha256: "a".repeat(64),
  durationSeconds: 10,
  assessment: { critical: false, issues: [], score: 0 },
};

void test("freezes the first clean anchor instead of recursively following later chunks", () => {
  const later = { ...clean, fingerprint: "later", fileSha256: "b".repeat(64) };
  assert.equal(
    selectContinuationAnchor([clean, later], clean.baselineKey),
    clean,
  );
});

void test("never uses warnings, another expression, short titles or overlong prompts as anchors", () => {
  const candidates = [
    { ...clean, assessment: { ...clean.assessment, issues: ["pitch-drift"] } },
    { ...clean, baselineKey: "different-speaker-or-expression" },
    { ...clean, durationSeconds: 1 },
    { ...clean, durationSeconds: 31 },
    { ...clean, durationSeconds: NaN },
  ];
  assert.equal(
    selectContinuationAnchor(candidates, clean.baselineKey),
    undefined,
  );
  assert.equal(
    selectContinuationAnchor([...candidates, clean], clean.baselineKey),
    clean,
  );
});

void test("a regenerated anchor invalidates dependent caches even with the same request and seed", () => {
  assert.notEqual(
    continuationFingerprint(clean),
    continuationFingerprint({ ...clean, fileSha256: "b".repeat(64) }),
  );
  assert.equal(
    continuationFingerprint(clean),
    continuationFingerprint({ ...clean }),
  );
});

void test("anchor duration is bounded at native model speed, not export playback speed", () => {
  assert.equal(
    selectContinuationAnchor(
      [{ ...clean, durationSeconds: 20, speed: 2 }],
      clean.baselineKey,
    ),
    undefined,
  );
  const slow = { ...clean, durationSeconds: 40, speed: 0.5 };
  assert.equal(selectContinuationAnchor([slow], clean.baselineKey), slow);
});
