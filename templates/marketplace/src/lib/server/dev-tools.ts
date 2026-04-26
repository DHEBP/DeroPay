import { isProduction } from "./env";

export function devToolsEnabled(): boolean {
  if (isProduction()) return false;
  return process.env.ENABLE_DEV_TOOLS !== "false";
}
