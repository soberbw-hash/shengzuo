import { BookOpenText, CircleHelp, Plus, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import {
  GENERATION_PRESETS,
  getModelGenerationCapabilities,
  type GenerationPresetId,
  type Language,
  type ModelId,
  type PronunciationRule,
} from "@ai-voice-studio/shared-types";
import { Button, Modal, SelectField, TextField } from "@ai-voice-studio/ui";

const createRule = (
  action: NonNullable<PronunciationRule["action"]> = "replace",
): PronunciationRule => ({
  id: crypto.randomUUID(),
  source: "",
  replacement: "",
  enabled: true,
  action,
});

const ruleAction = (
  rule: PronunciationRule,
): NonNullable<PronunciationRule["action"]> => rule.action ?? "replace";

const isCompleteRule = (rule: PronunciationRule): boolean =>
  Boolean(
    rule.source.trim() &&
      (ruleAction(rule) === "skip" || rule.replacement.trim()),
  );

interface GenerationHelpPosition {
  arrowLeft: number;
  left: number;
  placement: "top" | "bottom";
  top: number;
  width: number;
}

interface GenerationHelpStyle extends CSSProperties {
  "--generation-help-arrow-left": string;
}

const GenerationModeHelp = () => {
  const tooltipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<GenerationHelpPosition | null>(null);
  const visible = focused || hovered || pinned;

  const updatePosition = useCallback(() => {
    const trigger = rootRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const edge = 12;
    const gap = 9;
    const width = Math.min(320, window.innerWidth - edge * 2);
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 148;
    const spaceAbove = rect.top - edge - gap;
    const spaceBelow = window.innerHeight - rect.bottom - edge - gap;
    const placement =
      spaceBelow >= tooltipHeight || spaceBelow >= spaceAbove
        ? "bottom"
        : "top";
    const naturalTop =
      placement === "bottom"
        ? rect.bottom + gap
        : rect.top - tooltipHeight - gap;
    const top = Math.min(
      Math.max(naturalTop, edge),
      window.innerHeight - tooltipHeight - edge,
    );
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, edge),
      window.innerWidth - width - edge,
    );
    const arrowLeft = Math.min(
      Math.max(rect.left + rect.width / 2 - left, 16),
      width - 16,
    );

    setPosition({ arrowLeft, left, placement, top, width });
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    updatePosition();
  }, [updatePosition, visible]);

  useEffect(() => {
    if (!visible) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !tooltipRef.current?.contains(target)
      ) {
        setPinned(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPinned(false);
      setHovered(false);
      rootRef.current?.blur();
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition, visible]);

  const tooltipStyle = position
    ? ({
        "--generation-help-arrow-left": `${position.arrowLeft}px`,
        left: position.left,
        top: position.top,
        width: position.width,
      } satisfies GenerationHelpStyle)
    : undefined;

  return (
    <span
      ref={rootRef}
      className="generation-mode-help"
      role="button"
      tabIndex={0}
      aria-label="查看生成策略说明"
      aria-describedby={tooltipId}
      aria-expanded={visible}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus();
        setPinned((current) => !current);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setPinned((current) => !current);
        }
      }}
    >
      <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
      {visible
        ? createPortal(
            <span
              ref={tooltipRef}
              className="generation-mode-help__tooltip"
              id={tooltipId}
              role="tooltip"
              data-placement={position?.placement ?? "bottom"}
              style={tooltipStyle}
            >
              <strong>两种策略只能选一种</strong>
              <span>
                <b>自然口播</b>：分段更完整、生成更快，适合短内容。
              </span>
              <span>
                <b>稳健长稿</b>
                ：分段更短，会逐段检查和重试，适合长内容。
              </span>
              <small>这里只控制生成稳定性；情绪在下方单独设置。</small>
            </span>,
            document.body,
          )
        : null}
    </span>
  );
};

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
  const preset = GENERATION_PRESETS.find((item) => item.id === presetId);
  const canSave = useMemo(() => {
    const active = draft.filter((rule) => rule.enabled);
    return (
      active.every(isCompleteRule) &&
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
          label="生成策略"
          hint={<GenerationModeHelp />}
          value={presetId}
          onChange={(event) =>
            onPresetChange(event.target.value as GenerationPresetId)
          }
        >
          {GENERATION_PRESETS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </SelectField>
        <small>{preset?.description}</small>
      </div>
      <div className="pronunciation-entry">
        <span>纠正读音，或跳过不需要朗读的文字</span>
        <Button
          size="sm"
          variant="secondary"
          title="设置哪些词换一种读法，哪些内容不朗读"
          onClick={() => setOpen(true)}
        >
          <BookOpenText className="h-3.5 w-3.5" />
          发音词典{activeCount ? ` ${activeCount}` : ""}
        </Button>
      </div>

      <Modal
        open={open}
        size="lg"
        title="发音词典"
        description="“改读”用来纠正名字或缩写；“跳过”让括号、备注等不出声。原稿不会改变。"
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
                  draft.filter(isCompleteRule).map((rule) => ({
                    ...rule,
                    action: ruleAction(rule),
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
          <div className="pronunciation-rules__compatibility">
            改读和跳过由声作先处理，切换三款模型仍然有效。
          </div>
          {draft.length ? (
            draft.map((rule, index) => (
              <div className="pronunciation-rule" key={rule.id}>
                <label
                  className="pronunciation-rule__enabled"
                  title={rule.enabled ? "暂时停用这条规则" : "启用这条规则"}
                >
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    aria-label={`${rule.enabled ? "停用" : "启用"}第 ${index + 1} 条发音规则`}
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
                  label="看到这些字"
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
                <SelectField
                  label="处理方式"
                  value={ruleAction(rule)}
                  onChange={(event) =>
                    setDraft((current) =>
                      current.map((item) =>
                        item.id === rule.id
                          ? {
                              ...item,
                              action: event.target.value as NonNullable<
                                PronunciationRule["action"]
                              >,
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="replace">改读</option>
                  <option value="skip">跳过</option>
                </SelectField>
                {ruleAction(rule) === "skip" ? (
                  <div className="pronunciation-rule__skip-result">
                    <span>处理结果</span>
                    <strong>不朗读</strong>
                  </div>
                ) : (
                  <TextField
                    label="改读成"
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
                )}
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
              暂时没有规则。可以纠正读音，也可以让指定文字不朗读。
            </div>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={draft.length >= 50}
            onClick={() => setDraft((current) => [...current, createRule()])}
          >
            <Plus className="h-3.5 w-3.5" />
            添加规则
          </Button>
          {!canSave ? (
            <p className="pronunciation-rules__error">
              启用的规则要填写完整，“看到这些字”不能重复。
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
};
