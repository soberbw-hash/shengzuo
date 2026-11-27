import {
  MODEL_CATALOG,
  MODEL_SEGMENT_LIMIT_NOTE,
  isModelId,
  type ModelId,
} from "@ai-voice-studio/shared-types";
import { SelectField } from "@ai-voice-studio/ui";

const modelOptionLabel = (model: (typeof MODEL_CATALOG)[number]) =>
  `${model.name} · ${model.taskLabel}`;

export const GenerationModelSelect = ({
  modelId,
  onChange,
}: {
  modelId: ModelId;
  onChange: (modelId: ModelId) => void;
}) => {
  const selectedModel = MODEL_CATALOG.find((model) => model.id === modelId);
  return (
    <div className="generation-model-select">
      <SelectField
        label="本地模型"
        aria-label="本地模型"
        title={selectedModel ? modelOptionLabel(selectedModel) : undefined}
        value={modelId}
        onChange={(event) => {
          if (isModelId(event.target.value)) onChange(event.target.value);
        }}
      >
        {MODEL_CATALOG.map((model) => (
          <option key={model.id} value={model.id}>
            {modelOptionLabel(model)}
          </option>
        ))}
      </SelectField>
    </div>
  );
};

export const GenerationModelLimit = ({ modelId }: { modelId: ModelId }) => {
  const note = MODEL_SEGMENT_LIMIT_NOTE[modelId];
  return note ? (
    <p className="generation-model-limit" role="status">
      {note}
    </p>
  ) : null;
};
