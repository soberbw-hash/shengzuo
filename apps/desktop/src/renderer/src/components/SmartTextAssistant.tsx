import {
  BookOpenText,
  Check,
  RotateCcw,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  countMeaningfulCharacters,
  type Emotion,
  type Language,
  type ModelId,
  type PronunciationRule,
  type SmartTextAction,
  type SmartTextResult,
} from "@ai-voice-studio/shared-types";
import { Button, Modal, TextAreaField, TextField } from "@ai-voice-studio/ui";

import { desktopApi } from "../lib/desktopApi";
import { useSmartApiAvailability } from "../hooks/useSmartApiAvailability";
import { useStudioStore } from "../store/studioStore";

const actions: readonly {
  id: SmartTextAction;
  label: string;
  description: string;
}[] = [
  {
    id: "spoken",
    label: "自然口语",
    description: "把书面句改成适合朗读的口语",
  },
  {
    id: "pause",
    label: "整理停顿",
    description: "调整标点和断句，不改核心内容",
  },
  {
    id: "concise",
    label: "精简文稿",
    description: "删除重复、赘词和绕口句",
  },
  {
    id: "pronunciation",
    label: "检查发音",
    description: "找出人名、品牌和英文缩写的读法",
  },
  {
    id: "translate",
    label: "翻译配音",
    description: "翻译成指定语言，并改得适合朗读",
  },
  {
    id: "custom",
    label: "自定义",
    description: "只按你填写的要求处理",
  },
];

interface SourceRange {
  start: number;
  end: number;
}

export const SmartTextAssistant = ({
  text,
  targetId,
  modelId,
  language,
  pronunciationRules,
  onChange,
  onExpressionChange,
  onEmotionChange,
  onPronunciationRulesChange,
  compact = false,
}: {
  text: string;
  targetId?: string;
  modelId: ModelId;
  language: Language;
  pronunciationRules?: PronunciationRule[];
  onChange: (text: string) => void;
  onExpressionChange?: (expression: string) => void;
  onEmotionChange?: (emotion: Emotion) => void;
  onPronunciationRulesChange?: (rules: PronunciationRule[]) => void;
  compact?: boolean;
}) => {
  const navigate = useNavigate();
  const tooltipId = useId();
  const { status: apiStatus, configured } = useSmartApiAvailability();
  const pushToast = useStudioStore((state) => state.pushToast);
  const [open, setOpen] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [sourceRange, setSourceRange] = useState<SourceRange | null>(null);
  const [action, setAction] = useState<SmartTextAction>("spoken");
  const [customInstruction, setCustomInstruction] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("英语");
  const [result, setResult] = useState<SmartTextResult | null>(null);
  const [revisedText, setRevisedText] = useState("");
  const [busy, setBusy] = useState(false);
  const [undoText, setUndoText] = useState<string | null>(null);
  const [suggestionsApplied, setSuggestionsApplied] = useState(false);

  const openPanel = () => {
    const input = targetId
      ? document.querySelector<HTMLTextAreaElement>(`#${targetId}`)
      : null;
    const hasSelection =
      input &&
      input.selectionEnd > input.selectionStart &&
      input.value === text;
    const range = hasSelection
      ? { start: input.selectionStart, end: input.selectionEnd }
      : null;
    const source = range ? text.slice(range.start, range.end) : text;
    if (!source.trim()) {
      pushToast({ title: "先输入需要处理的文字", tone: "warning" });
      return;
    }
    if (countMeaningfulCharacters(source) > 20_000) {
      pushToast({
        title: "一次最多处理 20,000 个字",
        description: "请在文字框中选中一部分后再处理。",
        tone: "warning",
      });
      return;
    }
    setSourceText(source);
    setSourceRange(range);
    setResult(null);
    setRevisedText("");
    setSuggestionsApplied(false);
    setOpen(true);
  };

  const process = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await desktopApi.smart.processText({
        action,
        text: sourceText,
        customInstruction:
          action === "custom" ? customInstruction.trim() : undefined,
        targetLanguage:
          action === "translate" ? targetLanguage.trim() : undefined,
        modelId,
        language,
      });
      setResult(next);
      setRevisedText(next.revisedText);
    } catch (error) {
      pushToast({
        title: "智能处理没有完成",
        description: error instanceof Error ? error.message : "请稍后重试。",
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const applyText = () => {
    if (!result || !revisedText.trim()) return;
    if (
      sourceRange &&
      text.slice(sourceRange.start, sourceRange.end) === sourceText
    ) {
      setUndoText(text);
      onChange(
        `${text.slice(0, sourceRange.start)}${revisedText.trim()}${text.slice(sourceRange.end)}`,
      );
    } else if (!sourceRange && text === sourceText) {
      setUndoText(text);
      onChange(revisedText.trim());
    } else {
      pushToast({
        title: "输入框里的文字已经变了",
        description: "请关闭窗口，再重新选择要处理的文字。",
        tone: "warning",
      });
      return;
    }
    setOpen(false);
    pushToast({
      title: sourceRange ? "已替换选中文字" : "已替换全文",
      description: "如果不满意，可以点击旁边的撤销按钮。",
      tone: "success",
    });
  };

  const applySuggestions = () => {
    if (!result || suggestionsApplied) return;
    if (result.expressionSuggestion && onExpressionChange) {
      onExpressionChange(result.expressionSuggestion);
    }
    if (result.emotionSuggestion && onEmotionChange) {
      onEmotionChange(result.emotionSuggestion);
    }
    setSuggestionsApplied(true);
  };

  const addPronunciations = () => {
    if (
      !result?.pronunciations.length ||
      !pronunciationRules ||
      !onPronunciationRulesChange
    ) {
      return;
    }
    const existing = new Set(
      pronunciationRules.map((rule) => rule.source.trim().toLocaleLowerCase()),
    );
    const additions = result.pronunciations
      .filter((item) => !existing.has(item.source.trim().toLocaleLowerCase()))
      .slice(0, Math.max(0, 50 - pronunciationRules.length))
      .map((item) => ({
        id: crypto.randomUUID(),
        source: item.source,
        replacement: item.replacement,
        enabled: true,
      }));
    if (!additions.length) {
      pushToast({ title: "这些词已经在发音词典里", tone: "info" });
      return;
    }
    onPronunciationRulesChange([...pronunciationRules, ...additions]);
    pushToast({
      title: `已加入 ${additions.length} 条发音规则`,
      tone: "success",
    });
  };

  const sourceCharacterCount = countMeaningfulCharacters(sourceText);
  const resultCharacterCount = countMeaningfulCharacters(revisedText);
  const selectedAction = actions.find((item) => item.id === action);
  const needsExtra =
    (action === "custom" && !customInstruction.trim()) ||
    (action === "translate" && !targetLanguage.trim());

  return (
    <>
      <span className="smart-text-entry">
        <span
          className="smart-text-help-trigger"
          tabIndex={configured ? undefined : 0}
        >
          <Button
            size="sm"
            variant="secondary"
            className={compact ? "smart-text-entry__compact" : undefined}
            aria-describedby={tooltipId}
            disabled={!configured}
            onClick={openPanel}
          >
            <Sparkles className="h-3.5 w-3.5" />
            智能处理
          </Button>
          <span className="smart-text-tooltip" id={tooltipId} role="tooltip">
            {apiStatus === "configured" ? (
              <>
                <strong>处理和修改文稿</strong>
                <span>
                  润色口语、整理停顿、精简文字、检查发音或翻译。结果会先给你确认。
                </span>
              </>
            ) : apiStatus === "loading" ? (
              <>
                <strong>正在读取 API配置</strong>
                <span>读取完成后会自动显示是否可以使用。</span>
              </>
            ) : (
              <>
                <strong>需要先配置 API</strong>
                <span>打开设置里的“API配置”，填写接口信息后才能使用。</span>
              </>
            )}
          </span>
        </span>
        {undoText !== null ? (
          <button
            type="button"
            className="smart-text-undo"
            title="撤销上一次智能修改"
            aria-label="撤销智能修改"
            onClick={() => {
              onChange(undoText);
              setUndoText(null);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </span>

      <Modal
        open={open}
        size="xl"
        title="智能处理文稿"
        description={
          sourceRange
            ? `只处理选中的 ${sourceCharacterCount.toLocaleString()} 个字，确认后替换这部分。`
            : `处理全文 ${sourceCharacterCount.toLocaleString()} 个字，确认后才会替换原文。`
        }
        onClose={() => setOpen(false)}
        footer={
          configured && result ? (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                保留原文
              </Button>
              <Button onClick={applyText}>
                <Check className="h-4 w-4" />
                {sourceRange ? "替换选中文字" : "替换全文"}
              </Button>
            </>
          ) : undefined
        }
      >
        {!configured ? (
          <div className="smart-text-unconfigured">
            <span>
              <WandSparkles className="h-5 w-5" />
            </span>
            <strong>还没有配置 API</strong>
            <p>请先到设置里的“API配置”填写接口信息。</p>
            <Button
              size="sm"
              onClick={() => {
                setOpen(false);
                void navigate("/settings?smart=1");
              }}
            >
              去设置
            </Button>
          </div>
        ) : (
          <div className="smart-text-workspace">
            <div className="smart-text-actions" aria-label="智能处理方式">
              {actions.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  data-active={action === item.id}
                  onClick={() => {
                    setAction(item.id);
                    setResult(null);
                  }}
                >
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
            {action === "custom" ? (
              <TextAreaField
                label="处理要求"
                className="smart-text-custom"
                value={customInstruction}
                maxLength={500}
                placeholder="例如：语气更轻松，保留所有产品参数"
                onChange={(event) => setCustomInstruction(event.target.value)}
              />
            ) : null}
            {action === "translate" ? (
              <TextField
                label="翻译成"
                value={targetLanguage}
                maxLength={60}
                placeholder="例如：英语、日语、粤语"
                onChange={(event) => setTargetLanguage(event.target.value)}
              />
            ) : null}
            {!result ? (
              <div className="smart-text-ready">
                <Sparkles className="h-5 w-5" />
                <strong>{selectedAction?.label}</strong>
                <p>{selectedAction?.description}</p>
                <Button
                  disabled={busy || needsExtra}
                  onClick={() => void process()}
                >
                  <WandSparkles className="h-4 w-4" />
                  {busy ? "正在处理…" : "开始处理"}
                </Button>
              </div>
            ) : (
              <>
                <div className="smart-text-summary">
                  <Sparkles className="h-4 w-4" />
                  <div>
                    <strong>本次处理：{selectedAction?.label}</strong>
                    <p>{selectedAction?.description}</p>
                    <span>具体变化：{result.summary}</span>
                    <small>
                      原文 {sourceCharacterCount.toLocaleString()} 字 → 结果{" "}
                      {resultCharacterCount.toLocaleString()} 字
                    </small>
                  </div>
                </div>
                <div className="smart-text-compare">
                  <TextAreaField
                    label="修改前"
                    value={sourceText}
                    readOnly
                    className="smart-text-compare__field"
                  />
                  <TextAreaField
                    label="处理结果（可以修改）"
                    value={revisedText}
                    maxLength={50_000}
                    className="smart-text-compare__field"
                    onChange={(event) => setRevisedText(event.target.value)}
                  />
                </div>
                {result.expressionSuggestion || result.emotionSuggestion ? (
                  <div className="smart-text-suggestions">
                    <span>配音建议</span>
                    {result.emotionSuggestion ? (
                      <strong>情绪：{result.emotionSuggestion}</strong>
                    ) : null}
                    {result.expressionSuggestion ? (
                      <strong>表达：{result.expressionSuggestion}</strong>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={suggestionsApplied}
                      onClick={applySuggestions}
                    >
                      {suggestionsApplied ? "已应用" : "应用建议"}
                    </Button>
                  </div>
                ) : null}
                {result.pronunciations.length ? (
                  <div className="smart-text-pronunciations">
                    <span>
                      <BookOpenText className="h-4 w-4" /> 发音建议
                    </span>
                    <div>
                      {result.pronunciations.map((item) => (
                        <strong key={`${item.source}-${item.replacement}`}>
                          {item.source} → {item.replacement}
                        </strong>
                      ))}
                    </div>
                    {onPronunciationRulesChange ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={addPronunciations}
                      >
                        加入发音词典
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
};
