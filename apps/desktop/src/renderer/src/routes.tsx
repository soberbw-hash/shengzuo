import {
  AudioLines,
  Blocks,
  Captions,
  CircleHelp,
  FolderKanban,
  MessagesSquare,
  Settings2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export interface AppRoute {
  path: string;
  label: string;
  caption: string;
  icon: LucideIcon;
}

export const primaryRoutes: AppRoute[] = [
  { path: "/", label: "开始创作", caption: "单段快速配音", icon: AudioLines },
  {
    path: "/voices",
    label: "我的声音",
    caption: "克隆与管理",
    icon: UsersRound,
  },
  {
    path: "/projects",
    label: "项目与记录",
    caption: "续做与导出",
    icon: FolderKanban,
  },
];

export const toolRoutes: AppRoute[] = [
  {
    path: "/subtitles",
    label: "字幕配音",
    caption: "整稿逐句配音",
    icon: Captions,
  },
  {
    path: "/dialogue",
    label: "多人对话",
    caption: "多角色配音",
    icon: MessagesSquare,
  },
  {
    path: "/models",
    label: "本地引擎",
    caption: "高级功能",
    icon: Blocks,
  },
];

export const settingsRoute: AppRoute = {
  path: "/settings",
  label: "设置",
  caption: "存储与性能",
  icon: Settings2,
};

export const helpRoute: AppRoute = {
  path: "/help",
  label: "使用帮助",
  caption: "上手与排查",
  icon: CircleHelp,
};

export const appRoutes: AppRoute[] = [
  ...primaryRoutes,
  ...toolRoutes,
  settingsRoute,
  helpRoute,
];
