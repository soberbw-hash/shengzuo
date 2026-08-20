import { Check, ScanText, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  countMeaningfulCharacters,
  getSmartScriptDestination,
  type SmartDialogueScriptResult,
} from "@ai-voice-studio/shared-types";
import { Button, Modal } from "@ai-voice-studio/ui";

import { useSmartApiAvailability } from "../hooks/useSmartApiAvailability";
import { desktopApi } from "../lib/desktopApi";
import { getUserErrorMessage } from "../lib/errorMessage";
import { useStudioStore } from "../store/studioStore";

interface SmartDialogueExtractorProps {
  text: string;
  compact?: boolean;
  actionLabel?: string | ((result: SmartDialogueScriptResult) => string);
  onResult?: (result: SmartDialogueScriptResult) => Promise<void> | void;
  secondaryActionLabel?: (
    result: SmartDialogueScriptResult,
  ) => string | undefined;
  onSecondaryResult?: (
    result: SmartDialogueScriptResult,
  ) => Promise<void> | void;
}

export const SmartDialogueExtractor = ({
  text,
  compact = false,
  actionLabel,
  onResult,
  secondaryActionLabel,
  onSecondaryResult,
}: SmartDialogueExtractorProps) => {
  const navigate = useNavigate();
  const tooltipId = useId();
  const { status: apiStatus, configured } = useSmartApiAvailability();
  const pushToast = useStudioStore((state) => state.pushToast);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SmartDialogueScriptResult | null>(null);
  const characterCount = countMeaningfulCharacters(text);

  const extract = async () => {
    if (!text.trim()) {
      pushToast({ title: "先输入或拖入完整脚本", tone: "warning" });
      return;
    }
    if (characterCount > 40_000) {
      pushToast({
        title: "一次最多整理 40,000 个字",
        description: "请把脚本分成两次处理。",
        tone: "warning",
      });
      return;
    }
    setOpen(true);
    setBusy(true);
    setResult(null);
    try {
      setResult(await desktopApi.smart.processDialogue({ text }));
    } catch (error) {
      setOpen(false);
      pushToast({
        title: "角色和台词没有提取完成",
        description: getUserErrorMessage(error, "请稍后重试。"),
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmResult = async () => {
    if (!result) return;
    setOpen(false);
    if (onResult) {
      await onResult(result);
      return;
    }
    const destination = getSmartScriptDestination(result);
    void navigate(`/${destination}`, {
      state: { extractedDialogue: result },
    });
  };

  const confirmSecondaryResult = async () => {
    if (!result || !onSecondaryResult) return;
    setOpen(false);
    await onSecondaryResult(result);
  };

  const destinationLabel =
    result && getSmartScriptDestination(result) === "subtitles"
      ? "转到长稿配音"
      : "转到多人对话";
  const resolvedActionLabel =
    typeof actionLabel === "function"
      ? result
        ? actionLabel(result)
        : destinationLabel
      : (actionLabel ?? destinationLabel);
  const resolvedSecondaryActionLabel = result
    ? secondaryActionLabel?.(result)
    : undefined;

  return (
    <>
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
          onClick={() => void extract()}
        >
          <ScanText className="h-3.5 w-3.5" />
          提取台词
        </Button>
        <span className="smart-text-tooltip" id={tooltipId} role="tooltip">
          {apiStatus === "configured" ? (
            <>
              <strong>从完整脚本提取台词</strong>
              <span>
                去掉场景、镜头、动作和音效，整理成可直接配音的角色和台词。
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
              <span>到设置里重新输入 API Key，再保存并验证。</span>
            </>
          ) : apiStatus === "missing-key" ? (
            <>
              <strong>还需填写 API Key</strong>
              <span>到设置里输入 API Key，再保存并验证。</span>
            </>
          ) : apiStatus === "error" ? (
            <>
              <strong>API配置读取失败</strong>
              <span>请重开软件，或到设置里重新保存并验证。</span>
            </>
          ) : (
            <>
              <strong>需要先配置 API</strong>
              <span>打开设置里的“API配置”，填写接口信息后才能使用。</span>
            </>
          )}
        </span>
      </span>

      <Modal
        open={open}
        size="lg"
        title="确认角色和台词"
        description={
          result
            ? `提取出 ${result.roles.length} 个角色、${result.lines.length} 句台词。请选择接下来在哪种配音方式中继续。`
            : `正在读取整篇脚本，共 ${characterCount.toLocaleString()} 个字。`
        }
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        footer={
          result ? (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                返回修改
              </Button>
              {resolvedSecondaryActionLabel ? (
                <Button
                  variant="secondary"
                  onClick={() => void confirmSecondaryResult()}
                >
                  {resolvedSecondaryActionLabel}
                </Button>
              ) : null}
              <Button onClick={() => void confirmResult()}>
                <Check className="h-4 w-4" />
                {resolvedActionLabel}
              </Button>
            </>
          ) : undefined
        }
      >
        {busy ? (
          <div className="smart-text-ready">
            <Sparkles className="h-5 w-5" />
            <strong>正在提取角色和台词…</strong>
            <p>画面、动作、音效等内容不会放进配音台词。</p>
          </div>
        ) : result ? (
          <div className="dialogue-smart-review">
            <div className="dialogue-smart-review__summary">
              <Sparkles className="h-4 w-4" />
              <div>
                <strong>本次处理结果</strong>
                <p>{result.summary}</p>
                {result.removedContent.length ? (
                  <div>
                    <span>已去除</span>
                    {result.removedContent.map((item) => (
                      <small key={item}>{item}</small>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="dialogue-smart-review__lines">
              {result.lines.map((line, index) => (
                <div key={`${line.role}-${index}`}>
                  <strong title={line.role}>{line.role}</strong>
                  <p>{line.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
};
