import { Check, Sparkles, WandSparkles } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  countMeaningfulCharacters,
  getModelGenerationCapabilities,
  type Language,
  type ModelId,
  type SmartPerformanceSegment,
  type SmartTextResult,
} from "@ai-voice-studio/shared-types";
import { Button, Modal } from "@ai-voice-studio/ui";

import { useSmartApiAvailability } from "../hooks/useSmartApiAvailability";
import { desktopApi } from "../lib/desktopApi";
import { getUserErrorMessage } from "../lib/errorMessage";
import { performancePauseLabel } from "../lib/performanceAnnotations";
import { useStudioStore } from "../store/studioStore";

const modelApplicationCopy = (modelId: ModelId, language: Language): string => {
  const capabilities = getModelGenerationCapabilities(modelId, language);
  if (capabilities.emotion) {
    return "当前模型会逐段应用情绪和停顿，避免叠加表达提示造成失真。";
  }
  if (capabilities.expression) {
    return "当前模型会逐段应用表达和停顿；情绪名称用于说明。";
  }
  return "当前模型只应用停顿；情绪名称用于说明，不会作为文字朗读。";
};

export const SmartTextAssistant = ({
  text,
  modelId,
  language,
  segments,
  onSegmentsChange,
  compact = false,
}: {
  text: string;
  modelId: ModelId;
  language: Language;
  segments: SmartPerformanceSegment[];
  onSegmentsChange: (segments: SmartPerformanceSegment[]) => void;
  compact?: boolean;
}) => {
  const navigate = useNavigate();
  const tooltipId = useId();
  const { status: apiStatus, configured } = useSmartApiAvailability();
  const pushToast = useStudioStore((state) => state.pushToast);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SmartTextResult | null>(null);
  const [busy, setBusy] = useState(false);
  const characterCount = countMeaningfulCharacters(text);

  const openPanel = () => {
    if (!text.trim()) {
      pushToast({ title: "先输入已经定稿的文字", tone: "warning" });
      return;
    }
    if (characterCount > 20_000) {
      pushToast({
        title: "一次最多分析 20,000 个字",
        description: "请缩短文稿后再试。",
        tone: "warning",
      });
      return;
    }
    setResult(null);
    setOpen(true);
  };

  const process = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setResult(
        await desktopApi.smart.processText({
          action: "performance",
          text,
          modelId,
          language,
        }),
      );
    } catch (error) {
      pushToast({
        title: "智能处理没有完成",
        description: getUserErrorMessage(error, "请稍后重试。"),
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!result) return;
    onSegmentsChange(result.segments);
    setOpen(false);
    pushToast({
      title: `已应用 ${result.segments.length} 段配音标注`,
      description: "已在原文旁显示彩色括号；括号只作提示，不会朗读。",
      tone: "success",
    });
  };

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
                <strong>分析整篇定稿</strong>
                <span>
                  不改原文，只标出分段、停顿和情绪表达；结果会先给你确认。
                </span>
              </>
            ) : apiStatus === "loading" ? (
              <>
                <strong>正在读取 API配置</strong>
                <span>读取完成后会自动显示是否可以使用。</span>
              </>
            ) : apiStatus === "key-error" ? (
              <>
                <strong>保存的 API Key 无法读取</strong>
                <span>到设置里重新输入 API Key，再点“保存并验证”。</span>
              </>
            ) : apiStatus === "missing-key" ? (
              <>
                <strong>还需填写 API Key</strong>
                <span>到设置里输入 API Key，再点“保存并验证”。</span>
              </>
            ) : apiStatus === "error" ? (
              <>
                <strong>API配置读取失败</strong>
                <span>请重开软件；如果仍然失败，到设置里重新保存并验证。</span>
              </>
            ) : (
              <>
                <strong>需要先配置 API</strong>
                <span>打开设置里的“API配置”，填写接口信息后才能使用。</span>
              </>
            )}
          </span>
        </span>
        {segments.length ? (
          <span className="smart-text-applied" title="点击智能处理可以重新分析">
            已标注 {segments.length} 段
          </span>
        ) : null}
      </span>

      <Modal
        open={open}
        size="xl"
        title="智能处理停顿与情绪"
        description={`读取全文 ${characterCount.toLocaleString()} 个字；不修改原稿，只生成不朗读的配音标注。`}
        onClose={() => setOpen(false)}
        footer={
          configured && result ? (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button onClick={apply}>
                <Check className="h-4 w-4" />
                使用这些标注
              </Button>
            </>
          ) : undefined
        }
      >
        {apiStatus === "key-error" ? (
          <div className="smart-text-unconfigured">
            <span>
              <WandSparkles className="h-5 w-5" />
            </span>
            <strong>保存的 API Key 无法读取</strong>
            <p>到设置里重新输入 API Key，再点“保存并验证”。</p>
          </div>
        ) : apiStatus === "error" ? (
          <div className="smart-text-unconfigured">
            <span>
              <WandSparkles className="h-5 w-5" />
            </span>
            <strong>API配置读取失败</strong>
            <p>请重开软件，或在设置里重新保存并验证。</p>
          </div>
        ) : !configured ? (
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
        ) : !result ? (
          <div className="smart-text-ready">
            <Sparkles className="h-5 w-5" />
            <strong>只分析，不改稿</strong>
            <p>AI 会按语意分段，并标记停顿、情绪和克制的表达要求。</p>
            <small>{modelApplicationCopy(modelId, language)}</small>
            <Button disabled={busy} onClick={() => void process()}>
              <WandSparkles className="h-4 w-4" />
              {busy ? "正在分析整篇文稿…" : "开始标注"}
            </Button>
          </div>
        ) : (
          <div className="smart-performance-review">
            <div className="smart-text-summary">
              <Sparkles className="h-4 w-4" />
              <div>
                <strong>原稿未修改</strong>
                <span>{result.summary}</span>
                <small>{modelApplicationCopy(modelId, language)}</small>
              </div>
            </div>
            <div className="smart-performance-segments">
              {result.segments.map((segment, index) => (
                <article key={`${index}-${segment.text.slice(0, 18)}`}>
                  <span>{index + 1}</span>
                  <p>{segment.text}</p>
                  <div>
                    <strong>
                      {performancePauseLabel(segment.pauseAfterMs)}
                    </strong>
                    <strong>情绪：{segment.mood}</strong>
                    {segment.expression ? (
                      <small>{segment.expression}</small>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};
