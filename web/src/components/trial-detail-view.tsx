"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  RiRobot2Line,
  RiUser3Line,
  RiSearchEyeLine,
  RiBookReadLine,
  RiFileEditLine,
  RiFileTextLine,
  RiFileCodeLine,
  RiTerminalBoxLine,
  RiCheckDoubleLine,
  RiSparkling2Line,
  RiDownload2Line,
  RiArrowLeftLine,
  RiArrowRightLine,
  RiTerminalLine,
  RiInformationLine,
  RiFolderOpenLine,
  RiShieldCheckFill,
  RiCloseCircleLine,
  RiRouteLine,
  RiCpuLine,
  RiDatabase2Line,
  RiScales3Line,
  RiFileCopyLine,
  RiCheckLine,
} from "@remixicon/react";
import type {
  AgentWorkspaceFile,
  StorageRootId,
  StoredTrialDetail,
  StoredTrialIndexEntry,
} from "@/lib/storage-types";
import type { RuntimeMode } from "@/lib/lexverse-data";
import { withBasePath } from "@/lib/runtime-config";
import { TerminalSnippet, cn } from "./magic-ui";
import { StepTokenTimelineChart } from "./mebius-charts";
import type { ComposerPreset } from "./experiment-composer";

export interface TrialRefInput {
  id?: string;
  storageRoot: StorageRootId;
  storagePath: string;
  staticFile?: string;
}

function tryParseJson(raw: any): any {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function artifactDownloadUrl(storageRoot: StorageRootId, relPath: string, inline = false): string {
  return withBasePath(
    `/api/live/artifact?storageRoot=${encodeURIComponent(
      storageRoot
    )}&storagePath=${encodeURIComponent(relPath)}${inline ? "&inline=1" : ""}`
  );
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

const RUBRIC_DIM_LABELS: Record<string, { label: string; max: number }> = {
  facts_amounts: { label: "Facts & Amounts (事实与金额梳理)", max: 20 },
  legal_analysis: { label: "Legal Analysis (法律推理与时点)", max: 30 },
  complaint: { label: "Complaint Draft (起诉状草稿)", max: 25 },
  material_grounding: { label: "Material Grounding (材料依据)", max: 20 },
  usability: { label: "DOCX Usability (文书可用性)", max: 5 },
};

type PrimaryTrialTab = "trace" | "judge" | "workspace";
type TraceDensity = "focus" | "full";

export function TrialDetailView({
  trialRef,
  mode,
  staticTrials,
  onOpenComposerWithPreset,
}: {
  trialRef: TrialRefInput | null;
  mode: RuntimeMode;
  staticTrials: StoredTrialIndexEntry[];
  onOpenComposerWithPreset: (preset: ComposerPreset) => void;
}) {
  const [bundle, setBundle] = useState<StoredTrialDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<PrimaryTrialTab>("trace");
  const [traceDensity, setTraceDensity] = useState<TraceDensity>("focus");
  const [selectedStepIdx, setSelectedStepIdx] = useState<number | "all">("all");
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const [expandedObs, setExpandedObs] = useState<Record<string, boolean>>({});

  const [showRawJudgeJson, setShowRawJudgeJson] = useState(false);
  const [selectedWsNode, setSelectedWsNode] = useState<string>("virtual:answer");
  const [skillSearch, setSkillSearch] = useState("");
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);
  const [trialPdfViewMode, setTrialPdfViewMode] = useState<"embed" | "text">("embed");

  const detailCacheRef = useRef<Record<string, StoredTrialDetail>>({});

  useEffect(() => {
    setSelectedStepIdx("all");
    setExpandedSteps({});
    setExpandedObs({});
    setLoadError(null);
    if (!trialRef) {
      setBundle(null);
      return;
    }

    const staticMatch =
      trialRef.staticFile ||
      staticTrials.find(
        (t) => t.storageRoot === trialRef.storageRoot && t.storagePath === trialRef.storagePath
      )?.staticFile ||
      "";

    const cacheKey = `${mode}:${trialRef.storageRoot}:${trialRef.storagePath}:${staticMatch}`;
    const cached = detailCacheRef.current[cacheKey];
    if (cached) {
      setBundle(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const rawUrl =
      mode === "serve"
        ? `/api/live/trial?storageRoot=${encodeURIComponent(
            trialRef.storageRoot
          )}&storagePath=${encodeURIComponent(trialRef.storagePath)}`
        : staticMatch;

    if (!rawUrl) {
      if (mode === "static" && staticTrials.length === 0) {
        setLoading(true);
        return;
      }
      setLoadError("No exported static bundle available for this trial in Static Hub mode.");
      setLoading(false);
      return;
    }

    const url = withBasePath(rawUrl);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const detail: StoredTrialDetail = mode === "serve" && data?.trial ? data.trial : data;
        if (!detail || !detail.trajectory) {
          throw new Error("Invalid trial bundle response");
        }
        detailCacheRef.current[cacheKey] = detail;
        setBundle(detail);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message || "Failed to load trial bundle");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trialRef, mode, staticTrials]);

  // Select the most informative default file inside Agent Workspace whenever trial changes
  useEffect(() => {
    if (!bundle) return;
    const wf = bundle.harborWorkspace?.workFiles || [];
    if (wf.length > 0) {
      setSelectedWsNode(wf[0].id);
    } else if (bundle.answer) {
      setSelectedWsNode("virtual:answer");
    } else {
      setSelectedWsNode("runtime:result");
    }
    setShowRawJudgeJson(false);
    setSkillSearch("");
  }, [bundle]);

  const steps: any[] = useMemo(() => bundle?.trajectory?.steps || [], [bundle]);
  const hw = bundle?.harborWorkspace;
  const workFiles: AgentWorkspaceFile[] = useMemo(() => hw?.workFiles || [], [hw]);
  const accessedInputs = useMemo(() => hw?.accessedInputs || [], [hw]);
  const invokedSkills = useMemo(() => hw?.invokedSkills || [], [hw]);
  const mountedSkills = useMemo(() => hw?.mountedSkills || [], [hw]);

  const invokedSkillSet = useMemo(() => new Set(invokedSkills), [invokedSkills]);
  const filteredSkills = useMemo(() => {
    const q = skillSearch.trim().toLowerCase();
    const list = mountedSkills.filter((s) => !q || s.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const au = invokedSkillSet.has(a) ? 0 : 1;
      const bu = invokedSkillSet.has(b) ? 0 : 1;
      return au !== bu ? au - bu : a.localeCompare(b);
    });
  }, [mountedSkills, skillSearch, invokedSkillSet]);

  const totalTokens =
    (bundle?.usage?.promptTokens || 0) + (bundle?.usage?.completionTokens || 0);

  const selectedWorkFile = useMemo(
    () => workFiles.find((f) => f.id === selectedWsNode) || null,
    [workFiles, selectedWsNode]
  );

  const trajDownloadFile = useMemo(
    () => (bundle?.files || []).find((f) => f.kind === "trajectory") || null,
    [bundle]
  );

  const handleExportTraceJson = () => {
    if (!bundle) return;
    const payload = JSON.stringify(bundle, null, 2);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bundle.trialId || bundle.id}-trajectory.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedFileId(id);
    setTimeout(() => setCopiedFileId((cur) => (cur === id ? null : cur)), 1600);
  };

  const openPathInWorkspace = (targetPath?: string) => {
    if (targetPath) {
      const cleanTarget = targetPath.replace(/^.*\//, "");
      const match = workFiles.find(
        (f) => f.path === targetPath || f.path.endsWith(`/${cleanTarget}`) || f.name === cleanTarget
      );
      if (match) setSelectedWsNode(match.id);
    }
    setActiveTab("workspace");
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-10 text-center text-xs text-zinc-500 font-mono">
        Loading stored trial trajectory, judge assessment &amp; agent workspace ({trialRef?.storagePath})…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] p-6 text-xs text-amber-800 dark:text-amber-300 font-mono">
        {loadError}
      </div>
    );
  }

  if (!bundle) return null;

  const numericIdx = selectedStepIdx === "all" ? 0 : selectedStepIdx;
  const canPrev = selectedStepIdx !== "all" && numericIdx > 0;
  const canNext = steps.length > 0 && (selectedStepIdx === "all" || numericIdx < steps.length - 1);
  const visibleSteps =
    selectedStepIdx === "all" ? steps : [steps[selectedStepIdx]].filter(Boolean);

  const metricValues = Object.values(bundle.metrics || {});
  const scoreBadgeText = bundle.primaryMetric
    ? `${bundle.primaryMetric.value}${bundle.primaryMetric.unit === "%" ? "%" : ` ${bundle.primaryMetric.unit}`}`
    : null;

  return (
    <div className="space-y-4">
      {/* ==================== PROVENANCE HEADER + 3 UNDERLINED TABS ==================== */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-zinc-100 dark:border-zinc-800/80">
            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
              {bundle.trajectory?.schema_version &&
                !/atif/i.test(bundle.trajectory.schema_version) && (
                  <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold shrink-0">
                    {bundle.trajectory.schema_version}
                  </span>
                )}
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-white truncate">
                {bundle.title}
              </h2>
              {bundle.trialId && (
                <span className="text-[11px] font-mono text-zinc-400">{bundle.trialId}</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportTraceJson}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-1.5 text-xs font-medium transition cursor-pointer"
              >
                <RiDownload2Line className="w-3.5 h-3.5" />
                Export JSON
              </button>

              <button
                type="button"
                onClick={() =>
                  onOpenComposerWithPreset({
                    targetType: bundle.sourceKind === "user" ? "user" : "benchmark",
                    targetName:
                      bundle.sourceKind === "user"
                        ? `user_workspace/tasks/${bundle.taskName}`
                        : bundle.taskName,
                    agent: bundle.agent === "static" ? "static" : bundle.agent,
                    model: bundle.model,
                    enableLaws:
                      bundle.arm === "full_capabilities" || bundle.arm === "vanilla_cap",
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 px-3.5 py-1.5 text-xs font-medium transition cursor-pointer"
              >
                <RiTerminalBoxLine className="w-3.5 h-3.5" />
                {mode === "serve" ? "Clone & Re-run" : "Reproduce CLI"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
            <div className="sm:col-span-2 min-w-0">
              <span className="text-zinc-500 dark:text-zinc-400 block">Trial Storage Path</span>
              <span className="font-mono text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 break-all">
                {bundle.storageRoot}:/{bundle.storagePath}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 block">Agent · Model</span>
              <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                {bundle.agent} · {bundle.model}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 block">Steps · Tokens</span>
              <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                {steps.length}s · {totalTokens.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 block">Verification</span>
              {scoreBadgeText ? (
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {scoreBadgeText} · {bundle.status}
                </span>
              ) : (
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {bundle.status}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Clean 3-Tab Underlined Bar matching reference screenshot */}
        <div
          role="tablist"
          aria-label="Trial Inspection Views"
          className="px-4 sm:px-5 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/40 flex items-center gap-6 overflow-x-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "trace"}
            onClick={() => setActiveTab("trace")}
            className={cn(
              "inline-flex items-center gap-2 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition cursor-pointer -mb-px",
              activeTab === "trace"
                ? "border-zinc-950 dark:border-white text-zinc-950 dark:text-white font-semibold"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
          >
            <RiRouteLine className="w-3.5 h-3.5" />
            <span>Run trace</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "judge"}
            onClick={() => setActiveTab("judge")}
            className={cn(
              "inline-flex items-center gap-2 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition cursor-pointer -mb-px",
              activeTab === "judge"
                ? "border-zinc-950 dark:border-white text-zinc-950 dark:text-white font-semibold"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
          >
            <RiScales3Line className="w-3.5 h-3.5" />
            <span>Judge</span>
            {scoreBadgeText && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold">
                {scoreBadgeText}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "workspace"}
            onClick={() => setActiveTab("workspace")}
            className={cn(
              "inline-flex items-center gap-2 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition cursor-pointer -mb-px",
              activeTab === "workspace"
                ? "border-zinc-950 dark:border-white text-zinc-950 dark:text-white font-semibold"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
          >
            <RiFolderOpenLine className="w-3.5 h-3.5" />
            <span>Workspace</span>
            {workFiles.length > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold">
                {workFiles.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ==================== TAB 1: RUN TRACE ==================== */}
      {activeTab === "trace" && (
        <div className="space-y-4">
          {/* Sub-header metadata + Focus | Full toggle matching screenshot */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
              <span>
                {steps.length} turns · {bundle.usage?.toolCalls ?? 0} tool calls ·{" "}
                {totalTokens.toLocaleString()} tokens
              </span>
              {bundle.usage?.usedRetrieval && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                  Retrieval
                </span>
              )}
              {bundle.usage?.usedSkill && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold">
                  Skills
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              {traceDensity === "full" && steps.length > 1 && (
                <div className="hidden sm:flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    disabled={!canPrev}
                    onClick={() =>
                      setSelectedStepIdx((prev) =>
                        prev === "all" ? 0 : Math.max(0, prev - 1)
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[11px] font-medium disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <RiArrowLeftLine className="w-3 h-3" />
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={!canNext}
                    onClick={() =>
                      setSelectedStepIdx((prev) =>
                        prev === "all" ? 0 : Math.min(steps.length - 1, prev + 1)
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[11px] font-medium disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    Next
                    <RiArrowRightLine className="w-3 h-3" />
                  </button>
                </div>
              )}

              <div
                role="group"
                aria-label="Trace Detail Density"
                className="inline-flex items-center rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900 p-0.5 text-xs font-medium"
              >
                <button
                  type="button"
                  onClick={() => {
                    setTraceDensity("focus");
                    setSelectedStepIdx("all");
                  }}
                  className={cn(
                    "px-3 py-1 rounded-full transition cursor-pointer",
                    traceDensity === "focus"
                      ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-2xs font-semibold"
                      : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                  )}
                >
                  Focus
                </button>
                <button
                  type="button"
                  onClick={() => setTraceDensity("full")}
                  className={cn(
                    "px-3 py-1 rounded-full transition cursor-pointer",
                    traceDensity === "full"
                      ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-2xs font-semibold"
                      : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                  )}
                >
                  Full
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Timeline + Telemetry rail shown in Full mode */}
            {traceDensity === "full" && (
              <div className="lg:col-span-3 space-y-3 lg:sticky lg:top-20">
                <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-3">
                  <div className="flex items-center justify-between px-1 pb-2.5 mb-2 border-b border-zinc-100 dark:border-zinc-800/80">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                      Steps ({steps.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedStepIdx("all")}
                      className={cn(
                        "text-[11px] px-2 py-0.5 rounded font-medium cursor-pointer",
                        selectedStepIdx === "all"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                      )}
                    >
                      All
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-0.5">
                    {steps.map((s, idx) => {
                      const toolNames = (s.tool_calls || []).map((t: any) => t.function_name);
                      const hasKnowledge = toolNames.some((n: string) =>
                        n.toLowerCase().includes("knowledge")
                      );
                      const hasWrite = toolNames.some((n: string) =>
                        ["write_file", "write", "create_file", "apply_patch", "edit_file"].includes(
                          n.toLowerCase()
                        )
                      );
                      const active = selectedStepIdx === idx;

                      return (
                        <button
                          key={`${s.step_id}-${idx}`}
                          type="button"
                          onClick={() => setSelectedStepIdx(idx)}
                          className={cn(
                            "w-full text-left rounded-lg px-2.5 py-2 transition border cursor-pointer",
                            active
                              ? "border-emerald-500/50 bg-emerald-500/10"
                              : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900"
                          )}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                              #{String(s.step_id).padStart(2, "0")}{" "}
                              {s.source === "user"
                                ? "Prompt / Input"
                                : s.source === "system"
                                ? "System Prompt"
                                : hasKnowledge
                                ? "Knowledge Retrieval"
                                : hasWrite
                                ? "Write File"
                                : toolNames[0] || "Agent Turn"}
                            </span>
                            {s.metrics?.prompt_tokens && (
                              <span className="text-[10px] font-mono text-zinc-400 shrink-0 ml-1">
                                {(s.metrics.prompt_tokens / 1000).toFixed(1)}k
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <StepTokenTimelineChart steps={steps} />
              </div>
            )}

            {/* Main Spacious Trace Stream */}
            <div
              className={cn(
                "space-y-3",
                traceDensity === "full" ? "lg:col-span-9" : "lg:col-span-12"
              )}
            >
              {(traceDensity === "focus" ? steps : visibleSteps).map((step, sIdx) => {
                const obsMap: Record<string, any> = {};
                for (const res of step.observation?.results || []) {
                  if (res.source_call_id) obsMap[res.source_call_id] = res.content;
                }

                const isUser = step.source === "user";
                const isSystem = step.source === "system";
                const msgText =
                  typeof step.message === "string"
                    ? step.message
                    : JSON.stringify(step.message || "");

                const stepKey = Number(step.step_id ?? sIdx);
                const msgExpanded = Boolean(expandedSteps[stepKey]);
                const focusCollapseLimit = isUser || isSystem ? 320 : 1200;
                const isCollapsedInFocus =
                  traceDensity === "focus" && !msgExpanded && msgText.length > focusCollapseLimit;
                const displayMsg = isCollapsedInFocus
                  ? msgText.slice(0, focusCollapseLimit) + "…"
                  : msgText;

                return (
                  <div
                    key={`${step.step_id}-${sIdx}`}
                    className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "w-6 h-6 rounded-md grid place-items-center",
                            isUser || isSystem
                              ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          )}
                        >
                          {isUser || isSystem ? (
                            <RiUser3Line className="w-3.5 h-3.5" />
                          ) : (
                            <RiRobot2Line className="w-3.5 h-3.5" />
                          )}
                        </span>
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          Step {String(step.step_id).padStart(2, "0")} ·{" "}
                          {isUser
                            ? step.model_name || "Task Input"
                            : isSystem
                            ? "System Instruction"
                            : step.model_name || bundle.model || "Agent"}
                        </span>
                      </div>
                      {step.metrics && (
                        <span className="text-[11px] font-mono text-zinc-400">
                          in:{step.metrics.prompt_tokens ?? 0} · out:
                          {step.metrics.completion_tokens ?? 0}
                        </span>
                      )}
                    </div>

                    {msgText && msgText !== "(tool use)" && (
                      <div className="space-y-1.5">
                        <p className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap bg-zinc-50/70 dark:bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-200/60 dark:border-zinc-800">
                          {displayMsg}
                        </p>
                        {traceDensity === "focus" && msgText.length > focusCollapseLimit && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSteps((p) => ({ ...p, [stepKey]: !p[stepKey] }))
                            }
                            className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                          >
                            {msgExpanded
                              ? "Collapse text"
                              : `Expand full text (${msgText.length.toLocaleString()} chars)`}
                          </button>
                        )}
                      </div>
                    )}

                    {(step.tool_calls || []).map((tc: any, tcIdx: number) => {
                      const rawResult = obsMap[tc.tool_call_id];
                      const parsedResult = tryParseJson(rawResult);
                      const fn = String(tc.function_name || "tool");
                      const fnLower = fn.toLowerCase();
                      const args = tc.arguments || {};
                      const obsId = `${stepKey}:${tc.tool_call_id || tcIdx}`;
                      const isObsExpanded = traceDensity === "full" || Boolean(expandedObs[obsId]);

                      if (fnLower.includes("search_knowledge")) {
                        const hits = Array.isArray(parsedResult)
                          ? parsedResult
                          : Array.isArray(parsedResult?.results)
                          ? parsedResult.results
                          : [];
                        return (
                          <div
                            key={obsId}
                            className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3.5 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                                <RiSearchEyeLine className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{fn}</span>
                              </span>
                              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                                {hits.length ? `${hits.length} hits` : "knowledge"}
                              </span>
                            </div>
                            {args.query && (
                              <div className="text-xs text-zinc-800 dark:text-zinc-200 font-medium">
                                Query: “{args.query}”
                              </div>
                            )}
                            {hits.length > 0 ? (
                              <div className="space-y-1.5 pt-1">
                                {(isObsExpanded ? hits.slice(0, 6) : hits.slice(0, 3)).map(
                                  (h: any, hi: number) => (
                                    <div
                                      key={hi}
                                      className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 p-2 text-[11px] bg-white dark:bg-zinc-900"
                                    >
                                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                                        《{h.title || "Statute"}》 {h.article || ""}
                                      </div>
                                      <p className="text-zinc-600 dark:text-zinc-400 mt-0.5 line-clamp-2">
                                        {h.snippet || h.text}
                                      </p>
                                    </div>
                                  )
                                )}
                              </div>
                            ) : (
                              rawResult && (
                                <pre className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 max-h-36 overflow-y-auto whitespace-pre-wrap">
                                  {String(rawResult).slice(0, isObsExpanded ? 2400 : 320)}
                                </pre>
                              )
                            )}
                          </div>
                        );
                      }

                      if (fnLower.includes("fetch_knowledge")) {
                        const doc =
                          parsedResult && typeof parsedResult === "object" ? parsedResult : {};
                        return (
                          <div
                            key={obsId}
                            className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-3.5 space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                                <RiBookReadLine className="w-3.5 h-3.5 shrink-0" />
                                {fn}
                              </span>
                              {doc.effective_from && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-800 dark:text-emerald-200">
                                  Effective: {doc.effective_from}
                                </span>
                              )}
                            </div>
                            {(doc.title || doc.article) && (
                              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                《{doc.title || "Statute"}》 {doc.article || ""}
                              </div>
                            )}
                            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed bg-white/80 dark:bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-200/70 dark:border-zinc-800 max-h-40 overflow-y-auto whitespace-pre-wrap">
                              {doc.text || String(rawResult || "")}
                            </p>
                          </div>
                        );
                      }

                      if (
                        ["bash", "exec", "execute", "terminal"].includes(fnLower)
                      ) {
                        const cmd = args.command || args.input || args.cmd || JSON.stringify(args);
                        const resStr = String(rawResult || "");
                        return (
                          <div
                            key={obsId}
                            className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-3.5 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                                <RiTerminalLine className="w-3.5 h-3.5 text-zinc-500" />
                                {fn}
                              </span>
                            </div>
                            <pre className="text-[11px] font-mono text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-950 p-2.5 rounded-lg border border-zinc-200/70 dark:border-zinc-800 overflow-x-auto whitespace-pre-wrap">
                              {String(cmd).slice(0, isObsExpanded ? 2400 : 500)}
                            </pre>
                            {resStr && (
                              <div className="space-y-1">
                                <pre className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 max-h-36 overflow-y-auto whitespace-pre-wrap">
                                  {resStr.slice(0, isObsExpanded ? 2400 : 320)}
                                </pre>
                                {traceDensity === "focus" && resStr.length > 320 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedObs((p) => ({ ...p, [obsId]: !p[obsId] }))
                                    }
                                    className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                                  >
                                    {isObsExpanded ? "Hide full output" : "Show full output"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (
                        [
                          "write_file",
                          "write",
                          "create_file",
                          "save_file",
                          "edit_file",
                          "apply_patch",
                        ].includes(fnLower)
                      ) {
                        const targetFile =
                          args.file_path || args.filePath || args.path || "workspace file";
                        return (
                          <div
                            key={obsId}
                            className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.03] p-3.5 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <RiFileEditLine className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                  {fn} → {targetFile}
                                </div>
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                  {rawResult || "File updated inside agent workspace"}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => openPathInWorkspace(String(targetFile))}
                              className="shrink-0 px-3 py-1 rounded-full bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950 text-[11px] font-medium transition cursor-pointer"
                            >
                              Workspace →
                            </button>
                          </div>
                        );
                      }

                      if (["skill", "read_skill", "use_skill", "load_skill"].includes(fnLower)) {
                        return (
                          <div
                            key={obsId}
                            className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.04] p-3 space-y-1.5"
                          >
                            <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-indigo-700 dark:text-indigo-300">
                              <RiSparkling2Line className="w-3.5 h-3.5" />
                              {fn} ({args.name || args.skill || "skill"})
                            </div>
                            {rawResult && (
                              <pre className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 max-h-28 overflow-y-auto whitespace-pre-wrap">
                                {String(rawResult).slice(0, isObsExpanded ? 1800 : 280)}
                              </pre>
                            )}
                          </div>
                        );
                      }

                      const argSummary =
                        args.file_path ||
                        args.filePath ||
                        args.path ||
                        args.pattern ||
                        args.query ||
                        (Object.keys(args).length ? JSON.stringify(args).slice(0, 140) : "");

                      return (
                        <div
                          key={obsId}
                          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-3 space-y-1.5"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-300 truncate">
                            <RiFileTextLine className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              {fn}({argSummary})
                            </span>
                          </div>
                          {rawResult && (
                            <pre className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 max-h-32 overflow-y-auto whitespace-pre-wrap">
                              {String(rawResult).slice(0, isObsExpanded ? 2400 : 320)}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Telemetry & CLI Receipt footer in Full mode */}
              {traceDensity === "full" && (
                <div className="space-y-3 pt-2">
                  <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-2.5 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
                      <RiInformationLine className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Execution &amp; Token Telemetry
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 font-mono text-[11px]">
                      <div>
                        <span className="text-zinc-400 block">Trial ID</span>
                        <span className="text-zinc-800 dark:text-zinc-200 break-all">
                          {bundle.trialId || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block">Config ID</span>
                        <span className="text-zinc-800 dark:text-zinc-200 break-all">
                          {bundle.configId || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block">Prompt Tokens</span>
                        <span className="text-zinc-800 dark:text-zinc-200">
                          {(bundle.usage?.promptTokens || 0).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block">Completion</span>
                        <span className="text-zinc-800 dark:text-zinc-200">
                          {(bundle.usage?.completionTokens || 0).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block">Cached</span>
                        <span className="text-zinc-800 dark:text-zinc-200">
                          {(bundle.usage?.cachedTokens || 0).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block">Duration</span>
                        <span className="text-zinc-800 dark:text-zinc-200">
                          {bundle.usage?.activeElapsedSec
                            ? `${bundle.usage.activeElapsedSec}s`
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                  {bundle.cliCommand && (
                    <TerminalSnippet title="Inspect Trial Locally" command={bundle.cliCommand} />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: JUDGE & VERIFIER METRICS ==================== */}
      {activeTab === "judge" && (
        <div className="space-y-5">
          {/* Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Primary Score</div>
              <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums mt-0.5">
                {scoreBadgeText || bundle.status}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Verification Status</div>
              <div className="text-sm font-semibold text-zinc-950 dark:text-white font-mono mt-1.5">
                {hw?.verifierJudge?.status || bundle.status}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Stop Reason</div>
              <div className="text-sm font-semibold text-zinc-950 dark:text-white font-mono mt-1.5">
                {bundle.stopReason || "completed"}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Judge / Evaluator</div>
              <div className="text-sm font-semibold text-zinc-950 dark:text-white font-mono mt-1.5 truncate">
                {hw?.verifierJudge?.model || "LexVerse Verifier"}
              </div>
            </div>
          </div>

          {/* Generic Verifier Evaluation Metrics */}
          {metricValues.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.03] p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-zinc-950 dark:text-white flex items-center gap-2">
                  <RiCheckDoubleLine className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Verifier Evaluation Metrics
                </span>
                {bundle.primaryMetric && (
                  <span className="text-base font-semibold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {bundle.primaryMetric.value}
                    {bundle.primaryMetric.unit === "%"
                      ? "%"
                      : ` / ${bundle.primaryMetric.max ?? 100}`}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {metricValues.map((m) => {
                  const max = m.max;
                  const pct = max ? Math.min(100, Math.round((m.value / max) * 100)) : null;
                  return (
                    <div
                      key={m.key}
                      className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                          {m.label}
                        </span>
                        <span className="font-mono font-semibold text-zinc-950 dark:text-white">
                          {m.value}
                          {m.unit === "%"
                            ? "%"
                            : m.unit === "pts" && max
                            ? ` / ${max}`
                            : m.unit === "flag"
                            ? m.value >= 1
                              ? " (Valid)"
                              : " (Invalid)"
                            : ""}
                        </span>
                      </div>
                      {pct !== null && (
                        <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Deterministic Verifier Checks (checks.json) */}
          {hw?.verifierChecks && (
            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div>
                <div className="text-[11px] font-mono text-zinc-400">verifier/checks.json</div>
                <h3 className="text-sm font-semibold text-zinc-950 dark:text-white mt-0.5">
                  Deterministic Artifact Checks
                </h3>
                {hw.verifierChecks.scope && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {hw.verifierChecks.scope}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {Object.entries(hw.verifierChecks.checks || {}).map(([name, ok]) => (
                  <div
                    key={name}
                    className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 px-3.5 py-2.5 flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate pr-2">
                      {name}
                    </span>
                    {ok ? (
                      <span className="inline-flex items-center gap-1 font-mono text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                        <RiShieldCheckFill className="w-4 h-4" />
                        true
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-mono text-amber-600 font-semibold shrink-0">
                        <RiCloseCircleLine className="w-4 h-4" />
                        false
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Harbor Verifier Judge Assessment (judge.json) */}
          {hw?.verifierJudge && (
            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 sm:p-6 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <div>
                  <div className="text-[11px] font-mono text-zinc-400">
                    verifier/judge.json · Rubric {hw.verifierJudge.rubric_version || "v1"} · Judge{" "}
                    {hw.verifierJudge.model || "gpt-6-luna"}
                  </div>
                  <h3 className="text-base font-semibold text-zinc-950 dark:text-white mt-0.5">
                    Harbor Verifier Judge Assessment
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRawJudgeJson((v) => !v)}
                  className="px-3 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 text-xs font-mono hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer"
                >
                  {showRawJudgeJson ? "Structured View" : "Raw JSON"}
                </button>
              </div>

              {showRawJudgeJson ? (
                <pre className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 text-[11px] font-mono overflow-x-auto max-h-[540px]">
                  {JSON.stringify(hw.verifierJudge, null, 2)}
                </pre>
              ) : (
                <div className="space-y-4">
                  {hw.verifierJudge.assessment?.summary && (
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                      <div className="font-semibold text-emerald-700 dark:text-emerald-300 mb-1">
                        Judge Overall Summary
                      </div>
                      {hw.verifierJudge.assessment.summary}
                    </div>
                  )}

                  {hw.verifierJudge.assessment?.dimensions && (
                    <div className="space-y-2.5">
                      <div className="text-[11px] font-mono uppercase text-zinc-400">
                        Dimension-by-Dimension Grading Rationale
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(hw.verifierJudge.assessment.dimensions).map(
                          ([dimKey, dimVal]) => {
                            const meta = RUBRIC_DIM_LABELS[dimKey] || { label: dimKey, max: 100 };
                            const maxScore = dimVal.max ?? meta.max;
                            const pct = Math.min(100, Math.round((dimVal.score / maxScore) * 100));
                            return (
                              <div
                                key={dimKey}
                                className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 p-3.5 space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="font-semibold text-zinc-950 dark:text-white">
                                    {meta.label}
                                  </span>
                                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                    {dimVal.score} / {maxScore}
                                  </span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-emerald-500"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                  {dimVal.reason}
                                </p>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  )}

                  {hw.verifierJudge.assessment?.serious_errors && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {Object.entries(hw.verifierJudge.assessment.serious_errors).map(
                        ([errKey, errVal]) => (
                          <div
                            key={errKey}
                            className={cn(
                              "rounded-xl border p-3.5 text-xs space-y-1",
                              errVal.present
                                ? "border-amber-500/40 bg-amber-500/[0.06]"
                                : "border-emerald-500/25 bg-emerald-500/[0.03]"
                            )}
                          >
                            <div className="flex items-center justify-between font-mono font-semibold">
                              <span>{errKey}</span>
                              <span
                                className={
                                  errVal.present
                                    ? "text-amber-700 dark:text-amber-300"
                                    : "text-emerald-700 dark:text-emerald-300"
                                }
                              >
                                {errVal.present ? "PRESENT" : "PASS (Clean)"}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                              {errVal.reason}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Final Response vs Official Reference */}
          <div
            className={cn(
              "grid gap-4",
              bundle.reference ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
            )}
          >
            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="text-[11px] font-mono uppercase text-zinc-400">
                Agent Final Response
              </div>
              <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 p-3.5 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-[380px] overflow-y-auto">
                {bundle.answer || "(Deliverable artifact generated in /work/ — inspect in Workspace tab)"}
              </div>
            </div>

            {bundle.reference && (
              <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="text-[11px] font-mono uppercase text-zinc-400">
                  Official Reference Answer
                </div>
                <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 p-3.5 text-xs font-mono text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap max-h-[380px] overflow-y-auto">
                  {bundle.reference}
                </div>
              </div>
            )}
          </div>

          {hw?.verifierReward && (
            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-2">
              <div className="text-[11px] font-mono text-zinc-400">verifier/reward.json</div>
              <pre className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3.5 text-xs font-mono overflow-x-auto">
                {JSON.stringify(hw.verifierReward, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: AGENT EXECUTION WORKSPACE ==================== */}
      {activeTab === "workspace" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: Agent's Sandbox Tree */}
          <div className="lg:col-span-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
              <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
                Agent Execution Workspace
              </div>
              <div className="text-xs font-mono font-semibold text-zinc-950 dark:text-white mt-0.5 truncate">
                {bundle.agent} · {ARM_SHORT[bundle.arm] || bundle.armLabel}
              </div>
              <div className="text-[11px] font-mono text-zinc-400 truncate mt-0.5">
                {bundle.storageRoot}:/{bundle.storagePath}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-snug">
                Per-trial sandbox snapshot: deliverables written, mounted skills &amp; inputs accessed in this run.
              </p>
            </div>

            <div className="space-y-4 text-xs font-mono">
              {/* Group 1: /work/ (Agent-Created Deliverables, Scripts & Persisted Files) */}
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 px-2 flex items-center justify-between">
                  <span>/work/ (Agent Outputs &amp; Scripts)</span>
                  <span>{workFiles.length}</span>
                </div>

                {workFiles.map((wf) => {
                  const active = selectedWsNode === wf.id;
                  return (
                    <button
                      key={wf.id}
                      type="button"
                      onClick={() => setSelectedWsNode(wf.id)}
                      className={cn(
                        "w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 cursor-pointer transition",
                        active
                          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                        {wf.category === "artifact" ? (
                          <RiFileTextLine className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        ) : (
                          <RiFileCodeLine className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        )}
                        <span className="truncate">{wf.path}</span>
                      </span>
                      <span className="text-[10px] shrink-0 text-zinc-400">
                        {wf.category === "artifact"
                          ? formatBytes(wf.sizeBytes)
                          : wf.stepId
                          ? `#${wf.stepId}`
                          : formatBytes(wf.sizeBytes)}
                      </span>
                    </button>
                  );
                })}

                {workFiles.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedWsNode("virtual:answer")}
                    className={cn(
                      "w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 cursor-pointer",
                      selectedWsNode === "virtual:answer"
                        ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <RiFileTextLine className="w-3.5 h-3.5 shrink-0" />
                      <span>/work/response.txt</span>
                    </span>
                    <span className="text-[10px] text-zinc-400">output</span>
                  </button>
                )}
              </div>

              {/* Group 2: /skills/ */}
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 px-2">
                  /skills/ (Sandbox Mount)
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedWsNode("agent_fs:skills")}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between cursor-pointer",
                    selectedWsNode === "agent_fs:skills"
                      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                  )}
                >
                  <span>skills/</span>
                  <span className="text-[10px] text-zinc-400">
                    {mountedSkills.length} mounted
                    {invokedSkills.length > 0 ? ` · ${invokedSkills.length} used` : ""}
                  </span>
                </button>
              </div>

              {/* Group 3: /inputs/ (Files Read by Agent During Run) */}
              {accessedInputs.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-400 px-2">
                    /inputs/ (Accessed in Run)
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedWsNode("agent_fs:inputs")}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between cursor-pointer",
                      selectedWsNode === "agent_fs:inputs"
                        ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                    )}
                  >
                    <span>read_file history</span>
                    <span className="text-[10px] text-zinc-400">
                      {accessedInputs.length} files
                    </span>
                  </button>
                </div>
              )}

              {/* Group 4: runtime/ */}
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 px-2">
                  runtime/ &amp; trial_root/
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedWsNode("runtime:knowledge")}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between cursor-pointer",
                    selectedWsNode === "runtime:knowledge"
                      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                  )}
                >
                  <span>knowledge_indexes.json</span>
                  <span className="text-[10px] text-zinc-400">
                    {hw?.knowledgeIndexes?.length || 0} stores
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedWsNode("runtime:result")}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between cursor-pointer",
                    selectedWsNode === "runtime:result"
                      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                  )}
                >
                  <span>result.json</span>
                  <span className="text-[10px] text-zinc-400">manifest</span>
                </button>
                {(hw?.artifactsManifest?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedWsNode("runtime:artifacts")}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between cursor-pointer",
                      selectedWsNode === "runtime:artifacts"
                        ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                    )}
                  >
                    <span>artifacts.json</span>
                    <span className="text-[10px] text-zinc-400">
                      {hw?.artifactsManifest.length}
                    </span>
                  </button>
                )}
                {(hw?.lifecycleEvents?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedWsNode("runtime:lifecycle")}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between cursor-pointer",
                      selectedWsNode === "runtime:lifecycle"
                        ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                    )}
                  >
                    <span>lifecycle.jsonl</span>
                    <span className="text-[10px] text-zinc-400">
                      {hw?.lifecycleEvents.length} events
                    </span>
                  </button>
                )}
              </div>

              {mode === "serve" && trajDownloadFile && (
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                  <a
                    href={artifactDownloadUrl(trajDownloadFile.storageRoot, trajDownloadFile.relPath)}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 px-3 py-2 text-[11px] font-medium text-zinc-700 dark:text-zinc-200"
                  >
                    <RiDownload2Line className="w-3.5 h-3.5" />
                    Download Raw trajectory.json ({formatBytes(trajDownloadFile.sizeBytes)})
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Right: Agent Workspace File Viewer */}
          <div className="lg:col-span-8 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            {selectedWorkFile ? (
              <div>
                <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold",
                          selectedWorkFile.category === "artifact"
                            ? "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300"
                            : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                        )}
                      >
                        {selectedWorkFile.category === "artifact"
                          ? "Collected Deliverable"
                          : selectedWorkFile.category === "persisted"
                          ? "Persisted Workspace File"
                          : `Written in Step #${selectedWorkFile.stepId ?? "?"} via ${
                              selectedWorkFile.toolName || "tool"
                            }`}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400">
                        {formatBytes(selectedWorkFile.sizeBytes)}
                      </span>
                    </div>
                    <div className="text-xs font-mono font-semibold text-zinc-950 dark:text-white mt-1 truncate">
                      {selectedWorkFile.path}
                    </div>
                    {selectedWorkFile.sha256 && (
                      <div className="text-[10px] font-mono text-zinc-400 truncate mt-0.5">
                        sha256: {selectedWorkFile.sha256}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {selectedWorkFile.previewText && (
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedWorkFile.id, selectedWorkFile.previewText!)}
                        className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1 text-[11px] font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        {copiedFileId === selectedWorkFile.id ? (
                          <RiCheckLine className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <RiFileCopyLine className="w-3.5 h-3.5" />
                        )}
                        {copiedFileId === selectedWorkFile.id ? "Copied" : "Copy Text"}
                      </button>
                    )}
                    {mode === "serve" &&
                      selectedWorkFile.downloadable &&
                      selectedWorkFile.relPath &&
                      selectedWorkFile.storageRoot && (
                        <a
                          href={artifactDownloadUrl(
                            selectedWorkFile.storageRoot,
                            selectedWorkFile.relPath
                          )}
                          className="inline-flex items-center gap-1 rounded-full bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950 px-3 py-1 text-[11px] font-medium"
                        >
                          <RiDownload2Line className="w-3.5 h-3.5" />
                          Download
                        </a>
                      )}
                  </div>
                </div>

                <div className="p-5">
                  {(selectedWorkFile.format === "pdf" || selectedWorkFile.name.toLowerCase().endsWith(".pdf")) &&
                  ((mode === "serve" &&
                    selectedWorkFile.downloadable &&
                    selectedWorkFile.relPath &&
                    selectedWorkFile.storageRoot) ||
                    selectedWorkFile.previewText) ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-mono text-zinc-400">
                          PDF Artifact ({selectedWorkFile.name})
                        </span>
                        <div className="flex items-center gap-2">
                          {mode === "serve" &&
                            selectedWorkFile.downloadable &&
                            selectedWorkFile.relPath &&
                            selectedWorkFile.storageRoot &&
                            selectedWorkFile.previewText && (
                              <div className="inline-flex items-center rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-0.5 text-[11px] font-mono">
                                <button
                                  type="button"
                                  onClick={() => setTrialPdfViewMode("embed")}
                                  className={cn(
                                    "px-2.5 py-0.5 rounded-full cursor-pointer transition",
                                    trialPdfViewMode === "embed"
                                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-semibold"
                                      : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                                  )}
                                >
                                  PDF View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTrialPdfViewMode("text")}
                                  className={cn(
                                    "px-2.5 py-0.5 rounded-full cursor-pointer transition",
                                    trialPdfViewMode === "text"
                                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-semibold"
                                      : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                                  )}
                                >
                                  Extracted Text
                                </button>
                              </div>
                            )}
                          {mode === "serve" &&
                            selectedWorkFile.downloadable &&
                            selectedWorkFile.relPath &&
                            selectedWorkFile.storageRoot && (
                              <a
                                href={artifactDownloadUrl(
                                  selectedWorkFile.storageRoot,
                                  selectedWorkFile.relPath,
                                  true
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 hover:underline"
                              >
                                Open PDF ↗
                              </a>
                            )}
                        </div>
                      </div>

                      {mode === "serve" &&
                      selectedWorkFile.downloadable &&
                      selectedWorkFile.relPath &&
                      selectedWorkFile.storageRoot &&
                      trialPdfViewMode === "embed" ? (
                        <iframe
                          src={artifactDownloadUrl(
                            selectedWorkFile.storageRoot,
                            selectedWorkFile.relPath,
                            true
                          )}
                          title={selectedWorkFile.name}
                          className="w-full h-[560px] rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white"
                        />
                      ) : selectedWorkFile.previewText ? (
                        <pre className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-4 text-xs font-mono text-zinc-800 dark:text-zinc-200 overflow-x-auto max-h-[640px] leading-relaxed whitespace-pre-wrap">
                          {selectedWorkFile.previewText}
                        </pre>
                      ) : null}
                    </div>
                  ) : selectedWorkFile.previewText ? (
                    selectedWorkFile.format === "docx" ? (
                      <div className="space-y-3">
                        <div className="text-[11px] font-mono text-zinc-400">
                          Rendered inline from {selectedWorkFile.name} (word/document.xml)
                        </div>
                        <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 p-5 text-xs sm:text-[13px] text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap max-h-[640px] overflow-y-auto">
                          {selectedWorkFile.previewText}
                        </div>
                      </div>
                    ) : (
                      <pre className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-4 text-xs font-mono text-zinc-800 dark:text-zinc-200 overflow-x-auto max-h-[640px] leading-relaxed whitespace-pre-wrap">
                        {selectedWorkFile.previewText}
                      </pre>
                    )
                  ) : (
                    <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-8 text-center space-y-2">
                      <RiFileTextLine className="w-8 h-8 text-indigo-500 mx-auto" />
                      <div className="text-xs font-mono font-semibold text-zinc-950 dark:text-white">
                        {selectedWorkFile.path}
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Binary artifact ({formatBytes(selectedWorkFile.sizeBytes)}). Use Download in Serve mode to inspect locally.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : selectedWsNode === "virtual:answer" ? (
              <div className="p-5 space-y-3">
                <div className="text-[11px] font-mono text-zinc-400">/work/response.txt</div>
                <h3 className="text-base font-semibold text-zinc-950 dark:text-white">
                  Agent Final Text Deliverable
                </h3>
                <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-4 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-[600px] overflow-y-auto">
                  {bundle.answer || "(No standalone /work/ files or final text captured in this trial)"}
                </div>
              </div>
            ) : selectedWsNode === "agent_fs:skills" ? (
              <div className="p-5 sm:p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-mono text-zinc-400">
                      .internal/agent_fs/skills/
                    </div>
                    <h3 className="text-base font-semibold text-zinc-950 dark:text-white">
                      Mounted Legal &amp; Office Skills ({mountedSkills.length})
                    </h3>
                  </div>
                  <input
                    value={skillSearch}
                    onChange={(e) => setSkillSearch(e.target.value)}
                    placeholder="Filter skills…"
                    className="rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-1 text-xs"
                  />
                </div>

                {invokedSkills.length > 0 && (
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4 space-y-2">
                    <div className="text-[11px] font-mono uppercase text-emerald-700 dark:text-emerald-300 font-semibold">
                      Used During This Run ({invokedSkills.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {invokedSkills.map((sk) => (
                        <span
                          key={sk}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 text-[11px] font-mono font-semibold"
                        >
                          <RiSparkling2Line className="w-3 h-3" />
                          {sk}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {filteredSkills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {filteredSkills.map((sk) => {
                      const used = invokedSkillSet.has(sk);
                      return (
                        <span
                          key={sk}
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-mono",
                            used
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold"
                              : "border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300"
                          )}
                        >
                          <RiCpuLine className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          {sk}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-6 text-center text-xs text-zinc-400 font-mono">
                    0 skills mounted in this sandbox configuration (Base / Static arm).
                  </div>
                )}
              </div>
            ) : selectedWsNode === "agent_fs:inputs" ? (
              <div className="p-5 sm:p-6 space-y-4">
                <div>
                  <div className="text-[11px] font-mono text-zinc-400">
                    read_file / read accesses logged during trajectory
                  </div>
                  <h3 className="text-base font-semibold text-zinc-950 dark:text-white">
                    Sandbox Paths Accessed by Agent ({accessedInputs.length})
                  </h3>
                </div>
                <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/70 text-xs font-mono">
                  {accessedInputs.map((inp) => (
                    <div
                      key={`${inp.stepId}:${inp.path}`}
                      className="p-3 flex items-center justify-between gap-3"
                    >
                      <span className="text-zinc-800 dark:text-zinc-200 truncate">{inp.path}</span>
                      <span className="text-[11px] text-zinc-400 shrink-0">
                        Step #{inp.stepId} · {inp.toolName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : selectedWsNode === "runtime:knowledge" ? (
              <div className="p-5 sm:p-6 space-y-4">
                <div>
                  <div className="text-[11px] font-mono text-zinc-400">
                    .internal/knowledge_indexes.json
                  </div>
                  <h3 className="text-base font-semibold text-zinc-950 dark:text-white">
                    Mounted Retrieval Indexes ({hw?.knowledgeIndexes?.length || 0})
                  </h3>
                </div>
                {(hw?.knowledgeIndexes || []).length > 0 ? (
                  <div className="space-y-2">
                    {hw!.knowledgeIndexes.map((ki, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 p-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono"
                      >
                        <div className="flex items-center gap-2">
                          <RiDatabase2Line className="w-4 h-4 text-emerald-600" />
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {ki.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          {ki.mode} · {ki.embeddingModel} · top_k={ki.topK}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-6 text-center text-xs text-zinc-400 font-mono">
                    No local knowledge index metadata recorded inside this trial sandbox.
                  </div>
                )}
              </div>
            ) : selectedWsNode === "runtime:artifacts" ? (
              <div className="p-5 sm:p-6 space-y-3">
                <div className="text-[11px] font-mono text-zinc-400">.internal/artifacts.json</div>
                <h3 className="text-base font-semibold text-zinc-950 dark:text-white">
                  Artifact Collection Manifest
                </h3>
                <pre className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 text-[11px] font-mono overflow-x-auto max-h-[540px]">
                  {JSON.stringify(hw?.artifactsManifest || [], null, 2)}
                </pre>
              </div>
            ) : selectedWsNode === "runtime:lifecycle" ? (
              <div className="p-5 sm:p-6 space-y-3">
                <div className="text-[11px] font-mono text-zinc-400">.internal/lifecycle.jsonl</div>
                <h3 className="text-base font-semibold text-zinc-950 dark:text-white">
                  Worker Lifecycle Events
                </h3>
                <pre className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 text-[11px] font-mono overflow-x-auto max-h-[540px]">
                  {JSON.stringify(hw?.lifecycleEvents || [], null, 2)}
                </pre>
              </div>
            ) : (
              <div className="p-5 sm:p-6 space-y-3">
                <div className="text-[11px] font-mono text-zinc-400">result.json</div>
                <h3 className="text-base font-semibold text-zinc-950 dark:text-white">
                  Trial Execution Result Manifest
                </h3>
                <pre className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 text-[11px] font-mono overflow-x-auto max-h-[540px]">
                  {JSON.stringify(bundle.rawResult || {}, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
