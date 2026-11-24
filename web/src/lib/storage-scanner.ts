import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { load as loadYaml } from "js-yaml";
import type {
  AgentWorkspaceFile,
  CapabilitiesCatalogData,
  CapabilityBuiltinTool,
  CapabilityKnowledgeCollection,
  CapabilityMcpServer,
  CapabilitySkillItem,
  CapabilitySkillPack,
  ExampleAgentPairRow,
  HarborTaskPackage,
  HarborTreeNode,
  HarborWorkspaceData,
  ModeComparisonGroup,
  MultiArmSubtaskRow,
  ResultsSummaryData,
  StorageOverviewResponse,
  StorageRootId,
  StoredArtifactItem,
  StoredJobFile,
  StoredJobRecord,
  StoredMetricBadge,
  StoredMetricItem,
  StoredSampledTrial,
  StoredSiblingTrial,
  StoredSubtaskMetric,
  StoredTrialDetail,
  StoredTrialFileItem,
  StoredTrialIndexEntry,
  TrialHarborWorkspace,
  TrialsPageResponse,
} from "./storage-types";

const LAWBENCH_LABELS: Record<string, string> = {
  "1-1": "Article Recitation",
  "1-2": "Knowledge Q&A",
  "2-1": "Document Proofreading",
  "2-2": "Dispute Focus ID",
  "2-3": "Marital Disputes ID",
  "2-4": "Issue Topic ID",
  "2-5": "Reading Comprehension",
  "2-6": "Named Entity Recognition",
  "2-7": "Opinion Summarization",
  "2-8": "Argument Mining",
  "2-9": "Event Detection",
  "2-10": "Trigger Word Extraction",
  "3-1": "Fact-based Article Pred.",
  "3-2": "Scene-based Article Pred.",
  "3-3": "Charge Prediction",
  "3-4": "Prison Term (w/o Article)",
  "3-5": "Prison Term (w/ Article)",
  "3-6": "Case Analysis",
  "3-7": "Criminal Damages Calc.",
  "3-8": "Legal Consultation",
};

const PLAWBENCH_LABELS: Record<string, string> = {
  case_analysis: "Practical Case Analysis",
  legal_consultation: "Public Legal Consultation",
  document_generation: "Civil Complaint & Defense Drafting",
};

const EXAMPLE_RUBRIC_META: Record<string, { label: string; max: number }> = {
  legal_quality: { label: "Legal Quality (Overall)", max: 100 },
  raw_legal_quality: { label: "Raw Legal Quality", max: 100 },
  facts_amounts: { label: "Facts & Amounts", max: 20 },
  legal_analysis: { label: "Legal Analysis", max: 30 },
  complaint: { label: "Complaint Draft", max: 25 },
  material_grounding: { label: "Material Grounding", max: 20 },
  usability: { label: "DOCX Usability", max: 5 },
  submission_valid: { label: "Submission Valid", max: 1 },
};

const PLAWBENCH_METRIC_LABELS: Record<string, string> = {
  acc: "Overall Accuracy",
  fact_acc: "Fact Accuracy",
  law_acc: "Law Citation Accuracy",
  reasoning_acc: "Legal Reasoning",
  conclusion_acc: "Conclusion Accuracy",
  failed: "Failed Judge Count",
};

export const ARM_DISPLAY_LABELS: Record<string, string> = {
  static: "Static Prompt",
  vanilla: "Vanilla (w/o Cap)",
  vanilla_cap: "Vanilla + 16 Capabilities",
  full_capabilities: "Full Capabilities (41 Skills + Legal Laws + MCP)",
  base: "Base (No External Capabilities)",
  native: "Native Multi-Agent Pipeline",
  default: "Standard Run",
};

const EXTRA_EXCLUDES = (process.env.LEXVERSE_EXCLUDE_PATTERNS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const FORBIDDEN_PATTERNS = [
  "disputed_issues",
  "user_tasks",
  "agent_smoke",
  "user_workspace/exports",
  ...EXTRA_EXCLUDES,
];

const PUBLIC_KNOWLEDGE_DOMAINS = new Set([
  "legal_laws",
  "legal_cases",
  "legal_qa",
  "legal_concepts",
  "legal_templates",
]);

export function isForbiddenPathSegment(p: string): boolean {
  const lower = p.toLowerCase();
  return FORBIDDEN_PATTERNS.some((pat) => lower.includes(pat.toLowerCase()));
}

export function resolveRoots(): { repoRoot: string; upstreamRoot: string } {
  const cwd = process.cwd();
  let repoRoot = "";
  if (fs.existsSync(path.join(cwd, "lexverse"))) {
    repoRoot = cwd;
  } else if (fs.existsSync(path.join(cwd, "../lexverse"))) {
    repoRoot = path.resolve(cwd, "..");
  } else if (fs.existsSync("/home/azureuser/lexverse/lexverse")) {
    repoRoot = "/home/azureuser/lexverse";
  } else {
    repoRoot = path.resolve(cwd, "..");
  }
  const upstreamRoot =
    process.env.LEXVERSE_UPSTREAM_ROOT ||
    (fs.existsSync(path.resolve(repoRoot, "../lexverse-upstream-main"))
      ? path.resolve(repoRoot, "../lexverse-upstream-main")
      : "/home/azureuser/lexverse-upstream-main");
  return { repoRoot, upstreamRoot };
}

export function canRead(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function safeStat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

export function safeReadJson(filePath: string, maxBytes = 64 * 1024 * 1024): any | null {
  try {
    if (!canRead(filePath)) return null;
    const st = safeStat(filePath);
    if (!st || !st.isFile() || st.size > maxBytes) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

export function safeReadText(filePath: string, maxChars = 150000): string | null {
  try {
    if (!canRead(filePath)) return null;
    const st = safeStat(filePath);
    if (!st || !st.isFile()) return null;
    const text = fs.readFileSync(filePath, "utf-8");
    return text.length > maxChars ? text.slice(0, maxChars) : text;
  } catch {
    return null;
  }
}

export function coerceText(val: any): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && typeof item.text === "string") return item.text;
        return JSON.stringify(item);
      })
      .join("\n");
  }
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

export function truncateText(val: any, maxChars: number): string {
  const str = coerceText(val);
  if (!str) return "";
  return str.length > maxChars ? str.slice(0, maxChars) + "\n… [truncated]" : str;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

export function parseCsvRows(csvText: string): Array<Record<string, string>> {
  const clean = csvText.replace(/^\uFEFF/, "").trim();
  if (!clean) return [];
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];
  for (const line of lines.slice(1)) {
    const vals = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = (vals[i] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function sanitizeArgs(args: any): any {
  if (!args || typeof args !== "object") return args;
  if (Array.isArray(args)) return args.slice(0, 20);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string") {
      out[k] = v.length > 2400 ? v.slice(0, 2400) + "\n… [truncated]" : v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function sanitizeTrajectory(
  traj: any,
  resultJson?: any,
  fallbackAgent = "static",
  fallbackModel = "deepseek-v4.1-flash"
) {
  const hasSteps = Array.isArray(traj?.steps) && traj.steps.length > 0;
  if (!hasSteps && Array.isArray(traj?.messages)) {
    const promptTok = resultJson?.usage?.prompt_tokens ?? resultJson?.usage?.input_tokens ?? 0;
    const compTok = resultJson?.usage?.completion_tokens ?? resultJson?.usage?.output_tokens ?? 0;
    return {
      schema_version: "ATIF-v1.7 (Static)",
      session_id: resultJson?.trial_id || "static",
      agent: {
        name: fallbackAgent,
        version: "1.0",
        model_name: fallbackModel,
      },
      final_metrics: {
        total_prompt_tokens: promptTok,
        total_completion_tokens: compTok,
        total_steps: traj.messages.length,
      },
      steps: traj.messages.map((m: any, idx: number) => {
        const isAssistant = m?.role === "assistant";
        return {
          step_id: idx + 1,
          timestamp: null,
          source: isAssistant ? "agent" : m?.role || "user",
          model_name: isAssistant ? fallbackModel : null,
          message: truncateText(m?.content, 8000),
          tool_calls: [],
          metrics: isAssistant
            ? {
                prompt_tokens: promptTok,
                completion_tokens: compTok,
              }
            : undefined,
        };
      }),
    };
  }

  const rawSteps: any[] = Array.isArray(traj?.steps) ? traj.steps : [];
  return {
    schema_version: traj?.schema_version || "ATIF-v1.7",
    session_id: traj?.session_id || "",
    agent: traj?.agent || {},
    final_metrics: traj?.final_metrics || null,
    steps: rawSteps.map((s, idx) => ({
      step_id: s?.step_id ?? idx + 1,
      timestamp: s?.timestamp || null,
      source: s?.source || "agent",
      model_name: s?.model_name || traj?.agent?.model_name || null,
      message: truncateText(s?.message, 8000),
      tool_calls: Array.isArray(s?.tool_calls)
        ? s.tool_calls.map((tc: any) => ({
            tool_call_id: tc?.tool_call_id || `call_${idx}`,
            function_name: tc?.function_name || "tool",
            arguments: sanitizeArgs(tc?.arguments),
          }))
        : [],
      observation: s?.observation?.results
        ? {
            results: (s.observation.results as any[]).map((r: any) => ({
              source_call_id: r?.source_call_id || null,
              content: truncateText(r?.content, 4500),
            })),
          }
        : undefined,
      metrics: s?.metrics || undefined,
      llm_call_count: s?.llm_call_count,
    })),
  };
}

export function detectToolUsage(steps: any[]) {
  let usedRetrieval = false;
  let usedSkill = false;
  let toolCallsCount = 0;
  for (const s of steps) {
    for (const tc of s?.tool_calls || []) {
      toolCallsCount++;
      const fn = String(tc?.function_name || "").toLowerCase();
      if (fn.includes("search_knowledge") || fn.includes("fetch_knowledge")) {
        usedRetrieval = true;
      }
      const argStr = JSON.stringify(tc?.arguments || {}).toLowerCase();
      if (fn === "skill" || fn === "read_skill" || argStr.includes("/skills/")) {
        usedSkill = true;
      }
    }
  }
  return { usedRetrieval, usedSkill, toolCallsCount };
}

interface InternalJobDescriptor {
  job: StoredJobRecord;
  absDir: string;
  relDir: string;
  storageRoot: StorageRootId;
}

interface LegacyTrialRef {
  taskType: string;
  sampleId: string;
  relTrialDir: string;
}

interface ScannerState {
  summaryCache: Map<string, { mtimeMs: number; data: any }>;
  verifCache: Map<string, { mtimeMs: number; trials: Record<string, any> }>;
  predDirCache: Map<string, string | null>;
  predFileCache: Map<string, Record<string, any>>;
  legacyTrialsIndexCache: Map<string, { mtimeMs: number; entries: LegacyTrialRef[] }>;
  overviewCache: { ts: number; data: StorageOverviewResponse } | null;
  jobDescriptors: Map<string, InternalJobDescriptor>;
}

const g = globalThis as unknown as { __lexverseScannerState?: ScannerState };
if (!g.__lexverseScannerState) {
  g.__lexverseScannerState = {
    summaryCache: new Map(),
    verifCache: new Map(),
    predDirCache: new Map(),
    predFileCache: new Map(),
    legacyTrialsIndexCache: new Map(),
    overviewCache: null,
    jobDescriptors: new Map(),
  };
}
const STATE = g.__lexverseScannerState;

function readSummaryCached(summaryPath: string): any | null {
  const st = safeStat(summaryPath);
  if (!st || !st.isFile() || !canRead(summaryPath)) return null;
  const cached = STATE.summaryCache.get(summaryPath);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.data;
  const parsed = safeReadJson(summaryPath);
  if (parsed) {
    STATE.summaryCache.set(summaryPath, { mtimeMs: st.mtimeMs, data: parsed });
  }
  return parsed;
}

function readVerificationCached(verifPath: string): Record<string, any> {
  const st = safeStat(verifPath);
  if (!st || !st.isFile() || !canRead(verifPath)) return {};
  const cached = STATE.verifCache.get(verifPath);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.trials;
  const parsed = safeReadJson(verifPath);
  const trials = parsed?.trials && typeof parsed.trials === "object" ? parsed.trials : {};
  STATE.verifCache.set(verifPath, { mtimeMs: st.mtimeMs, trials });
  return trials;
}

function findLawbenchPredDir(jobDir: string): string | null {
  if (STATE.predDirCache.has(jobDir)) return STATE.predDirCache.get(jobDir) ?? null;
  const internalRoot = path.join(jobDir, "verification/.internal");
  if (!canRead(internalRoot)) {
    STATE.predDirCache.set(jobDir, null);
    return null;
  }
  for (const att of fs.readdirSync(internalRoot).sort()) {
    const pr = path.join(internalRoot, att, "verifier/predictions");
    if (!canRead(pr)) continue;
    const mSub = fs
      .readdirSync(pr)
      .find((d) => safeStat(path.join(pr, d))?.isDirectory());
    if (mSub) {
      const full = path.join(pr, mSub);
      STATE.predDirCache.set(jobDir, full);
      return full;
    }
  }
  STATE.predDirCache.set(jobDir, null);
  return null;
}

function getLawbenchReference(jobDir: string, taskType: string, sampleId: string): string {
  const predDir = findLawbenchPredDir(jobDir);
  if (!predDir) return "";
  const cacheKey = `${predDir}::${taskType}`;
  if (!STATE.predFileCache.has(cacheKey)) {
    STATE.predFileCache.set(cacheKey, safeReadJson(path.join(predDir, `${taskType}.json`)) || {});
  }
  const entry = STATE.predFileCache.get(cacheKey)?.[sampleId];
  return entry?.refr ? truncateText(entry.refr, 2500) : "";
}

export function resolveSafeStoragePath(
  storageRoot: StorageRootId,
  relPath: string
): { absPath: string; rootRunsDir: string; relClean: string } | null {
  if (!relPath || typeof relPath !== "string") return null;
  const normalized = path.posix.normalize(relPath.replace(/\\/g, "/")).replace(/^\/+/, "");
  if (!normalized || normalized.startsWith("..") || normalized.includes("/../")) return null;
  if (isForbiddenPathSegment(normalized)) return null;

  const { repoRoot, upstreamRoot } = resolveRoots();
  const baseRoot = storageRoot === "upstream" ? upstreamRoot : repoRoot;
  const runsBase = path.join(baseRoot, "runs");
  const candidate = path.resolve(baseRoot, normalized);

  try {
    const realRuns = fs.realpathSync(runsBase);
    const realCand = fs.realpathSync(candidate);
    if (realCand !== realRuns && !realCand.startsWith(realRuns + path.sep)) {
      return null;
    }
    return {
      absPath: realCand,
      rootRunsDir: realRuns,
      relClean: path.relative(fs.realpathSync(baseRoot), realCand).replace(/\\/g, "/"),
    };
  } catch {
    return null;
  }
}

export function parseTaskIdParts(taskId: string, fallbackTaskName: string) {
  const parts = String(taskId || "").split(":");
  if (parts.length >= 3) {
    return {
      taskName: parts[0] || fallbackTaskName,
      taskType: parts[1] || fallbackTaskName,
      sampleId: parts[parts.length - 1] || "0",
    };
  }
  if (parts.length === 2) {
    return {
      taskName: parts[0] || fallbackTaskName,
      taskType: parts[0] || fallbackTaskName,
      sampleId: parts[1] || "0",
    };
  }
  return {
    taskName: taskId || fallbackTaskName,
    taskType: taskId || fallbackTaskName,
    sampleId: taskId || "0",
  };
}

function formatTaskTitle(taskName: string): string {
  const titles: Record<string, string> = {
    plawbench: "PLawBench",
    lawbench: "LawBench",
    lexeval: "LexEval",
    j1bench: "J1Bench",
    legalworld: "Legal-world",
    simucourt: "AgentsCourt",
    dlawbench: "DLawBench",
    maser: "MASER (MILE)",
    lecardv2: "LeCaRDv2",
    example: "example (微信购表起诉准备)",
  };
  return titles[taskName] || taskName;
}

const NATIVE_BENCHMARKS = new Set(["legalworld", "j1bench", "dlawbench", "maser", "simucourt"]);
const SUPPORTED_LEGACY_BENCHMARKS = new Set([
  "plawbench",
  "lawbench",
  "lexeval",
  "j1bench",
  "legalworld",
  "simucourt",
  "dlawbench",
  "maser",
]);
const IGNORED_METRIC_KEYS = new Set([
  "failed",
  "expected_samples",
  "completed_samples",
  "failed_samples",
  "missing_samples",
  "sample_count",
  "formatted_samples",
  "deterministic_scored_samples",
  "judge_expected_samples",
  "complete_judge_coverage",
  "complete_native_coverage",
  "overall_possible_score",
  "overall_score_unweighted",
  "turn_min",
  "turn_max",
  "turn_mean",
  "sessions",
]);

function normalizeBenchmarkMetric(taskName: string, metricName: string, rawVal: number): number {
  if (metricName === "failed") return Number(rawVal.toFixed(2));
  // Metrics already expressed in [0, 100] (e.g. legalworld overall_score or MASER Total/G_AVE/I_AVE)
  if (rawVal > 1.0001) return Number(rawVal.toFixed(2));
  if (taskName === "legalworld" && metricName === "overall_score") return Number(rawVal.toFixed(2));
  return Number((rawVal * 100).toFixed(2));
}

function selectPrimaryMetricForSubtask(
  taskName: string,
  metrics: Record<string, number>
): { name: string; value: number | null } {
  const candidatesByBench: Record<string, string[]> = {
    plawbench: ["acc", "fact_acc", "law_acc"],
    lawbench: ["score"],
    lexeval: ["Accuracy", "accuracy", "Rouge_L", "rouge_l", "score"],
    j1bench: ["AVE", "BIN", "score"],
    legalworld: ["overall_score", "overall_score_normalized", "LC.stage_score"],
    dlawbench: ["fidelity", "elicitation", "resolution", "fact_coverage"],
    maser: ["Total", "G_AVE", "I_AVE", "CLI"],
    simucourt: ["judgment_micro_f1", "law_micro_f1", "charge_exact", "fine_exact"],
  };
  if (taskName === "simucourt") {
    const core = ["law_micro_f1", "judgment_micro_f1", "charge_exact", "fine_exact"]
      .map((k) => metrics[k])
      .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
    if (core.length > 0) {
      return {
        name: "mean_f1",
        value: Number((core.reduce((a, b) => a + b, 0) / core.length).toFixed(2)),
      };
    }
  }
  for (const key of candidatesByBench[taskName] || []) {
    if (typeof metrics[key] === "number" && !Number.isNaN(metrics[key])) {
      return { name: key, value: metrics[key] };
    }
  }
  const firstKey = Object.keys(metrics)[0] || "score";
  return {
    name: firstKey,
    value: typeof metrics[firstKey] === "number" ? metrics[firstKey] : null,
  };
}

function listLegacyTrialEntries(jobDir: string, relDir: string): LegacyTrialRef[] {
  const trialsRoot = path.join(jobDir, "trials");
  const st = safeStat(trialsRoot);
  if (!st || !st.isDirectory() || !canRead(trialsRoot)) return [];

  if (!STATE.legacyTrialsIndexCache) STATE.legacyTrialsIndexCache = new Map();
  const cached = STATE.legacyTrialsIndexCache.get(jobDir);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.entries;

  const entries: LegacyTrialRef[] = [];
  let taskDirs: string[] = [];
  try {
    taskDirs = fs
      .readdirSync(trialsRoot)
      .filter((d) => !d.startsWith(".") && !isForbiddenPathSegment(d) && safeStat(path.join(trialsRoot, d))?.isDirectory())
      .sort();
  } catch {
    return [];
  }

  for (const taskType of taskDirs) {
    const taskPath = path.join(trialsRoot, taskType);
    let sampleDirs: string[] = [];
    try {
      sampleDirs = fs
        .readdirSync(taskPath)
        .filter((s) => !s.startsWith(".") && !isForbiddenPathSegment(s))
        .sort((a, b) => {
          const na = Number(a);
          const nb = Number(b);
          return !Number.isNaN(na) && !Number.isNaN(nb) ? na - nb : a.localeCompare(b);
        });
    } catch {
      continue;
    }

    for (const sampleId of sampleDirs) {
      if (canRead(path.join(taskPath, sampleId, "results.json"))) {
        entries.push({
          taskType,
          sampleId,
          relTrialDir: `${relDir}/trials/${taskType}/${sampleId}`.replace(/\\/g, "/"),
        });
      }
    }
  }

  STATE.legacyTrialsIndexCache.set(jobDir, { mtimeMs: st.mtimeMs, entries });
  return entries;
}

function collectJobFiles(jobDir: string, relDir: string, storageRoot: StorageRootId): StoredJobFile[] {
  const candidates: Array<{ name: string; rel: string; kind: StoredJobFile["kind"]; downloadable: boolean }> = [
    { name: "job.json", rel: "job.json", kind: "metadata", downloadable: true },
    { name: "summary.json", rel: "summary.json", kind: "metadata", downloadable: true },
    { name: "verification/report.csv", rel: "verification/report.csv", kind: "verification", downloadable: true },
    { name: "verification/verification.json", rel: "verification/verification.json", kind: "verification", downloadable: true },
    { name: "evaluation_result.csv", rel: "evaluation_result.csv", kind: "verification", downloadable: true },
    { name: "run.log", rel: "run.log", kind: "log", downloadable: true },
  ];
  const out: StoredJobFile[] = [];
  for (const c of candidates) {
    const fp = path.join(jobDir, c.rel);
    const st = safeStat(fp);
    if (st && st.isFile() && canRead(fp)) {
      out.push({
        name: c.name,
        relPath: `${relDir}/${c.rel}`.replace(/\\/g, "/"),
        storageRoot,
        sizeBytes: st.size,
        kind: c.kind,
        downloadable: c.downloadable,
      });
    }
  }
  return out;
}

function extractResultArtifacts(rawArtifacts: any, jobDir: string, storageRoot: StorageRootId, baseRoot: string): StoredArtifactItem[] {
  const out: StoredArtifactItem[] = [];
  if (Array.isArray(rawArtifacts)) {
    for (const a of rawArtifacts) {
      if (!a || typeof a !== "object") continue;
      let relPath = "";
      if (typeof a.path === "string" && a.path) {
        const absCand = path.isAbsolute(a.path) ? a.path : path.join(jobDir, a.path);
        if (absCand.startsWith(baseRoot)) {
          relPath = path.relative(baseRoot, absCand).replace(/\\/g, "/");
        }
      }
      out.push({
        name: String(a.name || path.basename(relPath || "artifact")),
        relPath,
        storageRoot,
        sizeBytes: typeof a.size_bytes === "number" ? a.size_bytes : undefined,
        sha256: typeof a.sha256 === "string" ? a.sha256 : undefined,
        format: typeof a.format === "string" ? a.format : undefined,
      });
    }
  } else if (rawArtifacts && typeof rawArtifacts === "object") {
    for (const [k, v] of Object.entries(rawArtifacts)) {
      if (typeof v !== "string") continue;
      if (v.includes("/.internal/")) continue;
      const absCand = path.isAbsolute(v) ? v : path.join(jobDir, v);
      const st = safeStat(absCand);
      if (st && st.isFile() && absCand.startsWith(baseRoot)) {
        out.push({
          name: k,
          relPath: path.relative(baseRoot, absCand).replace(/\\/g, "/"),
          storageRoot,
          sizeBytes: st.size,
          format: path.extname(absCand).replace(/^\./, "") || undefined,
        });
      }
    }
  }
  return out;
}

function sampleLegacyTrialsFromJob(jobDir: string, maxSamples = 3): StoredSampledTrial[] {
  const trialsRoot = path.join(jobDir, "trials");
  if (!canRead(trialsRoot)) return [];
  const samples: StoredSampledTrial[] = [];
  const taskDirs = fs
    .readdirSync(trialsRoot)
    .filter((d) => safeStat(path.join(trialsRoot, d))?.isDirectory())
    .sort();

  for (const taskDirName of taskDirs) {
    if (samples.length >= maxSamples) break;
    const taskPath = path.join(trialsRoot, taskDirName);
    const sampleIds = fs
      .readdirSync(taskPath)
      .filter((s) => canRead(path.join(taskPath, s, "results.json")))
      .sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        return !Number.isNaN(na) && !Number.isNaN(nb) ? na - nb : a.localeCompare(b);
      });
    const pick = sampleIds[0];
    if (!pick) continue;
    const res = safeReadJson(path.join(taskPath, pick, "results.json"));
    if (!res) continue;
    samples.push({
      id: res.id || `${taskDirName}:${pick}`,
      task: res.task || taskDirName,
      sampleId: String(res.sample_id ?? pick),
      status: res.status || "completed",
      instruction: truncateText(res.input?.instruction, 420),
      content: truncateText(res.input?.content, 520),
      response: truncateText(res.response, 800),
      reference: truncateText(res.reference, 600),
      evaluationMetrics: res.evaluation?.metrics || null,
    });
  }
  return samples;
}

function sampleModernBenchmarkTrials(
  jobDir: string,
  taskName: string,
  summary: any,
  maxSamples = 3
): StoredSampledTrial[] {
  const rawTrials: any[] = Array.isArray(summary?.trials) ? summary.trials : [];
  if (!rawTrials.length) return [];
  const verTrials = taskName === "plawbench" ? readVerificationCached(path.join(jobDir, "verification/verification.json")) : {};
  const samples: StoredSampledTrial[] = [];
  const seenTaskTypes = new Set<string>();

  for (const tr of rawTrials) {
    if (samples.length >= maxSamples) break;
    const parsedId = parseTaskIdParts(tr.task_id, taskName);
    if (seenTaskTypes.has(parsedId.taskType) && rawTrials.length > maxSamples) continue;
    seenTaskTypes.add(parsedId.taskType);

    const resPath = path.join(jobDir, tr.result || "");
    const res = safeReadJson(resPath);
    const traj = safeReadJson(path.join(path.dirname(resPath), "trajectory.json"));
    if (!res) continue;

    const firstPrompt =
      traj?.steps?.find((s: any) => s?.source === "user")?.message ||
      traj?.steps?.[0]?.message ||
      traj?.messages?.[0]?.content ||
      "";
    const metricsRaw = tr.trial_id && verTrials[tr.trial_id]?.metrics ? verTrials[tr.trial_id].metrics : null;
    const normMetrics: Record<string, number> | null = metricsRaw
      ? Object.fromEntries(
          Object.entries(metricsRaw)
            .filter(([, v]) => typeof v === "number")
            .map(([k, v]) => [k, k === "failed" ? Number(v) : Number((Number(v) * 100).toFixed(1))])
        )
      : null;

    let refText = "";
    if (taskName === "lawbench") {
      refText = getLawbenchReference(jobDir, parsedId.taskType, parsedId.sampleId);
    } else if (normMetrics) {
      refText = Object.entries(normMetrics)
        .map(([k, v]) => `${k}: ${k === "failed" ? v : `${v}%`}`)
        .join("\n");
    }

    samples.push({
      id: res.id || tr.task_id,
      task: parsedId.taskType,
      sampleId: parsedId.sampleId,
      status: res.status || tr.status || "completed",
      instruction: truncateText(firstPrompt, 500),
      content: "",
      response: truncateText(res.answer, 800),
      reference: refText || "Verified via LexVerse evaluator",
      evaluationMetrics: normMetrics,
    });
  }
  return samples;
}

function buildModernJobRecord(params: {
  jobDir: string;
  relDir: string;
  storageRoot: StorageRootId;
  cohort: string;
  armOverride?: string;
  armLabelOverride?: string;
  taskNameHint?: string;
  fullSummaryJob?: any;
  baseRoot: string;
}): StoredJobRecord | null {
  const { jobDir, relDir, storageRoot, cohort, baseRoot, fullSummaryJob } = params;
  const summaryPath = path.join(jobDir, "summary.json");
  const summary = readSummaryCached(summaryPath);
  if (!summary) return null;

  const files = collectJobFiles(jobDir, relDir, storageRoot);
  const stSummary = safeStat(summaryPath);
  const updatedAt = stSummary ? stSummary.mtime.toISOString() : new Date().toISOString();

  const firstGroup: any = summary.groups ? Object.values(summary.groups)[0] : null;
  const rawTrials: any[] = Array.isArray(summary.trials) ? summary.trials : [];
  const firstTrial = rawTrials[0];
  const agent = firstGroup?.agent || path.basename(jobDir);
  const model = firstGroup?.model || "unknown";

  const inferredTaskName =
    params.taskNameHint ||
    (firstTrial?.task_id ? parseTaskIdParts(firstTrial.task_id, "").taskName : "") ||
    (relDir.includes("plawbench") ? "plawbench" : relDir.includes("lawbench") ? "lawbench" : "example");

  if (isForbiddenPathSegment(inferredTaskName) || isForbiddenPathSegment(relDir)) {
    return null;
  }

  const sourceKind: "benchmark" | "user" =
    inferredTaskName === "plawbench" || inferredTaskName === "lawbench" ? "benchmark" : "user";

  const arm =
    params.armOverride ||
    (cohort === "gpt6_luna_full_capabilities"
      ? "full_capabilities"
      : cohort === "gpt6_luna_agent_tests"
      ? "base"
      : agent === "static"
      ? "static"
      : "vanilla");
  const armLabel = params.armLabelOverride || ARM_DISPLAY_LABELS[arm] || arm;

  const statuses: Record<string, number> = summary.statuses || {};
  const completedTrials = statuses.completed ?? rawTrials.filter((t) => t.status === "completed").length;
  const failedTrials = statuses.failed ?? 0;
  const plannedTrials = summary.planned_trials ?? rawTrials.length;

  const reportText = safeReadText(path.join(jobDir, "verification/report.csv"), 100000);
  const reportRows = reportText ? parseCsvRows(reportText) : [];
  const subtaskMetrics: StoredSubtaskMetric[] = [];
  let scoredTrials = 0;
  let submissionValid: boolean | null = null;

  for (const r of reportRows) {
    const metrics: Record<string, number> = {};
    const total = parseInt(r.total || "0", 10) || 0;
    const completed = parseInt(r.completed || "0", 10) || 0;
    const failed = parseInt(r.failed || "0", 10) || 0;
    const scored = parseInt(r.scored || "0", 10) || 0;
    scoredTrials += scored;

    for (const [k, v] of Object.entries(r)) {
      if (!k.startsWith("metric.") || v === "") continue;
      const mName = k.replace(/^metric\./, "");
      const num = parseFloat(v);
      if (Number.isNaN(num)) continue;
      if (inferredTaskName === "plawbench" || inferredTaskName === "lawbench") {
        metrics[mName] = mName === "failed" ? Number(num.toFixed(2)) : Number((num * 100).toFixed(2));
      } else {
        metrics[mName] = Number(num.toFixed(2));
      }
    }

    if (typeof metrics.submission_valid === "number") {
      submissionValid = metrics.submission_valid >= 1;
    }

    const primaryName =
      typeof metrics.legal_quality === "number"
        ? "legal_quality"
        : typeof metrics.acc === "number"
        ? "acc"
        : typeof metrics.score === "number"
        ? "score"
        : Object.keys(metrics)[0] || "score";

    subtaskMetrics.push({
      task: r.task || inferredTaskName,
      label:
        inferredTaskName === "lawbench"
          ? LAWBENCH_LABELS[r.task] || r.task
          : inferredTaskName === "plawbench"
          ? PLAWBENCH_LABELS[r.task] || r.task
          : formatTaskTitle(r.task || inferredTaskName),
      primaryValue: typeof metrics[primaryName] === "number" ? metrics[primaryName] : null,
      primaryName,
      total,
      completed,
      failed,
      scored,
      metrics,
    });
  }

  let macroScore: number | null = null;
  let weightedScore: number | null = null;
  let primaryMetric: StoredMetricBadge | null = null;

  if (subtaskMetrics.length > 0) {
    const vals = subtaskMetrics
      .map((s) => s.primaryValue)
      .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
    if (vals.length > 0) {
      macroScore = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
    }
    const totalWeight = subtaskMetrics.reduce((acc, s) => acc + (s.scored || s.completed || 0), 0);
    if (totalWeight > 0) {
      const wSum = subtaskMetrics.reduce(
        (acc, s) => acc + (s.primaryValue ?? 0) * (s.scored || s.completed || 0),
        0
      );
      weightedScore = Number((wSum / totalWeight).toFixed(2));
    } else if (typeof fullSummaryJob?.overall_weighted === "number") {
      weightedScore = fullSummaryJob.overall_weighted;
    }

    if (inferredTaskName === "example") {
      const val = subtaskMetrics[0].metrics.legal_quality ?? macroScore;
      if (typeof val === "number") {
        primaryMetric = { name: "legal_quality", label: "Legal Quality", value: val, unit: "pts", max: 100 };
      }
    } else if (inferredTaskName === "plawbench") {
      const val = weightedScore ?? macroScore;
      if (typeof val === "number") {
        primaryMetric = { name: "weighted_acc", label: "Weighted Acc", value: val, unit: "%", max: 100 };
      }
    } else if (macroScore !== null) {
      primaryMetric = { name: "macro_score", label: "Macro Score", value: macroScore, unit: "%", max: 100 };
    }
  }

  let hasArtifacts = false;
  let artifactCount = 0;
  let trajectoryCount = 0;
  if (rawTrials.length > 0) {
    // Fast check on first trial to know if this job stores trajectory.json + artifacts
    const sampleTrial = rawTrials[0];
    const sampleResPath = path.join(jobDir, sampleTrial.result || "");
    const sampleTrajPath = path.join(path.dirname(sampleResPath), "trajectory.json");
    if (canRead(sampleTrajPath)) {
      trajectoryCount = rawTrials.length;
    }
    const sampleRes = rawTrials.length <= 2 ? safeReadJson(sampleResPath) : null;
    if (sampleRes?.artifacts) {
      const arts = extractResultArtifacts(sampleRes.artifacts, jobDir, storageRoot, baseRoot);
      artifactCount = arts.length;
      hasArtifacts = arts.length > 0;
    }
  }

  const jobId = String(summary.job_id || path.basename(jobDir));
  const key = `${storageRoot}:${relDir}`;
  const cliInspectCommand = `lexverse job inspect ${relDir}`;
  const cliRunCommand =
    sourceKind === "benchmark"
      ? `lexverse run -b ${inferredTaskName} --agents ${agent} --model ${model}${arm === "vanilla_cap" ? " --knowledge collection:legal_laws" : ""}`
      : `lexverse run -p user_workspace/tasks/${inferredTaskName} --agents ${agent} --model ${model} --environment docker`;

  return {
    key,
    jobId,
    storageRoot,
    storagePath: relDir,
    cohort,
    sourceKind,
    taskName: inferredTaskName,
    taskTitle: formatTaskTitle(inferredTaskName),
    agent,
    model,
    arm,
    armLabel,
    status: summary.status || "completed",
    verificationStatus: summary.verification_status || "not_configured",
    plannedTrials,
    completedTrials,
    failedTrials,
    scoredTrials: scoredTrials || completedTrials,
    primaryMetric,
    macroScore,
    weightedScore,
    submissionValid,
    subtaskMetrics,
    hasTrajectories: trajectoryCount > 0,
    trajectoryCount,
    hasArtifacts,
    artifactCount,
    updatedAt,
    files,
    sampledTrials:
      sourceKind === "benchmark" && rawTrials.length > 0
        ? sampleModernBenchmarkTrials(jobDir, inferredTaskName, summary, 3)
        : [],
    cliInspectCommand,
    cliRunCommand,
  };
}

function buildLegacyWorkspaceJobRecord(
  jobDir: string,
  dirName: string,
  _baseRoot: string
): StoredJobRecord | null {
  if (isForbiddenPathSegment(dirName)) return null;
  const summaryPath = path.join(jobDir, "summary.json");
  const summary = readSummaryCached(summaryPath);
  if (!summary || typeof summary !== "object" || !summary.benchmark) return null;

  const taskName = String(summary.benchmark);
  if (!SUPPORTED_LEGACY_BENCHMARKS.has(taskName)) return null;

  const relDir = `runs/${dirName}`;
  const storageRoot: StorageRootId = "workspace";
  const stSummary = safeStat(summaryPath);
  const updatedAt = stSummary ? stSummary.mtime.toISOString() : new Date().toISOString();

  const modelRaw = String(summary.model || "unknown");
  const model = path.basename(modelRaw) || modelRaw;
  const csvText = safeReadText(path.join(jobDir, "evaluation_result.csv"), 100000);
  const subtaskMetrics: StoredSubtaskMetric[] = [];

  // 1. Parse summary.tasks first (works across all 8 legacy/native benchmarks)
  if (summary.tasks && typeof summary.tasks === "object") {
    for (const [tId, tValRaw] of Object.entries(summary.tasks)) {
      if (!tValRaw || typeof tValRaw !== "object") continue;
      const tVal: any = tValRaw;
      const rawMetrics =
        tVal.metrics && typeof tVal.metrics === "object" ? tVal.metrics : tVal;
      const norm: Record<string, number> = {};
      for (const [mk, mv] of Object.entries(rawMetrics)) {
        if (typeof mv !== "number" || Number.isNaN(mv) || IGNORED_METRIC_KEYS.has(mk)) continue;
        norm[mk] = normalizeBenchmarkMetric(taskName, mk, mv);
      }
      if (Object.keys(norm).length === 0) continue;
      const prim = selectPrimaryMetricForSubtask(taskName, norm);
      subtaskMetrics.push({
        task: tId,
        label:
          taskName === "lawbench"
            ? LAWBENCH_LABELS[tId] || tId
            : taskName === "plawbench"
            ? PLAWBENCH_LABELS[tId] || tId
            : tId,
        primaryValue: prim.value,
        primaryName: prim.name,
        total: typeof tVal.expected_samples === "number" ? tVal.expected_samples : undefined,
        completed: typeof tVal.completed_samples === "number" ? tVal.completed_samples : undefined,
        failed: typeof tVal.failed_samples === "number" ? tVal.failed_samples : undefined,
        scored: typeof tVal.sample_count === "number" ? tVal.sample_count : undefined,
        metrics: norm,
      });
    }
  }

  // 2. Fallback to evaluation_result.csv if summary.tasks had no metrics
  if (subtaskMetrics.length === 0 && csvText) {
    const lines = csvText.trim().split(/\r?\n/).slice(1);
    if (taskName === "lawbench") {
      for (const line of lines) {
        const parts = line.split(",");
        if (parts.length >= 4) {
          const score = Number((parseFloat(parts[2]) * 100).toFixed(2));
          const abstention = Number((parseFloat(parts[3]) * 100).toFixed(2));
          if (!Number.isNaN(score)) {
            subtaskMetrics.push({
              task: parts[0],
              label: LAWBENCH_LABELS[parts[0]] || parts[0],
              primaryValue: score,
              primaryName: "score",
              metrics: {
                score,
                abstention_rate: Number.isNaN(abstention) ? 0 : abstention,
              },
            });
          }
        }
      }
    } else {
      const grouped: Record<string, Record<string, number>> = {};
      for (const line of lines) {
        const parts = line.split(",");
        if (parts.length >= 4) {
          const tId = parts[0];
          const mName = parts[2];
          const rawVal = parseFloat(parts[3]);
          if (Number.isNaN(rawVal) || IGNORED_METRIC_KEYS.has(mName)) continue;
          if (!grouped[tId]) grouped[tId] = {};
          grouped[tId][mName] = normalizeBenchmarkMetric(taskName, mName, rawVal);
        }
      }
      for (const [tId, metrics] of Object.entries(grouped)) {
        const prim = selectPrimaryMetricForSubtask(taskName, metrics);
        subtaskMetrics.push({
          task: tId,
          label: PLAWBENCH_LABELS[tId] || tId,
          primaryValue: prim.value,
          primaryName: prim.name,
          metrics,
        });
      }
    }
  }

  // Skip unscored smoke/broken workspace directories with 0 metrics
  if (subtaskMetrics.length === 0) return null;

  const vals = subtaskMetrics
    .map((s) => s.primaryValue)
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  const macroScore = vals.length
    ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
    : null;

  const legacyRefs = listLegacyTrialEntries(jobDir, relDir);
  const completedCount = Number(
    summary.samples?.completed ?? summary.coverage?.sample_count ?? legacyRefs.length
  );
  const expectedCount = Number(
    summary.samples?.expected ?? summary.coverage?.sample_count ?? (completedCount || legacyRefs.length)
  );
  const failedCount = Number(summary.samples?.failed ?? Math.max(0, expectedCount - completedCount));

  const isNative = NATIVE_BENCHMARKS.has(taskName);
  const unit = taskName === "legalworld" ? "pts" : "%";

  return {
    key: `${storageRoot}:${relDir}`,
    jobId: dirName,
    storageRoot,
    storagePath: relDir,
    cohort: "workspace",
    sourceKind: "benchmark",
    taskName,
    taskTitle: formatTaskTitle(taskName),
    agent: isNative ? "native" : "static",
    model,
    arm: isNative ? "native" : "static",
    armLabel: isNative ? "Native Multi-Agent" : "Static Prompt",
    status: summary.status || "completed",
    verificationStatus: subtaskMetrics.length > 0 || csvText ? "completed" : "not_configured",
    plannedTrials: expectedCount || legacyRefs.length,
    completedTrials: completedCount || legacyRefs.length,
    failedTrials: failedCount,
    scoredTrials: completedCount || legacyRefs.length,
    primaryMetric:
      macroScore !== null
        ? {
            name: taskName === "legalworld" ? "overall_score" : "macro_score",
            label: taskName === "legalworld" ? "Overall Score" : "Macro Score",
            value: macroScore,
            unit,
            max: 100,
          }
        : null,
    macroScore,
    weightedScore: macroScore,
    submissionValid: null,
    subtaskMetrics,
    hasTrajectories: legacyRefs.length > 0,
    trajectoryCount: legacyRefs.length,
    hasArtifacts: isNative && legacyRefs.length > 0,
    artifactCount: 0,
    updatedAt,
    files: collectJobFiles(jobDir, relDir, storageRoot),
    sampledTrials: sampleLegacyTrialsFromJob(jobDir, 3),
    cliInspectCommand: `lexverse job inspect ${relDir}`,
    cliRunCommand: `lexverse run -b ${taskName}${isNative ? "" : " --agents static"} --model ${model}`,
  };
}

function computeResultsSummary(jobs: StoredJobRecord[]): ResultsSummaryData {
  const totalJobs = jobs.length;
  const totalPlannedTrials = jobs.reduce((acc, j) => acc + (j.plannedTrials || 0), 0);
  const totalCompletedTrials = jobs.reduce((acc, j) => acc + (j.completedTrials || 0), 0);
  const totalVerifiedTrials = jobs.reduce((acc, j) => acc + (j.scoredTrials || 0), 0);
  const completionRate =
    totalPlannedTrials > 0 ? Number(((totalCompletedTrials / totalPlannedTrials) * 100).toFixed(1)) : 100;

  const distinctTasks = Array.from(new Set(jobs.map((j) => j.taskName))).sort();
  const distinctAgents = Array.from(new Set(jobs.map((j) => j.agent))).sort();
  const distinctModels = Array.from(new Set(jobs.map((j) => j.model))).sort();

  const findFullCapJob = (task: string, arm: string) =>
    jobs.find((j) => j.cohort === "full_capability" && j.taskName === task && j.arm === arm);

  const modeComparisons: ModeComparisonGroup[] = [];

  // 1) PLawBench Weighted & Macro comparison
  const pStatic = findFullCapJob("plawbench", "static");
  const pVanilla = findFullCapJob("plawbench", "vanilla");
  const pCap = findFullCapJob("plawbench", "vanilla_cap");
  if (pStatic || pVanilla || pCap) {
    const weightedBase = pStatic?.weightedScore ?? pStatic?.macroScore ?? 0;
    const weightedArms = [pStatic, pVanilla, pCap]
      .filter((j): j is StoredJobRecord => Boolean(j))
      .map((j) => {
        const val = Number((j.weightedScore ?? j.macroScore ?? 0).toFixed(2));
        return {
          arm: j.arm,
          armLabel: j.armLabel,
          value: val,
          delta: j.arm === "static" ? null : Number((val - weightedBase).toFixed(2)),
          jobKey: j.key,
          sampleCount: j.completedTrials,
        };
      });
    modeComparisons.push({
      id: "plawbench-weighted",
      title: "PLawBench · Weighted Overall",
      subtitle: "280 real cases across case analysis, consultation & drafting",
      taskName: "plawbench",
      metricName: "Weighted Acc",
      unit: "%",
      arms: weightedArms,
    });

    const macroBase = pStatic?.macroScore ?? 0;
    const macroArms = [pStatic, pVanilla, pCap]
      .filter((j): j is StoredJobRecord => Boolean(j))
      .map((j) => {
        const val = Number((j.macroScore ?? 0).toFixed(2));
        return {
          arm: j.arm,
          armLabel: j.armLabel,
          value: val,
          delta: j.arm === "static" ? null : Number((val - macroBase).toFixed(2)),
          jobKey: j.key,
          sampleCount: j.completedTrials,
        };
      });
    modeComparisons.push({
      id: "plawbench-macro",
      title: "PLawBench · 3-Task Macro Avg",
      subtitle: "Unweighted mean across 3 task types",
      taskName: "plawbench",
      metricName: "3-Task Macro",
      unit: "%",
      arms: macroArms,
    });
  }

  // 2) LawBench 20-Task Macro comparison
  const lStatic = findFullCapJob("lawbench", "static");
  const lVanilla = findFullCapJob("lawbench", "vanilla");
  const lCap = findFullCapJob("lawbench", "vanilla_cap");
  if (lStatic || lVanilla || lCap) {
    const lBase = lStatic?.macroScore ?? 0;
    const lArms = [lStatic, lVanilla, lCap]
      .filter((j): j is StoredJobRecord => Boolean(j))
      .map((j) => {
        const val = Number((j.macroScore ?? 0).toFixed(2));
        return {
          arm: j.arm,
          armLabel: j.armLabel,
          value: val,
          delta: j.arm === "static" ? null : Number((val - lBase).toFixed(2)),
          jobKey: j.key,
          sampleCount: j.completedTrials,
        };
      });
    modeComparisons.push({
      id: "lawbench-macro",
      title: "LawBench · 20-Task Macro Avg",
      subtitle: "10,000 zero-shot items across 20 cognitive legal tasks",
      taskName: "lawbench",
      metricName: "Macro Score",
      unit: "%",
      arms: lArms,
    });
  }

  // 3) Example Cohort Base vs Full Capabilities comparison
  const exFullJobs = jobs.filter((j) => j.cohort === "gpt6_luna_full_capabilities");
  const exBaseJobs = jobs.filter((j) => j.cohort === "gpt6_luna_agent_tests");
  if (exFullJobs.length > 0 || exBaseJobs.length > 0) {
    const avg = (list: StoredJobRecord[]) => {
      const vals = list
        .map((j) => j.primaryMetric?.value)
        .filter((v): v is number => typeof v === "number");
      return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0;
    };
    const baseMean = avg(exBaseJobs);
    const fullMean = avg(exFullJobs);
    const exArms: ModeComparisonGroup["arms"] = [];
    if (exBaseJobs.length) {
      exArms.push({
        arm: "base",
        armLabel: `Base Agents (${exBaseJobs.length})`,
        value: baseMean,
        delta: null,
        jobKey: exBaseJobs[0].key,
        sampleCount: exBaseJobs.length,
      });
    }
    if (exFullJobs.length) {
      exArms.push({
        arm: "full_capabilities",
        armLabel: `Full Capabilities (${exFullJobs.length})`,
        value: fullMean,
        delta: exBaseJobs.length ? Number((fullMean - baseMean).toFixed(2)) : null,
        jobKey: exFullJobs[0].key,
        sampleCount: exFullJobs.length,
      });
    }
    modeComparisons.push({
      id: "example-cohorts",
      title: "Example User Task · Mean Legal Quality",
      subtitle: "Average rubric score (/100) across evaluated CLI harnesses",
      taskName: "example",
      metricName: "Mean Legal Quality",
      unit: "pts",
      arms: exArms,
    });
  }

  // LawBench multi-arm 20-task table
  const lawMap = (j?: StoredJobRecord) =>
    new Map((j?.subtaskMetrics || []).map((s) => [s.task, s.primaryValue]));
  const lsMap = lawMap(lStatic);
  const lvMap = lawMap(lVanilla);
  const lcMap = lawMap(lCap);
  const lawKeys = Array.from(new Set([...lsMap.keys(), ...lvMap.keys(), ...lcMap.keys()])).sort(
    (a, b) => {
      const [a1, a2] = a.split("-").map(Number);
      const [b1, b2] = b.split("-").map(Number);
      return a1 !== b1 ? a1 - b1 : a2 - b2;
    }
  );
  const lawbenchMultiArm: MultiArmSubtaskRow[] = lawKeys.map((t) => ({
    task: t,
    label: LAWBENCH_LABELS[t] || t,
    static: lsMap.get(t) ?? null,
    vanilla: lvMap.get(t) ?? null,
    vanilla_cap: lcMap.get(t) ?? null,
  }));

  // PLawBench multi-arm 3-task table
  const pMap = (j?: StoredJobRecord) =>
    new Map((j?.subtaskMetrics || []).map((s) => [s.task, s.primaryValue]));
  const psMap = pMap(pStatic);
  const pvMap = pMap(pVanilla);
  const pcMap = pMap(pCap);
  const pKeys = ["case_analysis", "legal_consultation", "document_generation"].filter(
    (k) => psMap.has(k) || pvMap.has(k) || pcMap.has(k)
  );
  const plawbenchMultiArm: MultiArmSubtaskRow[] = pKeys.map((t) => ({
    task: t,
    label: PLAWBENCH_LABELS[t] || t,
    static: psMap.get(t) ?? null,
    vanilla: pvMap.get(t) ?? null,
    vanilla_cap: pcMap.get(t) ?? null,
  }));

  // Example paired agent comparison (no leaderboard framing — purely alphabetical / analytical pairing)
  const fullByAgent = new Map(exFullJobs.map((j) => [j.agent, j]));
  const baseByAgent = new Map(exBaseJobs.map((j) => [j.agent, j]));
  const allAgents = Array.from(new Set([...fullByAgent.keys(), ...baseByAgent.keys()])).sort();

  const exampleCohortComparison: ExampleAgentPairRow[] = allAgents.map((agent) => {
    const f = fullByAgent.get(agent);
    const b = baseByAgent.get(agent);
    const fScore = f?.primaryMetric?.value ?? null;
    const bScore = b?.primaryMetric?.value ?? null;

    const getStepsTools = (job?: StoredJobRecord) => {
      if (!job) return { steps: null, tools: null, trialPath: null };
      const sum = readSummaryCached(
        path.join(
          resolveRoots().upstreamRoot,
          job.storagePath,
          "summary.json"
        )
      );
      const t0 = sum?.trials?.[0];
      if (!t0?.result) return { steps: null, tools: null, trialPath: null };
      const trialDirRel = path.posix.join(job.storagePath, path.posix.dirname(t0.result));
      const resPath = path.join(resolveRoots().upstreamRoot, job.storagePath, t0.result);
      const trajPath = path.join(path.dirname(resPath), "trajectory.json");
      const res = safeReadJson(resPath);
      const traj = safeReadJson(trajPath, 2 * 1024 * 1024);
      const steps = Array.isArray(traj?.steps) ? traj.steps.length : null;
      const tools =
        typeof res?.usage?.tool_calls === "number"
          ? res.usage.tool_calls
          : traj?.steps
          ? detectToolUsage(traj.steps).toolCallsCount
          : null;
      return { steps, tools, trialPath: trialDirRel };
    };

    const fMeta = getStepsTools(f);
    const bMeta = getStepsTools(b);

    return {
      agent,
      model: f?.model || b?.model || "gpt-6-luna",
      baseScore: bScore,
      fullScore: fScore,
      delta: fScore !== null && bScore !== null ? Number((fScore - bScore).toFixed(2)) : null,
      baseValid: b?.submissionValid ?? false,
      fullValid: f?.submissionValid ?? false,
      baseSteps: bMeta.steps,
      fullSteps: fMeta.steps,
      baseTools: bMeta.tools,
      fullTools: fMeta.tools,
      baseJobKey: b?.key ?? null,
      fullJobKey: f?.key ?? null,
      baseTrialPath: bMeta.trialPath,
      fullTrialPath: fMeta.trialPath,
    };
  });

  return {
    totalJobs,
    totalPlannedTrials,
    totalCompletedTrials,
    totalVerifiedTrials,
    completionRate,
    distinctTasks,
    distinctAgents,
    distinctModels,
    modeComparisons,
    lawbenchMultiArm,
    plawbenchMultiArm,
    exampleCohortComparison,
  };
}

export function scanStorageOverview(forceRefresh = false): StorageOverviewResponse {
  const now = Date.now();
  if (!forceRefresh && STATE.overviewCache && now - STATE.overviewCache.ts < 15000) {
    return STATE.overviewCache.data;
  }

  const { repoRoot, upstreamRoot } = resolveRoots();
  const jobs: StoredJobRecord[] = [];
  const nextDescriptors = new Map<string, InternalJobDescriptor>();
  const scannedRelSet = new Set<string>();

  const register = (job: StoredJobRecord | null, absDir: string, relDir: string, storageRoot: StorageRootId) => {
    if (!job) return;
    jobs.push(job);
    nextDescriptors.set(job.key, { job, absDir, relDir, storageRoot });
    scannedRelSet.add(`${storageRoot}:${relDir}`);
  };

  // 1. Upstream runs/full_capability/*
  const fullCapRoot = path.join(upstreamRoot, "runs/full_capability");
  const fullSummary = safeReadJson(path.join(fullCapRoot, "full_summary.json"));
  const fullCapSpecs: Array<{
    dir: string;
    taskName: "plawbench" | "lawbench";
    arm: string;
    armLabel: string;
  }> = [
    { dir: "plawbench-cap", taskName: "plawbench", arm: "vanilla_cap", armLabel: "Vanilla + 16 Capabilities" },
    { dir: "plawbench-vanilla", taskName: "plawbench", arm: "vanilla", armLabel: "Vanilla (w/o Cap)" },
    { dir: "plawbench-static", taskName: "plawbench", arm: "static", armLabel: "Static Prompt" },
    { dir: "lawbench-cap", taskName: "lawbench", arm: "vanilla_cap", armLabel: "Vanilla + 16 Capabilities" },
    { dir: "lawbench-vanilla", taskName: "lawbench", arm: "vanilla", armLabel: "Vanilla (w/o Cap)" },
    { dir: "lawbench-static", taskName: "lawbench", arm: "static", armLabel: "Static Prompt" },
  ];

  for (const spec of fullCapSpecs) {
    const absDir = path.join(fullCapRoot, spec.dir);
    if (!canRead(absDir)) continue;
    const relDir = `runs/full_capability/${spec.dir}`;
    const job = buildModernJobRecord({
      jobDir: absDir,
      relDir,
      storageRoot: "upstream",
      cohort: "full_capability",
      armOverride: spec.arm,
      armLabelOverride: spec.armLabel,
      taskNameHint: spec.taskName,
      fullSummaryJob: fullSummary?.jobs?.[spec.dir],
      baseRoot: upstreamRoot,
    });
    register(job, absDir, relDir, "upstream");
  }

  // 2. Upstream example cohorts (gpt6_luna_full_capabilities & gpt6_luna_agent_tests)
  for (const cohort of ["gpt6_luna_full_capabilities", "gpt6_luna_agent_tests"] as const) {
    const cohortRoot = path.join(upstreamRoot, "runs", cohort);
    if (!canRead(cohortRoot)) continue;
    for (const agentDirName of fs.readdirSync(cohortRoot).sort()) {
      const absDir = path.join(cohortRoot, agentDirName);
      if (!safeStat(absDir)?.isDirectory()) continue;
      const summary = readSummaryCached(path.join(absDir, "summary.json"));
      if (!summary || summary.status !== "completed") continue;
      const firstResultRel = summary.trials?.[0]?.result;
      if (!firstResultRel) continue;
      const trajPath = path.join(absDir, path.dirname(firstResultRel), "trajectory.json");
      const traj = safeReadJson(trajPath, 2 * 1024 * 1024);
      if (!traj || !Array.isArray(traj.steps) || traj.steps.length <= 1) continue;

      const relDir = `runs/${cohort}/${agentDirName}`;
      const job = buildModernJobRecord({
        jobDir: absDir,
        relDir,
        storageRoot: "upstream",
        cohort,
        taskNameHint: "example",
        baseRoot: upstreamRoot,
      });
      register(job, absDir, relDir, "upstream");
    }
  }

  // 3. Workspace runs (legacy/native benchmark runs + any modern non-disputed job dirs)
  const localRunsRoot = path.join(repoRoot, "runs");
  const WORKSPACE_SKIP_RE = /(smoke|onecase|pilot-shard|probe|patch|id2-8-12|heading-v2|client-only|client-greeting|part1|part2)/i;
  if (canRead(localRunsRoot)) {
    for (const dirName of fs.readdirSync(localRunsRoot).sort()) {
      if (dirName.startsWith(".") || isForbiddenPathSegment(dirName) || WORKSPACE_SKIP_RE.test(dirName)) {
        continue;
      }
      const absDir = path.join(localRunsRoot, dirName);
      if (!safeStat(absDir)?.isDirectory()) continue;
      const relDir = `runs/${dirName}`;
      if (scannedRelSet.has(`workspace:${relDir}`)) continue;

      if (
        canRead(path.join(absDir, "summary.json")) &&
        canRead(path.join(absDir, "job.json"))
      ) {
        const job = buildModernJobRecord({
          jobDir: absDir,
          relDir,
          storageRoot: "workspace",
          cohort: "workspace",
          baseRoot: repoRoot,
        });
        register(job, absDir, relDir, "workspace");
      } else if (
        canRead(path.join(absDir, "summary.json")) &&
        safeStat(path.join(absDir, "trials"))?.isDirectory()
      ) {
        const job = buildLegacyWorkspaceJobRecord(absDir, dirName, repoRoot);
        register(job, absDir, relDir, "workspace");
      }
    }
  }

  // Deterministic clean sort: full_capability (plawbench/lawbench) -> workspace benchmarks -> example cohorts
  jobs.sort((a, b) => {
    const rank = (j: StoredJobRecord) =>
      j.cohort === "full_capability"
        ? 0
        : j.cohort === "workspace"
        ? 1
        : j.cohort === "gpt6_luna_full_capabilities"
        ? 2
        : 3;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.cohort === "full_capability" && b.cohort === "full_capability") {
      if (a.taskName !== b.taskName) return a.taskName === "plawbench" ? -1 : 1;
      const armOrder = (arm: string) => (arm === "vanilla_cap" ? 0 : arm === "vanilla" ? 1 : 2);
      return armOrder(a.arm) - armOrder(b.arm);
    }
    if (a.cohort === "workspace") return b.completedTrials - a.completedTrials;
    return (b.primaryMetric?.value ?? -1) - (a.primaryMetric?.value ?? -1) || a.agent.localeCompare(b.agent);
  });

  STATE.jobDescriptors = nextDescriptors;

  const upstreamJobs = jobs.filter((j) => j.storageRoot === "upstream");
  const workspaceJobs = jobs.filter((j) => j.storageRoot === "workspace");
  const armMap = new Map<string, string>();
  for (const j of jobs) {
    if (!armMap.has(j.arm)) armMap.set(j.arm, j.armLabel);
  }

  const resultsSummary = computeResultsSummary(jobs);

  const response: StorageOverviewResponse = {
    generatedAt: new Date().toISOString(),
    mode: "serve",
    storageRoots: [
      {
        id: "upstream",
        label: "Experiment Archive Store",
        rootPath: path.join(upstreamRoot, "runs"),
        jobCount: upstreamJobs.length,
        trialCount: upstreamJobs.reduce((acc, j) => acc + j.completedTrials, 0),
      },
      {
        id: "workspace",
        label: "Local Workspace Runs",
        rootPath: path.join(repoRoot, "runs"),
        jobCount: workspaceJobs.length,
        trialCount: workspaceJobs.reduce((acc, j) => acc + j.completedTrials, 0),
      },
    ],
    jobs,
    facets: {
      taskNames: resultsSummary.distinctTasks,
      cohorts: Array.from(new Set(jobs.map((j) => j.cohort))).sort(),
      arms: Array.from(armMap.entries()).map(([id, label]) => ({ id, label })),
      agents: resultsSummary.distinctAgents,
      models: resultsSummary.distinctModels,
    },
    resultsSummary,
  };

  STATE.overviewCache = { ts: now, data: response };
  return response;
}

export function queryStoredTrials(params: {
  jobKey?: string;
  taskName?: string;
  cohort?: string;
  agent?: string;
  arm?: string;
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): TrialsPageResponse {
  if (!STATE.overviewCache) {
    scanStorageOverview(false);
  }
  const overview = STATE.overviewCache!.data;
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 12));
  const page = Math.max(1, params.page || 1);
  const q = (params.q || "").trim().toLowerCase();

  // Order jobs for browsing: example full/base -> plawbench -> lawbench (or filtered)
  const trajJobs = overview.jobs.filter((j) => j.hasTrajectories);
  const matchingJobs = trajJobs.filter((j) => {
    if (params.jobKey && params.jobKey !== "all" && j.key !== params.jobKey) return false;
    if (params.taskName && params.taskName !== "all" && j.taskName !== params.taskName) return false;
    if (params.cohort && params.cohort !== "all" && j.cohort !== params.cohort) return false;
    if (params.agent && params.agent !== "all" && j.agent !== params.agent) return false;
    if (params.arm && params.arm !== "all" && j.arm !== params.arm) return false;
    return true;
  });

  // Sort jobs so when browsing "all", Example & PLawBench appear alongside LawBench nicely
  matchingJobs.sort((a, b) => {
    const order = (j: StoredJobRecord) =>
      j.cohort === "gpt6_luna_full_capabilities"
        ? 0
        : j.cohort === "gpt6_luna_agent_tests"
        ? 1
        : j.taskName === "plawbench"
        ? 2
        : 3;
    return order(a) - order(b);
  });

  interface LightTrialRef {
    mode: "modern" | "legacy";
    descriptor: InternalJobDescriptor;
    rawTrial: any;
    taskName: string;
    taskType: string;
    sampleId: string;
    relTrialDir: string;
  }

  const matchedRefs: LightTrialRef[] = [];

  for (const job of matchingJobs) {
    const desc = STATE.jobDescriptors.get(job.key);
    if (!desc) continue;
    const summary = readSummaryCached(path.join(desc.absDir, "summary.json"));
    const rawTrials: any[] = Array.isArray(summary?.trials) ? summary.trials : [];
    if (rawTrials.length > 0) {
      for (const tr of rawTrials) {
        if (params.status && params.status !== "all" && tr.status !== params.status) continue;
        if (!tr.result) continue;
        const parsedId = parseTaskIdParts(tr.task_id, job.taskName);
        const relTrialDir = path.posix.join(desc.relDir, path.posix.dirname(tr.result));
        if (q) {
          const hay = `${tr.trial_id} ${tr.task_id} ${parsedId.taskType} ${parsedId.sampleId} ${job.agent} ${job.model} ${job.jobId} ${relTrialDir} ${job.armLabel}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        matchedRefs.push({
          mode: "modern",
          descriptor: desc,
          rawTrial: tr,
          taskName: parsedId.taskName,
          taskType: parsedId.taskType,
          sampleId: parsedId.sampleId,
          relTrialDir,
        });
      }
    } else {
      const legacyEntries = listLegacyTrialEntries(desc.absDir, desc.relDir);
      for (const le of legacyEntries) {
        if (q) {
          const hay = `${job.taskName} ${le.taskType} ${le.sampleId} ${job.agent} ${job.model} ${job.jobId} ${le.relTrialDir} ${job.armLabel}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        matchedRefs.push({
          mode: "legacy",
          descriptor: desc,
          rawTrial: le,
          taskName: job.taskName,
          taskType: le.taskType,
          sampleId: le.sampleId,
          relTrialDir: le.relTrialDir,
        });
      }
    }
  }

  const total = matchedRefs.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = matchedRefs.slice(start, start + pageSize);

  const items: StoredTrialIndexEntry[] = slice.map((ref) =>
    ref.mode === "modern" ? hydrateIndexEntry(ref) : hydrateLegacyIndexEntry(ref)
  );

  return {
    total,
    page: safePage,
    pageSize,
    totalPages,
    items,
  };
}

function hydrateLegacyIndexEntry(ref: {
  descriptor: InternalJobDescriptor;
  taskName: string;
  taskType: string;
  sampleId: string;
  relTrialDir: string;
}): StoredTrialIndexEntry {
  const { descriptor, taskType, sampleId, relTrialDir } = ref;
  const { job, storageRoot } = descriptor;
  const { repoRoot, upstreamRoot } = resolveRoots();
  const baseRoot = storageRoot === "upstream" ? upstreamRoot : repoRoot;

  const trialAbs = path.join(baseRoot, relTrialDir);
  const resAbs = path.join(trialAbs, "results.json");
  const stRes = safeStat(resAbs);
  const res = safeReadJson(resAbs, 16 * 1024 * 1024);

  const inter = res?.interaction || {};
  let turns = Array.isArray(inter.dialog_history) && inter.dialog_history.length > 0
    ? inter.dialog_history.length
    : Array.isArray(inter.messages)
    ? inter.messages.length
    : 2;

  if (job.taskName === "dlawbench" && Array.isArray(inter.dialog_history)) {
    turns = inter.dialog_history.length * 2;
  } else if (job.taskName === "legalworld") {
    const pr = safeReadJson(path.join(trialAbs, "native/pipeline_result.json"), 8 * 1024 * 1024);
    if (pr?.stage_results && typeof pr.stage_results === "object") {
      let totalDh = 0;
      for (const stVal of Object.values(pr.stage_results) as any[]) {
        if (Array.isArray(stVal?.dialog_history)) totalDh += stVal.dialog_history.length;
      }
      if (totalDh > 0) turns = totalDh;
    }
  }

  let score: number | null = null;
  const unit = job.taskName === "legalworld" ? "pts" : "%";
  const rawMetrics = res?.evaluation?.metrics;
  if (rawMetrics && typeof rawMetrics === "object") {
    const norm: Record<string, number> = {};
    for (const [mk, mv] of Object.entries(rawMetrics)) {
      if (typeof mv !== "number" || Number.isNaN(mv) || IGNORED_METRIC_KEYS.has(mk)) continue;
      norm[mk] = normalizeBenchmarkMetric(job.taskName, mk, mv);
    }
    score = selectPrimaryMetricForSubtask(job.taskName, norm).value;
  } else if (job.taskName === "lawbench") {
    const sub = job.subtaskMetrics.find((s) => s.task === taskType);
    score = sub?.primaryValue ?? null;
  }

  const usage = inter.dialog_history?.[0]?.metadata?.usage;
  const promptTokens = typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0;
  const completionTokens = typeof usage?.completion_tokens === "number" ? usage.completion_tokens : 0;

  const artifactNames: string[] = [];
  if (canRead(path.join(trialAbs, "memo.txt"))) artifactNames.push("memo.txt");
  if (canRead(path.join(trialAbs, "native/CD_document.pdf"))) artifactNames.push("CD_document.pdf");
  if (canRead(path.join(trialAbs, "native/AD_document.pdf"))) artifactNames.push("AD_document.pdf");

  return {
    id: `${storageRoot}:${relTrialDir}`,
    trialId: String(res?.trial_id || res?.id || `${taskType}:${sampleId}`),
    taskId: String(res?.id || `${job.taskName}:${taskType}:${sampleId}`),
    configId: String(res?.config_hash || ""),
    attempt: Number(res?.attempt || 1),
    jobKey: job.key,
    jobId: job.jobId,
    cohort: job.cohort,
    storageRoot,
    storagePath: relTrialDir,
    runDir: job.storagePath,
    sourceKind: "benchmark",
    taskName: job.taskName,
    taskType,
    sampleId,
    agent: job.agent,
    model: job.model,
    arm: job.arm,
    armLabel: job.armLabel,
    title: `${job.taskTitle} · ${taskType} #${sampleId}`,
    status: String(res?.status || "completed"),
    stopReason: null,
    updatedAt: stRes ? stRes.mtime.toISOString() : job.updatedAt,
    score,
    scoreUnit: unit,
    scoreLabel: unit === "pts" ? "Score" : "Metric",
    steps: turns,
    toolCalls: 0,
    promptTokens,
    completionTokens,
    hasArtifacts: artifactNames.length > 0,
    artifactNames,
    usedRetrieval: false,
    usedSkill: false,
  };
}

function hydrateIndexEntry(ref: {
  descriptor: InternalJobDescriptor;
  rawTrial: any;
  taskName: string;
  taskType: string;
  sampleId: string;
  relTrialDir: string;
}): StoredTrialIndexEntry {
  const { descriptor, rawTrial, taskName, taskType, sampleId, relTrialDir } = ref;
  const { job, absDir, storageRoot } = descriptor;
  const { repoRoot, upstreamRoot } = resolveRoots();
  const baseRoot = storageRoot === "upstream" ? upstreamRoot : repoRoot;

  const resAbs = path.join(absDir, rawTrial.result);
  const res = safeReadJson(resAbs);
  const trajAbs = path.join(path.dirname(resAbs), "trajectory.json");
  const stRes = safeStat(resAbs);
  const traj = safeReadJson(trajAbs, 2 * 1024 * 1024);
  const stepsArr = Array.isArray(traj?.steps)
    ? traj.steps
    : Array.isArray(traj?.messages)
    ? traj.messages
    : [];
  const { usedRetrieval, usedSkill, toolCallsCount } = Array.isArray(traj?.steps)
    ? detectToolUsage(traj.steps)
    : { usedRetrieval: false, usedSkill: false, toolCallsCount: 0 };

  const mcpCalls = Object.values(res?.usage?.mcp || {}).reduce(
    (acc: number, item: any) => acc + (item?.completed_calls || item?.calls || 0),
    0
  );

  let score: number | null = job.primaryMetric?.value ?? null;
  let scoreUnit = job.primaryMetric?.unit || "pts";
  let scoreLabel = job.primaryMetric?.label || "Score";

  if (job.taskName === "plawbench" && rawTrial.trial_id) {
    const verTrials = readVerificationCached(path.join(absDir, "verification/verification.json"));
    const tm = verTrials[rawTrial.trial_id]?.metrics;
    if (typeof tm?.acc === "number") {
      score = Number((tm.acc * 100).toFixed(1));
      scoreUnit = "%";
      scoreLabel = "Acc";
    }
  } else if (job.taskName === "lawbench") {
    const sub = job.subtaskMetrics.find((s) => s.task === taskType);
    score = sub?.primaryValue ?? job.macroScore ?? null;
    scoreUnit = "%";
    scoreLabel = "Task Avg";
  }

  const artifacts = extractResultArtifacts(res?.artifacts, absDir, storageRoot, baseRoot);
  const promptTokens =
    res?.usage?.input_tokens ??
    res?.usage?.prompt_tokens ??
    traj?.final_metrics?.total_prompt_tokens ??
    0;
  const completionTokens =
    res?.usage?.output_tokens ??
    res?.usage?.completion_tokens ??
    traj?.final_metrics?.total_completion_tokens ??
    0;

  return {
    id: `${storageRoot}:${relTrialDir}`,
    trialId: rawTrial.trial_id || res?.trial_id || "",
    taskId: rawTrial.task_id || res?.task_id || taskName,
    configId: rawTrial.config_id || res?.config_id || "",
    attempt: Number(rawTrial.attempt || res?.attempt || 1),
    jobKey: job.key,
    jobId: job.jobId,
    cohort: job.cohort,
    storageRoot,
    storagePath: relTrialDir,
    runDir: job.storagePath,
    sourceKind: job.sourceKind,
    taskName: job.taskName,
    taskType,
    sampleId,
    agent: job.agent,
    model: traj?.agent?.model_name || job.model,
    arm: job.arm,
    armLabel: job.armLabel,
    title:
      job.taskName === "example"
        ? `微信购表纠纷起诉准备 · ${job.agent}`
        : `${job.taskTitle} · ${taskType} #${sampleId}`,
    status: res?.status || rawTrial.status || "completed",
    stopReason: res?.stop_reason || null,
    updatedAt: stRes ? stRes.mtime.toISOString() : job.updatedAt,
    score,
    scoreUnit,
    scoreLabel,
    steps: stepsArr.length,
    toolCalls: toolCallsCount || res?.usage?.tool_calls || 0,
    promptTokens,
    completionTokens,
    hasArtifacts: artifacts.length > 0,
    artifactNames: artifacts.map((a) => a.name),
    usedRetrieval: usedRetrieval || mcpCalls > 0,
    usedSkill,
  };
}

function collectTrialFiles(
  trialAbsDir: string,
  relTrialDir: string,
  storageRoot: StorageRootId
): StoredTrialFileItem[] {
  const out: StoredTrialFileItem[] = [];
  const rootFiles = ["result.json", "trajectory.json"];
  for (const name of rootFiles) {
    const fp = path.join(trialAbsDir, name);
    const st = safeStat(fp);
    if (st && st.isFile() && canRead(fp)) {
      out.push({
        name,
        relPath: `${relTrialDir}/${name}`.replace(/\\/g, "/"),
        storageRoot,
        sizeBytes: st.size,
        kind: name === "result.json" ? "result" : "trajectory",
        downloadable: true,
      });
    }
  }

  const artDir = path.join(trialAbsDir, "artifacts");
  if (canRead(artDir) && safeStat(artDir)?.isDirectory()) {
    for (const entry of fs.readdirSync(artDir).sort()) {
      if (entry.startsWith(".")) continue;
      const fp = path.join(artDir, entry);
      const st = safeStat(fp);
      if (st && st.isFile() && canRead(fp)) {
        out.push({
          name: `artifacts/${entry}`,
          relPath: `${relTrialDir}/artifacts/${entry}`.replace(/\\/g, "/"),
          storageRoot,
          sizeBytes: st.size,
          kind: "artifact",
          downloadable: true,
        });
      }
    }
  }

  for (const internalRel of [".internal/lifecycle.jsonl", ".internal/artifacts.json", ".internal/events.jsonl"]) {
    const fp = path.join(trialAbsDir, internalRel);
    const st = safeStat(fp);
    if (st && st.isFile() && canRead(fp)) {
      out.push({
        name: internalRel,
        relPath: `${relTrialDir}/${internalRel}`.replace(/\\/g, "/"),
        storageRoot,
        sizeBytes: st.size,
        kind: "internal",
        downloadable: false,
      });
    }
  }

  return out;
}

const WORKSPACE_TEXT_EXTS = new Set([
  ".txt",
  ".md",
  ".json",
  ".py",
  ".sh",
  ".csv",
  ".yaml",
  ".yml",
  ".toml",
  ".js",
  ".ts",
  ".tsx",
  ".html",
  ".xml",
  ".sql",
  ".log",
  ".ini",
  ".cfg",
]);

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#([0-9]+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function readZipEntries(
  absPath: string,
  predicate: (fileName: string) => boolean
): Map<string, Buffer> | null {
  try {
    if (!canRead(absPath)) return null;
    const st = safeStat(absPath);
    if (!st || !st.isFile() || st.size > 12 * 1024 * 1024) return null;
    const buf = fs.readFileSync(absPath);
    if (buf.length < 22) return null;

    const minOff = Math.max(0, buf.length - 65557);
    let eocdOff = -1;
    for (let i = buf.length - 22; i >= minOff; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocdOff = i;
        break;
      }
    }
    if (eocdOff === -1) return null;

    const totalEntries = buf.readUInt16LE(eocdOff + 10);
    let cdOff = buf.readUInt32LE(eocdOff + 16);
    const out = new Map<string, Buffer>();

    for (let e = 0; e < totalEntries && cdOff + 46 <= eocdOff; e++) {
      if (buf.readUInt32LE(cdOff) !== 0x02014b50) break;
      const compression = buf.readUInt16LE(cdOff + 10);
      const compressedSize = buf.readUInt32LE(cdOff + 20);
      const nameLen = buf.readUInt16LE(cdOff + 28);
      const extraLen = buf.readUInt16LE(cdOff + 30);
      const commentLen = buf.readUInt16LE(cdOff + 32);
      const localHeaderOff = buf.readUInt32LE(cdOff + 42);
      const fileName = buf.subarray(cdOff + 46, cdOff + 46 + nameLen).toString("utf8");
      cdOff += 46 + nameLen + extraLen + commentLen;

      if (!predicate(fileName)) continue;
      if (localHeaderOff + 30 > buf.length || buf.readUInt32LE(localHeaderOff) !== 0x04034b50) {
        continue;
      }
      const lNameLen = buf.readUInt16LE(localHeaderOff + 26);
      const lExtraLen = buf.readUInt16LE(localHeaderOff + 28);
      const dataStart = localHeaderOff + 30 + lNameLen + lExtraLen;
      if (dataStart + compressedSize > buf.length) continue;

      const compressed = buf.subarray(dataStart, dataStart + compressedSize);
      const content =
        compression === 0
          ? compressed
          : compression === 8
          ? zlib.inflateRawSync(compressed)
          : null;
      if (content) out.set(fileName, content);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Extracts readable paragraph text from a .docx ZIP archive using pure node:zlib
 * (no external dependencies or subprocesses).
 */
export function extractDocxPreviewText(absPath: string, maxChars = 14000): string | null {
  try {
    const entries = readZipEntries(absPath, (name) => name === "word/document.xml");
    const xmlBuf = entries?.get("word/document.xml");
    if (!xmlBuf) return null;

    const xml = xmlBuf
      .toString("utf8")
      .replace(/<w:tab[^>]*\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n");

    const paragraphs: string[] = [];
    for (const block of xml.split(/<\/w:p>/)) {
      const runs = Array.from(block.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)).map((m) =>
        decodeXmlEntities(m[1])
      );
      const line = runs.join("").trim();
      if (line) paragraphs.push(line);
    }

    if (!paragraphs.length) return null;
    const joined = paragraphs.join("\n\n");
    return joined.length > maxChars ? joined.slice(0, maxChars) + "\n… [truncated]" : joined;
  } catch {
    return null;
  }
}

function colRefToIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] || "A";
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, idx - 1);
}

/**
 * Extracts sheets & plain-text TSV summary from a .xlsx ZIP archive using pure node:zlib.
 */
export function extractXlsxPreview(
  absPath: string,
  maxRows = 120
): { sheets: Array<{ name: string; rows: string[][] }>; text: string } | null {
  try {
    const entries = readZipEntries(
      absPath,
      (name) =>
        name === "xl/sharedStrings.xml" ||
        name === "xl/workbook.xml" ||
        /^xl\/worksheets\/sheet\d+\.xml$/.test(name)
    );
    if (!entries || entries.size === 0) return null;

    const sharedStrings: string[] = [];
    const ssBuf = entries.get("xl/sharedStrings.xml");
    if (ssBuf) {
      const ssXml = ssBuf.toString("utf8");
      for (const si of ssXml.matchAll(/<(?:[a-zA-Z_][\w-]*:)?si\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w-]*:)?si>/g)) {
        const txt = Array.from(
          si[1].matchAll(/<(?:[a-zA-Z_][\w-]*:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-zA-Z_][\w-]*:)?t>/g)
        )
          .map((m) => decodeXmlEntities(m[1]))
          .join("");
        sharedStrings.push(txt);
      }
    }

    const sheetNames: string[] = [];
    const wbBuf = entries.get("xl/workbook.xml");
    if (wbBuf) {
      const wbXml = wbBuf.toString("utf8");
      for (const m of wbXml.matchAll(/<(?:[a-zA-Z_][\w-]*:)?sheet\b[^>]*name="([^"]+)"/g)) {
        sheetNames.push(decodeXmlEntities(m[1]));
      }
    }

    const sheetFiles = Array.from(entries.keys())
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
      .sort((a, b) => {
        const na = Number(a.match(/sheet(\d+)\.xml$/)?.[1] || 0);
        const nb = Number(b.match(/sheet(\d+)\.xml$/)?.[1] || 0);
        return na - nb;
      });

    const sheets: Array<{ name: string; rows: string[][] }> = [];
    const textBlocks: string[] = [];

    for (let sIdx = 0; sIdx < sheetFiles.length; sIdx++) {
      const xml = entries.get(sheetFiles[sIdx])!.toString("utf8");
      const rawRows: string[][] = [];
      let maxCols = 0;

      for (const rm of xml.matchAll(/<(?:[a-zA-Z_][\w-]*:)?row\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w-]*:)?row>/g)) {
        if (rawRows.length >= maxRows) break;
        const rowCells: string[] = [];
        for (const cm of rm[1].matchAll(
          /<(?:[a-zA-Z_][\w-]*:)?c\b([^>]*)(?:\/>|>([\s\S]*?)<\/(?:[a-zA-Z_][\w-]*:)?c>)/g
        )) {
          const attrs = cm[1] || "";
          const inner = cm[2] || "";
          const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
          const type = attrs.match(/\bt="([^"]+)"/)?.[1] || "";
          const colIdx = ref ? colRefToIndex(ref) : rowCells.length;

          let val = "";
          if (type === "inlineStr") {
            val = Array.from(
              inner.matchAll(/<(?:[a-zA-Z_][\w-]*:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-zA-Z_][\w-]*:)?t>/g)
            )
              .map((m) => decodeXmlEntities(m[1]))
              .join("");
          } else {
            const vMatch = inner.match(
              /<(?:[a-zA-Z_][\w-]*:)?v\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w-]*:)?v>/
            );
            const rawVal = vMatch ? decodeXmlEntities(vMatch[1]).trim() : "";
            if (type === "s") {
              val = sharedStrings[Number(rawVal)] ?? rawVal;
            } else if (type === "b") {
              val = rawVal === "1" ? "TRUE" : "FALSE";
            } else if (type === "d") {
              val = rawVal.replace(/T00:00:00(?:\.000)?Z$/, "");
            } else {
              val = rawVal;
            }
          }

          while (rowCells.length <= colIdx) rowCells.push("");
          rowCells[colIdx] = val.trim();
        }

        while (rowCells.length > 0 && rowCells[rowCells.length - 1] === "") {
          rowCells.pop();
        }
        if (rowCells.some((c) => c !== "")) {
          maxCols = Math.max(maxCols, rowCells.length);
          rawRows.push(rowCells);
        }
      }

      if (rawRows.length > 0) {
        const normalized = rawRows.map((r) => {
          const padded = [...r];
          while (padded.length < maxCols) padded.push("");
          return padded;
        });
        const name = sheetNames[sIdx] || `Sheet${sIdx + 1}`;
        sheets.push({ name, rows: normalized });
        textBlocks.push(`[${name}]\n` + normalized.map((r) => r.join("\t")).join("\n"));
      }
    }

    if (!sheets.length) return null;
    return { sheets, text: textBlocks.join("\n\n") };
  } catch {
    return null;
  }
}

export function extractPdfPreviewText(absPath: string, maxChars = 16000): string | null {
  try {
    if (!canRead(absPath)) return null;
    const st = safeStat(absPath);
    if (!st || !st.isFile() || st.size > 16 * 1024 * 1024) return null;
    const txt = execFileSync("pdftotext", ["-layout", absPath, "-"], {
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
      encoding: "utf8",
    });
    const clean = (txt || "").replace(/\f/g, "\n").trim();
    if (!clean) return null;
    return clean.length > maxChars ? clean.slice(0, maxChars) + "\n… [truncated]" : clean;
  } catch {
    return null;
  }
}

function readWorkspaceFilePreview(absPath: string, sizeBytes: number, maxChars = 14000): string | undefined {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === ".docx") {
    return extractDocxPreviewText(absPath, maxChars) ?? undefined;
  }
  if (ext === ".xlsx") {
    return extractXlsxPreview(absPath)?.text ?? undefined;
  }
  if (ext === ".pdf") {
    return extractPdfPreviewText(absPath, maxChars) ?? undefined;
  }
  if (sizeBytes > 256 * 1024) return undefined;
  try {
    if (!canRead(absPath)) return undefined;
    const raw = fs.readFileSync(absPath);
    // Reject binary files containing NUL bytes unless extension is explicitly text
    if (!WORKSPACE_TEXT_EXTS.has(ext) && raw.subarray(0, 2048).includes(0)) {
      return undefined;
    }
    const text = raw.toString("utf8");
    return text.length > maxChars ? text.slice(0, maxChars) + "\n… [truncated]" : text;
  } catch {
    return undefined;
  }
}

function normalizeWorkPath(rawPath: string): string {
  const cleaned = String(rawPath || "").replace(/\\/g, "/").trim();
  if (!cleaned) return "";
  if (cleaned.startsWith("/")) return path.posix.normalize(cleaned);
  return path.posix.normalize(`/work/${cleaned}`);
}

function parseRawToolArgs(rawArgs: any): Record<string, any> {
  if (!rawArgs) return {};
  if (typeof rawArgs === "string") {
    try {
      const parsed = JSON.parse(rawArgs);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof rawArgs === "object" ? rawArgs : {};
}

function collectAgentWorkspace(params: {
  trialAbsDir: string;
  relClean: string;
  rawTraj: any;
  artifacts: StoredArtifactItem[];
  storageRoot: StorageRootId;
  baseRoot: string;
}): {
  workFiles: AgentWorkspaceFile[];
  accessedInputs: Array<{ path: string; stepId: number; toolName: string }>;
  invokedSkills: string[];
  artifactsManifest: Array<Record<string, any>>;
} {
  const { trialAbsDir, relClean, rawTraj, artifacts, storageRoot, baseRoot } = params;

  // 1. Parse .internal/artifacts.json manifest to map destination -> container source path
  const artManifestRaw = safeReadJson(path.join(trialAbsDir, ".internal/artifacts.json"), 128 * 1024);
  const artifactsManifest: Array<Record<string, any>> = Array.isArray(artManifestRaw?.artifacts)
    ? artManifestRaw.artifacts
    : Array.isArray(artManifestRaw)
    ? artManifestRaw
    : [];

  const sourceByDest = new Map<string, string>();
  for (const item of artifactsManifest) {
    if (item && typeof item.destination === "string" && typeof item.source === "string") {
      sourceByDest.set(item.destination, normalizeWorkPath(item.source));
    }
  }

  const workFilesMap = new Map<string, AgentWorkspaceFile>();

  // 2. Collected deliverable artifacts (both from result.json and artifacts/ dir)
  for (const art of artifacts) {
    if (!art.relPath || isForbiddenPathSegment(art.relPath)) continue;
    const abs = path.join(baseRoot, art.relPath);
    const st = safeStat(abs);
    if (!st || !st.isFile() || !canRead(abs)) continue;
    const containerPath = sourceByDest.get(art.name) || normalizeWorkPath(`/work/${art.name}`);
    const previewText = readWorkspaceFilePreview(abs, st.size, 14000);
    workFilesMap.set(containerPath, {
      id: `artifact:${containerPath}`,
      path: containerPath,
      name: path.posix.basename(containerPath),
      category: "artifact",
      sizeBytes: art.sizeBytes ?? st.size,
      sha256: art.sha256,
      format: art.format || path.extname(abs).replace(/^\./, "") || undefined,
      previewText,
      downloadable: true,
      storageRoot,
      relPath: art.relPath,
    });
  }

  const artsDir = path.join(trialAbsDir, "artifacts");
  if (canRead(artsDir) && safeStat(artsDir)?.isDirectory()) {
    for (const entry of fs.readdirSync(artsDir).sort()) {
      if (entry.startsWith(".") || isForbiddenPathSegment(entry)) continue;
      const abs = path.join(artsDir, entry);
      const st = safeStat(abs);
      if (!st || !st.isFile() || !canRead(abs)) continue;
      const containerPath = sourceByDest.get(entry) || normalizeWorkPath(`/work/${entry}`);
      if (workFilesMap.has(containerPath)) continue;
      const relPath = `${relClean}/artifacts/${entry}`.replace(/\\/g, "/");
      workFilesMap.set(containerPath, {
        id: `artifact:${containerPath}`,
        path: containerPath,
        name: entry,
        category: "artifact",
        sizeBytes: st.size,
        format: path.extname(entry).replace(/^\./, "") || undefined,
        previewText: readWorkspaceFilePreview(abs, st.size, 14000),
        downloadable: true,
        storageRoot,
        relPath,
      });
    }
  }

  // 3. Persisted files inside .internal/agent_fs/workspace/ (e.g., nemo-agent solution.txt, answer.txt)
  const persistedWsDir = path.join(trialAbsDir, ".internal/agent_fs/workspace");
  const walkPersisted = (dirAbs: string, depth: number) => {
    if (depth > 3 || workFilesMap.size >= 40 || !canRead(dirAbs)) return;
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dirAbs).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      if (workFilesMap.size >= 40) break;
      if (name.startsWith(".") || name === "__pycache__" || isForbiddenPathSegment(name)) continue;
      const abs = path.join(dirAbs, name);
      const st = safeStat(abs);
      if (!st || !canRead(abs)) continue;
      if (st.isDirectory()) {
        walkPersisted(abs, depth + 1);
      } else if (st.isFile()) {
        const relFromWs = path.relative(persistedWsDir, abs).replace(/\\/g, "/");
        const containerPath = normalizeWorkPath(`/work/${relFromWs}`);
        if (workFilesMap.has(containerPath)) continue;
        workFilesMap.set(containerPath, {
          id: `persisted:${containerPath}`,
          path: containerPath,
          name,
          category: "persisted",
          sizeBytes: st.size,
          format: path.extname(name).replace(/^\./, "") || "txt",
          previewText: readWorkspaceFilePreview(abs, st.size, 14000),
          downloadable: false,
        });
      }
    }
  };
  if (safeStat(persistedWsDir)?.isDirectory()) {
    walkPersisted(persistedWsDir, 0);
  }

  // 4. Reconstruct files written/patched & inputs/skills accessed from raw ATIF trajectory steps
  const invokedSkillsSet = new Set<string>();
  const accessedInputsMap = new Map<string, { path: string; stepId: number; toolName: string }>();
  const writtenMap = new Map<string, AgentWorkspaceFile>();
  const rawSteps: any[] = Array.isArray(rawTraj?.steps) ? rawTraj.steps : [];

  for (let sIdx = 0; sIdx < rawSteps.length; sIdx++) {
    const step = rawSteps[sIdx];
    const stepId = typeof step?.step_id === "number" ? step.step_id : sIdx + 1;
    for (const tc of step?.tool_calls || []) {
      const toolName = String(tc?.function_name || "");
      const fn = toolName.toLowerCase();
      const args = parseRawToolArgs(tc?.arguments);
      const rawPath = String(
        args.file_path || args.filePath || args.path || args.filename || args.target_file || ""
      ).trim();

      const isCreateEditor = fn === "str_replace_editor" && args.command === "create";
      const isWrite =
        isCreateEditor ||
        ["write_file", "write", "create_file", "save_file", "file_write"].includes(fn);

      if (isWrite && rawPath && !isForbiddenPathSegment(rawPath)) {
        const containerPath = normalizeWorkPath(rawPath);
        const content = String(
          args.content ?? args.file_text ?? args.text ?? args.new_str ?? ""
        );
        writtenMap.set(containerPath, {
          id: `written:${containerPath}`,
          path: containerPath,
          name: path.posix.basename(containerPath),
          category: "written",
          sizeBytes: Buffer.byteLength(content, "utf8"),
          stepId,
          toolName,
          format: path.posix.extname(containerPath).replace(/^\./, "") || "txt",
          previewText: truncateText(content, 14000),
          downloadable: false,
        });
        continue;
      }

      const isPatch =
        fn === "apply_patch" ||
        fn === "patch_file" ||
        fn === "edit_file" ||
        fn === "edit" ||
        (fn === "str_replace_editor" && args.command === "str_replace");

      if (isPatch) {
        const patchText = String(
          args.patch ??
            args.patchText ??
            args.input ??
            args.content ??
            (typeof tc?.arguments === "string" ? tc.arguments : "")
        );
        const matchedFiles = Array.from(
          patchText.matchAll(/\*\*\*\s+(?:Add|Update)\s+File:\s*([^\r\n]+)/g)
        ).map((m) => m[1].trim());

        if (matchedFiles.length > 0) {
          for (const mf of matchedFiles) {
            if (!mf || isForbiddenPathSegment(mf)) continue;
            const containerPath = normalizeWorkPath(mf);
            const prev = writtenMap.get(containerPath);
            const combined = prev?.previewText
              ? `${prev.previewText}\n\n--- [Patched at Step #${stepId} via ${toolName}] ---\n${patchText}`
              : patchText;
            writtenMap.set(containerPath, {
              id: `written:${containerPath}`,
              path: containerPath,
              name: path.posix.basename(containerPath),
              category: "written",
              sizeBytes: Buffer.byteLength(patchText, "utf8"),
              stepId,
              toolName,
              format: path.posix.extname(containerPath).replace(/^\./, "") || "patch",
              previewText: truncateText(combined, 14000),
              downloadable: false,
            });
          }
        } else if (rawPath && !isForbiddenPathSegment(rawPath)) {
          const containerPath = normalizeWorkPath(rawPath);
          const oldStr = args.old_string ?? args.old_str ?? "";
          const newStr = args.new_string ?? args.new_str ?? args.content ?? patchText;
          const editSnippet =
            oldStr || newStr
              ? `--- Step #${stepId} (${toolName}) ---\n${
                  oldStr ? `- old:\n${String(oldStr)}\n\n` : ""
                }+ new:\n${String(newStr)}`
              : JSON.stringify(args, null, 2);
          const prev = writtenMap.get(containerPath);
          const combined = prev?.previewText
            ? `${prev.previewText}\n\n${editSnippet}`
            : editSnippet;
          writtenMap.set(containerPath, {
            id: `written:${containerPath}`,
            path: containerPath,
            name: path.posix.basename(containerPath),
            category: "written",
            sizeBytes: Buffer.byteLength(combined, "utf8"),
            stepId,
            toolName,
            format: path.posix.extname(containerPath).replace(/^\./, "") || "txt",
            previewText: truncateText(combined, 14000),
            downloadable: false,
          });
        }
        continue;
      }

      if (["skill", "read_skill", "use_skill", "load_skill", "activate_skill"].includes(fn)) {
        const sName = String(args.name || args.skill || args.skill_name || "").trim();
        if (sName && !isForbiddenPathSegment(sName)) invokedSkillsSet.add(sName);
      }

      if (rawPath && ["read_file", "read", "view_file", "open_file"].includes(fn)) {
        const skillMatch = rawPath.match(/\/skills\/([^/]+)/);
        if (skillMatch?.[1]) {
          invokedSkillsSet.add(skillMatch[1]);
        } else if (!isForbiddenPathSegment(rawPath) && accessedInputsMap.size < 30) {
          const normRead = normalizeWorkPath(rawPath);
          if (!accessedInputsMap.has(normRead)) {
            accessedInputsMap.set(normRead, { path: normRead, stepId, toolName });
          }
        }
      }
    }
  }

  for (const [cPath, wFile] of writtenMap.entries()) {
    if (!workFilesMap.has(cPath)) {
      workFilesMap.set(cPath, wFile);
    }
  }

  return {
    workFiles: Array.from(workFilesMap.values()),
    accessedInputs: Array.from(accessedInputsMap.values()),
    invokedSkills: Array.from(invokedSkillsSet).sort(),
    artifactsManifest,
  };
}

function collectLegacyTrialWorkFiles(params: {
  trialAbsDir: string;
  relClean: string;
  storageRoot: StorageRootId;
}): { workFiles: AgentWorkspaceFile[]; files: StoredTrialFileItem[] } {
  const { trialAbsDir, relClean, storageRoot } = params;
  const candidates: Array<{ rel: string; displayPath: string; category: AgentWorkspaceFile["category"]; priority: number }> = [
    { rel: "memo.txt", displayPath: "/work/memo.txt", category: "artifact", priority: 1 },
    { rel: "native/CD_document.pdf", displayPath: "/work/CD_document.pdf", category: "artifact", priority: 2 },
    { rel: "native/AD_document.pdf", displayPath: "/work/AD_document.pdf", category: "artifact", priority: 3 },
    { rel: "native/pipeline_result.json", displayPath: "/work/pipeline_result.json", category: "persisted", priority: 4 },
    { rel: "dialog_history.jsonl", displayPath: "/work/dialog_history.jsonl", category: "persisted", priority: 5 },
    { rel: "evaluation/eval_result.json", displayPath: "/work/evaluation/eval_result.json", category: "persisted", priority: 6 },
    { rel: "evaluation/grading.json", displayPath: "/work/evaluation/grading.json", category: "persisted", priority: 6 },
    { rel: "session.json", displayPath: "/work/session.json", category: "persisted", priority: 7 },
    { rel: "session_evaluated.json", displayPath: "/work/session_evaluated.json", category: "persisted", priority: 8 },
    { rel: "results.json", displayPath: "/work/results.json", category: "persisted", priority: 9 },
    { rel: "input.json", displayPath: "/work/input.json", category: "persisted", priority: 10 },
    { rel: "model_calls.json", displayPath: "/work/model_calls.json", category: "persisted", priority: 11 },
  ];

  // Also check any additional *.json / *.pdf directly under trialAbsDir/native/
  const nativeDir = path.join(trialAbsDir, "native");
  if (canRead(nativeDir) && safeStat(nativeDir)?.isDirectory()) {
    try {
      for (const f of fs.readdirSync(nativeDir).sort()) {
        if (f.startsWith(".") || f.startsWith("_") || isForbiddenPathSegment(f)) continue;
        const rel = `native/${f}`;
        if (!candidates.some((c) => c.rel === rel)) {
          const st = safeStat(path.join(nativeDir, f));
          if (st?.isFile()) {
            candidates.push({
              rel,
              displayPath: `/work/native/${f}`,
              category: f.endsWith(".pdf") ? "artifact" : "persisted",
              priority: 20,
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);
  const workFiles: AgentWorkspaceFile[] = [];
  const files: StoredTrialFileItem[] = [];

  for (const c of candidates) {
    if (workFiles.length >= 18 || isForbiddenPathSegment(c.rel)) continue;
    const abs = path.join(trialAbsDir, c.rel);
    const st = safeStat(abs);
    if (!st || !st.isFile() || !canRead(abs)) continue;
    const relPath = `${relClean}/${c.rel}`.replace(/\\/g, "/");
    workFiles.push({
      id: `${c.category}:${c.displayPath}`,
      path: c.displayPath,
      name: path.basename(c.rel),
      category: c.category,
      sizeBytes: st.size,
      format: path.extname(c.rel).replace(/^\./, "") || "txt",
      previewText: readWorkspaceFilePreview(abs, st.size, 14000),
      downloadable: true,
      storageRoot,
      relPath,
    });
    files.push({
      name: c.rel,
      relPath,
      storageRoot,
      sizeBytes: st.size,
      kind: c.rel === "results.json" ? "result" : c.category === "artifact" ? "artifact" : "internal",
      downloadable: true,
    });
  }

  return { workFiles, files };
}

function parseJudgeJsonFromRawOutput(raw: string): any | null {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function loadLegacyOrNativeTrialDetail(params: {
  storageRoot: StorageRootId;
  relClean: string;
  trialAbsDir: string;
  ownerDesc?: InternalJobDescriptor;
  baseRoot: string;
  staticOverrideId?: string;
}): StoredTrialDetail | null {
  const { storageRoot, relClean, trialAbsDir, ownerDesc, baseRoot, staticOverrideId } = params;
  const resAbs = path.join(trialAbsDir, "results.json");
  const res = safeReadJson(resAbs, 32 * 1024 * 1024);
  if (!res || typeof res !== "object") return null;

  const job = ownerDesc?.job;
  const taskName = String(job?.taskName || res.benchmark || "task");
  const sampleId = String(res.sample_id ?? path.basename(trialAbsDir));
  const taskType = String(res.task || path.basename(path.dirname(trialAbsDir)) || taskName);
  const agent = job?.agent || (NATIVE_BENCHMARKS.has(taskName) ? "native" : "static");
  const model =
    job?.model ||
    (typeof res.model === "string"
      ? path.basename(res.model)
      : path.basename(String(res.model?.name || "unknown")));
  const arm = job?.arm || (NATIVE_BENCHMARKS.has(taskName) ? "native" : "static");
  const armLabel = job?.armLabel || ARM_DISPLAY_LABELS[arm] || arm;

  const inter = res.interaction || {};
  const steps: any[] = [];
  let schemaVersion = "Static Q&A";
  let answer = coerceText(res.response);
  let reference = "";

  if (typeof res.reference === "string") {
    reference = truncateText(res.reference, 5000);
  } else if (Array.isArray(res.reference)) {
    reference = truncateText(res.reference.join("\n"), 5000);
  } else if (res.reference && typeof res.reference === "object") {
    reference = truncateText(JSON.stringify(res.reference, null, 2), 5000);
  }

  // Convert format-specific execution records into unified inspectable steps
  if (taskName === "legalworld") {
    schemaVersion = "Native Multi-Stage (Legal-world)";
    const pr = safeReadJson(path.join(trialAbsDir, "native/pipeline_result.json"), 16 * 1024 * 1024);
    const stageOrder: string[] = Array.isArray(pr?.stages_completed)
      ? pr.stages_completed
      : Object.keys(pr?.stage_results || {});
    let stepNum = 1;
    for (const stg of stageOrder) {
      const stgVal = pr?.stage_results?.[stg];
      if (!stgVal || typeof stgVal !== "object") continue;
      const dh: any[] = Array.isArray(stgVal.dialog_history)
        ? stgVal.dialog_history
        : Array.isArray(stgVal.debate_history)
        ? stgVal.debate_history
        : Array.isArray(stgVal.investigation_history)
        ? stgVal.investigation_history
        : [];
      for (const turn of dh) {
        if (steps.length >= 160) break;
        const role = String(turn?.role || stg);
        const content = coerceText(turn?.content || turn?.message);
        if (!content) continue;
        steps.push({
          step_id: stepNum++,
          timestamp: turn?.timestamp || null,
          source: /client|plaintiff|appellant|user/i.test(role) ? "user" : "agent",
          model_name: `[${stg}] ${role}`,
          message: truncateText(content, 4500),
          tool_calls: [],
        });
      }
      const docText =
        stgVal.complaint_statement || stgVal.appeal_statement || stgVal.final_judgment || stgVal.mediation_result;
      if (docText && steps.length < 160) {
        steps.push({
          step_id: stepNum++,
          source: "agent",
          model_name: `[${stg}] Deliverable`,
          message: truncateText(coerceText(docText), 5000),
          tool_calls: [],
        });
      }
    }
    const lastJudg = pr?.stage_results?.CIA?.final_judgment || pr?.stage_results?.CI?.final_judgment || pr?.stage_results?.DRAFT?.complaint_statement;
    if (!answer && lastJudg) {
      answer = truncateText(coerceText(lastJudg), 6000);
    }
  } else if (
    taskName === "dlawbench" &&
    Array.isArray(inter.dialog_history) &&
    inter.dialog_history.some((d: any) => d && ("lawyer_message" in d || "client_response" in d))
  ) {
    schemaVersion = "Native Dialogue (DLawBench)";
    let stepNum = 1;
    if (res.input?.instruction) {
      steps.push({
        step_id: stepNum++,
        source: "user",
        model_name: "Case Prompt",
        message: truncateText(res.input.instruction, 3000),
        tool_calls: [],
      });
    }
    for (const d of inter.dialog_history) {
      if (d.lawyer_message) {
        steps.push({
          step_id: stepNum++,
          timestamp: d.timestamp || null,
          source: "agent",
          model_name: `Lawyer (${model})`,
          message: truncateText(d.lawyer_message, 4500),
          tool_calls: [],
        });
      }
      if (d.client_response) {
        steps.push({
          step_id: stepNum++,
          timestamp: d.timestamp || null,
          source: "user",
          model_name: "Simulated Client",
          message: truncateText(d.client_response, 4500),
          tool_calls: [],
        });
      }
    }
    const memoText = safeReadText(path.join(trialAbsDir, "memo.txt"), 8000) || answer;
    if (memoText) {
      answer = truncateText(memoText, 6000);
      steps.push({
        step_id: stepNum++,
        source: "agent",
        model_name: "Legal Memo (Deliverable)",
        message: truncateText(memoText, 5000),
        tool_calls: [],
      });
    }
  } else if (
    Array.isArray(inter.dialog_history) &&
    inter.dialog_history.some((d: any) => d && typeof d.role === "string" && typeof d.content === "string")
  ) {
    schemaVersion =
      taskName === "simucourt" ? "Native Courtroom (AgentsCourt)" : "Native Multi-Agent Dialogue";
    let stepNum = 1;
    for (const d of inter.dialog_history.slice(0, 160)) {
      const role = String(d.role || d.actor || "agent");
      steps.push({
        step_id: stepNum++,
        timestamp: d.timestamp || null,
        source: /plaintiff|client|public|character|user/i.test(role) ? "user" : "agent",
        model_name: role,
        message: truncateText(d.content, 5000),
        tool_calls: [],
      });
    }
    if (answer && !String(inter.dialog_history[inter.dialog_history.length - 1]?.content || "").includes(answer.slice(0, 80))) {
      steps.push({
        step_id: stepNum++,
        source: "agent",
        model_name: `Final Deliverable (${model})`,
        message: truncateText(answer, 6000),
        tool_calls: [],
      });
    }
  } else {
    schemaVersion = taskName === "simucourt" ? "Native Courtroom (AgentsCourt)" : "Static Q&A";
    const msgs: any[] = Array.isArray(inter.messages) ? inter.messages : [];
    const dhUsage = inter.dialog_history?.[0]?.metadata?.usage;
    let stepNum = 1;
    if (msgs.length > 0) {
      for (const m of msgs) {
        const isSys = m?.role === "system";
        const isUser = m?.role === "user";
        steps.push({
          step_id: stepNum++,
          source: isSys ? "system" : isUser ? "user" : "agent",
          model_name: isSys ? "System Instruction" : isUser ? "Prompt / Input" : model,
          message: truncateText(m?.content, 6000),
          tool_calls: [],
        });
      }
    } else if (res.input?.instruction || res.input?.content) {
      steps.push({
        step_id: stepNum++,
        source: "user",
        model_name: "Prompt / Input",
        message: truncateText([res.input?.instruction, res.input?.content].filter(Boolean).join("\n\n"), 6000),
        tool_calls: [],
      });
    }
    const lastReply = inter.dialog_history?.[0]?.content || answer;
    if (lastReply) {
      steps.push({
        step_id: stepNum++,
        source: "agent",
        model_name: model,
        message: truncateText(lastReply, 6000),
        tool_calls: [],
        metrics: dhUsage
          ? {
              prompt_tokens: dhUsage.prompt_tokens ?? 0,
              completion_tokens: dhUsage.completion_tokens ?? 0,
            }
          : undefined,
      });
    }
  }

  // Normalize trial metrics & Verifier Judge
  const metrics: Record<string, StoredMetricItem> = {};
  let primaryMetric: StoredMetricBadge | null = null;
  const rawMetrics = res.evaluation?.metrics;
  const unit = taskName === "legalworld" ? "pts" : "%";

  if (rawMetrics && typeof rawMetrics === "object") {
    const normMap: Record<string, number> = {};
    for (const [mk, mv] of Object.entries(rawMetrics)) {
      if (typeof mv !== "number" || Number.isNaN(mv) || IGNORED_METRIC_KEYS.has(mk)) continue;
      normMap[mk] = normalizeBenchmarkMetric(taskName, mk, mv);
    }
    const prim = selectPrimaryMetricForSubtask(taskName, normMap);
    for (const [mk, mv] of Object.entries(normMap)) {
      metrics[mk] = {
        key: mk,
        label: PLAWBENCH_METRIC_LABELS[mk] || mk,
        value: mv,
        unit,
        max: 100,
        isPrimary: mk === prim.name,
      };
    }
    if (prim.value !== null) {
      primaryMetric = {
        name: prim.name,
        label: prim.name,
        value: prim.value,
        unit,
        max: 100,
      };
    }
  } else if (taskName === "lawbench" && job) {
    const sub = job.subtaskMetrics.find((s) => s.task === taskType);
    if (sub && sub.primaryValue !== null) {
      metrics.task_macro = {
        key: "task_macro",
        label: `Subtask ${taskType} Avg`,
        value: sub.primaryValue,
        unit: "%",
        max: 100,
        isPrimary: true,
      };
      primaryMetric = {
        name: "task_macro",
        label: `Subtask ${taskType} Avg`,
        value: sub.primaryValue,
        unit: "%",
        max: 100,
      };
    }
  }

  // Extract structured verifierJudge for legacy plawbench / legalworld / simucourt
  let verifierJudge: TrialHarborWorkspace["verifierJudge"] = null;
  if (taskName === "plawbench") {
    const att0 = res.evaluation?.raw_result?.attempts?.[0];
    const parsedJudge = parseJudgeJsonFromRawOutput(att0?.raw_judge_output || "");
    if (parsedJudge?.score_details) {
      const dims: Record<string, { score: number; max?: number; reason: string }> = {};
      for (const [dk, dv] of Object.entries(parsedJudge.score_details) as [string, any][]) {
        if (!dv || typeof dv !== "object") continue;
        const reasons = Array.isArray(dv.breakdown)
          ? dv.breakdown
              .map((b: any) => `[${b.points_awarded ?? 0}/${b.max_points ?? 0}] ${b.rationale || ""}`)
              .join("\n")
          : "";
        dims[dk] = {
          score: Number(dv.total_points ?? 0),
          max: Number(dv.max_points ?? 100),
          reason: reasons || dk,
        };
      }
      const fb = parsedJudge.overall_feedback;
      const summaryParts: string[] = [];
      if (Array.isArray(fb?.strengths) && fb.strengths.length) {
        summaryParts.push(`Strengths: ${fb.strengths.join(" ")}`);
      }
      if (Array.isArray(fb?.weaknesses) && fb.weaknesses.length) {
        summaryParts.push(`Weaknesses: ${fb.weaknesses.join(" ")}`);
      }
      verifierJudge = {
        status: res.evaluation?.status || "completed",
        model: res.evaluation?.provenance?.model || "judge",
        assessment: {
          dimensions: dims,
          summary: summaryParts.join("\n\n") || undefined,
        },
      };
    }
  } else if (taskName === "legalworld") {
    const evalRes = safeReadJson(path.join(trialAbsDir, "evaluation/eval_result.json"), 512 * 1024);
    if (evalRes?.stage_eval_results) {
      const dims: Record<string, { score: number; max?: number; reason: string }> = {};
      for (const [sk, sv] of Object.entries(evalRes.stage_eval_results) as [string, any][]) {
        const rawScore =
          typeof sv?.stage_score === "number"
            ? sv.stage_score
            : typeof sv?.score === "number"
            ? sv.score
            : typeof sv?.normalized_score === "number"
            ? sv.normalized_score
            : null;
        if (rawScore !== null) {
          dims[sk] = {
            score: normalizeBenchmarkMetric("legalworld", sk, rawScore),
            max: 100,
            reason: coerceText(sv?.feedback || sv?.summary || sv?.details || `${sk} stage evaluated`).slice(0, 600),
          };
        }
      }
      verifierJudge = {
        status: "completed",
        model: evalRes.judge_model || "legalworld-judge",
        assessment: {
          dimensions: dims,
          summary: `Overall weighted score: ${evalRes.overall_score ?? primaryMetric?.value ?? ""} / ${evalRes.overall_possible_score ?? 100}`,
        },
      };
    }
  } else if (taskName === "simucourt") {
    const grading = safeReadJson(path.join(trialAbsDir, "evaluation/grading.json"), 256 * 1024);
    if (grading?.raw_result?.gold) {
      reference = truncateText(JSON.stringify(grading.raw_result.gold, null, 2), 5000);
    }
  }

  const { workFiles, files } = collectLegacyTrialWorkFiles({
    trialAbsDir,
    relClean,
    storageRoot,
  });

  // Discover real siblings sharing the same (taskName, taskType, sampleId) across workspace/upstream
  const siblings: StoredSiblingTrial[] = [];
  for (const cand of STATE.jobDescriptors.values()) {
    if (cand.job.taskName !== taskName) continue;
    const candLegacyDir = path.join(cand.absDir, "trials", taskType, sampleId);
    if (canRead(path.join(candLegacyDir, "results.json"))) {
      const sibRelDir = path.posix.join(cand.relDir, "trials", taskType, sampleId);
      siblings.push({
        id: `${cand.storageRoot}:${sibRelDir}`,
        storageRoot: cand.storageRoot,
        storagePath: sibRelDir,
        jobKey: cand.job.key,
        jobId: cand.job.jobId,
        cohort: cand.job.cohort,
        agent: cand.job.agent,
        arm: cand.job.arm,
        armLabel: cand.job.armLabel,
        score: cand.job.primaryMetric?.value ?? null,
        scoreUnit: cand.job.primaryMetric?.unit ?? "%",
      });
    }
  }

  const dhUsage = inter.dialog_history?.[0]?.metadata?.usage;
  const promptTokens = typeof dhUsage?.prompt_tokens === "number" ? dhUsage.prompt_tokens : 0;
  const completionTokens = typeof dhUsage?.completion_tokens === "number" ? dhUsage.completion_tokens : 0;
  const stRes = safeStat(resAbs);

  const harborWorkspace: TrialHarborWorkspace = {
    verifierChecks: null,
    verifierReward: null,
    verifierJudge,
    mountedSkills: [],
    invokedSkills: [],
    workFiles,
    accessedInputs: [],
    artifactsManifest: [],
    knowledgeIndexes: [],
    lifecycleEvents: [],
  };

  return {
    id: staticOverrideId || `${storageRoot}:${relClean}`,
    trialId: String(res.trial_id || res.id || `${taskType}:${sampleId}`),
    taskId: String(res.id || `${taskName}:${taskType}:${sampleId}`),
    configId: String(res.config_hash || ""),
    attempt: Number(res.attempt || 1),
    jobKey: job?.key || `${storageRoot}:${path.posix.dirname(path.posix.dirname(path.posix.dirname(relClean)))}`,
    jobId: job?.jobId || path.basename(path.resolve(trialAbsDir, "../../..")),
    cohort: job?.cohort || "workspace",
    storageRoot,
    storagePath: relClean,
    runDir: job?.storagePath || relClean,
    sourceKind: "benchmark",
    taskName,
    taskType,
    sampleId,
    agent,
    model,
    arm,
    armLabel,
    title: `${formatTaskTitle(taskName)} · ${taskType} #${sampleId}`,
    subtitle: `${armLabel} · ${steps.length} turns`,
    status: String(res.status || "completed"),
    stopReason: null,
    updatedAt: stRes ? stRes.mtime.toISOString() : null,
    primaryMetric,
    metrics,
    answer: truncateText(answer, 6000),
    reference,
    artifacts: workFiles
      .filter((w) => w.category === "artifact" && w.relPath)
      .map((w) => ({
        name: w.name,
        relPath: w.relPath!,
        storageRoot,
        sizeBytes: w.sizeBytes,
        format: w.format,
      })),
    files,
    rawResult: {
      id: res.id,
      benchmark: res.benchmark,
      task: res.task,
      sample_id: res.sample_id,
      status: res.status,
      model,
      started_at: res.started_at,
      finished_at: res.finished_at,
      evaluation_status: res.evaluation?.status,
    },
    usage: {
      steps: steps.length,
      toolCalls: 0,
      modelCalls: null,
      activeElapsedSec: null,
      promptTokens,
      completionTokens,
      cachedTokens: 0,
      totalCostUsd: null,
      mcpCalls: 0,
      usedRetrieval: false,
      usedSkill: false,
    },
    siblings,
    harborWorkspace,
    trajectory: {
      schema_version: schemaVersion,
      session_id: String(res.trial_id || res.id || sampleId),
      agent: { name: agent, model_name: model },
      final_metrics: { total_steps: steps.length },
      steps,
    },
    cliCommand: `lexverse trial inspect ${relClean}`,
  };
}

export function loadStoredTrialDetail(
  storageRoot: StorageRootId,
  relTrialDir: string,
  staticOverrideId?: string
): StoredTrialDetail | null {
  if (!STATE.overviewCache) {
    scanStorageOverview(false);
  }
  const safe = resolveSafeStoragePath(storageRoot, relTrialDir);
  if (!safe) return null;

  const trialAbsDir = safe.absPath;
  const relClean = safe.relClean;
  if (!safeStat(trialAbsDir)?.isDirectory()) return null;

  const { repoRoot, upstreamRoot } = resolveRoots();
  const baseRoot = storageRoot === "upstream" ? upstreamRoot : repoRoot;

  // Locate owning job descriptor
  let ownerDesc: InternalJobDescriptor | undefined;
  for (const desc of STATE.jobDescriptors.values()) {
    if (desc.storageRoot === storageRoot && relClean.startsWith(desc.relDir + "/")) {
      ownerDesc = desc;
      break;
    }
  }

  const resAbs = path.join(trialAbsDir, "result.json");
  const trajAbs = path.join(trialAbsDir, "trajectory.json");
  const res = safeReadJson(resAbs);
  const rawTraj = safeReadJson(trajAbs);
  if (!rawTraj) {
    return loadLegacyOrNativeTrialDetail({
      storageRoot,
      relClean,
      trialAbsDir,
      ownerDesc,
      baseRoot,
      staticOverrideId,
    });
  }

  const job = ownerDesc?.job;
  const jobAbsDir = ownerDesc?.absDir || path.resolve(trialAbsDir, "../../..");
  const taskId = String(res?.task_id || res?.id || job?.taskName || "task");
  const parsedId = parseTaskIdParts(taskId, job?.taskName || "task");
  const taskName = job?.taskName || parsedId.taskName;
  const taskType = parsedId.taskType;
  const sampleId = String(res?.sample_id ?? parsedId.sampleId);
  const agent = job?.agent || rawTraj?.agent?.name || "vanilla";
  const model = rawTraj?.agent?.model_name || job?.model || "unknown";
  const arm = job?.arm || "default";
  const armLabel = job?.armLabel || ARM_DISPLAY_LABELS[arm] || arm;

  const sanitized = sanitizeTrajectory(rawTraj, res, agent, model);
  const { usedRetrieval, usedSkill, toolCallsCount } = detectToolUsage(sanitized.steps);

  const mcpCalls = Object.values(res?.usage?.mcp || {}).reduce(
    (acc: number, item: any) => acc + (item?.completed_calls || item?.calls || 0),
    0
  );
  const promptTokens =
    res?.usage?.input_tokens ??
    res?.usage?.prompt_tokens ??
    rawTraj?.final_metrics?.total_prompt_tokens ??
    0;
  const completionTokens =
    res?.usage?.output_tokens ??
    res?.usage?.completion_tokens ??
    rawTraj?.final_metrics?.total_completion_tokens ??
    0;
  const cachedTokens = rawTraj?.final_metrics?.total_cached_tokens ?? 0;
  const totalCostUsd =
    typeof rawTraj?.final_metrics?.total_cost_usd === "number"
      ? Number(rawTraj.final_metrics.total_cost_usd.toFixed(4))
      : null;

  // Build generic metrics dictionary from verification sources
  const metrics: Record<string, StoredMetricItem> = {};
  let primaryMetric: StoredMetricBadge | null = null;

  if (taskName === "example" && job) {
    const sub = job.subtaskMetrics[0];
    if (sub) {
      for (const [k, v] of Object.entries(sub.metrics)) {
        const meta = EXAMPLE_RUBRIC_META[k] || { label: k, max: 100 };
        metrics[k] = {
          key: k,
          label: meta.label,
          value: v,
          unit: k === "submission_valid" ? "flag" : "pts",
          max: meta.max,
          isPrimary: k === "legal_quality",
        };
      }
      if (typeof metrics.legal_quality?.value === "number") {
        primaryMetric = {
          name: "legal_quality",
          label: "Legal Quality",
          value: metrics.legal_quality.value,
          unit: "pts",
          max: 100,
        };
      }
    }
  } else if (taskName === "plawbench" && res?.trial_id) {
    const verTrials = readVerificationCached(path.join(jobAbsDir, "verification/verification.json"));
    const tm = verTrials[res.trial_id]?.metrics;
    if (tm && typeof tm === "object") {
      for (const [k, v] of Object.entries(tm)) {
        if (typeof v !== "number" || Number.isNaN(v)) continue;
        const val = k === "failed" ? Number(v.toFixed(1)) : Number((v * 100).toFixed(1));
        metrics[k] = {
          key: k,
          label: PLAWBENCH_METRIC_LABELS[k] || k,
          value: val,
          unit: k === "failed" ? "count" : "%",
          max: k === "failed" ? undefined : 100,
          isPrimary: k === "acc",
        };
      }
      if (typeof metrics.acc?.value === "number") {
        primaryMetric = {
          name: "acc",
          label: "PLawBench Acc",
          value: metrics.acc.value,
          unit: "%",
          max: 100,
        };
      }
    }
  } else if (taskName === "lawbench" && job) {
    const sub = job.subtaskMetrics.find((s) => s.task === taskType);
    if (sub && sub.primaryValue !== null) {
      metrics.task_macro = {
        key: "task_macro",
        label: `Subtask ${taskType} Avg`,
        value: sub.primaryValue,
        unit: "%",
        max: 100,
        isPrimary: true,
      };
      if (typeof sub.metrics.abstention_rate === "number") {
        metrics.abstention_rate = {
          key: "abstention_rate",
          label: "Abstention Rate",
          value: sub.metrics.abstention_rate,
          unit: "%",
          max: 100,
        };
      }
      primaryMetric = {
        name: "task_macro",
        label: `Subtask ${taskType} Avg`,
        value: sub.primaryValue,
        unit: "%",
        max: 100,
      };
    }
  }

  let reference = "";
  if (taskName === "lawbench") {
    reference = getLawbenchReference(jobAbsDir, taskType, sampleId);
  }

  const artifacts = extractResultArtifacts(res?.artifacts, jobAbsDir, storageRoot, baseRoot);
  const files = collectTrialFiles(trialAbsDir, relClean, storageRoot);

  // Discover real sibling trials sharing same (taskName, taskType, sampleId)
  const siblings: StoredSiblingTrial[] = [];
  for (const cand of STATE.jobDescriptors.values()) {
    if (!cand.job.hasTrajectories || cand.job.taskName !== taskName) continue;
    // For example cohort, link same agent in opposite arm primarily (plus same trial check)
    if (taskName === "example" && cand.job.agent !== agent) continue;
    const sum = readSummaryCached(path.join(cand.absDir, "summary.json"));
    const candTrials: any[] = Array.isArray(sum?.trials) ? sum.trials : [];
    const match = candTrials.find((t) => {
      if (taskName === "example") return true;
      return t.task_id === taskId;
    });
    if (!match?.result) continue;
    const sibRelDir = path.posix.join(cand.relDir, path.posix.dirname(match.result));
    if (!canRead(path.join(cand.absDir, path.dirname(match.result), "trajectory.json"))) continue;
    siblings.push({
      id: `${cand.storageRoot}:${sibRelDir}`,
      storageRoot: cand.storageRoot,
      storagePath: sibRelDir,
      jobKey: cand.job.key,
      jobId: cand.job.jobId,
      cohort: cand.job.cohort,
      agent: cand.job.agent,
      arm: cand.job.arm,
      armLabel: cand.job.armLabel,
      score: cand.job.primaryMetric?.value ?? null,
      scoreUnit: cand.job.primaryMetric?.unit ?? "pts",
    });
  }

  const stRes = safeStat(resAbs) || safeStat(trajAbs);
  const rawResultSanitized = res
    ? {
        trial_id: res.trial_id,
        task_id: res.task_id,
        config_id: res.config_id,
        attempt: res.attempt,
        job_id: res.job_id,
        status: res.status,
        stop_reason: res.stop_reason,
        verification_ref: res.verification_ref,
        source: res.source,
        usage: res.usage,
      }
    : null;

  // Extract Harbor-structured trial verifier & agent_fs metadata
  const verifierBase = path.join(trialAbsDir, ".internal/scoring/.internal/verifier");
  const verifierChecksRaw = safeReadJson(path.join(verifierBase, "checks.json"), 64 * 1024);
  const verifierRewardRaw = safeReadJson(path.join(verifierBase, "reward.json"), 32 * 1024);
  const verifierJudgeRaw = safeReadJson(path.join(verifierBase, "judge.json"), 256 * 1024);

  const skillsDir = path.join(trialAbsDir, ".internal/agent_fs/skills");
  const mountedSkills =
    canRead(skillsDir) && safeStat(skillsDir)?.isDirectory()
      ? fs
          .readdirSync(skillsDir)
          .filter((d) => !d.startsWith(".") && safeStat(path.join(skillsDir, d))?.isDirectory())
          .sort()
      : [];

  const kiRaw = safeReadJson(path.join(trialAbsDir, ".internal/knowledge_indexes.json"), 256 * 1024);
  const knowledgeIndexes: TrialHarborWorkspace["knowledgeIndexes"] = Array.isArray(kiRaw?.knowledge)
    ? kiRaw.knowledge
        .filter((k: any) => !isForbiddenPathSegment(String(k?.path || k?.name || "")))
        .map((k: any) => ({
          name: String(k?.name || path.basename(String(k?.path || "index"))),
          indexHash: String(k?.index_hash || ""),
          mode: String(k?.retrieval?.mode || "keyword"),
          topK: Number(k?.retrieval?.top_k || 8),
          embeddingModel: String(k?.retrieval?.embedding?.model || "BAAI/bge-m3"),
        }))
    : [];

  const lifecycleText = safeReadText(path.join(trialAbsDir, ".internal/lifecycle.jsonl"), 32 * 1024);
  const lifecycleEvents: Array<Record<string, any>> = [];
  if (lifecycleText) {
    for (const line of lifecycleText.split(/\r?\n/).slice(0, 40)) {
      if (!line.trim()) continue;
      try {
        lifecycleEvents.push(JSON.parse(line));
      } catch {
        // skip partial line
      }
    }
  }

  const agentWs = collectAgentWorkspace({
    trialAbsDir,
    relClean,
    rawTraj,
    artifacts,
    storageRoot,
    baseRoot,
  });

  const harborWorkspace: TrialHarborWorkspace = {
    verifierChecks: verifierChecksRaw
      ? {
          scope: verifierChecksRaw.scope,
          checks: verifierChecksRaw.checks,
        }
      : null,
    verifierReward:
      verifierRewardRaw && typeof verifierRewardRaw === "object" ? verifierRewardRaw : null,
    verifierJudge: verifierJudgeRaw
      ? {
          status: verifierJudgeRaw.status,
          model: verifierJudgeRaw.model,
          rubric_version: verifierJudgeRaw.rubric_version,
          metrics: verifierJudgeRaw.metrics,
          assessment: verifierJudgeRaw.assessment,
          usage: verifierJudgeRaw.usage,
          sources_sha256: verifierJudgeRaw.sources_sha256,
        }
      : null,
    mountedSkills,
    invokedSkills: agentWs.invokedSkills,
    workFiles: agentWs.workFiles,
    accessedInputs: agentWs.accessedInputs,
    artifactsManifest: agentWs.artifactsManifest,
    knowledgeIndexes,
    lifecycleEvents,
  };

  return {
    id: staticOverrideId || `${storageRoot}:${relClean}`,
    trialId: String(res?.trial_id || ""),
    taskId,
    configId: String(res?.config_id || ""),
    attempt: Number(res?.attempt || 1),
    jobKey: job?.key || `${storageRoot}:${path.posix.dirname(relClean)}`,
    jobId: job?.jobId || String(res?.job_id || ""),
    cohort: job?.cohort || "workspace",
    storageRoot,
    storagePath: relClean,
    runDir: job?.storagePath || path.posix.dirname(relClean),
    sourceKind: job?.sourceKind || (taskName === "example" ? "user" : "benchmark"),
    taskName,
    taskType,
    sampleId,
    agent,
    model,
    arm,
    armLabel,
    title:
      taskName === "example"
        ? `微信购表纠纷起诉准备 · ${agent}`
        : `${formatTaskTitle(taskName)} · ${taskType} #${sampleId}`,
    subtitle: `${armLabel} · ${sanitized.steps.length} steps`,
    status: String(res?.status || "completed"),
    stopReason: res?.stop_reason || null,
    updatedAt: stRes ? stRes.mtime.toISOString() : null,
    primaryMetric,
    metrics,
    answer: truncateText(res?.answer, 6000),
    reference,
    artifacts,
    files,
    rawResult: rawResultSanitized,
    usage: {
      steps: sanitized.steps.length,
      toolCalls: toolCallsCount || res?.usage?.tool_calls || 0,
      modelCalls: res?.usage?.model_calls || null,
      activeElapsedSec: res?.usage?.active_elapsed_sec
        ? Number(res.usage.active_elapsed_sec.toFixed(1))
        : null,
      promptTokens,
      completionTokens,
      cachedTokens,
      totalCostUsd,
      mcpCalls,
      usedRetrieval: usedRetrieval || mcpCalls > 0,
      usedSkill,
    },
    siblings,
    harborWorkspace,
    trajectory: sanitized,
    cliCommand: `lexverse trial inspect ${relClean} --trajectory`,
  };
}

const HARBOR_TEXT_EXTS = new Set([
  ".toml",
  ".md",
  ".py",
  ".sh",
  ".json",
  ".yaml",
  ".yml",
  ".txt",
]);

function isHarborTextFile(name: string, ext: string): boolean {
  return name === "Dockerfile" || HARBOR_TEXT_EXTS.has(ext.toLowerCase());
}

function inferHarborRoleLabel(relPath: string): string {
  if (relPath === "task.toml") return "Task Manifest (Harbor)";
  if (relPath === "instruction.md") return "Agent Prompt Instruction";
  if (relPath === "README.md") return "Package Documentation";
  if (relPath.startsWith("environment/Dockerfile")) return "Offline Sandbox Container";
  if (relPath.startsWith("environment/inputs/")) return "Mounted Input Dossier";
  if (relPath.startsWith("tests/reference/")) return "Reference Corpus";
  if (relPath.startsWith("tests/")) return "Isolated Verifier Suite";
  if (relPath.startsWith("solution/")) return "Oracle Solution";
  return "Task File";
}

function buildHarborTree(
  dirAbs: string,
  baseAbs: string,
  storageRoot: StorageRootId,
  scope: "task" | "config",
  depth = 0
): HarborTreeNode[] {
  if (depth > 4 || !canRead(dirAbs)) return [];
  const entries = fs.readdirSync(dirAbs).sort((a, b) => {
    const aDir = safeStat(path.join(dirAbs, a))?.isDirectory() ? 0 : 1;
    const bDir = safeStat(path.join(dirAbs, b))?.isDirectory() ? 0 : 1;
    return aDir !== bDir ? aDir - bDir : a.localeCompare(b);
  });

  const nodes: HarborTreeNode[] = [];
  for (const name of entries) {
    if (name.startsWith(".") || name === "__pycache__" || isForbiddenPathSegment(name)) continue;
    const abs = path.join(dirAbs, name);
    const st = safeStat(abs);
    if (!st || !canRead(abs)) continue;
    const relPath = path.relative(baseAbs, abs).replace(/\\/g, "/");
    if (st.isDirectory()) {
      nodes.push({
        name,
        relPath,
        kind: "dir",
        sizeBytes: 0,
        ext: "",
        previewable: false,
        downloadable: false,
        storageRoot,
        scope,
        roleLabel: inferHarborRoleLabel(relPath + "/"),
        children: buildHarborTree(abs, baseAbs, storageRoot, scope, depth + 1),
      });
    } else if (st.isFile()) {
      const ext = path.extname(name);
      const lowerExt = ext.toLowerCase();
      let previewable = false;
      let previewKind: HarborTreeNode["previewKind"] = undefined;
      let content: string | undefined = undefined;
      let tableSheets: HarborTreeNode["tableSheets"] = undefined;
      let staticUrl: string | undefined = undefined;

      if (lowerExt === ".docx") {
        content = extractDocxPreviewText(abs, 24000) ?? undefined;
        previewable = Boolean(content);
        previewKind = "docx";
      } else if (lowerExt === ".xlsx") {
        const parsed = extractXlsxPreview(abs);
        if (parsed) {
          content = parsed.text;
          tableSheets = parsed.sheets;
          previewable = true;
        }
        previewKind = "xlsx";
      } else if (lowerExt === ".pdf") {
        content = extractPdfPreviewText(abs, 20000) ?? undefined;
        previewKind = "pdf";
        if (scope === "task") {
          staticUrl = `/files/example/${relPath}`;
        }
        previewable = Boolean(content || staticUrl);
      } else if (isHarborTextFile(name, ext) && st.size <= 24 * 1024) {
        previewable = true;
        previewKind = "text";
        content = safeReadText(abs, 24 * 1024) ?? undefined;
      }

      nodes.push({
        name,
        relPath,
        kind: "file",
        sizeBytes: st.size,
        ext,
        previewable,
        previewKind,
        content,
        tableSheets,
        staticUrl,
        downloadable: true,
        storageRoot,
        scope,
        roleLabel: inferHarborRoleLabel(relPath),
      });
    }
  }
  return nodes;
}

export function resolveSafeWorkspaceFile(
  scope: "task" | "config",
  relPath: string
): { absPath: string; relClean: string } | null {
  if (!relPath || typeof relPath !== "string") return null;
  const normalized = path.posix.normalize(relPath.replace(/\\/g, "/")).replace(/^\/+/, "");
  if (!normalized || normalized.startsWith("..") || normalized.includes("/../")) return null;
  if (isForbiddenPathSegment(normalized)) return null;

  const { repoRoot, upstreamRoot } = resolveRoots();
  const allowedBase =
    scope === "task"
      ? path.join(upstreamRoot, "user_workspace/tasks/example")
      : path.join(repoRoot, "configs/jobs");
  const candidate = path.resolve(allowedBase, normalized);

  try {
    const realBase = fs.realpathSync(allowedBase);
    const realCand = fs.realpathSync(candidate);
    if (realCand !== realBase && !realCand.startsWith(realBase + path.sep)) return null;
    if (!safeStat(realCand)?.isFile() || !canRead(realCand)) return null;
    return {
      absPath: realCand,
      relClean: path.relative(realBase, realCand).replace(/\\/g, "/"),
    };
  } catch {
    return null;
  }
}

export function scanHarborWorkspace(): HarborWorkspaceData {
  const { repoRoot, upstreamRoot } = resolveRoots();
  const overview = scanStorageOverview(false);
  const taskPackages: HarborTaskPackage[] = [];

  const exampleDir = path.join(upstreamRoot, "user_workspace/tasks/example");
  const tomlPath = path.join(exampleDir, "task.toml");
  if (canRead(tomlPath)) {
    const tomlText = safeReadText(tomlPath, 8000) || "";
    const srcMatch = tomlText.match(/^source\s*=\s*"([^"]+)"/m);
    const envMatch = tomlText.match(/^environment_mode\s*=\s*"([^"]+)"/m);
    taskPackages.push({
      id: "example",
      title: "example · 微信购表买卖合同纠纷起诉准备",
      rootPath: "user_workspace/tasks/example",
      storageRoot: "upstream",
      environmentMode: envMatch?.[1] || "separate",
      artifactSource: srcMatch?.[1] || "/workspace/complaint_preparation.docx",
      tree: buildHarborTree(exampleDir, exampleDir, "upstream", "task", 0),
    });
  }

  const configsDir = path.join(repoRoot, "configs/jobs");
  const jobConfigs: HarborTreeNode[] = [];
  if (canRead(configsDir)) {
    for (const f of fs.readdirSync(configsDir).sort()) {
      if (!f.endsWith(".yaml") || isForbiddenPathSegment(f)) continue;
      const fp = path.join(configsDir, f);
      const st = safeStat(fp);
      if (!st || !st.isFile() || !canRead(fp)) continue;
      jobConfigs.push({
        name: f,
        relPath: f,
        kind: "file",
        sizeBytes: st.size,
        ext: ".yaml",
        previewable: st.size <= 32 * 1024,
        content: safeReadText(fp, 32 * 1024) ?? undefined,
        downloadable: true,
        storageRoot: "workspace",
        scope: "config",
        roleLabel: "Job Configuration YAML",
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    taskPackages,
    jobConfigs,
    storageRoots: overview.storageRoots,
  };
}

const SKILL_CATEGORY_MAP: Record<string, string> = {
  docx: "Office Documents",
  pptx: "Office Documents",
  xlsx: "Office Documents",
  "deductive-reasoning": "Legal Reasoning & Interpretation",
  "inductive-reasoning": "Legal Reasoning & Interpretation",
  "analogical-reasoning": "Legal Reasoning & Interpretation",
  "counterfactual-reasoning": "Legal Reasoning & Interpretation",
  "legal-abductive-reasoning": "Legal Reasoning & Interpretation",
  "conflict-resolution": "Legal Reasoning & Interpretation",
  "argument-chain-construction": "Legal Reasoning & Interpretation",
  "argument-strength-evaluation": "Legal Reasoning & Interpretation",
  "legal-interpretation-argument": "Legal Reasoning & Interpretation",
  "systematic-interpretation": "Legal Reasoning & Interpretation",
  "teleological-interpretation": "Legal Reasoning & Interpretation",
  "normative-meaning-argumentation": "Legal Reasoning & Interpretation",
  "judicial-value-judgment": "Legal Reasoning & Interpretation",
  "administrative-value-judgment": "Legal Reasoning & Interpretation",
  "formal-legal-consequence": "Legal Reasoning & Interpretation",
  "legal-norm-validity-check": "Legal Reasoning & Interpretation",
  "case-retrieval": "Fact, Evidence & Retrieval",
  "legal-article-retrieval": "Fact, Evidence & Retrieval",
  "other-legal-retrieval": "Fact, Evidence & Retrieval",
  "legal-element-extraction": "Fact, Evidence & Retrieval",
  "structured-element-extraction": "Fact, Evidence & Retrieval",
  "dispute-issue-identification": "Fact, Evidence & Retrieval",
  "evidence-evaluation": "Fact, Evidence & Retrieval",
  "evidence-argument-chain": "Fact, Evidence & Retrieval",
  "legal-concept-comprehension": "Fact, Evidence & Retrieval",
  "legal-document-formatting": "Drafting & Summarization",
  "legal-document-summarization": "Drafting & Summarization",
  "multi-document-summarization": "Drafting & Summarization",
  "judgment-document-generation": "Drafting & Summarization",
  "legal-judgment-prediction": "Drafting & Summarization",
  "legal-terminology": "Drafting & Summarization",
  "dispute-and-performance-risk": "Risk & Case Ops",
  "internal-compliance-risk-identification": "Risk & Case Ops",
  "legal-risk-assessment": "Risk & Case Ops",
  "strategic-risk-prioritization": "Risk & Case Ops",
  "billing-and-litigation-budget": "Risk & Case Ops",
  "case-lifecycle-planning": "Risk & Case Ops",
  "trial-scheduling-and-deadline-monitoring": "Risk & Case Ops",
};

const SKILL_PACK_LABELS: Record<string, string> = {
  legal_skills_chinese: "Legal-Skills-Chinese (THUYRan)",
  harvey_labs: "Harvey-Labs Office Suite",
};

function parseSkillFrontmatter(mdText: string, fallbackName: string): {
  name: string;
  description: string;
  body: string;
} {
  const fmMatch = mdText.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!fmMatch) {
    return { name: fallbackName, description: "", body: mdText };
  }
  const fmRaw = fmMatch[1];
  const body = mdText.slice(fmMatch[0].length).trim();

  try {
    const parsed = loadYaml(fmRaw) as Record<string, unknown> | null;
    if (parsed && typeof parsed === "object") {
      const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : fallbackName;
      const desc =
        typeof parsed.description === "string"
          ? parsed.description.replace(/\s+/g, " ").trim()
          : "";
      return { name, description: desc, body };
    }
  } catch {
    // Fallback below for YAML frontmatter containing unquoted colons inside description
  }

  const nameMatch = fmRaw.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, "") : fallbackName;

  let description = "";
  const descLineMatch = fmRaw.match(/^description:\s*(.*)$/m);
  if (descLineMatch && descLineMatch.index !== undefined) {
    const inlineVal = descLineMatch[1].trim();
    if (inlineVal === "|" || inlineVal === ">" || inlineVal === "|-" || inlineVal === ">-") {
      const after = fmRaw.slice(descLineMatch.index + descLineMatch[0].length);
      const blockLines: string[] = [];
      for (const ln of after.split(/\r?\n/)) {
        if (!ln.trim() && blockLines.length === 0) continue;
        if (/^[ \t]+/.test(ln) || !ln.trim()) {
          blockLines.push(ln.trim());
        } else {
          break;
        }
      }
      description = blockLines.filter(Boolean).join(" ");
    } else {
      description = inlineVal.replace(/^["']|["']$/g, "");
    }
  }

  return { name, description, body };
}

function listFilesRecursiveRel(rootDir: string, curDir = rootDir, depth = 0): string[] {
  if (depth > 4) return [];
  const out: string[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(curDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (ent.name.startsWith(".")) continue;
    const abs = path.join(curDir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listFilesRecursiveRel(rootDir, abs, depth + 1));
    } else if (ent.isFile()) {
      out.push(path.relative(rootDir, abs).replace(/\\/g, "/"));
    }
  }
  return out;
}

const DOMAIN_FALLBACK_ORDER = [
  "legal_laws",
  "legal_cases",
  "legal_qa",
  "legal_concepts",
  "legal_templates",
];

let capabilitiesCache: { ts: number; data: CapabilitiesCatalogData } | null = null;
const CAPABILITIES_CACHE_TTL_MS = 10 * 60 * 1000;

export function scanCapabilitiesCatalog(forceRefresh = false): CapabilitiesCatalogData {
  if (!forceRefresh && capabilitiesCache && Date.now() - capabilitiesCache.ts < CAPABILITIES_CACHE_TTL_MS) {
    return capabilitiesCache.data;
  }

  const { repoRoot, upstreamRoot } = resolveRoots();

  // 1. Scan real SKILL.md modules from upstream/workspace capabilities/skills
  const skillsBaseCandidates = [
    path.join(upstreamRoot, ".lexverse/capabilities/skills"),
    path.join(repoRoot, ".lexverse/capabilities/skills"),
  ];
  const skillsRoot = skillsBaseCandidates.find((p) => canRead(p)) || skillsBaseCandidates[0];

  const skills: CapabilitySkillItem[] = [];
  const packsMap = new Map<string, CapabilitySkillPack>();
  const seenSkillKeys = new Set<string>();

  if (canRead(skillsRoot)) {
    const packDirs = fs
      .readdirSync(skillsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const packEnt of packDirs) {
      const packId = packEnt.name;
      const packPath = path.join(skillsRoot, packId);
      const packLabel = SKILL_PACK_LABELS[packId] || packId;

      const versionDirs = fs
        .readdirSync(packPath, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .sort((a, b) => b.name.localeCompare(a.name));

      for (const verEnt of versionDirs) {
        const verPath = path.join(packPath, verEnt.name);
        const sourceMeta = safeReadJson(path.join(verPath, ".lexverse-source.json"));
        const repository = typeof sourceMeta?.repository === "string" ? sourceMeta.repository : null;
        const commit = typeof sourceMeta?.commit === "string" ? sourceMeta.commit : null;
        const upstreamPath = typeof sourceMeta?.path === "string" ? sourceMeta.path : null;

        const skillDirs = fs
          .readdirSync(verPath, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !d.name.startsWith("."))
          .sort((a, b) => a.name.localeCompare(b.name));

        for (const skEnt of skillDirs) {
          const folderName = skEnt.name;
          if (isForbiddenPathSegment(folderName)) continue;
          const skillAbs = path.join(verPath, folderName);
          const skillMdAbs = path.join(skillAbs, "SKILL.md");
          if (!canRead(skillMdAbs)) continue;

          const mdFull = safeReadText(skillMdAbs, 48 * 1024) || "";
          if (FORBIDDEN_PATTERNS.some((pat) => mdFull.toLowerCase().includes(pat.toLowerCase()))) {
            continue;
          }

          const { name, description } = parseSkillFrontmatter(mdFull, folderName);
          const dedupeKey = `${packId}:${folderName.toLowerCase()}`;
          if (seenSkillKeys.has(dedupeKey)) continue;
          seenSkillKeys.add(dedupeKey);

          const st = safeStat(skillMdAbs);
          const files = listFilesRecursiveRel(skillAbs);
          const lookupKey = SKILL_CATEGORY_MAP[folderName.toLowerCase()]
            ? folderName.toLowerCase()
            : name.toLowerCase();
          const category =
            SKILL_CATEGORY_MAP[lookupKey] ||
            (packId === "harvey_labs" ? "Office Documents" : "Legal Practice");

          skills.push({
            id: folderName,
            name,
            packId,
            packLabel,
            category,
            description,
            mountPath: `/skills/${folderName}/SKILL.md`,
            repository,
            commit,
            upstreamPath,
            fileCount: files.length,
            files,
            sizeBytes: st?.size || mdFull.length,
            previewMarkdown: truncateText(mdFull.trim(), 2600),
          });

          const prevPack = packsMap.get(packId);
          if (prevPack) {
            prevPack.skillCount += 1;
          } else {
            packsMap.set(packId, {
              id: packId,
              label: packLabel,
              repository,
              commit,
              upstreamPath,
              skillCount: 1,
            });
          }
        }
      }
    }
  }

  skills.sort((a, b) => {
    if (a.packId !== b.packId) {
      return a.packId === "legal_skills_chinese" ? -1 : b.packId === "legal_skills_chinese" ? 1 : a.packId.localeCompare(b.packId);
    }
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  // 2. Scan knowledge retrieval config + 16 upstream prebuilt collections + local workspace index
  const retrievalYamlPath = path.join(upstreamRoot, ".lexverse/capabilities/indexes/retrieval.yaml");
  let retrievalParsed: any = null;
  if (canRead(retrievalYamlPath)) {
    try {
      retrievalParsed = loadYaml(fs.readFileSync(retrievalYamlPath, "utf-8"));
    } catch {
      retrievalParsed = null;
    }
  }

  const retrievalDefaults = {
    mode: String(retrievalParsed?.mode || "hybrid"),
    embeddingModel: String(retrievalParsed?.embedding?.model || "BAAI/bge-m3"),
    chunkTokens: Number(retrievalParsed?.chunk_tokens || 2048),
    overlapTokens: Number(retrievalParsed?.overlap_tokens || 128),
    keywordCandidates: Number(retrievalParsed?.keyword_candidates || 100),
    vectorCandidates: Number(retrievalParsed?.vector_candidates || 100),
    topK: Number(retrievalParsed?.top_k || 8),
    chunkTokensByKind: (retrievalParsed?.chunk_tokens_by_kind &&
    typeof retrievalParsed.chunk_tokens_by_kind === "object"
      ? retrievalParsed.chunk_tokens_by_kind
      : {
          legal_cases: 1024,
          legal_laws: 8192,
          legal_concepts: 8192,
          legal_qa: 8192,
          legal_templates: 8192,
        }) as Record<string, number>,
  };

  const knowledgeCollections: CapabilityKnowledgeCollection[] = [];
  const seenHashes = new Set<string>();

  const collectionsJsonPath = path.join(upstreamRoot, ".lexverse/capabilities/indexes/collections.json");
  const collectionsJson = safeReadJson(collectionsJsonPath);
  for (const col of Array.isArray(collectionsJson?.collections) ? collectionsJson.collections : []) {
    const id = String(col?.id || "");
    if (!id || isForbiddenPathSegment(id)) continue;
    const domain = id.includes("/") ? id.split("/")[0] : id;
    const manifestPath = path.join(upstreamRoot, ".lexverse/capabilities", String(col?.path || ""), "manifest.json");
    const mf = safeReadJson(manifestPath);
    const chunkTokensForDomain = retrievalDefaults.chunkTokensByKind[domain] || retrievalDefaults.chunkTokens;
    const indexHash = String(col?.index_hash || mf?.index_hash || "");
    if (indexHash) seenHashes.add(indexHash);

    knowledgeCollections.push({
      id,
      domain,
      sourceId: String(col?.source_id || mf?.identity?.source_id || id),
      indexHash,
      chunkCount: Number(col?.chunk_count || mf?.chunk_count || 0),
      origin: "upstream_prebuilt",
      mode: String(mf?.identity?.retrieval?.mode || retrievalDefaults.mode),
      embeddingModel: String(mf?.embedding_config?.model || retrievalDefaults.embeddingModel),
      chunkTokens: Number(mf?.identity?.retrieval?.chunk_tokens || chunkTokensForDomain),
      overlapTokens: Number(mf?.identity?.retrieval?.overlap_tokens || retrievalDefaults.overlapTokens),
      keywordCandidates: retrievalDefaults.keywordCandidates,
      vectorCandidates: retrievalDefaults.vectorCandidates,
      topK: retrievalDefaults.topK,
    });
  }

  // Also scan workspace-local indexes matching standard public knowledge domains
  const localIdxDir = path.join(repoRoot, ".lexverse/capabilities/indexes");
  if (canRead(localIdxDir)) {
    for (const entry of fs.readdirSync(localIdxDir).sort()) {
      if (entry.startsWith(".") || isForbiddenPathSegment(entry)) continue;
      const mf = safeReadJson(path.join(localIdxDir, entry, "manifest.json"));
      if (!mf || !mf.source_name || !PUBLIC_KNOWLEDGE_DOMAINS.has(String(mf.source_name))) continue;
      if (isForbiddenPathSegment(String(mf.source_name))) continue;
      const indexHash = String(mf.index_hash || entry);
      if (seenHashes.has(indexHash)) continue;
      seenHashes.add(indexHash);
      knowledgeCollections.push({
        id: String(mf.source_name),
        domain: String(mf.source_name),
        sourceId: String(mf.identity?.source_id || mf.source_name),
        indexHash,
        chunkCount: Number(mf.chunk_count || 0),
        origin: "workspace_local",
        mode: String(mf.identity?.retrieval?.mode || "keyword"),
        embeddingModel: String(mf.embedding_config?.model || "BAAI/bge-small-zh-v1.5"),
        chunkTokens: Number(mf.identity?.retrieval?.chunk_tokens || 400),
        overlapTokens: Number(mf.identity?.retrieval?.overlap_tokens || 60),
        keywordCandidates: Number(mf.identity?.retrieval?.keyword_candidates || 100),
        vectorCandidates: Number(mf.identity?.retrieval?.vector_candidates || 100),
        topK: Number(mf.identity?.retrieval?.top_k || 8),
      });
    }
  }

  knowledgeCollections.sort((a, b) => {
    if (a.origin !== b.origin) return a.origin === "upstream_prebuilt" ? -1 : 1;
    const da = DOMAIN_FALLBACK_ORDER.indexOf(a.domain);
    const db = DOMAIN_FALLBACK_ORDER.indexOf(b.domain);
    if (da !== db) return (da === -1 ? 99 : da) - (db === -1 ? 99 : db);
    return b.chunkCount - a.chunkCount;
  });

  // 3. Built-in MCP servers & tools documented from lexverse/capabilities/knowledge/mcp_server.py & mcp_client.py
  const mcpServers: CapabilityMcpServer[] = [
    {
      id: "lexverse_knowledge",
      name: "lexverse_knowledge",
      serverTitle: 'FastMCP("lexverse-knowledge")',
      transports: ["stdio", "streamable-http", "sse"],
      entrypoint: "python -m lexverse.capabilities.knowledge.mcp_server --manifest <knowledge_indexes.json>",
      description:
        "Built-in hybrid legal knowledge MCP server powered by TaskRetriever (BM25+jieba keyword search, FAISS vector search, Reciprocal Rank Fusion with k=60, and exact Chinese statute article lookup).",
      tools: [
        {
          name: "search_knowledge",
          kind: "tool",
          signature: "search_knowledge(query, top_k=8, source_ids=None, filters=None)",
          description:
            "Search allowed legal knowledge collections (legal_laws, legal_cases, legal_concepts, legal_qa, legal_templates) and return ranked snippets with citation_ids.",
          params: [
            { name: "query", type: "str (1..3000)", required: true, description: "Focused legal fact or rule query (do not import distractor or masked facts)." },
            { name: "top_k", type: "int (1..20)", required: false, defaultValue: "8", description: "Maximum number of deduplicated chunks to return." },
            { name: "source_ids", type: "list[str] | null", required: false, defaultValue: "null (all)", description: "Optional collection domains or specific IDs (e.g. ['legal_laws', 'legal_cases/LeCaRDv2'])." },
            { name: "filters", type: "KnowledgeFilters | null", required: false, defaultValue: "null", description: "Optional metadata filter: { kind, title, article, page }." },
          ],
          returns: "JSON list of hits containing { citation_id, source_id, kind, title, article, snippet }",
        },
        {
          name: "fetch_knowledge",
          kind: "tool",
          signature: "fetch_knowledge(citation_id, offset=0, limit=4000)",
          description:
            "Fetch full paginated chunk text for a hit previously returned by search_knowledge.",
          params: [
            { name: "citation_id", type: "str", required: true, description: "Format: knowledge:<index_hash>:<chunk_id>" },
            { name: "offset", type: "int (>=0)", required: false, defaultValue: "0", description: "Character offset into the indexed chunk." },
            { name: "limit", type: "int (1..8000)", required: false, defaultValue: "4000", description: "Page length in characters." },
          ],
          returns: "JSON object with { text, offset, next_offset, ...metadata }",
        },
        {
          name: "knowledge://{source_id}/chunks",
          kind: "resource",
          signature: "knowledge://{source_id}/chunks",
          description: "Inspect the first 50 indexed chunks, citation IDs, and metadata headers for a loaded source.",
          params: [
            { name: "source_id", type: "str", required: true, description: "Logical source_id or index_hash prefix." },
          ],
          returns: "JSON array of up to 50 { chunk_id, citation_id, snippet, metadata }",
        },
      ],
      yamlExample: `resources:\n  knowledge:\n    - legal_laws\n    - legal_cases/LeCaRDv2\n  tools:\n    - search_knowledge\n    - fetch_knowledge`,
    },
    {
      id: "custom_mcp",
      name: "External MCP Services (mcp_servers[])",
      serverTitle: "MCPService Protocol Adapter",
      transports: ["streamable-http", "sse", "stdio"],
      entrypoint: "resources.mcp_servers[] -> <alias>__<remote_name>",
      description:
        "Plug any external HTTP/SSE or local stdio MCP server into benchmark or Docker runs with schema-hash verification, allowlisted tools, and secret-isolated credential_ref.",
      tools: [
        {
          name: "<alias>__<remote_name>",
          kind: "tool",
          signature: "tool_name(alias, remote_name) -> schema_hash verified wrapper",
          description:
            "Exposed automatically once open_mcp_tools() discovers allowed_tools and records SHA-256 input schemas for run-level reproducibility.",
          params: [
            { name: "transport", type: '"streamable-http" | "sse" | "stdio"', required: false, defaultValue: '"streamable-http"', description: "HTTP endpoint or container-mounted stdio process." },
            { name: "allowed_tools", type: "list[str] | null", required: false, defaultValue: "null (all discovered)", description: "Strict allowlist validated against remote MCP list_tools()." },
            { name: "credential_ref", type: "str | null", required: false, defaultValue: "null", description: "Profile name in configs/secrets.local.yaml for Bearer authorization (forbidden in URLs)." },
            { name: "timeout_sec", type: "float (>0)", required: false, defaultValue: "60.0", description: "Discovery and invocation timeout per remote tool call." },
          ],
          returns: "Tool call output recorded to usage.mcp[alias] ledger & execution trajectory steps",
        },
      ],
      yamlExample: `resources:\n  mcp_servers:\n    - name: lexverse_knowledge\n      transport: streamable-http\n      url: http://host.docker.internal:18794/mcp\n      required: true\n      allowed_tools:\n        - search_knowledge\n        - fetch_knowledge\n      timeout_sec: 60`,
    },
  ];

  const builtinAgentTools: CapabilityBuiltinTool[] = [
    { name: "search_knowledge", group: "knowledge", disableable: true, description: "Hybrid BM25+FAISS legal retrieval tool over configured Knowledge collections." },
    { name: "fetch_knowledge", group: "knowledge", disableable: true, description: "Paginated full-chunk fetcher using citation_id from search_knowledge." },
    { name: "ask_user", group: "interactive", disableable: true, description: "Multi-turn consultation Clarification tool for user-simulator / dialogue benchmarks." },
    { name: "read_file", group: "workspace", disableable: true, description: "Read /inputs/, /skills/<name>/SKILL.md, or workspace files (required when Skills are mounted)." },
    { name: "write_file", group: "workspace", disableable: true, description: "Create deliverables (.docx, .txt, .md, Python helper scripts) inside /workspace." },
    { name: "edit_file", group: "workspace", disableable: true, description: "Apply targeted diffs to workspace files." },
    { name: "ls", group: "workspace", disableable: true, description: "Inspect directories mounted inside the task container or workspace." },
    { name: "glob", group: "workspace", disableable: true, description: "Pattern-match files in /inputs, /skills, or /workspace." },
    { name: "grep", group: "workspace", disableable: true, description: "Search text inside workspace deliverables or input case materials." },
    { name: "execute", group: "workspace", disableable: true, description: "Run shell / python commands inside the isolated task container." },
    { name: "write_todos", group: "workspace", disableable: true, description: "Track multi-step planning checklist during long-horizon tasks." },
  ];

  const prebuiltCols = knowledgeCollections.filter((c) => c.origin === "upstream_prebuilt");
  const localCols = knowledgeCollections.filter((c) => c.origin === "workspace_local");
  const legalSkillsCount = skills.filter((s) => s.packId !== "harvey_labs").length;
  const officeSkillsCount = skills.filter((s) => s.packId === "harvey_labs").length;

  const data: CapabilitiesCatalogData = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalSkills: skills.length,
      legalSkills: legalSkillsCount,
      officeSkills: officeSkillsCount,
      prebuiltCollections: prebuiltCols.length,
      prebuiltChunks: prebuiltCols.reduce((acc, c) => acc + c.chunkCount, 0),
      localWorkspaceIndexes: localCols.length,
      mcpServers: mcpServers.length,
      mcpToolsAndResources: mcpServers.reduce((acc, s) => acc + s.tools.length, 0),
      builtinTools: builtinAgentTools.length,
    },
    skillPacks: Array.from(packsMap.values()),
    skills,
    retrievalDefaults,
    knowledgeCollections,
    mcpServers,
    builtinAgentTools,
  };

  capabilitiesCache = { ts: Date.now(), data };
  return data;
}
