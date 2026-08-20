import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("声作无法找到界面根节点。");

const renderApp = () => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

const fontSet = document.fonts;
if (fontSet) {
  const fallback = new Promise<void>((resolve) => {
    window.setTimeout(resolve, 1_200);
  });
  void Promise.race([
    fontSet.load('400 14px "Shengzuo HarmonyOS Sans"').then(() => undefined),
    fallback,
  ]).finally(renderApp);
} else {
  renderApp();
}
