import type { ComponentType } from "react";

import { DialoguePage } from "./pages/DialoguePage";
import { GeneratePage } from "./pages/GeneratePage";
import { ModelsPage } from "./pages/ModelsPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SubtitlesPage } from "./pages/SubtitlesPage";
import { VoicesPage } from "./pages/VoicesPage";
import { appRoutes, type AppFeatureId, type AppRoute } from "./routes";

const featureComponents: Record<AppFeatureId, ComponentType> = {
  generate: GeneratePage,
  subtitles: SubtitlesPage,
  dialogue: DialoguePage,
  voices: VoicesPage,
  projects: ProjectsPage,
  models: ModelsPage,
  settings: SettingsPage,
};

export const featureRegistry: Array<AppRoute & { component: ComponentType }> =
  appRoutes.map((route) => ({
    ...route,
    component: featureComponents[route.id],
  }));
