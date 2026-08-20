import {
  DEFAULT_EXPORT_NAMING_TEMPLATE,
  MODEL_CATALOG,
  renderExportFileStem,
  type AudioResult,
  type ExportAudioResult,
} from "@ai-voice-studio/shared-types";

import { desktopApi } from "./desktopApi";
import { isAutomaticTimeTitle, resolveResultTitle } from "./projectNaming";

export const exportAudioResult = async (
  result: AudioResult,
): Promise<ExportAudioResult> => {
  const settings = await desktopApi.audio.getExportNamingSettings();
  const modelName = MODEL_CATALOG.find(
    (model) => model.id === result.modelId,
  )?.name;
  const title = resolveResultTitle(
    undefined,
    result.title,
    result.createdAt,
    "配音",
  );
  const template =
    settings.template === DEFAULT_EXPORT_NAMING_TEMPLATE &&
    isAutomaticTimeTitle(title)
      ? "{日期}_{时间}"
      : settings.template;
  const fileStem = renderExportFileStem(template, {
    title,
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
