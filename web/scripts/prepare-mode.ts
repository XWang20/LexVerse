import fs from "node:fs";
import path from "node:path";

const isStatic = process.argv.includes("--static");

const webRoot = path.resolve(import.meta.dir, "..");
const apiRoot = path.join(webRoot, "src/app/api");
const stashRoot = path.join(webRoot, ".api-stash");

const SERVER_ONLY_SUBDIRS = ["live", "jobs"];

if (isStatic) {
  fs.mkdirSync(stashRoot, { recursive: true });
  for (const dir of SERVER_ONLY_SUBDIRS) {
    const src = path.join(apiRoot, dir);
    const dst = path.join(stashRoot, dir);
    if (fs.existsSync(src)) {
      fs.rmSync(dst, { recursive: true, force: true });
      fs.renameSync(src, dst);
    }
  }
} else {
  if (fs.existsSync(stashRoot)) {
    for (const dir of SERVER_ONLY_SUBDIRS) {
      const src = path.join(stashRoot, dir);
      const dst = path.join(apiRoot, dir);
      if (fs.existsSync(src)) {
        fs.rmSync(dst, { recursive: true, force: true });
        fs.renameSync(src, dst);
      }
    }
    fs.rmSync(stashRoot, { recursive: true, force: true });
  }
}
