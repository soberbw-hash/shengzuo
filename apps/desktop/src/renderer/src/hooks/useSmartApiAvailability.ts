import { useCallback, useEffect, useState } from "react";

import type { SmartApiConfig } from "@ai-voice-studio/shared-types";

import { desktopApi } from "../lib/desktopApi";

export type SmartApiAvailability =
  | "loading"
  | "configured"
  | "missing"
  | "missing-key"
  | "key-error"
  | "error";

const configChangedEvent = "shengzuo:smart-api-config-changed";

const availabilityFromConfig = (
  config: SmartApiConfig,
): SmartApiAvailability => {
  if (!config.enabled || !config.baseUrl.trim() || !config.model.trim()) {
    return "missing";
  }
  try {
    const host = new URL(config.baseUrl).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return "configured";
    }
  } catch {
    return "missing";
  }
  if (config.apiKeyStatus === "unreadable") return "key-error";
  return config.hasApiKey ? "configured" : "missing-key";
};

export const announceSmartApiConfigChanged = (config: SmartApiConfig): void => {
  window.dispatchEvent(
    new CustomEvent<SmartApiConfig>(configChangedEvent, { detail: config }),
  );
};

export const useSmartApiAvailability = (): {
  status: SmartApiAvailability;
  configured: boolean;
} => {
  const [status, setStatus] = useState<SmartApiAvailability>("loading");

  const refresh = useCallback(async () => {
    try {
      const config = await desktopApi.smart.getConfig();
      setStatus(availabilityFromConfig(config));
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handleFocus = () => void refresh();
    const handleConfigChanged = (event: Event) => {
      const config = (event as CustomEvent<SmartApiConfig>).detail;
      setStatus(config ? availabilityFromConfig(config) : "error");
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener(configChangedEvent, handleConfigChanged);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(configChangedEvent, handleConfigChanged);
    };
  }, [refresh]);

  return { status, configured: status === "configured" };
};
