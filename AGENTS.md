# CloneVoice — Agent Rules

## Scope and phase gates

- The repository root is the current workspace. Do not nest the project in the `shanghao` repository.
- The `soberbw-hash/shanghao` repository is read-only reference material.
- Authorized scope includes Phase 2 local model integration.
- Allow installing Python/FFmpeg, downloading official model weights, starting a loopback-only local worker, and integrating real voice cloning and speech generation.
- Do not add accounts, memberships, payments, analytics, or telemetry.

## Architecture invariants

- Electron main owns windows, filesystem access, export, downloads, process management, updates, hardware detection, and diagnostics.
- Renderer code must use the typed preload API. It may not import Node APIs or access model files.
- Keep `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Model engines are isolated plugins with separate runtime, worker, license, checksum, and weight storage.
- A future worker may only bind to loopback and must require a short-lived one-time token.
- Load at most one large model by default.

## Product and design rules

- Product copy is plain Chinese for non-technical creators.
- Preserve the light blue/mint liquid-glass system, shared tokens, generous spacing, and short restrained motion.
- Never copy ShangHao business copy, office scenes, animal characters, brand name, logo, or chat/voice-channel concepts.
- Support `prefers-reduced-motion`.
- Reuse components and tokens; do not create page-specific copies of primitives.
- At 1280×720 the primary workflow must remain usable without horizontal page scrolling.

## Code quality and safety

- TypeScript strict mode is mandatory. Do not use `any` as an escape hatch.
- Keep files focused; split components before they become difficult to review.
- User-visible failures are natural Chinese; technical details go only to privacy-safe logs.
- Never log full scripts, raw voice files, secrets, access tokens, or private paths unnecessarily.
- Do not delete or weaken tests to make a build pass.
- Use atomic writes for future project/model metadata and verify SHA-256 before installation.

## Required checks

Before reporting completion, run:

1. `pnpm format:check`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm build`
6. `pnpm package:win`
7. `pnpm visual:capture`

Update `docs/progress.md` whenever an A–Z deliverable changes status.
