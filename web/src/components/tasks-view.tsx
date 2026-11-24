"use client";

import React, { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  RiSearchLine,
  RiExternalLinkLine,
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiPlayCircleLine,
  RiShieldCheckLine,
  RiTerminalBoxLine,
  RiFileCodeLine,
  RiFileCopyLine,
  RiCheckLine,
} from "@remixicon/react";
import {
  BENCHMARK_TASK_NAMES,
  BENCHMARKS,
  RuntimeMode,
} from "@/lib/lexverse-data";
import { SlidingPill, cn, getBenchmarkTone, TerminalSnippet } from "./magic-ui";
import { ComposerPreset } from "./experiment-composer";
import type { JobsNavTarget } from "./jobs-explorer";

const RUBRIC_TITLES: Record<string, string> = {
  facts_amounts: "Facts & Amounts",
  legal_analysis: "Legal Analysis",
  complaint: "Complaint Draft",
  material_grounding: "Material Grounding",
  usability: "DOCX Usability",
};

function JobConfigPanel({
  tpl,
  copied,
  mode,
  onCopy,
  onLoadComposer,
}: {
  tpl: { name: string; file: string; yaml: string };
  copied: boolean;
  mode: RuntimeMode;
  onCopy: () => void;
  onLoadComposer: () => void;
}) {
  return (
    <div className="mt-2.5 min-w-0 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 p-3 space-y-2 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
        <span className="text-zinc-500 dark:text-zinc-400 truncate">{tpl.file}</span>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onCopy}
            className="lv-btn-secondary inline-flex items-center gap-1 rounded-md px-2 py-0.5 cursor-pointer"
          >
            {copied ? <RiCheckLine className="w-3 h-3 text-emerald-600" /> : <RiFileCopyLine className="w-3 h-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            onClick={onLoadComposer}
            className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer whitespace-nowrap"
          >
            {mode === "serve" ? "Load Runner →" : "CLI Builder →"}
          </button>
        </div>
      </div>
      <pre className="w-full text-[11px] font-mono text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-950 p-2.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800 max-h-60 overflow-auto leading-relaxed">
        {tpl.yaml}
      </pre>
    </div>
  );
}

export function TasksView({
  snapshot,
  mode,
  onOpenComposer,
  onOpenJobsTarget,
  onOpenExampleShowcase,
}: {
  snapshot: any;
  mode: RuntimeMode;
  onOpenComposer: (preset?: ComposerPreset) => void;
  onOpenJobsTarget: (target: JobsNavTarget) => void;
  onOpenExampleShowcase: () => void;
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "benchmarks" | "user">("all");
  const [expandedPanel, setExpandedPanel] = useState<Record<string, "none" | "tasks" | "config">>({});
  const [exampleConfigOpen, setExampleConfigOpen] = useState(false);
  const [copiedConfigKey, setCopiedConfigKey] = useState<string | null>(null);

  const catalogByBench: Record<string, any> = useMemo(() => {
    const map: Record<string, any> = {};
    for (const item of snapshot?.benchmarkCatalog || []) {
      map[item.id] = item;
    }
    return map;
  }, [snapshot]);

  const templatesByName: Record<string, { name: string; file: string; yaml: string }> = useMemo(() => {
    const map: Record<string, { name: string; file: string; yaml: string }> = {};
    for (const tpl of snapshot?.jobTemplates || []) {
      if (tpl?.name) map[tpl.name] = tpl;
    }
    return map;
  }, [snapshot]);

  const userWorkspaceTasks: any[] = snapshot?.userWorkspaceTasks || [];

  const filteredBenchmarks = useMemo(() => {
    if (categoryFilter === "user") return [];
    return BENCHMARKS.filter((b) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const cat = catalogByBench[b.id];
      const taskIds = (cat?.tasks || []).map((t: any) => t.id).join(" ");
      return (
        b.name.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
        b.coverage.toLowerCase().includes(q) ||
        taskIds.toLowerCase().includes(q)
      );
    });
  }, [categoryFilter, query, catalogByBench]);

  const filteredUserTasks = useMemo(() => {
    if (categoryFilter === "benchmarks") return [];
    if (!query.trim()) return userWorkspaceTasks;
    const q = query.toLowerCase();
    return userWorkspaceTasks.filter(
      (u) =>
        u.groupName.toLowerCase().includes(q) ||
        u.title.toLowerCase().includes(q) ||
        u.path.toLowerCase().includes(q)
    );
  }, [categoryFilter, query, userWorkspaceTasks]);

  const togglePanel = (id: string, panel: "tasks" | "config") => {
    setExpandedPanel((prev) => ({ ...prev, [id]: prev[id] === panel ? "none" : panel }));
  };

  const copyJobYaml = (key: string, yaml: string) => {
    navigator.clipboard?.writeText(yaml);
    setCopiedConfigKey(key);
    setTimeout(() => setCopiedConfigKey((cur) => (cur === key ? null : cur)), 1600);
  };

  const totalBenchmarkTaskTypes = useMemo(() => {
    return Object.values(catalogByBench).reduce(
      (acc: number, c: any) => acc + (c?.taskCount || 0),
      0
    );
  }, [catalogByBench]);

  return (
    <div className="space-y-8">
      {/* Header & Search */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">
              SUPPORTED TASKS
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white mt-0.5">
              All Benchmark Suites &amp; User Workspace Tasks
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {BENCHMARKS.length} integrated benchmarks ({totalBenchmarkTaskTypes || 70} task types across 26,331+ items) and the{" "}
              <code className="font-mono">user_workspace/tasks/example</code> Docker package.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onOpenComposer()}
            className="lv-btn-primary inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium cursor-pointer"
          >
            <RiPlayCircleLine className="w-4 h-4" />
            <span>{mode === "serve" ? "Configure & Run Task" : "CLI Config Builder"}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <RiSearchLine className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search benchmarks, task IDs (1-1, case_analysis, LC), or example..."
              className="w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 p-1 text-xs font-medium">
              {[
                { id: "all", label: "All Tasks" },
                { id: "benchmarks", label: "Benchmarks (9)" },
                { id: "user", label: "User Tasks" },
              ].map((c) => {
                const active = categoryFilter === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryFilter(c.id as any)}
                    className={cn(
                      "relative px-3 py-1 rounded-full transition cursor-pointer",
                      active
                        ? "text-zinc-950 dark:text-white font-semibold"
                        : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                    )}
                  >
                    {active && <SlidingPill layoutId="tasks-category-filter" />}
                    <span className="relative z-10">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Section A: 9 Standardized Legal Benchmarks */}
      {filteredBenchmarks.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
              Standardized Benchmark Suites ({filteredBenchmarks.length})
            </h2>
            <span className="text-[11px] font-mono text-zinc-400">
              Parsed directly from lexverse/benchmarks/*/catalog.yaml &amp; configs/jobs/*.yaml
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredBenchmarks.map((b) => {
              const cat = catalogByBench[b.id];
              const tasksList: any[] = cat?.tasks || [];
              const tpl = templatesByName[b.id];
              const panel = expandedPanel[b.id] || "none";
              const tasksExpanded = panel === "tasks";
              const configExpanded = panel === "config";
              const hasJobsView = b.id !== "lecardv2";
              const defaultAgent = b.executionModes.includes("Vanilla")
                ? "vanilla"
                : b.executionModes[0].toLowerCase();
              const tone = getBenchmarkTone(b.id);
              const scalePct = Math.max(
                14,
                Math.min(100, Math.round((Math.log10(b.samples + 1) / Math.log10(15000)) * 100))
              );

              return (
                <div
                  key={b.id}
                  className="relative min-w-0 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 flex flex-col justify-between gap-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden transition-all duration-200 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-[0_8px_20px_-10px_rgba(15,23,42,0.12)]"
                >
                  <div className="space-y-3 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-zinc-950 dark:text-white">
                            {b.name}
                          </h3>
                          <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded-full font-medium", tone.badge)}>
                            {b.category}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                          {b.coverage}
                        </p>
                      </div>

                      <a
                        href={b.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${b.name} upstream repository`}
                        className="p-1.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition"
                      >
                        <RiExternalLinkLine className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                      <span className={cn("inline-flex items-center gap-2 px-2 py-0.5 rounded-md font-medium tabular-nums", tone.badge)}>
                        <span>{b.samples.toLocaleString()} samples</span>
                        <span
                          aria-hidden="true"
                          className="w-8 h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden inline-block"
                        >
                          <span
                            className={cn("block h-full rounded-full", tone.bar)}
                            style={{ width: `${scalePct}%` }}
                          />
                        </span>
                      </span>
                      <span className="px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 tabular-nums">
                        {tasksList.length} task types
                      </span>
                      {b.executionModes.map((m) => (
                        <span
                          key={m}
                          className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400"
                        >
                          {m}
                        </span>
                      ))}
                    </div>

                    {/* Expandable Task Types (catalog.yaml) & Job Config (configs/jobs/*.yaml) */}
                    {(tasksList.length > 0 || tpl) && (
                      <div className="pt-1">
                        <div className="flex flex-wrap items-center gap-4">
                          {tasksList.length > 0 && (
                            <button
                              type="button"
                              onClick={() => togglePanel(b.id, "tasks")}
                              className={cn(
                                "inline-flex items-center gap-1 text-xs font-medium cursor-pointer transition",
                                tasksExpanded
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-zinc-700 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-400"
                              )}
                            >
                              <span>
                                {tasksExpanded
                                  ? `Hide ${tasksList.length} Task Types`
                                  : `Show ${tasksList.length} Task Types`}
                              </span>
                              {tasksExpanded ? (
                                <RiArrowUpSLine className="w-4 h-4" />
                              ) : (
                                <RiArrowDownSLine className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          {tpl && (
                            <button
                              type="button"
                              onClick={() => togglePanel(b.id, "config")}
                              className={cn(
                                "inline-flex items-center gap-1 text-xs font-medium cursor-pointer transition",
                                configExpanded
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                              )}
                            >
                              <RiFileCodeLine className="w-3.5 h-3.5" />
                              <span>Job Config ({b.id}.yaml)</span>
                              {configExpanded ? (
                                <RiArrowUpSLine className="w-4 h-4" />
                              ) : (
                                <RiArrowDownSLine className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>

                        {tasksExpanded && tasksList.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.18 }}
                            className="mt-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 p-3 max-h-56 overflow-y-auto space-y-1.5"
                          >
                            {tasksList.map((t: any) => {
                              const readable = BENCHMARK_TASK_NAMES[b.id]?.[t.id];
                              return (
                                <div
                                  key={t.id}
                                  className="flex flex-wrap items-center justify-between gap-2 text-[11px] py-1 border-b last:border-b-0 border-zinc-200/50 dark:border-zinc-800/60"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <code className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                                      {t.id}
                                    </code>
                                    {readable && (
                                      <span className="text-zinc-500 dark:text-zinc-400 truncate">
                                        {readable}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 font-mono text-[10px] shrink-0">
                                    <span className="px-1.5 py-0.5 rounded bg-white dark:bg-zinc-950 border border-zinc-200/70 dark:border-zinc-800 text-zinc-500">
                                      {t.outputType}
                                    </span>
                                    <span className="text-zinc-400 truncate max-w-[160px]">
                                      {t.metrics.slice(0, 3).join(", ")}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </motion.div>
                        )}

                        {configExpanded && tpl && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.18 }}
                          >
                            <JobConfigPanel
                              tpl={tpl}
                              copied={copiedConfigKey === b.id}
                              mode={mode}
                              onCopy={() => copyJobYaml(b.id, tpl.yaml)}
                              onLoadComposer={() =>
                                onOpenComposer({
                                  targetType: "benchmark",
                                  targetName: b.id,
                                  agent: defaultAgent,
                                })
                              }
                            />
                          </motion.div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[11px] font-mono text-zinc-400">
                      Metric: {b.metricName}
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      {hasJobsView && (
                        <button
                          type="button"
                          onClick={() => onOpenJobsTarget({ taskName: b.id })}
                          className="group/btn lv-btn-tertiary inline-flex items-center gap-1 px-3 py-1 rounded-full font-medium cursor-pointer"
                        >
                          <span>View Jobs &amp; Results</span>
                          <span className="inline-block transition-transform duration-150 group-hover/btn:translate-x-0.5">
                            →
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          onOpenComposer({
                            targetType: "benchmark",
                            targetName: b.id,
                            agent: b.executionModes.includes("Vanilla")
                              ? "vanilla"
                              : b.executionModes[0].toLowerCase(),
                          })
                        }
                        className="lv-btn-secondary px-3 py-1 rounded-full font-medium cursor-pointer"
                      >
                        {mode === "serve" ? "Run Benchmark" : "CLI Config"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section B: User Workspace Task (`example` only) */}
      {(categoryFilter === "all" || categoryFilter === "user") && filteredUserTasks.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
              User Workspace Task (<code className="font-mono">user_workspace/tasks/example</code>)
            </h2>
            <span className="text-[11px] font-mono text-zinc-400">
              Isolated Docker sandbox + DOCX/rubric verifier
            </span>
          </div>

          {filteredUserTasks.map((ex) => (
            <div
              key={ex.groupName}
              className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-gradient-to-br from-emerald-500/[0.035] via-white to-indigo-500/[0.03] dark:from-emerald-500/[0.06] dark:via-zinc-950 dark:to-indigo-500/[0.05] p-6 space-y-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <RiShieldCheckLine className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="text-base font-semibold text-zinc-950 dark:text-white">
                      example · {ex.title}
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Evaluated across{" "}
                    <code className="font-mono">gpt6_luna_full_capabilities</code> ({ex.fullCount} agents) and{" "}
                    <code className="font-mono">gpt6_luna_agent_tests</code> ({ex.baseCount} agents) producing{" "}
                    <code className="font-mono">{ex.artifactSource}</code>.
                  </p>
                </div>

                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-500/20 tabular-nums">
                  {ex.fullCount + ex.baseCount} Completed Traces
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-6 space-y-2.5">
                  <div className="text-[11px] font-mono uppercase text-zinc-400">
                    Input Dossier (<code className="font-mono">environment/inputs/</code>)
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
                    {(ex.inputFiles || []).map((f: string) => (
                      <span
                        key={f}
                        className="px-2.5 py-1 rounded-md bg-white/90 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed bg-white/80 dark:bg-zinc-900/60 p-3 rounded-xl border border-zinc-200/70 dark:border-zinc-800">
                    {ex.instructionPreview}
                  </p>
                </div>

                <div className="lg:col-span-6 space-y-2.5">
                  <div className="text-[11px] font-mono uppercase text-zinc-400">
                    Verifier Rubric (100 Points Total)
                  </div>
                  <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white/85 dark:bg-zinc-950/80 divide-y divide-zinc-100 dark:divide-zinc-800/70 text-xs overflow-hidden">
                    {(ex.rubricDimensions || []).map((dim: any) => {
                      const pct = Math.min(100, Math.max(5, Number(dim.maxScore) || 0));
                      return (
                        <div key={dim.id} className="p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">
                              {RUBRIC_TITLES[dim.id] || dim.id}
                            </span>
                            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                              {dim.maxScore} pts
                            </span>
                          </div>
                          <div className="h-1 w-full rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenJobsTarget({ taskName: "example" })}
                    className="px-3.5 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium cursor-pointer transition whitespace-nowrap"
                  >
                    View Example Jobs ({ex.fullCount + ex.baseCount}) →
                  </button>
                  <button
                    type="button"
                    onClick={onOpenExampleShowcase}
                    className="lv-btn-secondary px-3.5 py-1.5 rounded-full font-medium cursor-pointer"
                  >
                    Inspect Task Package →
                  </button>
                  {templatesByName[ex.groupName] && (
                    <button
                      type="button"
                      onClick={() => setExampleConfigOpen((v) => !v)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-medium transition cursor-pointer whitespace-nowrap",
                        exampleConfigOpen
                          ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "lv-btn-secondary"
                      )}
                    >
                      <RiFileCodeLine className="w-3.5 h-3.5" />
                      <span>Job Config (example.yaml)</span>
                      {exampleConfigOpen ? (
                        <RiArrowUpSLine className="w-4 h-4" />
                      ) : (
                        <RiArrowDownSLine className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onOpenComposer({
                      targetType: "user",
                      targetName: "user_workspace/tasks/example",
                      agent: "vanilla",
                      enableLaws: true,
                    })
                  }
                  className="lv-btn-primary px-4 py-1.5 rounded-full font-medium cursor-pointer"
                >
                  {mode === "serve" ? "Run Example Task →" : "CLI Config →"}
                </button>
              </div>

              {exampleConfigOpen && templatesByName[ex.groupName] && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <JobConfigPanel
                    tpl={templatesByName[ex.groupName]}
                    copied={copiedConfigKey === ex.groupName}
                    mode={mode}
                    onCopy={() =>
                      copyJobYaml(ex.groupName, templatesByName[ex.groupName].yaml)
                    }
                    onLoadComposer={() =>
                      onOpenComposer({
                        targetType: "user",
                        targetName: "user_workspace/tasks/example",
                        agent: "vanilla",
                        enableLaws: true,
                      })
                    }
                  />
                </motion.div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Section C: Authoring Custom Tasks */}
      <section className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="lg:col-span-5 space-y-2.5">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            <RiTerminalBoxLine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>CUSTOM TASK PACKAGING</span>
          </div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
            Package Your Own Legal Task (<code className="font-mono">task.toml</code>)
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Mount custom case dossiers (<code className="font-mono">.docx</code>,{" "}
            <code className="font-mono">.xlsx</code>, <code className="font-mono">.json</code>) into offline Docker sandboxes with separate verifier containers.
          </p>
          <TerminalSnippet
            title="Scaffold a New Task Package"
            command="lexverse task init user_workspace/tasks/contract-review"
          />
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 overflow-hidden shadow-xs">
            <div className="px-4 py-2 border-b border-zinc-800/90 flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
                contract-review/ · Harbor Spec
              </span>
              <span>Offline Sandbox</span>
            </div>
            <pre className="p-4 text-[11px] font-mono leading-relaxed overflow-x-auto text-zinc-200">
{`user_workspace/tasks/contract-review/
├── task.toml        # Artifacts, network policy & verifier spec
├── instruction.md   # Legal prompt & required deliverable schema
├── environment/
│   ├── Dockerfile   # Offline sandbox (allow_internet = false)
│   └── inputs/      # Case materials mounted at /inputs/
└── tests/
    ├── Dockerfile   # Isolated judge container
    └── grade.py     # Deterministic + Rubric evaluation`}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}
