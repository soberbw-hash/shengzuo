export interface WindowSize {
  width: number;
  height: number;
}

export interface MainWindowSizing extends WindowSize {
  minWidth: number;
  minHeight: number;
}

const PREFERRED_WIDTH = 1840;
const PREFERRED_HEIGHT = 1024;
const REQUIRED_WORKFLOW_WIDTH = 1280;
const REQUIRED_WORKFLOW_HEIGHT = 720;
const WORK_AREA_MARGIN = 16;

export const getMainWindowSizing = (workArea: WindowSize): MainWindowSizing => {
  const availableWidth = Math.max(1, workArea.width - WORK_AREA_MARGIN);
  const availableHeight = Math.max(1, workArea.height - WORK_AREA_MARGIN);
  const width = Math.min(PREFERRED_WIDTH, availableWidth);
  const height = Math.min(PREFERRED_HEIGHT, availableHeight);
  return {
    width,
    height,
    minWidth: Math.min(REQUIRED_WORKFLOW_WIDTH, width),
    minHeight: Math.min(REQUIRED_WORKFLOW_HEIGHT, height),
  };
};
