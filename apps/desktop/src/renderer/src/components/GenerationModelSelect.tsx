import {
  MODEL_CATALOG,
  MODEL_SEGMENT_LIMIT_NOTE,
  isModelId,
  type ModelId,
} from "@ai-voice-studio/shared-types";
import { SelectField } from "@ai-voice-studio/ui";

export const GenerationModelSelect = ({
  modelId,
  onChange,
}: {
  modelId: ModelId;
  onChange: (modelId: ModelId) => void;
}) => (
  <div className="generation-model-select">
    <SelectField
      label="本地模型"
      aria-label="本地模型"
      title={MODEL_CATALOG.find((model) => model.id === modelId)?.name}
      value={modelId}
      onChange={(event) => {
        if (isModelId(event.target.value)) onChange(event.target.value);
      }}
    >
      {MODEL_CATALOG.map((model) => (
        <option key={model.id} value={model.id} title={model.name}>
          {model.taskLabel}
        </option>
      ))}
    </SelectField>
  </div>
);

export const GenerationModelLimit = ({ modelId }: { modelId: ModelId }) => {
  const note = MODEL_SEGMENT_LIMIT_NOTE[modelId];
  return note ? (
    <p className="generation-model-limit" role="status">
      {note}
    </p>
  ) : null;
};
