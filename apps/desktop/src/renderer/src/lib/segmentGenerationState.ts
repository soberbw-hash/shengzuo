import type {
  GenerationTask,
  ProjectKind,
} from "@ai-voice-studio/shared-types";

export type SegmentGenerationState =
  | "pending"
  | "processing"
  | "generated"
  | "failed";

export const SEGMENT_GENERATION_STATE_LABEL: Record<
  SegmentGenerationState,
  string
> = {
  pending: "待生成",
  processing: "正在生成",
  generated: "已生成",
  failed: "生成失败",
};

interface SegmentTaskSelection {
  projectId: string;
  kind: ProjectKind;
  totalSegments: number;
  projectUpdatedAt: string;
}

const parseTimestamp = (value: string): number => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const findLatestSegmentGenerationTask = (
  tasks: GenerationTask[],
  selection: SegmentTaskSelection,
): GenerationTask | undefined => {
  const projectUpdatedAt = parseTimestamp(selection.projectUpdatedAt);
  return tasks
    .filter(
      (task) =>
        !task.preview &&
        task.projectId === selection.projectId &&
        task.kind === selection.kind &&
        task.totalSegments === selection.totalSegments &&
        parseTimestamp(task.createdAt) >= projectUpdatedAt,
    )
    .sort(
      (left, right) =>
        parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt) ||
        parseTimestamp(right.updatedAt) - parseTimestamp(left.updatedAt),
    )[0];
};

const parseSavedSegmentCount = (message: string): number | undefined => {
  const match = /已保存\s*(\d+)\s*\/\s*(\d+)\s*句/u.exec(message);
  return match ? Number(match[1]) : undefined;
};

export const resolveSegmentGenerationState = (
  task: GenerationTask | undefined,
  segmentIndex: number,
): SegmentGenerationState => {
  if (!task || segmentIndex < 0 || segmentIndex >= task.totalSegments) {
    return "pending";
  }

  const oneBasedIndex = segmentIndex + 1;

  if (task.status === "completed") return "generated";

  if (task.status === "running") {
    if (task.message.includes("正在合并音频")) return "generated";
    if (
      task.message.includes("已经生成") &&
      oneBasedIndex <= task.currentSegment
    ) {
      return "generated";
    }
    if (oneBasedIndex < task.currentSegment) return "generated";
    if (
      /正在生成第\s*\d+\s*\/\s*\d+\s*句/u.test(task.message) &&
      oneBasedIndex === task.currentSegment &&
      task.currentSegment > 0
    ) {
      return "processing";
    }
    return "pending";
  }

  if (task.status === "failed") {
    const savedSegments = parseSavedSegmentCount(task.message);
    if (savedSegments !== undefined) {
      if (oneBasedIndex <= savedSegments) return "generated";
      if (
        savedSegments < task.totalSegments &&
        task.errorCode !== "TASK_PREFLIGHT_FAILED" &&
        task.currentSegment === savedSegments + 1 &&
        oneBasedIndex === task.currentSegment
      ) {
        return "failed";
      }
      return "pending";
    }

    if (oneBasedIndex < task.currentSegment) return "generated";
    if (
      task.errorCode !== "TASK_PREFLIGHT_FAILED" &&
      task.currentSegment > 0 &&
      oneBasedIndex === task.currentSegment
    ) {
      return "failed";
    }
    return "pending";
  }

  if (task.status === "canceled" || task.status === "queued") {
    return task.currentSegment > 0 && oneBasedIndex < task.currentSegment
      ? "generated"
      : "pending";
  }

  return "pending";
};
