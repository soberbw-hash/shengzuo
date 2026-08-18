import { create } from "zustand";

import {
  type AudioResult,
  type Emotion,
  type EngineSnapshot,
  type GenerationProject,
  type GenerationPresetId,
  type GenerationTask,
  type Language,
  type ModelId,
  type OutputFormat,
  type PronunciationRule,
  type VoiceProfile,
} from "@ai-voice-studio/shared-types";
import type { BadgeTone } from "@ai-voice-studio/ui";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: BadgeTone;
}

const initialVoiceProfiles: VoiceProfile[] = [];

interface StudioState {
  selectedModel: ModelId;
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
  setActiveVoicePreview: (voiceId: string | null) => void;
  pushToast: (toast: Omit<ToastMessage, "id">) => void;
  dismissToast: (id: string) => void;
}

const createToastId = (): string =>
  `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

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
  engine: null,
  engines: {},
  results: [],
  projects: [],
  tasks: [],
  activeVoicePreview: null,
  toasts: [],
  setSelectedModel: (selectedModel) =>
    set((state) => ({
      selectedModel,
      engine: state.engines[selectedModel] ?? null,
    })),
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
  setText: (text) => set({ text }),
  setExpression: (expression) => set({ expression }),
  setLanguage: (language) => set({ language }),
  setEmotion: (emotion) => set({ emotion }),
  setSpeed: (speed) => set({ speed }),
  setVolume: (volume) => set({ volume }),
  setFormat: (format) => set({ format }),
  setPresetId: (presetId) => set({ presetId }),
  setPronunciationRules: (pronunciationRules) => set({ pronunciationRules }),
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
  setActiveVoicePreview: (activeVoicePreview) => set({ activeVoicePreview }),
  pushToast: (toast) =>
    set((state) => {
      const duplicate = state.toasts.find(
        (item) =>
          item.title === toast.title && item.description === toast.description,
      );
      if (duplicate) return state;
      return {
        toasts: [...state.toasts.slice(-2), { ...toast, id: createToastId() }],
      };
    }),
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));
