import {
  CheckCircle2,
  Mic2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useState, type CSSProperties, type DragEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  VoiceProfile,
  VoiceSampleQuality,
  VoiceSampleSelection,
} from "@ai-voice-studio/shared-types";

import {
  Button,
  GlassCard,
  Modal,
  StatusBadge,
  TextAreaField,
  TextField,
} from "@ai-voice-studio/ui";

import { PageHeader } from "../components/PageHeader";
import { desktopApi } from "../lib/desktopApi";
import { useStudioStore } from "../store/studioStore";

export const VoicesPage = () => {
  const store = useStudioStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [cloneOpen, setCloneOpen] = useState(false);
  const [voiceName, setVoiceName] = useState("我的声音");
  const [sampleName, setSampleName] = useState("");
  const [sampleToken, setSampleToken] = useState("");
  const [sampleQuality, setSampleQuality] = useState<VoiceSampleQuality | null>(
    null,
  );
  const [referenceText, setReferenceText] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingSample, setCheckingSample] = useState(false);
  const [draggingSample, setDraggingSample] = useState(false);
  const [voiceToRemove, setVoiceToRemove] = useState<VoiceProfile | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("clone") === "1") {
      setCloneOpen(true);
    }
  }, [location.search]);

  const closeClone = () => {
    setCloneOpen(false);
    if (location.search) void navigate("/voices", { replace: true });
  };

  const applySampleSelection = (selection: VoiceSampleSelection) => {
    if (selection.canceled) return;
    setSampleName(selection.fileName ?? "已选择录音");
    setSampleToken(selection.sampleToken ?? "");
    setSampleQuality(selection.quality ?? null);
  };

  const loadSample = async (selection: Promise<VoiceSampleSelection>) => {
    if (checkingSample) return;
    setCheckingSample(true);
    try {
      applySampleSelection(await selection);
    } catch (error) {
      store.pushToast({
        title: "没有选中录音",
        description:
          error instanceof Error ? error.message : "请换一个音频文件。",
        tone: "warning",
      });
    } finally {
      setCheckingSample(false);
    }
  };

  const selectSample = () => loadSample(desktopApi.voices.selectSample());

  const dropSample = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingSample(false);
    const file = event.dataTransfer.files.item(0);
    if (!file) return;
    void loadSample(desktopApi.voices.selectDroppedSample(file));
  };

  const createVoice = async () => {
    if (!voiceName.trim() || !sampleToken || !referenceText.trim() || busy)
      return;
    setBusy(true);
    try {
      const voice = await desktopApi.voices.create({
        sampleToken,
        name: voiceName.trim(),
        referenceText: referenceText.trim(),
      });
      store.addVoiceProfile(voice);
      store.setSelectedVoice(voice.id);
      setSampleName("");
      setSampleToken("");
      setSampleQuality(null);
      setReferenceText("");
      setVoiceName("我的声音");
      closeClone();
      store.pushToast({
        title: "声音已创建",
        description: "可以直接开始配音。",
        tone: "success",
      });
    } catch (error) {
      store.pushToast({
        title: "声音没有创建成功",
        description:
          error instanceof Error ? error.message : "请重新选择录音。",
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const removeVoice = async () => {
    if (!voiceToRemove || removeBusy) return;
    setRemoveBusy(true);
    try {
      const removed = await desktopApi.voices.remove(voiceToRemove.id);
      if (!removed) throw new Error("这个声音已经不存在，请刷新后重试。");
      store.removeVoiceProfile(voiceToRemove.id);
      setVoiceToRemove(null);
      store.pushToast({ title: "声音已删除", tone: "success" });
    } catch (error) {
      store.pushToast({
        title: "声音没有删除成功",
        description: error instanceof Error ? error.message : "请稍后重试。",
        tone: "danger",
      });
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <div className="page-content">
      <PageHeader
        title="我的声音"
        description="选择、创建或删除声音。"
        actions={
          <Button onClick={() => setCloneOpen(true)}>
            <Plus className="h-4 w-4" />
            克隆声音
          </Button>
        }
      />

      <GlassCard tone="soft" padding="lg" className="clone-intro">
        <span className="clone-intro__icon">
          <Mic2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <strong>准备 3–30 秒清晰人声</strong>
          <p>只保留一个人说话，并填写录音中对应的原文。</p>
        </div>
        <Button variant="secondary" onClick={() => setCloneOpen(true)}>
          开始克隆
        </Button>
      </GlassCard>

      {store.voiceProfiles.length > 0 ? (
        <div className="voice-grid">
          {store.voiceProfiles.map((voice) => (
            <GlassCard
              key={voice.id}
              tone="solid"
              padding="lg"
              className="voice-card"
            >
              <div className="flex items-start gap-3">
                <span
                  className="voice-avatar"
                  style={{ "--voice-color": voice.color } as CSSProperties}
                >
                  <Mic2 className="h-5 w-5" />
                  <i />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3>{voice.name}</h3>
                    <StatusBadge tone="success">本地克隆</StatusBadge>
                  </div>
                  <p>{voice.description}</p>
                  <small>{voice.model}</small>
                </div>
              </div>
              <div className="voice-card__actions">
                <Button
                  size="sm"
                  variant={
                    store.selectedVoice === voice.id ? "primary" : "secondary"
                  }
                  fullWidth
                  onClick={() => {
                    store.setSelectedVoice(voice.id);
                    void navigate("/");
                  }}
                >
                  {store.selectedVoice === voice.id
                    ? "已选中，去创作"
                    : "用这个声音创作"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`删除声音 ${voice.name}`}
                  title="删除声音"
                  onClick={() => setVoiceToRemove(voice)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <GlassCard tone="solid" padding="lg" className="voice-empty">
          <Mic2 className="h-6 w-6" />
          <strong>还没有声音</strong>
          <p>添加一段录音，创建第一个声音。</p>
          <Button size="sm" onClick={() => setCloneOpen(true)}>
            克隆第一个声音
          </Button>
        </GlassCard>
      )}

      <Modal
        open={cloneOpen}
        title="克隆声音"
        onClose={closeClone}
        footer={
          <>
            <Button variant="ghost" onClick={closeClone}>
              取消
            </Button>
            <Button
              disabled={
                !voiceName.trim() ||
                !sampleToken ||
                !referenceText.trim() ||
                busy
              }
              onClick={() => void createVoice()}
            >
              <Sparkles className="h-4 w-4" />
              {busy ? "正在保存…" : "创建声音"}
            </Button>
          </>
        }
      >
        <ol className="clone-steps" aria-label="克隆声音步骤">
          <li data-active="true">
            <span>1</span>
            选择录音
          </li>
          <li data-active={Boolean(sampleName)}>
            <span>2</span>
            填写信息
          </li>
        </ol>

        <div className="mt-5 space-y-4">
          <div
            className="clone-upload"
            data-dragging={draggingSample}
            onDragEnter={(event) => {
              event.preventDefault();
              if (event.dataTransfer.types.includes("Files")) {
                setDraggingSample(true);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setDraggingSample(false);
              }
            }}
            onDrop={dropSample}
          >
            <span className="clone-upload__icon">
              {sampleName ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <strong>{sampleName || "选择一段人声录音"}</strong>
              <p>点击选择或把音频拖到这里；建议 3–30 秒。</p>
            </div>
            <button
              type="button"
              className="file-button"
              disabled={checkingSample}
              onClick={() => void selectSample()}
            >
              {checkingSample ? "正在检查…" : "选择音频"}
            </button>
          </div>
          <TextField
            label="声音名称"
            value={voiceName}
            maxLength={24}
            onChange={(event) => setVoiceName(event.target.value)}
          />
          <TextAreaField
            label="录音里说的原文"
            hint={`${referenceText.length} / 1,000`}
            value={referenceText}
            maxLength={1_000}
            placeholder="请按录音内容逐字填写；原文越准确，克隆越像。"
            onChange={(event) => setReferenceText(event.target.value)}
          />
          {sampleQuality ? (
            <div className="voice-quality-checks" aria-label="录音质量检查">
              {sampleQuality.checks.map((check) => (
                <StatusBadge key={check.code} tone={check.tone}>
                  {check.label}
                </StatusBadge>
              ))}
              {sampleQuality.durationSeconds && referenceText.trim() ? (
                <StatusBadge
                  tone={
                    referenceText.replace(/\s/gu, "").length /
                      sampleQuality.durationSeconds <
                      0.8 ||
                    referenceText.replace(/\s/gu, "").length /
                      sampleQuality.durationSeconds >
                      9
                      ? "warning"
                      : "success"
                  }
                >
                  {referenceText.replace(/\s/gu, "").length /
                    sampleQuality.durationSeconds <
                    0.8 ||
                  referenceText.replace(/\s/gu, "").length /
                    sampleQuality.durationSeconds >
                    9
                    ? "原文字数和录音时长可能不匹配"
                    : "原文字数与录音时长基本匹配"}
                </StatusBadge>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(voiceToRemove)}
        title="删除这个声音？"
        description="会同时删除保存在本机的参考录音，生成过的音频不会受影响。"
        onClose={() => {
          if (!removeBusy) setVoiceToRemove(null);
        }}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={removeBusy}
              onClick={() => setVoiceToRemove(null)}
            >
              取消
            </Button>
            <Button
              variant="danger"
              disabled={removeBusy}
              onClick={() => void removeVoice()}
            >
              <Trash2 className="h-4 w-4" />
              {removeBusy ? "正在删除…" : "确认删除"}
            </Button>
          </>
        }
      >
        <p className="delete-voice-summary">
          将删除“{voiceToRemove?.name}”。此操作无法撤销。
        </p>
      </Modal>
    </div>
  );
};
