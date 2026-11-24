import type { RuntimeMode } from "./lexverse-data";

const rawBase = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
const trimmedBase = rawBase.replace(/^\/+|\/+$/g, "");

export const RAW_BASE_PATH = rawBase;
export const BASE_PATH = trimmedBase ? `/${trimmedBase}` : "";

export const BUILD_MODE: RuntimeMode =
  process.env.NEXT_PUBLIC_BUILD_MODE === "static" ? "static" : "serve";

export function withBasePath(pathStr: string): string {
  if (!pathStr) return BASE_PATH || "/";
  if (/^(https?:)?\/\//i.test(pathStr) || pathStr.startsWith("data:") || pathStr.startsWith("blob:")) {
    return pathStr;
  }
  const clean = pathStr.replace(/^\.\//, "").replace(/^\/+/, "");
  return `${BASE_PATH}/${clean}`;
}
