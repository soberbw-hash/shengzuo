import { useCallback, useEffect, useState } from "react";

import { desktopApi } from "../lib/desktopApi";

export type SmartApiAvailability = "loading" | "configured" | "missing";

export const useSmartApiAvailability = (): {
  status: SmartApiAvailability;
  configured: boolean;
} => {
  const [status, setStatus] = useState<SmartApiAvailability>("loading");

  const refresh = useCallback(async () => {
    try {
      const config = await desktopApi.smart.getConfig();
      setStatus(
        config.baseUrl.trim() && config.model.trim() ? "configured" : "missing",
      );
    } catch {
      setStatus("missing");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handleFocus = () => void refresh();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  return { status, configured: status === "configured" };
};
