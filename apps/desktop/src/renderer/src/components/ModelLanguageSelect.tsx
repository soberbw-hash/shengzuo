import { Check, ChevronDown, LockKeyhole } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  LANGUAGE_OPTIONS,
  MODEL_CATALOG,
  MODEL_LANGUAGE_SUPPORT,
  type Language,
  type ModelId,
} from "@ai-voice-studio/shared-types";

interface ModelLanguageSelectProps {
  modelId: ModelId;
  value: Language;
  onChange: (language: Language) => void;
  label?: string;
}

const groupLabels = {
  common: "常用语言",
  dialect: "中文方言",
  more: "更多语言",
} as const;

const requiredModelFor = (language: Language) =>
  MODEL_CATALOG.find((model) =>
    MODEL_LANGUAGE_SUPPORT[model.id].includes(language),
  );

export const ModelLanguageSelect = ({
  modelId,
  value,
  onChange,
  label = "语言与方言",
}: ModelLanguageSelectProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected =
    LANGUAGE_OPTIONS.find((language) => language.id === value) ??
    LANGUAGE_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="model-language-select" ref={rootRef}>
      <span className="field-label">{label}</span>
      <button
        type="button"
        className="model-language-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={menuId}
          className="model-language-select__menu"
          role="listbox"
          aria-label={label}
        >
          {(Object.keys(groupLabels) as (keyof typeof groupLabels)[]).map(
            (group) => (
              <div className="model-language-select__group" key={group}>
                <p>{groupLabels[group]}</p>
                {LANGUAGE_OPTIONS.filter(
                  (language) => language.group === group,
                ).map((language) => {
                  const supported = MODEL_LANGUAGE_SUPPORT[modelId].includes(
                    language.id,
                  );
                  const requiredModel = requiredModelFor(language.id);
                  const requirement = requiredModel
                    ? `需要切换到 ${requiredModel.name} 模型`
                    : "当前模型暂不支持";
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={language.id === value}
                      aria-disabled={!supported}
                      className="model-language-select__option"
                      key={language.id}
                      onClick={() => {
                        if (!supported) return;
                        onChange(language.id);
                        setOpen(false);
                      }}
                    >
                      <span>{language.label}</span>
                      {supported ? (
                        language.id === value ? (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        ) : null
                      ) : (
                        <span
                          className="model-language-select__lock"
                          aria-label={requirement}
                        >
                          <LockKeyhole className="h-3.5 w-3.5" />
                          <span className="model-language-select__requirement">
                            {requirement}
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
};
