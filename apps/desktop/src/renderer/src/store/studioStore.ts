import { create } from "zustand";

import {
  normalizeGenerationControls,
  isAvailableModelId,
  resolveModelLanguage,
  getModelGenerationCapabilities,
  type AudioResult,
  type AvailableModelId,
  type Emotion,
  type EngineSnapshot,
  type GenerationProject,
  type GenerationPresetId,
  type GenerationTask,
  type Language,
  type ModelId,
  type OutputFormat,
  type PronunciationRule,
  type SmartPerformanceSegment,
  type VoiceProfile,
} from "@ai-voice-studio/shared-types";
import type { BadgeTone } from "@ai-voice-studio/ui";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: BadgeTone;
  durationMs?: number | null;
  dedupeKey?: string;
  replaceKey?: string;
  action?: {
    label: string;
    to: string;
  };
}

const initialVoiceProfiles: VoiceProfile[] = [];

interface StudioState {
  selectedModel: AvailableModelId;
  selectedVoice: string;
  voiceProfiles: VoiceProfile[];
  text: string;
  expression: string;
  language: Language;
  emotion: Emotion;
  speed: number;
  volume: number;
  format: OutputFormat;
  presetId: GenerationPresetId;
  pronunciationRules: PronunciationRule[];
  performanceSegments: SmartPerformanceSegment[];
  engine: EngineSnapshot | null;
  engines: Partial<Record<ModelId, EngineSnapshot>>;
  results: AudioResult[];
  projects: GenerationProject[];
  tasks: GenerationTask[];
  activeVoicePreview: string | null;
  toasts: ToastMessage[];
  setSelectedModel: (modelId: ModelId) => void;
  setSelectedVoice: (voiceId: string) => void;
  setVoiceProfiles: (voices: VoiceProfile[]) => void;
  addVoiceProfile: (voice: VoiceProfile) => void;
  updateVoiceProfile: (voice: VoiceProfile) => void;
  removeVoiceProfile: (voiceId: string) => void;
  setText: (text: string) => void;
  setExpression: (expression: string) => void;
  setLanguage: (language: Language) => void;
  setEmotion: (emotion: Emotion) => void;
  setSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  setFormat: (format: OutputFormat) => void;
  setPresetId: (presetId: GenerationPresetId) => void;
  setPronunciationRules: (rules: PronunciationRule[]) => void;
  setPerformanceSegments: (segments: SmartPerformanceSegment[]) => void;
  setEngine: (engine: EngineSnapshot) => void;
  setEngines: (engines: EngineSnapshot[]) => void;
  setResults: (results: AudioResult[]) => void;
  addResult: (result: AudioResult) => void;
  updateResult: (result: AudioResult) => void;
  removeResult: (resultId: string) => void;
  setProjects: (projects: GenerationProject[]) => void;
  updateProject: (project: GenerationProject) => void;
  removeProject: (projectId: string) => void;
  setTasks: (tasks: GenerationTask[]) => void;
  updateTask: (task: GenerationTask) => void;
  removeTask: (taskId: string) => void;
  setActiveVoicePreview: (voiceId: string | null) => void;
  pushToast: (toast: Omit<ToastMessage, "id">) => void;
  dismissToast: (id: string) => void;
}

const createToastId = (): string =>
  `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const modelContext = (
  state: StudioState,
  modelId: ModelId,
  requestedLanguage: Language,
) => {
  const language = resolveModelLanguage(modelId, requestedLanguage);
  return {
    language,
    ...normalizeGenerationControls({ ...state, modelId, language }),
    performanceSegments: [],
  };
};

export const useStudioStore = create<StudioState>((set) => ({
  selectedModel: "voxcpm2",
  selectedVoice: "",
  voiceProfiles: initialVoiceProfiles,
  text: "",
  expression: "自然、清晰",
  language: "auto",
  emotion: "自然",
  speed: 1,
  volume: 100,
  format: "mp3",
  presetId: "natural",
  pronunciationRules: [],
  performanceSegments: [],
  engine: null,
  engines: {},
  results: [],
  projects: [],
  tasks: [],
  activeVoicePreview: null,
  toasts: [],
  setSelectedModel: (modelId) =>
    set((state) => {
      const selectedModel = isAvailableModelId(modelId)
        ? modelId
        : state.selectedModel;
      return {
        ...modelContext(state, selectedModel, state.language),
        selectedModel,
        engine: state.engines[selectedModel] ?? null,
      };
    }),
  setSelectedVoice: (selectedVoice) => set({ selectedVoice }),
  setVoiceProfiles: (voiceProfiles) => set({ voiceProfiles }),
  addVoiceProfile: (voice) =>
    set((state) => ({ voiceProfiles: [voice, ...state.voiceProfiles] })),
  updateVoiceProfile: (voice) =>
    set((state) => ({
      voiceProfiles: state.voiceProfiles.map((item) =>
        item.id === voice.id ? voice : item,
      ),
    })),
  removeVoiceProfile: (voiceId) =>
    set((state) => {
      const voiceProfiles = state.voiceProfiles.filter(
        (voice) => voice.id !== voiceId,
      );
      return {
        voiceProfiles,
        selectedVoice:
          state.selectedVoice === voiceId
            ? (voiceProfiles[0]?.id ?? "")
            : state.selectedVoice,
      };
    }),
  setText: (text) => set({ text, performanceSegments: [] }),
  setExpression: (expression) =>
    set((state) => ({
      expression: getModelGenerationCapabilities(
        state.selectedModel,
        state.language,
      ).expression
        ? expression
        : "自然、清晰",
    })),
  setLanguage: (language) =>
    set((state) => modelContext(state, state.selectedModel, language)),
  setEmotion: (emotion) =>
    set((state) => ({
      emotion: getModelGenerationCapabilities(
        state.selectedModel,
        state.language,
      ).emotion
        ? emotion
        : "自然",
    })),
  setSpeed: (speed) => set({ speed }),
  setVolume: (volume) => set({ volume }),
  setFormat: (format) => set({ format }),
  setPresetId: (presetId) =>
    set((state) => ({
      presetId: normalizeGenerationControls({
        ...state,
        modelId: state.selectedModel,
        presetId,
      }).presetId,
    })),
  setPronunciationRules: (pronunciationRules) => set({ pronunciationRules }),
  setPerformanceSegments: (performanceSegments) => set({ performanceSegments }),
  setEngine: (engine) =>
    set((state) => ({
      engines: { ...state.engines, [engine.modelId]: engine },
      engine: engine.modelId === state.selectedModel ? engine : state.engine,
      results:
        engine.result &&
        !engine.result.preview &&
        !state.results.some((item) => item.id === engine.result?.id)
          ? [engine.result, ...state.results]
          : state.results,
    })),
  setEngines: (engines) =>
    set((state) => {
      const byModel: Partial<Record<ModelId, EngineSnapshot>> = {
        ...state.engines,
      };
      for (const engine of engines) byModel[engine.modelId] = engine;
      return {
        engines: byModel,
        engine: byModel[state.selectedModel] ?? null,
      };
    }),
  setResults: (results) => set({ results }),
  addResult: (result) =>
    set((state) => ({
      results: [
        result,
        ...state.results.filter((item) => item.id !== result.id),
      ],
    })),
  updateResult: (result) =>
    set((state) => ({
      results: state.results.map((item) =>
        item.id === result.id ? result : item,
      ),
    })),
  removeResult: (resultId) =>
    set((state) => ({
      results: state.results.filter((item) => item.id !== resultId),
    })),
  setProjects: (projects) => set({ projects }),
  updateProject: (project) =>
    set((state) => ({
      projects: [
        project,
        ...state.projects.filter((item) => item.id !== project.id),
      ],
    })),
  removeProject: (projectId) =>
    set((state) => ({
      projects: state.projects.filter((project) => project.id !== projectId),
    })),
  setTasks: (tasks) => set({ tasks }),
  updateTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks.filter((item) => item.id !== task.id)],
    })),
  removeTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((item) => item.id !== taskId),
    })),
  setActiveVoicePreview: (activeVoicePreview) => set({ activeVoicePreview }),
  pushToast: (toast) =>
    set((state) => {
      const duplicate = state.toasts.find(
        (item) =>
          (toast.dedupeKey && item.dedupeKey === toast.dedupeKey) ||
          (!toast.dedupeKey &&
            item.title === toast.title &&
            item.description === toast.description),
      );
      if (duplicate) return state;
      const remainingToasts = toast.replaceKey
        ? state.toasts.filter((item) => item.replaceKey !== toast.replaceKey)
        : state.toasts;
      return {
        toasts: [
          ...remainingToasts.slice(-2),
          { ...toast, id: createToastId() },
        ],
      };
    }),
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));
