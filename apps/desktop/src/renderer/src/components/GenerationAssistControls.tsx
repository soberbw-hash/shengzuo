import { BookOpenText, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  GENERATION_PRESETS,
  getModelGenerationCapabilities,
  type GenerationPresetId,
  type Language,
  type ModelId,
  type PronunciationRule,
} from "@ai-voice-studio/shared-types";
import { Button, Modal, SelectField, TextField } from "@ai-voice-studio/ui";

const createRule = (): PronunciationRule => ({
  id: crypto.randomUUID(),
  source: "",
  replacement: "",
  enabled: true,
});

export const GenerationAssistControls = ({
  presetId,
  rules,
  onPresetChange,
  onRulesChange,
  modelId,
  language,
}: {
  presetId: GenerationPresetId;
  rules: PronunciationRule[];
  onPresetChange: (presetId: GenerationPresetId) => void;
  onRulesChange: (rules: PronunciationRule[]) => void;
  modelId: ModelId;
  language: Language;
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PronunciationRule[]>(rules);
  const activeCount = rules.filter((rule) => rule.enabled).length;
  const capabilities = getModelGenerationCapabilities(modelId, language);
  const availablePresets = GENERATION_PRESETS.filter((item) =>
    capabilities.presets.includes(item.id),
  );
  const preset = availablePresets.find((item) => item.id === presetId);
  const canSave = useMemo(() => {
    const active = draft.filter((rule) => rule.enabled);
    return (
      active.every((rule) => rule.source.trim() && rule.replacement.trim()) &&
      new Set(active.map((rule) => rule.source.trim())).size === active.length
    );
  }, [draft]);

  useEffect(() => {
    if (!open) setDraft(rules);
  }, [open, rules]);

  useEffect(() => {
    if (!capabilities.presets.includes(presetId)) {
      onPresetChange("natural");
    }
  }, [capabilities.presets, onPresetChange, presetId]);

  const close = () => {
    setDraft(rules);
    setOpen(false);
  };

  return (
    <div className="generation-assist-controls">
      <div>
        <SelectField
          label="生成方式"
          value={presetId}
          onChange={(event) =>
            onPresetChange(event.target.value as GenerationPresetId)
          }
        >
          {availablePresets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </SelectField>
        <small>{preset?.description}</small>
      </div>
      <div className="pronunciation-entry">
        <span>专有名词、英文缩写读不准时使用</span>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <BookOpenText className="h-3.5 w-3.5" />
          发音词典{activeCount ? ` ${activeCount}` : ""}
        </Button>
      </div>

      <Modal
        open={open}
        size="lg"
        title="发音词典"
        description="只在生成时替换读音，项目里的文字不会改变。"
        onClose={close}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              取消
            </Button>
            <Button
              disabled={!canSave}
              onClick={() => {
                onRulesChange(
                  draft
                    .filter(
                      (rule) => rule.source.trim() && rule.replacement.trim(),
                    )
                    .map((rule) => ({
                      ...rule,
                      source: rule.source.trim(),
                      replacement: rule.replacement.trim(),
                    })),
                );
                setOpen(false);
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <div className="pronunciation-rules">
          {draft.length ? (
            draft.map((rule, index) => (
              <div className="pronunciation-rule" key={rule.id}>
                <label className="pronunciation-rule__enabled">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    aria-label={`启用第 ${index + 1} 条发音规则`}
                    onChange={(event) =>
                      setDraft((current) =>
                        current.map((item) =>
                          item.id === rule.id
                            ? { ...item, enabled: event.target.checked }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <TextField
                  label="原文"
                  value={rule.source}
                  maxLength={80}
                  placeholder="例如：AI"
                  onChange={(event) =>
                    setDraft((current) =>
                      current.map((item) =>
                        item.id === rule.id
                          ? { ...item, source: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <span className="pronunciation-rule__arrow">读作</span>
                <TextField
                  label="读音"
                  value={rule.replacement}
                  maxLength={160}
                  placeholder="例如：A I"
                  onChange={(event) =>
                    setDraft((current) =>
                      current.map((item) =>
                        item.id === rule.id
                          ? { ...item, replacement: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={`删除第 ${index + 1} 条发音规则`}
                  className="pronunciation-rule__remove"
                  onClick={() =>
                    setDraft((current) =>
                      current.filter((item) => item.id !== rule.id),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          ) : (
            <div className="pronunciation-rules__empty">
              暂时没有规则。适合纠正人名、品牌名和英文缩写。
            </div>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={draft.length >= 50}
            onClick={() => setDraft((current) => [...current, createRule()])}
          >
            <Plus className="h-3.5 w-3.5" />
            添加读音
          </Button>
          {!canSave ? (
            <p className="pronunciation-rules__error">
              启用的规则需要填写完整，原文不能重复。
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
};
