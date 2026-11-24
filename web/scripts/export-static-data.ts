import fs from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import {
  canRead,
  loadStoredTrialDetail,
  queryStoredTrials,
  resolveRoots,
  safeReadJson,
  safeReadText,
  scanCapabilitiesCatalog,
  scanHarborWorkspace,
  scanStorageOverview,
  truncateText,
} from "../src/lib/storage-scanner";
import type { StoredTrialDetail, StoredTrialIndexEntry } from "../src/lib/storage-types";

const { repoRoot: REPO_ROOT, upstreamRoot: UPSTREAM_ROOT } = resolveRoots();
const OUT_DIR = path.resolve(import.meta.dir, "../public/data");
const TRACES_OUT_DIR = path.join(OUT_DIR, "traces");

if (
  process.env.SKIP_DATA_EXPORT === "1" &&
  fs.existsSync(path.join(OUT_DIR, "lexverse-snapshot.json"))
) {
  console.log("[export-static-data] SKIP_DATA_EXPORT=1; reusing existing snapshot");
  process.exit(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.rmSync(TRACES_OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(TRACES_OUT_DIR, { recursive: true });

// 1. Reuse the exact same real storage scanner used by Serve APIs
const storageOverview = scanStorageOverview(true);
const exportedBundles = new Map<string, { fileName: string; detail: StoredTrialDetail }>();
const exportedTrialIndex: StoredTrialIndexEntry[] = [];

function toIndexEntry(detail: StoredTrialDetail, staticFile: string): StoredTrialIndexEntry {
  return {
    id: detail.id,
    trialId: detail.trialId,
    taskId: detail.taskId,
    configId: detail.configId,
    attempt: detail.attempt,
    jobKey: detail.jobKey,
    jobId: detail.jobId,
    cohort: detail.cohort,
    storageRoot: detail.storageRoot,
    storagePath: detail.storagePath,
    runDir: detail.runDir,
    sourceKind: detail.sourceKind,
    taskName: detail.taskName,
    taskType: detail.taskType,
    sampleId: detail.sampleId,
    agent: detail.agent,
    model: detail.model,
    arm: detail.arm,
    armLabel: detail.armLabel,
    title: detail.title,
    status: detail.status,
    stopReason: detail.stopReason,
    updatedAt: detail.updatedAt,
    score: detail.primaryMetric?.value ?? null,
    scoreUnit: detail.primaryMetric?.unit ?? "pts",
    scoreLabel: detail.primaryMetric?.label ?? "Score",
    steps: detail.usage.steps,
    toolCalls: detail.usage.toolCalls,
    promptTokens: detail.usage.promptTokens,
    completionTokens: detail.usage.completionTokens,
    hasArtifacts: detail.artifacts.length > 0,
    artifactNames: detail.artifacts.map((a) => a.name),
    usedRetrieval: detail.usage.usedRetrieval,
    usedSkill: detail.usage.usedSkill,
    staticFile,
  };
}

// 2. Export ALL completed `example` trajectories from BOTH upstream cohorts
const exampleJobs = storageOverview.jobs.filter(
  (j) =>
    j.hasTrajectories &&
    (j.cohort === "gpt6_luna_full_capabilities" || j.cohort === "gpt6_luna_agent_tests")
);

for (const job of exampleJobs) {
  const sum = safeReadJson(path.join(UPSTREAM_ROOT, job.storagePath, "summary.json"));
  const firstResRel = sum?.trials?.[0]?.result;
  if (!firstResRel) continue;
  const relTrialDir = path.posix.join(job.storagePath, path.posix.dirname(firstResRel));
  const detail = loadStoredTrialDetail("upstream", relTrialDir);
  if (!detail) continue;

  const safeSlug = `${job.cohort === "gpt6_luna_full_capabilities" ? "example-full" : "example-base"}--${job.agent}`;
  const staticFile = `./data/traces/${safeSlug}.json`;
  detail.id = safeSlug;
  exportedBundles.set(`${detail.storageRoot}:${detail.storagePath}`, { fileName: `${safeSlug}.json`, detail });
  exportedTrialIndex.push(toIndexEntry(detail, staticFile));
}

// 3. Stratified 30-case paired sampler for `full_capability` PLawBench & LawBench
function parseCaseKey(caseKey: string, benchmark: string) {
  const idx = caseKey.indexOf("_case-");
  if (idx !== -1) {
    return {
      taskType: caseKey.slice(0, idx),
      sampleId: caseKey.slice(idx + "_case-".length),
    };
  }
  return { taskType: benchmark, sampleId: caseKey };
}

const fullCapRoot = path.join(UPSTREAM_ROOT, "runs/full_capability");

for (const benchmark of ["plawbench", "lawbench"] as const) {
  const arms = [
    { arm: "vanilla_cap", dir: `${benchmark}-cap` },
    { arm: "vanilla", dir: `${benchmark}-vanilla` },
    { arm: "static", dir: `${benchmark}-static` },
  ];

  const maps: Record<string, Record<string, string>> = {
    static: {},
    vanilla: {},
    vanilla_cap: {},
  };

  for (const a of arms) {
    const sum = safeReadJson(path.join(fullCapRoot, a.dir, "summary.json"));
    const trials: any[] = Array.isArray(sum?.trials) ? sum.trials : [];
    for (const tr of trials) {
      if (!tr?.result) continue;
      const trialDirRel = `runs/full_capability/${a.dir}/${path.posix.dirname(tr.result)}`;
      const trajAbs = path.join(UPSTREAM_ROOT, trialDirRel, "trajectory.json");
      if (canRead(trajAbs)) {
        const folderName = path.posix.basename(trialDirRel);
        const caseKey = folderName.split("__")[0];
        maps[a.arm][caseKey] = trialDirRel;
      }
    }
  }

  const commonKeys = Object.keys(maps.vanilla_cap)
    .filter((k) => maps.vanilla[k] && maps.static[k])
    .sort();
  const poolKeys =
    commonKeys.length > 0
      ? commonKeys
      : Array.from(
          new Set([
            ...Object.keys(maps.vanilla_cap),
            ...Object.keys(maps.vanilla),
            ...Object.keys(maps.static),
          ])
        ).sort();

  const byTask: Record<string, string[]> = {};
  for (const k of poolKeys) {
    const { taskType } = parseCaseKey(k, benchmark);
    if (!byTask[taskType]) byTask[taskType] = [];
    byTask[taskType].push(k);
  }

  const scoreCapTools = (caseKey: string) => {
    const rel = maps.vanilla_cap[caseKey];
    if (!rel) return 0;
    const res = safeReadJson(path.join(UPSTREAM_ROOT, rel, "result.json"));
    const mcpCalls = Number(res?.usage?.mcp?.lexverse_knowledge?.completed_calls || 0);
    const toolCalls = Number(res?.usage?.tool_calls || 0);
    return mcpCalls * 10 + toolCalls;
  };

  const selectedKeys: string[] = [];
  if (benchmark === "plawbench") {
    const quotas: Record<string, number> = {
      document_generation: 6,
      legal_consultation: 8,
      case_analysis: 16,
    };
    for (const [task, limit] of Object.entries(quotas)) {
      const list = (byTask[task] || []).slice(0, 80);
      const rankMap: Record<string, number> = {};
      for (const k of list) rankMap[k] = scoreCapTools(k);
      list.sort((a, b) => rankMap[b] - rankMap[a]);
      selectedKeys.push(...list.slice(0, limit));
    }
  } else {
    const tasks = Object.keys(byTask).sort();
    const sortedByTask: Record<string, string[]> = {};
    for (const t of tasks) {
      const head = byTask[t].slice(0, 25);
      const rankMap: Record<string, number> = {};
      for (const k of head) rankMap[k] = scoreCapTools(k);
      head.sort((a, b) => rankMap[b] - rankMap[a]);
      sortedByTask[t] = head;
    }
    let round = 0;
    while (selectedKeys.length < 30 && round < 4) {
      let pushed = false;
      for (const t of tasks) {
        if (selectedKeys.length >= 30) break;
        const k = sortedByTask[t]?.[round];
        if (k && !selectedKeys.includes(k)) {
          selectedKeys.push(k);
          pushed = true;
        }
      }
      if (!pushed) break;
      round++;
    }
  }

  for (const caseKey of selectedKeys) {
    const safeCase = caseKey.replace(/[^a-zA-Z0-9._-]+/g, "_");
    for (const a of arms) {
      const relTrialDir = maps[a.arm][caseKey];
      if (!relTrialDir) continue;
      const detail = loadStoredTrialDetail("upstream", relTrialDir);
      if (!detail) continue;
      const slug = `${benchmark}--${a.arm}--${safeCase}`;
      const staticFile = `./data/traces/${slug}.json`;
      detail.id = slug;
      exportedBundles.set(`${detail.storageRoot}:${detail.storagePath}`, {
        fileName: `${slug}.json`,
        detail,
      });
      exportedTrialIndex.push(toIndexEntry(detail, staticFile));
    }
  }
}

// 3b. Stratified real trials from workspace legacy/native benchmark runs
const FLAGSHIP_WORKSPACE_JOBS = new Set([
  "workspace:runs/legalworld-gpt-52",
  "workspace:runs/legalworld-kimi-k25",
  "workspace:runs/legalworld-deepseek-v4-flash",
  "workspace:runs/dlawbench-kimi-k26-full240",
  "workspace:runs/dlawbench-legalone-8b-20",
  "workspace:runs/maser-native6-standard-full-693",
  "workspace:runs/j1bench-qwen25-7b-full508",
  "workspace:runs/simucourt-second180-gpt6luna",
  "workspace:runs/lexeval-qwen7b-full14150",
  "workspace:runs/plawbench-qwen3-4b-thinking-2507-full280",
  "workspace:runs/lawbench-qwen7b-full500-v2",
]);

for (const job of storageOverview.jobs) {
  if (!job.hasTrajectories || !FLAGSHIP_WORKSPACE_JOBS.has(job.key)) continue;
  const page = queryStoredTrials({ jobKey: job.key, page: 1, pageSize: 6 });
  for (const item of page.items) {
    const key = `${item.storageRoot}:${item.storagePath}`;
    if (exportedBundles.has(key)) continue;
    const detail = loadStoredTrialDetail(item.storageRoot, item.storagePath);
    if (!detail) continue;
    const safeSlug = `ws--${job.jobId}--${detail.taskType}--${detail.sampleId}`.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const staticFile = `./data/traces/${safeSlug}.json`;
    detail.id = safeSlug;
    exportedBundles.set(key, { fileName: `${safeSlug}.json`, detail });
    exportedTrialIndex.push(toIndexEntry(detail, staticFile));
  }
}

function sanitizePublicJsonText(jsonStr: string): string {
  return jsonStr
    .replaceAll(UPSTREAM_ROOT, "upstream")
    .replaceAll(REPO_ROOT, "workspace")
    .replaceAll("/home/azureuser", "~");
}

// Link siblings[].staticFile & write chunked trial bundles
for (const { fileName, detail } of exportedBundles.values()) {
  detail.siblings = detail.siblings
    .map((s) => {
      const target = exportedBundles.get(`${s.storageRoot}:${s.storagePath}`);
      if (!target) return null;
      return {
        ...s,
        id: target.detail.id,
        staticFile: `./data/traces/${target.fileName}`,
      };
    })
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  fs.writeFileSync(path.join(TRACES_OUT_DIR, fileName), sanitizePublicJsonText(JSON.stringify(detail)));
}

// 4. Scan ALL 9 benchmark catalog.yaml definitions
const benchmarksDir = path.join(REPO_ROOT, "lexverse/benchmarks");
const benchmarkCatalog: any[] = [];
const LEGALWORLD_STAGES = ["LC", "DRAFT", "CI", "SD", "APPEAL_DRAFT", "CIA"];

if (fs.existsSync(benchmarksDir)) {
  for (const entry of fs.readdirSync(benchmarksDir).sort()) {
    const catPath = path.join(benchmarksDir, entry, "catalog.yaml");
    if (!fs.existsSync(catPath)) continue;
    try {
      const parsed = loadYaml(fs.readFileSync(catPath, "utf-8")) as any;
      const rawTasks = parsed?.tasks || {};
      let tasksList = Object.entries(rawTasks).map(([taskId, meta]: [string, any]) => ({
        id: taskId,
        outputType: meta?.output_type || "text",
        metrics: Array.isArray(meta?.metrics) ? meta.metrics : [],
      }));

      if (entry === "legalworld" && tasksList.length === 0) {
        tasksList = LEGALWORLD_STAGES.map((stage) => ({
          id: stage,
          outputType: "trajectory",
          metrics: ["stage_score", "overall_weighted"],
        }));
      }

      benchmarkCatalog.push({
        id: entry,
        repoUrl: parsed?.source?.repo_url || "",
        commit: parsed?.source?.commit || "",
        taskCount: tasksList.length,
        tasks: tasksList,
      });
    } catch {
      // ignore invalid yaml
    }
  }
}

// 5. Scan public example User Workspace Task (`example` only)
const userWorkspaceTasks: any[] = [];
const exampleTaskDir = path.join(UPSTREAM_ROOT, "user_workspace/tasks/example");
if (canRead(path.join(exampleTaskDir, "task.toml"))) {
  const tomlRaw = fs.readFileSync(path.join(exampleTaskDir, "task.toml"), "utf-8");
  const instrRaw = safeReadText(path.join(exampleTaskDir, "instruction.md"), 4000) || "";
  const inputsDir = path.join(exampleTaskDir, "environment/inputs");
  const inputFiles = canRead(inputsDir) ? fs.readdirSync(inputsDir).sort() : [];
  const rubricJson = safeReadJson(path.join(exampleTaskDir, "tests/rubric.json"));

  const dimensions = rubricJson?.dimensions
    ? Object.entries(rubricJson.dimensions).map(([k, v]: [string, any]) => ({
        id: k,
        maxScore: v.max_score,
        criteria: v.criteria,
      }))
    : [];

  const sourceMatch = tomlRaw.match(/^source\s*=\s*"([^"]+)"/m);
  userWorkspaceTasks.push({
    groupName: "example",
    taskId: "example",
    title: "微信购表纠纷起诉准备",
    path: "user_workspace/tasks/example",
    artifactSource: sourceMatch?.[1] || "/workspace/complaint_preparation.docx",
    environmentMode: "docker (separate verifier)",
    inputFiles,
    instructionPreview: truncateText(instrRaw.trim(), 320),
    rubricDimensions: dimensions,
    fullCount: storageOverview.jobs.filter((j) => j.cohort === "gpt6_luna_full_capabilities").length,
    baseCount: storageOverview.jobs.filter((j) => j.cohort === "gpt6_luna_agent_tests").length,
  });
}

const examplePdfSrc = path.join(exampleTaskDir, "tests/reference/case.pdf");
const publicFilesOut = path.resolve(import.meta.dir, "../public/files/example");
fs.rmSync(publicFilesOut, { recursive: true, force: true });
if (canRead(examplePdfSrc)) {
  fs.mkdirSync(publicFilesOut, { recursive: true });
  fs.copyFileSync(examplePdfSrc, path.join(publicFilesOut, "tests__reference__case.pdf"));
}

// 6. Scan configs/jobs/*.yaml
const configsDir = path.join(REPO_ROOT, "configs/jobs");
const jobConfigs: Array<{ name: string; file: string; yaml: string }> = [];
if (fs.existsSync(configsDir)) {
  for (const f of fs.readdirSync(configsDir).sort()) {
    if (f.endsWith(".yaml")) {
      const content = safeReadText(path.join(configsDir, f), 8000);
      if (content) {
        jobConfigs.push({ name: f.replace(/\.yaml$/, ""), file: `configs/jobs/${f}`, yaml: content });
      }
    }
  }
}

// 7. Scan local capabilities indexes matching standard public knowledge domains
const PUBLIC_KNOWLEDGE_DOMAINS = new Set([
  "legal_laws",
  "legal_cases",
  "legal_qa",
  "legal_concepts",
  "legal_templates",
]);
const capabilitiesIndexes: any[] = [];
const idxDir = path.join(REPO_ROOT, ".lexverse/capabilities/indexes");
if (fs.existsSync(idxDir)) {
  for (const entry of fs.readdirSync(idxDir)) {
    const mf = safeReadJson(path.join(idxDir, entry, "manifest.json"));
    if (mf && PUBLIC_KNOWLEDGE_DOMAINS.has(String(mf.source_name))) {
      capabilitiesIndexes.push({
        hash: mf.index_hash,
        sourceName: mf.source_name,
        sourceId: mf.identity?.source_id,
        chunkCount: mf.chunk_count,
        mode: mf.identity?.retrieval?.mode || "keyword",
        embeddingModel: mf.embedding_config?.model || "BAAI/bge-small-zh-v1.5",
        chunkTokens: mf.identity?.retrieval?.chunk_tokens || 400,
        overlapTokens: mf.identity?.retrieval?.overlap_tokens || 60,
      });
    }
  }
}

const defaultTrialId =
  exportedTrialIndex.find((t) => t.id === "example-full--vanilla")?.id ||
  exportedTrialIndex[0]?.id ||
  "";

const sanitizedStorageRoots = storageOverview.storageRoots.map((r) => ({
  ...r,
  rootPath: r.id === "upstream" ? "upstream:/runs" : "workspace:/runs",
}));

const bundle = {
  generatedAt: new Date().toISOString(),
  mode: "static",
  storageRoots: sanitizedStorageRoots,
  jobs: storageOverview.jobs,
  facets: storageOverview.facets,
  resultsSummary: storageOverview.resultsSummary,
  trials: exportedTrialIndex,
  defaultTrialId,
  harborWorkspace: scanHarborWorkspace(),
  benchmarkCatalog,
  userWorkspaceTasks,
  jobTemplates: jobConfigs,
  capabilitiesIndexes,
  capabilitiesCatalog: scanCapabilitiesCatalog(true),
};

const outPath = path.join(OUT_DIR, "lexverse-snapshot.json");
fs.writeFileSync(outPath, sanitizePublicJsonText(JSON.stringify(bundle, null, 2)));
const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(
  `[export-static-data] Exported ${exportedTrialIndex.length} real trials across ${storageOverview.jobs.length} stored jobs (${storageOverview.resultsSummary.totalCompletedTrials.toLocaleString()} total stored trials), ${benchmarkCatalog.length} benchmark catalogs -> public/data/lexverse-snapshot.json (${sizeKb} KB)`
);
