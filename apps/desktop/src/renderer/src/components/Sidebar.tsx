import { NavLink } from "react-router-dom";

import { cn } from "@ai-voice-studio/ui";

import {
  helpRoute,
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
        {compact ? null : <small>{route.caption}</small>}
      </span>
    </NavLink>
  );
};

export const Sidebar = () => {
  return (
    <aside className="sidebar">
      <nav className="space-y-1" aria-label="主导航">
        {primaryRoutes.map((route) => (
          <RouteLink key={route.path} route={route} />
        ))}

        <div className="nav-section-label">更多功能</div>
        <div className="space-y-1">
          {toolRoutes.map((route) => (
            <RouteLink key={route.path} route={route} compact />
          ))}
        </div>
      </nav>

      <div className="mt-auto space-y-1">
        <RouteLink route={settingsRoute} compact />
        <RouteLink route={helpRoute} compact />
      </div>
    </aside>
  );
};
