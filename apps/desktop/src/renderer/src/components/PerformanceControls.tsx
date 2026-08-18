import { useEffect, useState } from "react";

import {
  EMOTION_OPTIONS,
  getModelGenerationCapabilities,
  type Emotion,
  type Language,
  type ModelId,
} from "@ai-voice-studio/shared-types";
import { SelectField, TextField } from "@ai-voice-studio/ui";

const EXPRESSION_PRESETS = [
  { label: "自然清晰", value: "自然、清晰" },
  { label: "轻松亲切", value: "轻松亲切，像日常说话" },
  { label: "沉稳专业", value: "沉稳专业，重点清楚" },
  { label: "温暖柔和", value: "温暖柔和，语气亲切" },
  { label: "活泼有感染力", value: "活泼有感染力，节奏明快" },
  { label: "舒缓克制", value: "舒缓克制，停顿自然" },
] as const;

const DEFAULT_EXPRESSION = EXPRESSION_PRESETS[0].value;
const CUSTOM_EXPRESSION = "__custom__";

const findPresetValue = (expression: string): string | undefined => {
  const normalized = expression.trim();
  if (normalized === "自然") return DEFAULT_EXPRESSION;
  return EXPRESSION_PRESETS.find((item) => item.value === normalized)?.value;
};

export const PerformanceControls = ({
  emotion,
  expression,
  onEmotionChange,
  onExpressionChange,
  compact = false,
  modelId,
  language,
}: {
  emotion: Emotion;
  expression: string;
  onEmotionChange: (emotion: Emotion) => void;
  onExpressionChange: (expression: string) => void;
  compact?: boolean;
  modelId: ModelId;
  language: Language;
}) => {
  const capabilities = getModelGenerationCapabilities(modelId, language);
  const [expressionSelection, setExpressionSelection] = useState(
    () =>
      findPresetValue(expression) ??
      (expression.trim() ? CUSTOM_EXPRESSION : DEFAULT_EXPRESSION),
  );
  const customExpression = !["", "自然", "自然、清晰"].includes(
    expression.trim(),
  );

  useEffect(() => {
    const preset = findPresetValue(expression);
    if (preset) {
      setExpressionSelection(preset);
    } else if (expression.trim()) {
      setExpressionSelection(CUSTOM_EXPRESSION);
    }
  }, [expression]);

  useEffect(() => {
    if (
      capabilities.expression &&
      !expression.trim() &&
      expressionSelection !== CUSTOM_EXPRESSION
    ) {
      onExpressionChange(DEFAULT_EXPRESSION);
    }
  }, [
    capabilities.expression,
    expression,
    expressionSelection,
    onExpressionChange,
  ]);

  if (!capabilities.emotion && !capabilities.expression) return null;
  return (
    <div
      className={
        compact
          ? "performance-controls performance-controls--compact"
          : "performance-controls"
      }
      data-columns={capabilities.emotion && capabilities.expression ? "2" : "1"}
    >
      {capabilities.emotion ? (
        <SelectField
          label="情绪"
          hint={customExpression ? "由表达要求控制" : undefined}
          value={emotion}
          disabled={customExpression}
          onChange={(event) => onEmotionChange(event.target.value as Emotion)}
        >
          {EMOTION_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectField>
      ) : null}
      {capabilities.expression ? (
        <div
          className="expression-control"
          data-custom={expressionSelection === CUSTOM_EXPRESSION}
        >
          <SelectField
            label="表达要求"
            value={expressionSelection}
            onChange={(event) => {
              const value = event.target.value;
              setExpressionSelection(value);
              onExpressionChange(value === CUSTOM_EXPRESSION ? "" : value);
            }}
          >
            {EXPRESSION_PRESETS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
            <option value={CUSTOM_EXPRESSION}>自定义…</option>
          </SelectField>
          {expressionSelection === CUSTOM_EXPRESSION ? (
            <TextField
              label="自定义表达"
              value={expression}
              maxLength={200}
              autoFocus
              placeholder="例如：像朋友聊天"
              onChange={(event) => onExpressionChange(event.target.value)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
