import { Minus, Square, X } from "lucide-react";

import { APP_NAME } from "@ai-voice-studio/shared-types";
import { IconButton, StatusBadge } from "@ai-voice-studio/ui";

import { desktopApi } from "../lib/desktopApi";
import { BrandMark } from "./BrandMark";

export const WindowTitleBar = () => (
  <div className="window-titlebar drag-region">
    <div className="flex min-w-0 items-center gap-3">
      <BrandMark compact />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-bold tracking-[-0.01em] text-[#172235]">
          {APP_NAME}
        </div>
      </div>
      <StatusBadge tone="success" className="ml-1">
        本地版
      </StatusBadge>
    </div>
    <div className="no-drag flex items-center gap-1">
      <IconButton
        aria-label="最小化窗口"
        onClick={() => void desktopApi.window.minimize()}
      >
        <Minus className="h-4 w-4" />
      </IconButton>
      <IconButton
        aria-label="最大化或还原窗口"
        onClick={() => void desktopApi.window.toggleMaximize()}
      >
        <Square className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton
        aria-label="关闭窗口"
        className="hover:!border-[#ffd2d2] hover:!bg-[#fff1f1] hover:!text-[#d83b3b]"
        onClick={() => void desktopApi.window.close()}
      >
        <X className="h-4 w-4" />
      </IconButton>
    </div>
  </div>
);
