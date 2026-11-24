"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  RiAddLine,
  RiArrowLeftLine,
  RiArrowRightLine,
  RiCheckLine,
  RiDownload2Line,
  RiFileTextLine,
  RiFolderOpenLine,
  RiRefreshLine,
  RiRouteLine,
  RiSearchLine,
  RiTerminalBoxLine,
} from "@remixicon/react";
import type {
  HarborWorkspaceData,
  StorageOverviewResponse,
  StorageRootId,
  StoredJobRecord,
  StoredTrialIndexEntry,
  TrialsPageResponse,
} from "@/lib/storage-types";
import type { JobRunRecord, RuntimeMode } from "@/lib/lexverse-data";
import { BENCHMARK_TASK_NAMES, LAWBENCH_TASK_NAMES, PLAWBENCH_TASK_NAMES } from "@/lib/lexverse-data";
import { withBasePath } from "@/lib/runtime-config";
import { SlidingPill, cn, TerminalSnippet } from "./magic-ui";
import { MebiusEfficiencyAreaCard, PLawBenchBreakdownChart } from "./mebius-charts";
import type { ComposerPreset } from "./experiment-composer";
import { TrialDetailView, type TrialRefInput } from "./trial-detail-view";

export interface JobsNavTarget {
  taskName?: string | null;
  jobKey?: string | null;
  trial?: TrialRefInput | null;
  reset?: boolean;
}

function readJobsQueryFromWindow(): {
  task: string | null;
  jobKey: string | null;
  trial: TrialRefInput | null;
} {
  if (typeof window === "undefined") {
    return { task: null, jobKey: null, trial: null };
  }
  const sp = new URLSearchParams(window.location.search);
  const task = sp.get("task")?.trim() || null;
  const jobKey = sp.get("job")?.trim() || null;
  const trialPath = sp.get("trial")?.trim() || null;
  const rawRoot = sp.get("root")?.trim();
  const root: StorageRootId = rawRoot === "workspace" ? "workspace" : "upstream";
  const trial = trialPath
    ? {
        storageRoot: root,
        storagePath: trialPath,
      }
    : null;
  return {
    task: task || (jobKey ? jobKey.split("/").pop()?.split("-")[0] || null : null),
    jobKey,
    trial,
  };
}

function pushJobsQueryToWindow(
  task: string | null,
  jobKey: string | null,
  trial: TrialRefInput | null
) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (task) params.set("task", task);
  if (jobKey) params.set("job", jobKey);
  if (trial?.storagePath) {
    params.set("trial", trial.storagePath);
    params.set("root", trial.storageRoot);
  }
  const qs = params.toString();
  const nextUrl = withBasePath("/jobs/") + (qs ? `?${qs}` : "");
  const curUrl = window.location.pathname + window.location.search;
  if (curUrl !== nextUrl) {
    window.history.pushState(null, "", nextUrl);
  }
}

const ARM_SHORT: Record<string, string> = {
  static: "Static",
  vanilla: "Vanilla",
  vanilla_cap: "Vanilla + Cap",
  full_capabilities: "Full Cap",
  base: "Base",
  native: "Native",
  default: "Standard",
};

function modeChipClass(label: string): string {
  if (label.includes("Cap")) {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium";
  }
  if (label === "Vanilla" || label === "Base") {
    return "border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-medium";
  }
  return "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300";
}

const TASK_DESCRIPTIONS: Record<string, string> = {
  plawbench: "Practical Chinese legal tasks: Case Analysis (250), Public Consultation (18) & Document Drafting (12).",
  lawbench: "20 cognitive legal tasks across Memorization (1-x), Understanding (2-x) & Application (3-x) at 10,000 scale.",
  example: "Docker-isolated litigation prep task (微信购表纠纷起诉准备) evaluated across Base vs Full Capabilities CLI harnesses.",
  legalworld: "Multi-stage plaintiff/defendant litigation lifecycle simulation spanning consultation, drafting, investigation, debate & appeal.",
  simucourt: "AgentsCourt 1st/2nd instance courtroom simulation across criminal, civil & administrative disputes.",
  dlawbench: "Dynamic multi-turn client-lawyer consultation evaluation across 4 realistic client persona types (P_WD, P_WS, P_CS, P_CD).",
  maser: "Interactive multi-agent client intake & civil complaint generation benchmark.",
  j1bench: "Judicial reasoning benchmark spanning 6 interactive & single-turn legal scenarios (CI, CR, KQ, LC, CD, DD).",
  lexeval: "23-task comprehensive cognitive legal evaluation suite spanning knowledge retention & application.",
};

export function JobsExplorer({
  storageOverview,
  staticTrials,
  harborWorkspace,
  runs,
  mode,
  navTarget,
  refreshing,
  onRefreshStorage,
  onOpenComposer,
}: {
  storageOverview: StorageOverviewResponse | null;
  staticTrials: StoredTrialIndexEntry[];
  harborWorkspace?: HarborWorkspaceData | null;
  runs: JobRunRecord[];
  mode: RuntimeMode;
  navTarget?: JobsNavTarget | null;
  refreshing?: boolean;
  onRefreshStorage?: () => void;
  onOpenComposer: (preset?: ComposerPreset) => void;
}) {
  // 4-Level Hierarchical State:
  // Level 1: selectedTask === null
  // Level 2: selectedTask !== null && selectedJobKey === null
  // Level 3: selectedJobKey !== null && selectedTrial === null
  // Level 4: selectedJobKey !== null && selectedTrial !== null
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [selectedJobKey, setSelectedJobKey] = useState<string | null>(null);
  const [selectedTrial, setSelectedTrial] = useState<TrialRefInput | null>(null);

  // Level 1 search/sort & Level 2 filters
  const [globalSearch, setGlobalSearch] = useState("");
  const [taskTableSort, setTaskTableSort] = useState<
    "default" | "jobs_desc" | "trials_desc" | "updated_desc"
  >("default");
  const [taskCohortFilter, setTaskCohortFilter] = useState<string>("all");
  const [taskArmFilter, setTaskArmFilter] = useState<string>("all");
  const [taskJobSearch, setTaskJobSearch] = useState("");
  const [taskSort, setTaskSort] = useState<"default" | "score_desc" | "trials_desc">("default");

  // Level 3 state
  const [jobSubTab, setJobSubTab] = useState<"trials" | "report" | "files">("trials");
  const [singleJobSubTab, setSingleJobSubTab] = useState<"trial" | "report">("trial");
  const [trialSearchInput, setTrialSearchInput] = useState("");
  const [debouncedTrialQ, setDebouncedTrialQ] = useState("");
  const [trialPageNum, setTrialPageNum] = useState(1);
  const [sampleTabIdx, setSampleTabIdx] = useState(0);
  const [trialsPage, setTrialsPage] = useState<TrialsPageResponse & { queryKey?: string }>({
    total: 0,
    page: 1,
    pageSize: 12,
    totalPages: 1,
    items: [],
    queryKey: "",
  });
  const [loadingTrials, setLoadingTrials] = useState(false);

  const jobs = storageOverview?.jobs || [];
  const summary = storageOverview?.resultsSummary;
  const liveRuns = useMemo(() => runs.filter((r) => r.id.startsWith("live-")), [runs]);

  // Sync initial deep-link URL & browser Back/Forward history
  useEffect(() => {
    const syncFromWindow = () => {
      const parsed = readJobsQueryFromWindow();
      setSelectedTask(parsed.task);
      setSelectedJobKey(parsed.jobKey);
      setSelectedTrial(parsed.trial);
      setTrialPageNum(1);
      setTrialSearchInput("");
      setDebouncedTrialQ("");
      setSampleTabIdx(0);
    };
    syncFromWindow();
    window.addEventListener("popstate", syncFromWindow);
    return () => window.removeEventListener("popstate", syncFromWindow);
  }, []);

  // Resolve exact taskName when URL carried ?job=... without ?task=...
  useEffect(() => {
    if (!selectedJobKey || jobs.length === 0) return;
    const match = jobs.find((j) => j.key === selectedJobKey);
    if (match && match.taskName !== selectedTask) {
      setSelectedTask(match.taskName);
    }
  }, [selectedJobKey, selectedTask, jobs]);

  // Hydrate staticFile for deep-linked trials once staticTrials snapshot finishes loading
  useEffect(() => {
    if (mode !== "static" || !selectedTrial || selectedTrial.staticFile) return;
    const hit = staticTrials.find(
      (t) =>
        t.storageRoot === selectedTrial.storageRoot &&
        t.storagePath === selectedTrial.storagePath
    );
    if (hit?.staticFile) {
      setSelectedTrial((prev) => (prev ? { ...prev, staticFile: hit.staticFile } : prev));
    }
  }, [mode, selectedTrial, staticTrials]);

  // Apply external navigation requests cleanly
  useEffect(() => {
    if (!navTarget) return;
    if (navTarget.reset) {
      setSelectedTask(null);
      setSelectedJobKey(null);
      setSelectedTrial(null);
      pushJobsQueryToWindow(null, null, null);
      return;
    }
    if (navTarget.jobKey) {
      const match = jobs.find((j) => j.key === navTarget.jobKey);
      const nextTask = navTarget.taskName || match?.taskName || null;
      const nextTrial = navTarget.trial || null;
      setSelectedTask(nextTask);
      setSelectedJobKey(navTarget.jobKey);
      setSelectedTrial(nextTrial);
      setTrialPageNum(1);
      setTrialSearchInput("");
      setDebouncedTrialQ("");
      setSampleTabIdx(0);
      pushJobsQueryToWindow(nextTask, navTarget.jobKey, nextTrial);
    } else if (navTarget.taskName) {
      setSelectedTask(navTarget.taskName);
      setSelectedJobKey(null);
      setSelectedTrial(null);
      setTaskCohortFilter("all");
      setTaskArmFilter("all");
      setTaskJobSearch("");
      pushJobsQueryToWindow(navTarget.taskName, null, null);
    }
  }, [navTarget, jobs]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedTrialQ(trialSearchInput);
      setTrialPageNum(1);
    }, 220);
    return () => clearTimeout(t);
  }, [trialSearchInput]);

  const selectedJob = useMemo(
    () => (selectedJobKey ? jobs.find((j) => j.key === selectedJobKey) || null : null),
    [jobs, selectedJobKey]
  );

  // Set default Level 3 sub-tab cleanly when opening a job
  useEffect(() => {
    if (!selectedJob) return;
    setJobSubTab(selectedJob.hasTrajectories ? "trials" : "report");
    setSingleJobSubTab("trial");
    setTrialPageNum(1);
    setTrialSearchInput("");
    setDebouncedTrialQ("");
    setSampleTabIdx(0);
  }, [selectedJob?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-resolve single-trial jobs (e.g. every `example` agent run) -> instant Level 4 inline!
  const isSingleTrialJob = Boolean(selectedJob && selectedJob.hasTrajectories && selectedJob.trajectoryCount === 1);
  const currentQueryKey = `${mode}|${selectedJob?.key || ""}|${debouncedTrialQ}|${trialPageNum}`;

  useEffect(() => {
    if (!selectedJob || !selectedJob.hasTrajectories) return;
    let cancelled = false;
    const pageSize = 12;

    if (mode === "serve") {
      setLoadingTrials(true);
      setTrialsPage((prev) => ({ ...prev, items: [] }));
      const qs = new URLSearchParams({
        jobKey: selectedJob.key,
        q: debouncedTrialQ,
        page: String(trialPageNum),
        pageSize: String(pageSize),
      });
      fetch(withBasePath(`/api/live/trials?${qs.toString()}`))
        .then((r) => r.json())
        .then((data) => {
          if (cancelled || !data?.ok) return;
          setTrialsPage({
            total: data.total ?? 0,
            page: data.page ?? trialPageNum,
            pageSize: data.pageSize ?? pageSize,
            totalPages: data.totalPages ?? 1,
            items: data.items || [],
            queryKey: currentQueryKey,
          });
          setLoadingTrials(false);
        })
        .catch(() => {
          if (!cancelled) setLoadingTrials(false);
        });
      return () => {
        cancelled = true;
      };
    }

    const q = debouncedTrialQ.trim().toLowerCase();
    const filtered = staticTrials.filter((item) => {
      if (item.jobKey !== selectedJob.key) return false;
      if (!q) return true;
      return `${item.trialId} ${item.taskId} ${item.taskType} ${item.sampleId} ${item.agent} ${item.model}`
        .toLowerCase()
        .includes(q);
    });
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(trialPageNum, totalPages);
    const start = (safePage - 1) * pageSize;
    setTrialsPage({
      total,
      page: safePage,
      pageSize,
      totalPages,
      items: filtered.slice(start, start + pageSize),
      queryKey: currentQueryKey,
    });
  }, [selectedJob, mode, debouncedTrialQ, trialPageNum, staticTrials, currentQueryKey]);

  const inlineSingleTrialRef: TrialRefInput | null = useMemo(() => {
    if (!isSingleTrialJob || !selectedJob) return null;
    if (
      trialsPage.queryKey === currentQueryKey &&
      trialsPage.items.length > 0 &&
      trialsPage.items[0].jobKey === selectedJob.key
    ) {
      const it = trialsPage.items[0];
      return {
        id: it.id,
        storageRoot: it.storageRoot,
        storagePath: it.storagePath,
        staticFile: it.staticFile,
      };
    }
    const stat = staticTrials.find((t) => t.jobKey === selectedJob.key);
    if (stat) {
      return {
        id: stat.id,
        storageRoot: stat.storageRoot,
        storagePath: stat.storagePath,
        staticFile: stat.staticFile,
      };
    }
    return null;
  }, [isSingleTrialJob, selectedJob, trialsPage, currentQueryKey, staticTrials]);

  // Task rows for Level 1 Tasks Table
  const taskRows = useMemo(() => {
    const names = storageOverview?.facets.taskNames || [];
    const preferredOrder = [
      "plawbench",
      "lawbench",
      "example",
      "legalworld",
      "simucourt",
      "dlawbench",
      "maser",
      "j1bench",
      "lexeval",
    ];
    const ordered = [...names].sort((a, b) => {
      const ia = preferredOrder.indexOf(a);
      const ib = preferredOrder.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });

    const rows = ordered.map((tn) => {
      const taskJobs = jobs.filter((j) => j.taskName === tn);
      const completedTrials = taskJobs.reduce((acc, j) => acc + j.completedTrials, 0);
      const plannedTrials = taskJobs.reduce((acc, j) => acc + j.plannedTrials, 0);
      const trajRuns = taskJobs.filter((j) => j.hasTrajectories).length;
      const sourceKind = taskJobs[0]?.sourceKind === "user" ? "User Task" : "Benchmark";
      const armLabels = Array.from(
        new Set(taskJobs.map((j) => ARM_SHORT[j.arm] || j.armLabel))
      );
      const latestUpdatedAt =
        taskJobs
          .map((j) => j.updatedAt)
          .filter(Boolean)
          .sort()
          .pop() || "";
      const comp = summary?.modeComparisons.find((m) =>
        tn === "plawbench" ? m.id === "plawbench-weighted" : m.taskName === tn
      );
      const scoredJobs = taskJobs
        .filter((j) => typeof j.primaryMetric?.value === "number")
        .sort((a, b) => (b.primaryMetric!.value - a.primaryMetric!.value));
      const bestJob = scoredJobs[0] || null;
      return {
        taskName: tn,
        title: taskJobs[0]?.taskTitle || tn,
        desc: TASK_DESCRIPTIONS[tn] || `Stored evaluation runs and trials for ${tn}.`,
        sourceKind,
        jobCount: taskJobs.length,
        completedTrials,
        plannedTrials,
        completionPct: plannedTrials
          ? Math.round((completedTrials / plannedTrials) * 100)
          : 100,
        trajRuns,
        armLabels,
        latestUpdatedAt,
        comparison: comp || null,
        bestJob,
      };
    });

    if (taskTableSort === "jobs_desc") {
      return [...rows].sort((a, b) => b.jobCount - a.jobCount);
    }
    if (taskTableSort === "trials_desc") {
      return [...rows].sort((a, b) => b.completedTrials - a.completedTrials);
    }
    if (taskTableSort === "updated_desc") {
      return [...rows].sort((a, b) => b.latestUpdatedAt.localeCompare(a.latestUpdatedAt));
    }
    return rows;
  }, [storageOverview, jobs, summary, taskTableSort]);

  // Level 1 filtered jobs for quick jump
  const quickJumpJobs = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    return jobs.filter((j) =>
      `${j.jobId} ${j.taskName} ${j.agent} ${j.model} ${j.armLabel} ${j.storagePath}`
        .toLowerCase()
        .includes(q)
    );
  }, [jobs, globalSearch]);

  // Level 2: filtered jobs for selectedTask
  const taskJobsList = useMemo(() => {
    if (!selectedTask) return [];
    const q = taskJobSearch.trim().toLowerCase();
    const list = jobs.filter((j) => {
      if (j.taskName !== selectedTask) return false;
      if (taskCohortFilter !== "all" && j.cohort !== taskCohortFilter) return false;
      if (taskArmFilter !== "all" && j.arm !== taskArmFilter) return false;
      if (!q) return true;
      return `${j.jobId} ${j.agent} ${j.model} ${j.armLabel} ${j.storagePath}`
        .toLowerCase()
        .includes(q);
    });
    if (taskSort === "score_desc") {
      return [...list].sort((a, b) => (b.primaryMetric?.value ?? -1) - (a.primaryMetric?.value ?? -1));
    }
    if (taskSort === "trials_desc") {
      return [...list].sort((a, b) => b.completedTrials - a.completedTrials);
    }
    return list;
  }, [jobs, selectedTask, taskCohortFilter, taskArmFilter, taskJobSearch, taskSort]);

  const taskCohorts = useMemo(() => {
    if (!selectedTask) return [];
    return Array.from(
      new Set(jobs.filter((j) => j.taskName === selectedTask).map((j) => j.cohort))
    );
  }, [jobs, selectedTask]);

  const taskArms = useMemo(() => {
    if (!selectedTask) return [];
    const m = new Map<string, string>();
    for (const j of jobs.filter((x) => x.taskName === selectedTask)) {
      if (!m.has(j.arm)) m.set(j.arm, j.armLabel);
    }
    return Array.from(m.entries()).map(([id, label]) => ({ id, label }));
  }, [jobs, selectedTask]);

  const exportCsv = (list: StoredJobRecord[], filename: string) => {
    const headers = [
      "job_id",
      "task_name",
      "cohort",
      "storage_path",
      "agent",
      "model",
      "arm",
      "completed_trials",
      "primary_metric_name",
      "primary_metric_value",
      "unit",
      "status",
    ];
    const esc = (v: any) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [
      headers.join(","),
      ...list.map((j) =>
        [
          j.jobId,
          j.taskName,
          j.cohort,
          j.storagePath,
          j.agent,
          j.model,
          j.arm,
          j.completedTrials,
          j.primaryMetric?.name ?? "",
          j.primaryMetric?.value ?? "",
          j.primaryMetric?.unit ?? "",
          j.status,
        ]
          .map(esc)
          .join(",")
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const navigateJobs = (
    task: string | null,
    jobKey: string | null,
    trial: TrialRefInput | null,
    scrollTop = false
  ) => {
    setSelectedTask(task);
    setSelectedJobKey(jobKey);
    setSelectedTrial(trial);
    if (jobKey !== selectedJobKey) {
      setTrialPageNum(1);
      setTrialSearchInput("");
      setDebouncedTrialQ("");
      setSampleTabIdx(0);
    }
    pushJobsQueryToWindow(task, jobKey, trial);
    if (scrollTop) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleOpenJob = (job: StoredJobRecord) => {
    navigateJobs(job.taskName, job.key, null, true);
  };

  return (
    <div className="space-y-6">
      {/* ==================== PERSISTENT CLICKABLE BREADCRUMB BAR ==================== */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
          <button
            type="button"
            onClick={() => navigateJobs(null, null, null)}
            className={cn(
              "px-2.5 py-1 rounded-full transition cursor-pointer",
              !selectedTask
                ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-semibold"
                : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-950 dark:hover:text-white"
            )}
          >
            Jobs (All Tasks)
          </button>

          {selectedTask && (
            <>
              <span className="text-zinc-400">/</span>
              <button
                type="button"
                onClick={() => navigateJobs(selectedTask, null, null)}
                className={cn(
                  "px-2.5 py-1 rounded-full transition cursor-pointer",
                  selectedTask && !selectedJob
                    ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-semibold"
                    : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                )}
              >
                {selectedTask}
              </button>
            </>
          )}

          {selectedJob && (
            <>
              <span className="text-zinc-400">/</span>
              <button
                type="button"
                onClick={() => navigateJobs(selectedTask, selectedJob.key, null)}
                className={cn(
                  "px-2.5 py-1 rounded-full transition cursor-pointer",
                  !selectedTrial
                    ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-semibold"
                    : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                )}
              >
                {selectedJob.jobId}
              </button>
            </>
          )}

          {selectedTrial && (
            <>
              <span className="text-zinc-400">/</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold truncate max-w-[260px]">
                {selectedTrial.storagePath.split("/").pop()?.split("__")[0] || "trial"}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedTask && (
            <button
              type="button"
              onClick={() => {
                if (selectedTrial) navigateJobs(selectedTask, selectedJobKey, null);
                else if (selectedJobKey) navigateJobs(selectedTask, null, null);
                else navigateJobs(null, null, null);
              }}
              className="lv-btn-secondary inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer"
            >
              <RiArrowLeftLine className="w-3.5 h-3.5" />
              Up One Level
            </button>
          )}

          {mode === "serve" && onRefreshStorage && (
            <button
              type="button"
              onClick={onRefreshStorage}
              disabled={refreshing}
              className="lv-btn-secondary inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer"
            >
              <RiRefreshLine className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
              <span>Rescan</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              exportCsv(
                selectedTask ? taskJobsList : jobs,
                selectedTask ? `lexverse-${selectedTask}-jobs.csv` : "lexverse-all-jobs.csv"
              )
            }
            disabled={!jobs.length}
            className="lv-btn-secondary inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-45"
          >
            <RiDownload2Line className="w-3.5 h-3.5" />
            Export CSV
          </button>

          <button
            type="button"
            onClick={() =>
              onOpenComposer({
                targetType: selectedTask === "example" ? "user" : "benchmark",
                targetName:
                  selectedTask === "example"
                    ? "user_workspace/tasks/example"
                    : selectedTask || "plawbench",
              })
            }
            className="lv-btn-primary inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium cursor-pointer"
          >
            <RiAddLine className="w-3.5 h-3.5" />
            <span>{mode === "serve" ? "New Job" : "CLI Config"}</span>
          </button>
        </div>
      </div>

      {/* ==================== LEVEL 1: TASK DIRECTORY OVERVIEW ==================== */}
      {!selectedTask && (
        <div className="space-y-6">
          <div className="flex flex-wrap md:flex-nowrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">
                UNIFIED JOBS WORKBENCH · TASK → CONFIGURED JOBS → TRIALS &amp; WORKSPACE
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white mt-0.5">
                Evaluation Jobs by Task
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Select a Task to view its configured runs, then drill into individual trials, execution traces &amp; agent workspaces.
              </p>
            </div>

            <div className="relative w-full md:w-64 shrink-0">
              <RiSearchLine className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Quick jump to any job…"
                className="w-full rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          </div>

          {/* Global KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="relative overflow-hidden rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
              <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>Evaluated Tasks</span>
                <RiFolderOpenLine className="w-3.5 h-3.5 text-indigo-500" />
              </div>
              <div className="text-2xl font-semibold text-zinc-950 dark:text-white tabular-nums mt-0.5">
                {taskRows.length}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
              <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>Stored Jobs</span>
                <RiTerminalBoxLine className="w-3.5 h-3.5 text-sky-500" />
              </div>
              <div className="text-2xl font-semibold text-zinc-950 dark:text-white tabular-nums mt-0.5">
                {summary?.totalJobs ?? jobs.length}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
              <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>Stored Trials</span>
                <RiRouteLine className="w-3.5 h-3.5 text-violet-500" />
              </div>
              <div className="text-2xl font-semibold text-zinc-950 dark:text-white tabular-nums mt-0.5">
                {(summary?.totalCompletedTrials ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
              <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>Completion Rate</span>
                <RiCheckLine className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                {summary?.completionRate ?? 100}%
              </div>
              <div className="mt-2 h-1 w-full rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                  style={{ width: `${Math.min(100, Math.max(0, summary?.completionRate ?? 100))}%` }}
                />
              </div>
            </div>
          </div>

          {liveRuns.length > 0 && (
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.04] p-4 space-y-2">
              <div className="text-[11px] font-mono uppercase text-sky-600 dark:text-sky-400 font-semibold">
                Live Session Dry-Runs ({liveRuns.length})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {liveRuns.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-zinc-950 dark:text-white">{r.name}</div>
                      <div className="text-[11px] font-mono text-zinc-400">{r.scoreText}</div>
                    </div>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-sky-500/12 text-sky-700 dark:text-sky-300">
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Jump Matches when searching globally */}
          {globalSearch.trim() !== "" && (
            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800 text-xs font-mono text-zinc-500">
                Matching Jobs ({quickJumpJobs.length})
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 max-h-72 overflow-y-auto">
                {quickJumpJobs.map((j) => (
                  <button
                    key={j.key}
                    type="button"
                    onClick={() => handleOpenJob(j)}
                    className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 flex items-center justify-between gap-3 text-xs cursor-pointer"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-zinc-950 dark:text-white">
                        {j.taskName} / {j.jobId}
                      </span>
                      <span className="ml-2 text-[11px] font-mono text-zinc-400">
                        {j.armLabel} · {j.storagePath}
                      </span>
                    </div>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                      {j.primaryMetric
                        ? `${j.primaryMetric.value.toFixed(2)}${j.primaryMetric.unit === "%" ? "%" : " pts"}`
                        : "Open →"}
                    </span>
                  </button>
                ))}
                {quickJumpJobs.length === 0 && (
                  <div className="p-4 text-center text-xs text-zinc-400 font-mono">
                    No matching jobs.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Production Tasks Table */}
          <section className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
                  Evaluated Tasks &amp; Suites ({taskRows.length})
                </h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Click any task row to compare its configured jobs, cohorts, and drill into individual trial trajectories &amp; agent workspaces.
                </p>
              </div>
              <select
                aria-label="Sort tasks table"
                value={taskTableSort}
                onChange={(e) => setTaskTableSort(e.target.value as any)}
                className="rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-1 text-xs"
              >
                <option value="default">Sort: Featured Order</option>
                <option value="jobs_desc">Sort: Most Jobs</option>
                <option value="trials_desc">Sort: Most Trials</option>
                <option value="updated_desc">Sort: Recently Updated</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-zinc-50/80 dark:bg-zinc-900/70 text-[11px] font-mono uppercase text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                  <tr>
                    <th className="py-3 px-4">Task</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3 text-right">Jobs</th>
                    <th className="py-3 px-3 text-right">Trials</th>
                    <th className="py-3 px-3">Configured Modes</th>
                    <th className="py-3 px-3">Mode Summary</th>
                    <th className="py-3 px-3 text-right">Updated</th>
                    <th className="py-3 px-4 text-right">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {taskRows.map((row) => {
                    const arms = row.comparison?.arms || [];
                    const baseArm = arms[0] || null;
                    const bestArm = arms.length > 0 ? arms[arms.length - 1] : null;
                    const unitSuffix = row.comparison?.unit === "%" ? "%" : " pts";
                    return (
                      <tr
                        key={row.taskName}
                        onClick={() => navigateJobs(row.taskName, null, null, true)}
                        className="group hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 cursor-pointer transition"
                      >
                        <td className="py-3.5 px-4 max-w-[320px]">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-zinc-950 dark:text-white">
                              {row.title}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500">
                              {row.taskName}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                            {row.desc}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span
                            className={cn(
                              "text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold",
                              row.sourceKind === "User Task"
                                ? "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300"
                                : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                            )}
                          >
                            {row.sourceKind}
                          </span>
                        </td>

                        <td className="py-3.5 px-3 text-right font-mono whitespace-nowrap">
                          <div className="font-semibold text-zinc-950 dark:text-white">
                            {row.jobCount}
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            {row.trajRuns} w/ traces
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-right font-mono whitespace-nowrap">
                          <div className="font-semibold text-zinc-950 dark:text-white">
                            {row.completedTrials.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            {row.completionPct}% done
                          </div>
                          <div className="w-14 ml-auto mt-1 h-1 rounded-full bg-zinc-200/80 dark:bg-zinc-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.min(100, Math.max(4, row.completionPct))}%` }}
                            />
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {row.armLabels.map((lbl) => (
                              <span
                                key={lbl}
                                className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded border", modeChipClass(lbl))}
                              >
                                {lbl}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 font-mono whitespace-nowrap">
                          {bestArm && baseArm ? (
                            <div>
                              <div className="text-zinc-900 dark:text-zinc-100 font-semibold">
                                {bestArm.value.toFixed(2)}
                                {unitSuffix}
                                {bestArm.delta !== null && bestArm.arm !== baseArm.arm && (
                                  <span
                                    className={cn(
                                      "ml-1.5 text-[11px]",
                                      bestArm.delta >= 0
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-zinc-500 dark:text-zinc-400"
                                    )}
                                  >
                                    ({bestArm.delta >= 0 ? `+${bestArm.delta}` : bestArm.delta})
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-zinc-400">
                                {baseArm.value.toFixed(1)} → {bestArm.value.toFixed(1)}{unitSuffix}
                              </div>
                            </div>
                          ) : row.bestJob?.primaryMetric ? (
                            <div>
                              <div className="text-zinc-900 dark:text-zinc-100 font-semibold">
                                {row.bestJob.primaryMetric.value.toFixed(2)}
                                {row.bestJob.primaryMetric.unit === "%" ? "%" : " pts"}
                              </div>
                              <div className="text-[10px] text-zinc-400 truncate max-w-[160px]">
                                best · {row.bestJob.model}
                              </div>
                            </div>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>

                        <td className="py-3.5 px-3 text-right font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                          {row.latestUpdatedAt ? row.latestUpdatedAt.slice(0, 10) : "—"}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <span className="lv-btn-tertiary inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium">
                            <span>Jobs</span>
                            <span className="inline-block transition-transform duration-150 group-hover:translate-x-0.5">→</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ==================== LEVEL 2: INSIDE A TASK (CONFIGURED JOBS) ==================== */}
      {selectedTask && !selectedJob && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              {selectedTask} · Configured Jobs
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {TASK_DESCRIPTIONS[selectedTask] || `Configured job runs for ${selectedTask}.`}
            </p>
          </div>

          {/* Configured Jobs Table inside Task */}
          <section className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
                  Configured Jobs for {selectedTask} ({taskJobsList.length})
                </h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Click any job row to inspect its trials, execution traces, verifier reports &amp; workspace files.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {taskCohorts.length > 1 && (
                  <select
                    aria-label="Filter jobs by cohort"
                    value={taskCohortFilter}
                    onChange={(e) => setTaskCohortFilter(e.target.value)}
                    className="rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-1 text-xs font-mono"
                  >
                    <option value="all">All Cohorts</option>
                    {taskCohorts.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}

                {taskArms.length > 1 && (
                  <select
                    aria-label="Filter jobs by mode"
                    value={taskArmFilter}
                    onChange={(e) => setTaskArmFilter(e.target.value)}
                    className="rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-1 text-xs"
                  >
                    <option value="all">All Modes</option>
                    {taskArms.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  aria-label="Sort jobs"
                  value={taskSort}
                  onChange={(e) => setTaskSort(e.target.value as any)}
                  className="rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-1 text-xs"
                >
                  <option value="default">Sort: Storage Order</option>
                  <option value="score_desc">Sort: Highest Metric</option>
                  <option value="trials_desc">Sort: Most Trials</option>
                </select>

                <div className="relative w-52">
                  <RiSearchLine className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={taskJobSearch}
                    onChange={(e) => setTaskJobSearch(e.target.value)}
                    placeholder="Filter job, agent, model…"
                    className="w-full rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 pl-8 pr-3 py-1 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-zinc-50/80 dark:bg-zinc-900/70 text-[11px] font-mono uppercase text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                  <tr>
                    <th className="py-3 px-4">Job ID &amp; Storage Path</th>
                    <th className="py-3 px-3">Cohort</th>
                    <th className="py-3 px-3">Agent &amp; Mode</th>
                    <th className="py-3 px-3">Model</th>
                    <th className="py-3 px-3 text-right">Trials</th>
                    <th className="py-3 px-3 text-right">Primary Metric</th>
                    <th className="py-3 px-4 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {taskJobsList.map((j) => (
                    <tr
                      key={j.key}
                      onClick={() => handleOpenJob(j)}
                      className="group hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 cursor-pointer transition"
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-zinc-950 dark:text-white flex items-center gap-2">
                          <span>{j.jobId}</span>
                          {j.submissionValid !== null && j.submissionValid !== undefined && (
                            <span
                              className={cn(
                                "text-[10px] font-normal px-1.5 py-0.2 rounded-full inline-flex items-center gap-0.5",
                                j.submissionValid
                                  ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                                  : "bg-amber-500/12 text-amber-700"
                              )}
                            >
                              {j.submissionValid && <RiCheckLine className="w-3 h-3" />}
                              {j.submissionValid ? "DOCX Valid" : "Valid=0"}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-zinc-400 truncate max-w-[300px]">
                          {j.storageRoot}:/{j.storagePath}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-zinc-500">{j.cohort}</td>
                      <td className="py-3 px-3">
                        <div className="font-mono text-zinc-800 dark:text-zinc-200">{j.agent}</div>
                        <div className="text-[11px] text-zinc-400">{j.armLabel}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                        {j.model}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-zinc-700 dark:text-zinc-300">
                        {j.completedTrials.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {j.primaryMetric
                          ? `${j.primaryMetric.value.toFixed(2)}${
                              j.primaryMetric.unit === "%" ? "%" : ` ${j.primaryMetric.unit}`
                            }`
                          : "—"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="lv-btn-tertiary inline-flex items-center gap-1 whitespace-nowrap px-3 py-1 rounded-full text-[11px] font-medium">
                          <span>{j.hasTrajectories ? "Trials & Traces" : "Report"}</span>
                          <span className="inline-block transition-transform duration-150 group-hover:translate-x-0.5">→</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ==================== LEVEL 3 & LEVEL 4: INSIDE A CONFIGURED JOB ==================== */}
      {selectedJob && (
        <div className="space-y-5">
          {/* Compact Job Summary Banner */}
          <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 sm:p-5 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold">
                    {selectedJob.taskName}
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300">
                    {selectedJob.armLabel}
                  </span>
                  <span className="text-xs font-mono text-zinc-400">
                    {selectedJob.storageRoot}:/{selectedJob.storagePath}
                  </span>
                </div>
                <h1 className="text-xl font-semibold text-zinc-950 dark:text-white mt-1.5 font-mono">
                  {selectedJob.jobId}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedJob.primaryMetric && (
                  <span className="text-sm font-mono font-semibold text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    {selectedJob.primaryMetric.label}: {selectedJob.primaryMetric.value.toFixed(2)}
                    {selectedJob.primaryMetric.unit === "%" ? "%" : ` ${selectedJob.primaryMetric.unit}`}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onOpenComposer({
                      targetType: selectedJob.sourceKind === "user" ? "user" : "benchmark",
                      targetName:
                        selectedJob.sourceKind === "user"
                          ? `user_workspace/tasks/${selectedJob.taskName}`
                          : selectedJob.taskName,
                      agent: selectedJob.agent,
                      model: selectedJob.model,
                      enableLaws:
                        selectedJob.arm === "vanilla_cap" ||
                        selectedJob.arm === "full_capabilities",
                    })
                  }
                  className="lv-btn-secondary inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer"
                >
                  <RiTerminalBoxLine className="w-3.5 h-3.5" />
                  Clone &amp; Run
                </button>
              </div>
            </div>
          </div>

          {/* LEVEL 4 (Explicit trial selected from multi-trial table) */}
          {selectedTrial ? (
            <TrialDetailView
              trialRef={selectedTrial}
              mode={mode}
              staticTrials={staticTrials}
              harborWorkspace={harborWorkspace}
              onOpenComposerWithPreset={onOpenComposer}
            />
          ) : isSingleTrialJob ? (
            /* SINGLE-TRIAL SMART FAST PATH: Inline Trial Trajectory & Harbor Workspace directly at Level 3 */
            <div className="space-y-4">
              <div className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 p-1 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setSingleJobSubTab("trial")}
                  className={cn(
                    "relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition cursor-pointer",
                    singleJobSubTab === "trial"
                      ? "text-zinc-950 dark:text-white font-semibold"
                      : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                  )}
                >
                  {singleJobSubTab === "trial" && <SlidingPill layoutId="jobs-single-subtab" />}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <RiRouteLine className="w-3.5 h-3.5" />
                    Trial Trajectory &amp; Harbor Workspace
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSingleJobSubTab("report")}
                  className={cn(
                    "relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition cursor-pointer",
                    singleJobSubTab === "report"
                      ? "text-zinc-950 dark:text-white font-semibold"
                      : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                  )}
                >
                  {singleJobSubTab === "report" && <SlidingPill layoutId="jobs-single-subtab" />}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <RiFolderOpenLine className="w-3.5 h-3.5" />
                    Job Report &amp; Files ({selectedJob.files.length})
                  </span>
                </button>
              </div>

              {singleJobSubTab === "trial" ? (
                <TrialDetailView
                  trialRef={inlineSingleTrialRef}
                  mode={mode}
                  staticTrials={staticTrials}
                  harborWorkspace={harborWorkspace}
                  onOpenComposerWithPreset={onOpenComposer}
                />
              ) : (
                <JobReportAndFilesPanel
                  job={selectedJob}
                  mode={mode}
                  sampleTabIdx={sampleTabIdx}
                  setSampleTabIdx={setSampleTabIdx}
                />
              )}
            </div>
          ) : (
            /* MULTI-TRIAL / LEGACY BENCHMARK JOB VIEW (Level 3) */
            <div className="space-y-4">
              <div className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 p-1 text-xs font-medium">
                {selectedJob.hasTrajectories && (
                  <button
                    type="button"
                    onClick={() => setJobSubTab("trials")}
                    className={cn(
                      "relative px-3.5 py-1.5 rounded-full transition cursor-pointer",
                      jobSubTab === "trials"
                        ? "text-zinc-950 dark:text-white font-semibold"
                        : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                    )}
                  >
                    {jobSubTab === "trials" && <SlidingPill layoutId="jobs-multi-subtab" />}
                    <span className="relative z-10">
                      Trials &amp; Trajectories ({selectedJob.trajectoryCount.toLocaleString()})
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setJobSubTab("report")}
                  className={cn(
                    "relative px-3.5 py-1.5 rounded-full transition cursor-pointer",
                    jobSubTab === "report"
                      ? "text-zinc-950 dark:text-white font-semibold"
                      : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                  )}
                >
                  {jobSubTab === "report" && <SlidingPill layoutId="jobs-multi-subtab" />}
                  <span className="relative z-10">Metrics &amp; Subtasks</span>
                </button>
                <button
                  type="button"
                  onClick={() => setJobSubTab("files")}
                  className={cn(
                    "relative px-3.5 py-1.5 rounded-full transition cursor-pointer",
                    jobSubTab === "files"
                      ? "text-zinc-950 dark:text-white font-semibold"
                      : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                  )}
                >
                  {jobSubTab === "files" && <SlidingPill layoutId="jobs-multi-subtab" />}
                  <span className="relative z-10">Job Files ({selectedJob.files.length})</span>
                </button>
              </div>

              {jobSubTab === "trials" && selectedJob.hasTrajectories && (
                <section className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs font-mono text-zinc-500">
                      {mode === "serve"
                        ? `Live stored trials in ${selectedJob.storagePath}: ${trialsPage.total.toLocaleString()} total`
                        : `Static export slice: ${trialsPage.total.toLocaleString()} stratified trials`}
                    </div>
                    <div className="relative w-64">
                      <RiSearchLine className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        value={trialSearchInput}
                        onChange={(e) => setTrialSearchInput(e.target.value)}
                        placeholder="Search trial_id, subtask, sample…"
                        className="w-full rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 pl-8 pr-3 py-1 text-xs"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-zinc-50 dark:bg-zinc-900 text-[10px] font-mono uppercase text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                        <tr>
                          <th className="py-2.5 px-4">Task &amp; Sample</th>
                          <th className="py-2.5 px-3">Trial ID &amp; Storage Folder</th>
                          <th className="py-2.5 px-3 text-right">Steps / Tools</th>
                          <th className="py-2.5 px-3 text-right">Tokens</th>
                          <th className="py-2.5 px-3 text-right">Score</th>
                          <th className="py-2.5 px-4 text-right">Open</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                        {trialsPage.items.map((tr) => (
                          <tr
                            key={tr.id}
                            onClick={() =>
                              navigateJobs(
                                selectedJob.taskName,
                                selectedJob.key,
                                {
                                  id: tr.id,
                                  storageRoot: tr.storageRoot,
                                  storagePath: tr.storagePath,
                                  staticFile: tr.staticFile,
                                },
                                true
                              )
                            }
                            className="group hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 cursor-pointer transition"
                          >
                            <td className="py-2.5 px-4">
                              <div className="font-mono font-semibold text-zinc-950 dark:text-white">
                                {tr.taskType} #{tr.sampleId}
                              </div>
                              <div className="text-[11px] text-zinc-400">
                                {BENCHMARK_TASK_NAMES[selectedJob.taskName]?.[tr.taskType] ||
                                  (selectedJob.taskName === "lawbench"
                                    ? LAWBENCH_TASK_NAMES[tr.taskType]
                                    : selectedJob.taskName === "plawbench"
                                    ? PLAWBENCH_TASK_NAMES[tr.taskType]
                                    : undefined) ||
                                  tr.taskType}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px]">
                              <div className="text-zinc-700 dark:text-zinc-300">{tr.trialId}</div>
                              <div className="text-[10px] text-zinc-400 truncate max-w-[280px]">
                                {tr.storagePath.split("/").pop()}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-zinc-600 dark:text-zinc-300">
                              {tr.steps ?? "—"}s · {tr.toolCalls ?? 0}t
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-zinc-500">
                              {(
                                ((tr.promptTokens || 0) + (tr.completionTokens || 0)) /
                                1000
                              ).toFixed(1)}
                              k
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                              {tr.score !== null && tr.score !== undefined
                                ? `${tr.score}${tr.scoreUnit === "%" ? "%" : ` ${tr.scoreUnit}`}`
                                : tr.status}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <span className="lv-btn-tertiary inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap">
                                <span>Open</span>
                                <span className="inline-block transition-transform duration-150 group-hover:translate-x-0.5">→</span>
                              </span>
                            </td>
                          </tr>
                        ))}

                        {trialsPage.items.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-xs font-mono text-zinc-400">
                              {loadingTrials ? "Loading stored trials…" : "No matching trials found."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="px-4 py-2.5 bg-zinc-50/70 dark:bg-zinc-900/60 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-zinc-500">
                      Page {trialsPage.page} / {trialsPage.totalPages.toLocaleString()} ·{" "}
                      {trialsPage.total.toLocaleString()} trials
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={trialsPage.page <= 1 || loadingTrials}
                        onClick={() => setTrialPageNum((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      >
                        Prev Page
                      </button>
                      <button
                        type="button"
                        disabled={trialsPage.page >= trialsPage.totalPages || loadingTrials}
                        onClick={() => setTrialPageNum((p) => Math.min(trialsPage.totalPages, p + 1))}
                        className="px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      >
                        Next Page
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {(jobSubTab === "report" || !selectedJob.hasTrajectories) && (
                <JobReportAndFilesPanel
                  job={selectedJob}
                  mode={mode}
                  sampleTabIdx={sampleTabIdx}
                  setSampleTabIdx={setSampleTabIdx}
                  hideFiles
                />
              )}

              {jobSubTab === "files" && (
                <JobFilesCard job={selectedJob} mode={mode} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JobFilesCard({ job, mode }: { job: StoredJobRecord; mode: RuntimeMode }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
            <RiFolderOpenLine className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Stored Run Files ({job.files.length})
          </span>
          <span className="text-[11px] font-mono text-zinc-400">{job.storagePath}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {job.files.map((f) => (
            <div
              key={f.relPath}
              className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 px-3.5 py-2.5 flex items-center justify-between gap-2 text-[11px] font-mono"
            >
              <div className="min-w-0">
                <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {f.name}
                </div>
                <div className="text-[10px] text-zinc-400">
                  {(f.sizeBytes / 1024).toFixed(1)} KB
                </div>
              </div>
              {mode === "serve" && f.downloadable && f.sizeBytes < 20 * 1024 * 1024 && (
                <a
                  href={withBasePath(
                    `/api/live/artifact?storageRoot=${encodeURIComponent(
                      f.storageRoot
                    )}&storagePath=${encodeURIComponent(f.relPath)}`
                  )}
                  className="shrink-0 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <RiDownload2Line className="w-3.5 h-3.5" />
                  Save
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      <TerminalSnippet title="Inspect Job Locally" command={job.cliInspectCommand} />
    </div>
  );
}

function JobReportAndFilesPanel({
  job,
  mode,
  sampleTabIdx,
  setSampleTabIdx,
  hideFiles = false,
}: {
  job: StoredJobRecord;
  mode: RuntimeMode;
  sampleTabIdx: number;
  setSampleTabIdx: (idx: number) => void;
  hideFiles?: boolean;
}) {
  return (
    <div className="space-y-4">
      {job.taskName === "plawbench" && job.subtaskMetrics.length > 0 && (
        <PLawBenchBreakdownChart
          tasks={job.subtaskMetrics.map((s) => ({
            task: s.task,
            metrics: s.metrics,
          }))}
        />
      )}

      {job.taskName === "lawbench" && job.subtaskMetrics.length > 0 && (
        <MebiusEfficiencyAreaCard
          subtasks={job.subtaskMetrics.map((s) => ({
            task: s.task,
            score: s.primaryValue ?? 0,
            abstention: s.metrics.abstention_rate ?? 0,
          }))}
          title={`${job.jobId} · Subtask Accuracy`}
          metaLabel={`${job.subtaskMetrics.length} subtasks · ${job.completedTrials.toLocaleString()} samples`}
        />
      )}

      {job.subtaskMetrics.length > 0 && (
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800/80 text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
            <span>Subtask &amp; Verifier Metrics</span>
            <span className="font-mono text-[11px] text-zinc-400">
              {job.subtaskMetrics.length} rows
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {job.subtaskMetrics.map((s) => (
              <div
                key={s.task}
                className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-semibold text-zinc-950 dark:text-white">
                    {s.label ||
                      (job.taskName === "lawbench"
                        ? LAWBENCH_TASK_NAMES[s.task]
                        : PLAWBENCH_TASK_NAMES[s.task]) ||
                      s.task}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400">{s.task}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(s.metrics).map(([mk, mv]) => (
                    <span
                      key={mk}
                      className={cn(
                        "text-[11px] font-mono px-2 py-0.5 rounded-md border",
                        mk === s.primaryName
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold"
                          : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300"
                      )}
                    >
                      {mk}: {mv}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(job.sampledTrials || []).length > 0 && (
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <RiFileTextLine className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-zinc-950 dark:text-white">
                Sampled Verification Cases
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {job.sampledTrials.map((tr, idx) => (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => setSampleTabIdx(idx)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-mono transition cursor-pointer",
                    sampleTabIdx === idx
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-semibold"
                      : "bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  )}
                >
                  {tr.task} #{tr.sampleId}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const activeSample = job.sampledTrials[sampleTabIdx] || job.sampledTrials[0];
            if (!activeSample) return null;
            return (
              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-3 space-y-1.5">
                  <div className="text-[10px] font-mono uppercase text-zinc-400">
                    Input Prompt · {activeSample.id}
                  </div>
                  <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {activeSample.instruction}
                    {activeSample.content ? `\n\n${activeSample.content}` : ""}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3 space-y-1.5">
                    <div className="text-[10px] font-mono uppercase text-emerald-700 dark:text-emerald-300">
                      Model Response
                    </div>
                    <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                      {activeSample.response || "(empty response)"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-3 space-y-1.5">
                    <div className="text-[10px] font-mono uppercase text-zinc-400">
                      Reference / Rubric
                    </div>
                    <pre className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
                      {activeSample.reference}
                    </pre>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {!hideFiles && <JobFilesCard job={job} mode={mode} />}
    </div>
  );
}
