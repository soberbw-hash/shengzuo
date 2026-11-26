import { NavLink } from "react-router-dom";

import { cn } from "@ai-voice-studio/ui";

import {
  primaryRoutes,
  settingsRoute,
  toolRoutes,
  type AppRoute,
} from "../routes";

const RouteLink = ({
  route,
  compact = false,
}: {
  route: AppRoute;
  compact?: boolean;
}) => {
  const Icon = route.icon;
  return (
    <NavLink
      to={route.path}
      end={route.path === "/"}
      title={`${route.label} · ${route.caption}`}
      className={({ isActive }) =>
        cn(
          "nav-item",
          compact && "nav-item--compact",
          isActive && "nav-item--active",
        )
      }
    >
      <span className="nav-item__icon">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <strong>{route.label}</strong>
        {compact ? null : <small title={route.caption}>{route.caption}</small>}
      </span>
    </NavLink>
  );
};

export const Sidebar = () => (
  <aside className="sidebar">
    <nav className="space-y-1" aria-label="主导航">
      <div className="nav-section-label">常用</div>
      <div className="space-y-1">
        {primaryRoutes
          .filter((route) => route.id === "generate" || route.id === "voices")
          .map((route) => (
            <RouteLink
              key={route.path}
              route={
                route.id === "generate"
                  ? { ...route, label: "生成语音" }
                  : { ...route, label: "克隆与管理声音" }
              }
            />
          ))}
      </div>

      <div className="nav-section-label">更多创作</div>
      <div className="space-y-1">
        {primaryRoutes
          .filter(
            (route) => route.id === "subtitles" || route.id === "dialogue",
          )
          .map((route) => (
            <RouteLink key={route.path} route={route} />
          ))}
      </div>
      <div className="nav-section-label">管理</div>
      <div className="space-y-1">
        {primaryRoutes
          .filter((route) => route.id === "projects")
          .map((route) => (
            <RouteLink key={route.path} route={route} />
          ))}
      </div>

      <div className="space-y-1">
        {toolRoutes.map((route) => (
          <RouteLink key={route.path} route={route} />
        ))}
      </div>
    </nav>

    <div className="mt-auto space-y-1">
      <RouteLink route={settingsRoute} compact />
    </div>
  </aside>
);
