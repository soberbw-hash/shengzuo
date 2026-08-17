import type {
  EngineStatus,
  GenerationRequest,
} from "@ai-voice-studio/shared-types";

const allowedTransitions: Record<EngineStatus, readonly EngineStatus[]> = {
  "not-installed": ["downloading"],
  downloading: ["download-paused", "download-failed", "installing"],
  "download-paused": ["downloading"],
  "download-failed": ["downloading"],
  installing: ["download-paused", "loading", "download-failed"],
  loading: ["ready", "generation-failed"],
  ready: ["generating", "loading"],
  generating: ["success", "generation-failed", "stopped"],
  success: ["generating", "ready"],
  "generation-failed": ["generating", "ready"],
  stopped: ["generating", "ready"],
};

export const canTransition = (from: EngineStatus, to: EngineStatus): boolean =>
  allowedTransitions[from].includes(to);

export const validateGenerationRequest = (
  request: GenerationRequest,
): string[] => {
  const errors: string[] = [];
  const trimmedText = request.text.trim();

  if (trimmedText.length === 0) errors.push("请输入需要配音的文字。");
  if (request.text.length > 20_000)
    errors.push("单次文本不能超过 20,000 个字符。");
  if (request.expression.length > 500)
    errors.push("表达要求不能超过 500 个字符。");
  if (request.speed < 0.5 || request.speed > 2)
    errors.push("语速需要在 0.5 到 2.0 之间。");
  if (request.volume < 0 || request.volume > 150)
    errors.push("音量需要在 0 到 150 之间。");

  return errors;
};
