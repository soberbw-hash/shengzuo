import path from "node:path";

import { checkAndRepairSystem } from "../apps/desktop/src/main/systemCheck";
import { detectHardware } from "../packages/hardware-detector/src/index";

const main = async () => {
  const localAppData = process.env.LOCALAPPDATA ?? process.env.APPDATA;
  const appData = process.env.APPDATA ?? localAppData;
  if (!localAppData || !appData) {
    throw new Error("Windows 数据目录不可用。不可执行系统检查。");
  }
  const modelLibraryRoot =
    process.env.SHENGZUO_MODEL_LIBRARY?.trim() ||
    path.join(localAppData, "声作模型库");

  const report = await checkAndRepairSystem({
    modelLibraryRoot,
    userDataRoot: path.join(appData, "声作"),
    enginePluginsRoot: path.resolve("engines"),
    hardware: await detectHardware(),
    snapshots: [],
    guideWasMissing: false,
  });

  console.log(JSON.stringify(report));
  if (report.overall !== "healthy") process.exitCode = 1;
};

void main();
