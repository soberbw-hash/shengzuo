import {
  AudioLines,
  Check,
  CheckCircle2,
  FolderOpen,
  Mic2,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
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
import { getUserErrorMessage } from "../lib/errorMessage";
import { createDefaultVoiceName } from "../lib/projectNaming";
import { useStudioStore } from "../store/studioStore";

export const VoicesPage = () => {
  const store = useStudioStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [cloneOpen, setCloneOpen] = useState(false);
  const [voiceName, setVoiceName] = useState(createDefaultVoiceName);
  const [sampleName, setSampleName] = useState("");
  const [sampleToken, setSampleToken] = useState("");
  const [samplePreviewUrl, setSamplePreviewUrl] = useState("");
  const [sampleQuality, setSampleQuality] = useState<VoiceSampleQuality | null>(
    null,
  );
  const [referenceText, setReferenceText] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingSample, setCheckingSample] = useState(false);
  const [draggingSample, setDraggingSample] = useState(false);
  const [voiceToRemove, setVoiceToRemove] = useState<VoiceProfile | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [editingVoiceId, setEditingVoiceId] = useState("");
  const [editingVoiceName, setEditingVoiceName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [sampleVoice, setSampleVoice] = useState<VoiceProfile | null>(null);
  const [managedSampleName, setManagedSampleName] = useState("");
  const [managedSampleToken, setManagedSampleToken] = useState("");
  const [managedSamplePreviewUrl, setManagedSamplePreviewUrl] = useState("");
  const [managedReferenceText, setManagedReferenceText] = useState("");
  const [managedSampleQuality, setManagedSampleQuality] =
    useState<VoiceSampleQuality | null>(null);
  const [managedSampleBusy, setManagedSampleBusy] = useState(false);
  const [managedSampleDragging, setManagedSampleDragging] = useState(false);
  const voicePreviewRef = useRef<HTMLAudioElement>(null);
  const [previewingVoiceId, setPreviewingVoiceId] = useState("");

  const openClone = useCallback(() => {
    setVoiceName(createDefaultVoiceName());
    setCloneOpen(true);
  }, []);

  const openVoicesFolder = async () => {
    const opened = await desktopApi.voices.openFolder();
    store.pushToast(
      opened
        ? { title: "已打开声音文件夹", tone: "success" }
        : {
            title: "声音文件夹没有打开",
            description: "请在设置中运行一次检查修复后重试。",
            tone: "warning",
          },
    );
  };

  useEffect(() => {
    if (new URLSearchParams(location.search).get("clone") === "1") {
      openClone();
    }
  }, [location.search, openClone]);

  useEffect(() => {
    const refreshVoices = () => {
      void desktopApi.voices
        .list()
        .then((voices) => useStudioStore.getState().setVoiceProfiles(voices))
        .catch(() => undefined);
    };
    window.addEventListener("focus", refreshVoices);
    return () => window.removeEventListener("focus", refreshVoices);
  }, []);

  const closeClone = () => {
    setCloneOpen(false);
    if (location.search) void navigate("/voices", { replace: true });
  };

  const applySampleSelection = (selection: VoiceSampleSelection) => {
    if (selection.canceled) return;
    setSampleName(selection.fileName ?? "已选择录音");
    setSampleToken(selection.sampleToken ?? "");
    setSamplePreviewUrl(selection.previewUrl ?? "");
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
        description: getUserErrorMessage(error, "请换一个音频文件。"),
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
    if (!voiceName.trim() || !sampleToken || busy) return;
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
      setSamplePreviewUrl("");
      setSampleQuality(null);
      setReferenceText("");
      setVoiceName(createDefaultVoiceName());
      closeClone();
      store.pushToast({
        title: "声音已创建",
        description: "可以直接开始配音。",
        tone: "success",
      });
    } catch (error) {
      store.pushToast({
        title: "声音没有创建成功",
        description: getUserErrorMessage(error, "请重新选择录音。"),
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
        description: getUserErrorMessage(error, "请稍后重试。"),
        tone: "danger",
      });
    } finally {
      setRemoveBusy(false);
    }
  };

  const startRename = (voice: VoiceProfile) => {
    setEditingVoiceId(voice.id);
    setEditingVoiceName(voice.name);
  };

  const cancelRename = () => {
    if (renameBusy) return;
    setEditingVoiceId("");
    setEditingVoiceName("");
  };

  const renameVoice = async (voice: VoiceProfile) => {
    const name = editingVoiceName.trim();
    if (!name || renameBusy) return;
    if (name === voice.name) {
      cancelRename();
      return;
    }
    setRenameBusy(true);
    try {
      const updated = await desktopApi.voices.rename({
        voiceId: voice.id,
        name,
      });
      store.updateVoiceProfile(updated);
      setEditingVoiceId("");
      setEditingVoiceName("");
      store.pushToast({ title: "声音名称已修改", tone: "success" });
    } catch (error) {
      store.pushToast({
        title: "声音名称没有修改成功",
        description: getUserErrorMessage(error, "请稍后重试。"),
        tone: "danger",
      });
    } finally {
      setRenameBusy(false);
    }
  };

  const openSampleManager = (voice: VoiceProfile) => {
    setSampleVoice(voice);
    setManagedSampleName("");
    setManagedSampleToken("");
    setManagedSamplePreviewUrl("");
    setManagedReferenceText("");
    setManagedSampleQuality(null);
  };

  const loadManagedSample = async (
    selection: Promise<VoiceSampleSelection>,
  ) => {
    if (managedSampleBusy) return;
    setManagedSampleBusy(true);
    try {
      const selected = await selection;
      if (selected.canceled) return;
      setManagedSampleName(selected.fileName ?? "已选择录音");
      setManagedSampleToken(selected.sampleToken ?? "");
      setManagedSamplePreviewUrl(selected.previewUrl ?? "");
      setManagedSampleQuality(selected.quality ?? null);
    } catch (error) {
      store.pushToast({
        title: "没有选中录音",
        description: getUserErrorMessage(error, "请换一个音频文件。"),
        tone: "warning",
      });
    } finally {
      setManagedSampleBusy(false);
    }
  };

  const addManagedSample = async () => {
    if (!sampleVoice || !managedSampleToken || managedSampleBusy) return;
    setManagedSampleBusy(true);
    try {
      const updated = await desktopApi.voices.addSample({
        voiceId: sampleVoice.id,
        sampleToken: managedSampleToken,
        referenceText: managedReferenceText.trim(),
      });
      store.updateVoiceProfile(updated);
      setSampleVoice(updated);
      setManagedSampleName("");
      setManagedSampleToken("");
      setManagedSamplePreviewUrl("");
      setManagedReferenceText("");
      setManagedSampleQuality(null);
      store.pushToast({
        title: "参考录音已添加并选中",
        tone: "success",
      });
    } catch (error) {
      store.pushToast({
        title: "参考录音没有添加成功",
        description: getUserErrorMessage(error, "请稍后重试。"),
        tone: "danger",
      });
    } finally {
      setManagedSampleBusy(false);
    }
  };

  const selectManagedSample = async (sampleId: string) => {
    if (!sampleVoice || managedSampleBusy) return;
    setManagedSampleBusy(true);
    try {
      const updated = await desktopApi.voices.selectSampleForVoice({
        voiceId: sampleVoice.id,
        sampleId,
      });
      store.updateVoiceProfile(updated);
      setSampleVoice(updated);
    } catch (error) {
      store.pushToast({
        title: "参考录音没有切换成功",
        description: getUserErrorMessage(error, "请稍后重试。"),
        tone: "danger",
      });
    } finally {
      setManagedSampleBusy(false);
    }
  };

  const removeManagedSample = async (sampleId: string, sampleName: string) => {
    if (!sampleVoice || managedSampleBusy) return;
    if (!window.confirm(`删除参考录音“${sampleName}”？`)) return;
    setManagedSampleBusy(true);
    try {
      const updated = await desktopApi.voices.removeSample({
        voiceId: sampleVoice.id,
        sampleId,
      });
      store.updateVoiceProfile(updated);
      setSampleVoice(updated);
    } catch (error) {
      store.pushToast({
        title: "参考录音没有删除成功",
        description: getUserErrorMessage(error, "请稍后重试。"),
        tone: "danger",
      });
    } finally {
      setManagedSampleBusy(false);
    }
  };

  const toggleVoicePreview = async (voice: VoiceProfile) => {
    const audio = voicePreviewRef.current;
    if (!audio || !voice.previewUrl) return;
    if (previewingVoiceId === voice.id && !audio.paused) {
      audio.pause();
      setPreviewingVoiceId("");
      return;
    }
    try {
      audio.src = voice.previewUrl;
      await audio.play();
      setPreviewingVoiceId(voice.id);
    } catch {
      setPreviewingVoiceId("");
      store.pushToast({
        title: "这段参考录音暂时无法播放",
        description: "请打开参考录音管理，确认文件仍然存在。",
        tone: "warning",
      });
    }
  };

  return (
    <div className="page-content voices-page">
      <audio
        ref={voicePreviewRef}
        preload="metadata"
        onEnded={() => setPreviewingVoiceId("")}
        onPause={() => {
          if (voicePreviewRef.current?.ended) setPreviewingVoiceId("");
        }}
      />
      <PageHeader
        title="我的声音"
        description="选择、创建或删除声音。"
        actions={
          <div className="page-header-actions">
            <Button variant="secondary" onClick={() => void openVoicesFolder()}>
              <FolderOpen className="h-4 w-4" />
              打开声音文件夹
            </Button>
            <Button onClick={openClone}>
              <Plus className="h-4 w-4" />
              克隆声音
            </Button>
          </div>
        }
      />

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
                  <div className="voice-card__title-row">
                    {editingVoiceId === voice.id ? (
                      <form
                        className="voice-name-editor"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void renameVoice(voice);
                        }}
                      >
                        <input
                          autoFocus
                          aria-label={`修改声音名称 ${voice.name}`}
                          value={editingVoiceName}
                          maxLength={24}
                          disabled={renameBusy}
                          onChange={(event) =>
                            setEditingVoiceName(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Escape") cancelRename();
                          }}
                        />
                        <button
                          type="submit"
                          aria-label="保存声音名称"
                          disabled={!editingVoiceName.trim() || renameBusy}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="取消修改声音名称"
                          disabled={renameBusy}
                          onClick={cancelRename}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    ) : (
                      <>
                        <h3 title={voice.name}>{voice.name}</h3>
                        <button
                          type="button"
                          className="voice-rename-button"
                          aria-label={`重命名声音 ${voice.name}`}
                          title="重命名"
                          onClick={() => startRename(voice)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                  <small>
                    {voice.referenceSamples?.length ?? 1} 段参考录音
                  </small>
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
                    ? "已选中，去配音"
                    : "用这个声音配音"}
                </Button>
                <Button
                  className="voice-card-preview-action"
                  size="sm"
                  variant="secondary"
                  disabled={!voice.previewUrl}
                  aria-label={`试听声音 ${voice.name}`}
                  title="试听当前参考录音"
                  onClick={() => void toggleVoicePreview(voice)}
                >
                  {previewingVoiceId === voice.id ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {previewingVoiceId === voice.id ? "暂停" : "试听"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`管理 ${voice.name} 的参考录音`}
                  title="参考录音"
                  onClick={() => openSampleManager(voice)}
                >
                  <AudioLines className="h-4 w-4" />
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
          <Button size="sm" onClick={openClone}>
            克隆第一个声音
          </Button>
        </GlassCard>
      )}

      <Modal
        open={cloneOpen}
        title="克隆声音"
        description="准备一段 3–30 秒的清晰单人录音；录音原文只有完全对应时再填写。"
        onClose={closeClone}
        footer={
          <>
            <Button variant="ghost" onClick={closeClone}>
              取消
            </Button>
            <Button
              disabled={!voiceName.trim() || !sampleToken || busy}
              onClick={() => void createVoice()}
            >
              <Mic2 className="h-4 w-4" />
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
              <strong title={sampleName || "选择一段人声录音"}>
                {sampleName || "选择一段人声录音"}
              </strong>
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
          {samplePreviewUrl ? (
            <div className="sample-audio-preview">
              <strong>先听一下，确认选对录音</strong>
              <audio controls preload="metadata" src={samplePreviewUrl} />
            </div>
          ) : null}
          <TextField
            label="声音名称"
            value={voiceName}
            maxLength={24}
            onChange={(event) => setVoiceName(event.target.value)}
          />
          <TextAreaField
            label="录音原文（可选）"
            hint={`${referenceText.length} / 1,000`}
            value={referenceText}
            maxLength={1_000}
            placeholder="只有能完整、准确对应录音时再填写"
            onChange={(event) => setReferenceText(event.target.value)}
          />
          <p className="field-footnote">
            留空也能克隆。填写准确原文后，才可以使用 VoxCPM2 的极致克隆。
          </p>
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
        open={Boolean(sampleVoice)}
        title={`${sampleVoice?.name ?? "声音"}的参考录音`}
        description="标记为“当前使用”的录音会用于配音，可以随时切换。"
        onClose={() => {
          if (!managedSampleBusy) setSampleVoice(null);
        }}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={managedSampleBusy}
              onClick={() => setSampleVoice(null)}
            >
              完成
            </Button>
            <Button
              disabled={
                !managedSampleToken ||
                managedSampleBusy ||
                (sampleVoice?.referenceSamples?.length ?? 1) >= 5
              }
              onClick={() => void addManagedSample()}
            >
              <Plus className="h-4 w-4" />
              {managedSampleBusy ? "正在保存…" : "添加并选中"}
            </Button>
          </>
        }
      >
        <div className="voice-sample-manager">
          <div className="voice-sample-list">
            {(sampleVoice?.referenceSamples ?? []).map((sample) => (
              <div key={sample.id} data-active={sample.active}>
                <span className="voice-sample-list__icon">
                  <AudioLines className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <strong title={sample.name}>{sample.name}</strong>
                  <small>{sample.active ? "当前使用" : "备用录音"}</small>
                </span>
                {sample.active ? (
                  <StatusBadge tone="success">已选中</StatusBadge>
                ) : (
                  <button
                    type="button"
                    disabled={managedSampleBusy}
                    onClick={() => void selectManagedSample(sample.id)}
                  >
                    使用
                  </button>
                )}
                <button
                  type="button"
                  className="voice-sample-remove"
                  aria-label={`删除参考录音 ${sample.name}`}
                  disabled={
                    managedSampleBusy ||
                    (sampleVoice?.referenceSamples?.length ?? 1) <= 1
                  }
                  onClick={() =>
                    void removeManagedSample(sample.id, sample.name)
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {(sampleVoice?.referenceSamples?.length ?? 1) < 5 ? (
            <>
              <div
                className="clone-upload"
                data-dragging={managedSampleDragging}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (event.dataTransfer.types.includes("Files")) {
                    setManagedSampleDragging(true);
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  ) {
                    setManagedSampleDragging(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setManagedSampleDragging(false);
                  const file = event.dataTransfer.files.item(0);
                  if (file) {
                    void loadManagedSample(
                      desktopApi.voices.selectDroppedSample(file),
                    );
                  }
                }}
              >
                <span className="clone-upload__icon">
                  {managedSampleName ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Upload className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <strong title={managedSampleName || "添加另一段参考录音"}>
                    {managedSampleName || "添加另一段参考录音"}
                  </strong>
                  <p>点击选择或直接拖入音频。</p>
                </div>
                <button
                  type="button"
                  className="file-button"
                  disabled={managedSampleBusy}
                  onClick={() =>
                    void loadManagedSample(desktopApi.voices.selectSample())
                  }
                >
                  选择音频
                </button>
              </div>
              {managedSamplePreviewUrl ? (
                <div className="sample-audio-preview">
                  <strong>确认这段录音</strong>
                  <audio
                    controls
                    preload="metadata"
                    src={managedSamplePreviewUrl}
                  />
                </div>
              ) : null}
              <TextAreaField
                label="录音原文（可选）"
                hint={`${managedReferenceText.length} / 1,000`}
                value={managedReferenceText}
                maxLength={1_000}
                placeholder="只有能完整、准确对应录音时再填写"
                onChange={(event) =>
                  setManagedReferenceText(event.target.value)
                }
              />
              {managedSampleQuality ? (
                <div className="voice-quality-checks">
                  {managedSampleQuality.checks.map((check) => (
                    <StatusBadge key={check.code} tone={check.tone}>
                      {check.label}
                    </StatusBadge>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="voice-sample-limit">
              已保存 5 段参考录音；删除不用的录音后可以继续添加。
            </p>
          )}
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
