import {
  AudioLines,
  Blocks,
  Captions,
  FolderKanban,
  MessagesSquare,
  Settings2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
export type AppFeatureId =
  | "generate"
  | "subtitles"
  | "dialogue"
  | "voices"
  | "projects"
  | "models"
  | "settings";

export interface AppRoute {
  path: string;
  label: string;
  caption: string;
  icon: LucideIcon;
  id: AppFeatureId;
  area: "create" | "library" | "system";
}

export const primaryRoutes: AppRoute[] = [
  {
    path: "/",
    label: "单段配音",
    caption: "一段文字 · 一个声音",
    icon: AudioLines,
    id: "generate",
    area: "create",
  },
  {
    path: "/subtitles",
    label: "长稿配音",
    caption: "整篇文稿 · 逐句调整",
    icon: Captions,
    id: "subtitles",
    area: "create",
  },
  {
    path: "/dialogue",
    label: "多人对话",
    caption: "多个角色 · 分配声音",
    icon: MessagesSquare,
    id: "dialogue",
    area: "create",
  },
  {
    path: "/voices",
    label: "我的声音",
    caption: "克隆与管理",
    icon: UsersRound,
    id: "voices",
    area: "library",
  },
  {
    path: "/projects",
    label: "项目与记录",
    caption: "续做与导出",
    icon: FolderKanban,
    id: "projects",
    area: "library",
  },
];

export const toolRoutes: AppRoute[] = [
  {
    path: "/models",
    label: "本地模型",
    caption: "下载与管理",
    icon: Blocks,
    id: "models",
    area: "system",
  },
];

export const settingsRoute: AppRoute = {
  path: "/settings",
  label: "设置",
  caption: "存储与性能",
  icon: Settings2,
  id: "settings",
  area: "system",
};

export const appRoutes: AppRoute[] = [
  ...primaryRoutes,
  ...toolRoutes,
  settingsRoute,
];
