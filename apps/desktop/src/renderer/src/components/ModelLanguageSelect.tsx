import { Check, ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

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
  more: "其他外语",
} as const;

interface MenuPosition {
  left: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
  width: number;
}

export const ModelLanguageSelect = ({
  modelId,
  value,
  onChange,
  label = "语言与方言",
}: ModelLanguageSelectProps) => {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const options = LANGUAGE_OPTIONS.filter((language) =>
    MODEL_LANGUAGE_SUPPORT[modelId].includes(language.id),
  );
  const selected =
    options.find((language) => language.id === value) ?? LANGUAGE_OPTIONS[0];

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const edge = 12;
    const gap = 8;
    const width = Math.min(440, window.innerWidth - edge * 2);
    const left = Math.min(
      Math.max(rect.right - width, edge),
      window.innerWidth - width - edge,
    );
    const spaceAbove = rect.top - edge - gap;
    const spaceBelow = window.innerHeight - rect.bottom - edge - gap;
    const openDown = spaceBelow >= 280 || spaceBelow >= spaceAbove;
    const available = openDown ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(160, Math.min(390, available));

    setMenuPosition({
      left,
      maxHeight,
      width,
      ...(openDown
        ? { top: rect.bottom + gap }
        : { bottom: window.innerHeight - rect.top + gap }),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  return (
    <div className="model-language-select" ref={rootRef}>
      <span className="field-label">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className="model-language-select__trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        title={selected.label}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="model-language-select__menu"
              role="listbox"
              aria-label={label}
              style={menuPosition as CSSProperties | undefined}
            >
              <div className="model-language-select__legend">
                <strong
                  title={
                    MODEL_CATALOG.find((model) => model.id === modelId)?.name
                  }
                >
                  {MODEL_CATALOG.find((model) => model.id === modelId)?.name}
                </strong>
                <span>支持的语言与方言</span>
              </div>
              {(Object.keys(groupLabels) as (keyof typeof groupLabels)[])
                .filter((group) =>
                  options.some((language) => language.group === group),
                )
                .map((group) => (
                  <div className="model-language-select__group" key={group}>
                    <p>{groupLabels[group]}</p>
                    {options
                      .filter((language) => language.group === group)
                      .map((language) => {
                        return (
                          <button
                            type="button"
                            role="option"
                            aria-selected={language.id === value}
                            className="model-language-select__option"
                            key={language.id}
                            onClick={() => {
                              onChange(language.id);
                              setOpen(false);
                            }}
                          >
                            <span>{language.label}</span>
                            {language.id === value && (
                              <Check className="h-4 w-4" aria-hidden="true" />
                            )}
                          </button>
                        );
                      })}
                  </div>
                ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};
