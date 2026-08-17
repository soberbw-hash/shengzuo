import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("声作无法找到界面根节点。");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
