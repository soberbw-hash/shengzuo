export const downloadManagerStage = {
  implemented: true,
  phase: 2,
  features: [
    "pause",
    "resume-after-restart",
    "retry",
    "mirrors",
    "sha256",
    "self-check",
  ],
} as const;
