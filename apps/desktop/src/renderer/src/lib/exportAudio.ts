import {
  MODEL_CATALOG,
  renderExportFileStem,
  type AudioResult,
  type ExportAudioResult,
} from "@ai-voice-studio/shared-types";

import { desktopApi } from "./desktopApi";

export const exportAudioResult = async (
  result: AudioResult,
): Promise<ExportAudioResult> => {
  const settings = await desktopApi.audio.getExportNamingSettings();
  const modelName = MODEL_CATALOG.find(
    (model) => model.id === result.modelId,
  )?.name;
  const fileStem = renderExportFileStem(settings.template, {
    title: result.title,
    kind: result.kind,
    modelName,
    createdAt: result.createdAt,
  });
  return desktopApi.audio.exportResult({
    resultId: result.id,
    suggestedName: `${fileStem}.${result.format}`,
    format: result.format,
  });
};
