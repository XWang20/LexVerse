"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  Cell,
} from "recharts";
import {
  RiPulseLine,
  RiPieChart2Line,
  RiBarChartGroupedLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils";
import type { ResultsSummaryData } from "@/lib/storage-types";

/**
 * Capability Ablation Gain Card computed directly from stored ResultsSummaryData
 */
export function MebiusAblationCard({
  resultsSummary,
}: {
  resultsSummary?: ResultsSummaryData | null;
}) {
  const groups = resultsSummary?.modeComparisons || [];
  const [selectedId, setSelectedId] = useState<string>("plawbench-weighted");

  useEffect(() => {
    if (groups.length && !groups.some((g) => g.id === selectedId)) {
      setSelectedId(groups[0].id);
    }
  }, [groups, selectedId]);

  const activeGroup = useMemo(() => {
    return groups.find((g) => g.id === selectedId) || groups[0] || null;
  }, [groups, selectedId]);

  const activeBars = useMemo(() => {
    if (!activeGroup) return [];
    return activeGroup.arms.map((a, idx) => ({
      label:
        a.arm === "static"
          ? "Static"
          : a.arm === "vanilla"
          ? "Vanilla"
          : a.arm === "vanilla_cap"
          ? "V + Cap"
          : a.arm === "base"
          ? "Base"
          : "Full Cap",
      v: a.value,
      tier:
        idx === activeGroup.arms.length - 1
          ? "emerald"
          : idx > 0
          ? "indigo"
          : "muted",
    }));
  }, [activeGroup]);

  const topArm = activeGroup?.arms[activeGroup.arms.length - 1];
  const topDelta = topArm?.delta;

  return (
    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-6 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 grid place-items-center">
              <RiPieChart2Line className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Mode &amp; Capability Comparison
            </span>
          </div>
          <span className="text-[11px] font-mono text-zinc-400">From Storage</span>
        </div>

        {activeGroup ? (
          <>
            <div className="flex items-baseline gap-2.5 mt-3">
              <span className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white tabular-nums">
                {topArm?.value.toFixed(2)}
                {activeGroup.unit === "%" ? "%" : ""}
              </span>
              {topDelta !== null && topDelta !== undefined && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/12 text-emerald-700 dark:text-emerald-400">
                  {topDelta >= 0 ? `↗ +${topDelta}` : `↘ ${topDelta}`}
                  {activeGroup.unit === "%" ? "%" : " pts"}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {activeGroup.subtitle}
            </p>
          </>
        ) : (
          <div className="py-6 text-xs font-mono text-zinc-400">
            Scanning stored run reports…
          </div>
        )}

        {groups.length > 0 && (
          <div className="flex flex-wrap gap-1 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 p-1 mt-4 text-[11px] font-medium">
            {groups.slice(0, 4).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedId(g.id)}
                className={cn(
                  "flex-1 py-1.5 px-2 rounded-xl transition cursor-pointer whitespace-nowrap",
                  activeGroup?.id === g.id
                    ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-2xs font-semibold"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                )}
              >
                {g.id === "plawbench-weighted"
                  ? "PLawBench"
                  : g.id === "plawbench-macro"
                  ? "PLaw Macro"
                  : g.id === "lawbench-macro"
                  ? "LawBench"
                  : "Example"}
              </button>
            ))}
          </div>
        )}

        {activeGroup && (
          <div className="space-y-2.5 mt-4">
            {activeGroup.arms.map((arm, idx) => (
              <div key={arm.arm} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 truncate">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      idx === activeGroup.arms.length - 1
                        ? "bg-emerald-500"
                        : idx > 0
                        ? "bg-indigo-500"
                        : "bg-zinc-400"
                    )}
                  />
                  <span className="truncate">{arm.armLabel}</span>
                </span>
                <div className="flex items-center gap-3 tabular-nums shrink-0">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {arm.value.toFixed(2)}
                    {activeGroup.unit === "%" ? "%" : ""}
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium w-16 text-right">
                    {arm.delta === null
                      ? "Baseline"
                      : `${arm.delta >= 0 ? "+" : ""}${arm.delta}${activeGroup.unit === "%" ? "%" : ""}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-[145px] w-full mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
        {activeBars.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activeBars} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="mebiusIndigoPill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.85} />
                </linearGradient>
                <linearGradient id="mebiusEmeraldPill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis domain={[0, 100]} hide />
              <Bar dataKey="v" radius={[8, 8, 8, 8]} maxBarSize={32} isAnimationActive={false}>
                {activeBars.map((b, i) => (
                  <Cell
                    key={i}
                    fill={
                      b.tier === "emerald"
                        ? "url(#mebiusEmeraldPill)"
                        : b.tier === "indigo"
                        ? "url(#mebiusIndigoPill)"
                        : "var(--chart-bar-muted)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/**
 * LawBench Subtask Breakdown Area Card (dynamic per selected job)
 */
export function MebiusEfficiencyAreaCard({
  subtasks,
  title = "LawBench 20-Task Breakdown",
  metaLabel,
}: {
  subtasks: Array<{ task: string; score: number; abstention: number }>;
  title?: string;
  metaLabel?: string;
}) {
  const data = useMemo(() => {
    return (subtasks?.length ? subtasks : []).map((d) => ({
      task: d.task,
      score: d.score,
      abstention: d.abstention,
    }));
  }, [subtasks]);

  const summaryStats = useMemo(() => {
    const avgOf = (prefix: string) => {
      const items = data.filter((d) => d.task.startsWith(prefix));
      if (!items.length) return "—";
      return `${(items.reduce((a, b) => a + b.score, 0) / items.length).toFixed(2)}%`;
    };
    const peak = data.reduce(
      (best, cur) => (cur.score > best.score ? cur : best),
      { task: "—", score: 0 }
    );
    return {
      mem: avgOf("1-"),
      und: avgOf("2-"),
      app: avgOf("3-"),
      peakTask: peak.task,
      peakScore: data.length ? `${peak.score.toFixed(2)}%` : "—",
    };
  }, [data]);

  return (
    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-6 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 grid place-items-center">
              <RiPulseLine className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              {title}
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800 text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
            {metaLabel || `${data.length || 20} subtasks`}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
          <div>
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="w-2 h-1 rounded-full bg-zinc-400" />
              Memorization
            </span>
            <div className="text-sm font-semibold text-zinc-950 dark:text-white mt-1 tabular-nums">
              {summaryStats.mem}
            </div>
          </div>
          <div>
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="w-2 h-1 rounded-full bg-indigo-500" />
              Understanding
            </span>
            <div className="text-sm font-semibold text-zinc-950 dark:text-white mt-1 tabular-nums">
              {summaryStats.und}
            </div>
          </div>
          <div>
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="w-2 h-1 rounded-full bg-sky-500" />
              Application
            </span>
            <div className="text-sm font-semibold text-zinc-950 dark:text-white mt-1 tabular-nums">
              {summaryStats.app}
            </div>
          </div>
          <div>
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="w-2 h-1 rounded-full bg-emerald-500" />
              Peak ({summaryStats.peakTask})
            </span>
            <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
              {summaryStats.peakScore}
            </div>
          </div>
        </div>
      </div>

      <div className="h-[185px] w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 6, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="mebiusEmeraldArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="task"
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-xl bg-zinc-950 text-white px-3.5 py-2.5 shadow-xl border border-zinc-800 text-xs">
                    <div className="text-zinc-400 text-[10px]">LawBench Subtask {d.task}</div>
                    <div className="font-semibold text-emerald-400 mt-0.5">
                      {d.score}% Score · {d.abstention}% Abstention
                    </div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="score"
              name="Task Score (%)"
              stroke="#10b981"
              strokeWidth={2.2}
              fill="url(#mebiusEmeraldArea)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * PLawBench Per-Task & Sub-Metric Bar Chart for Jobs Inspector
 */
export function PLawBenchBreakdownChart({
  tasks,
}: {
  tasks: Array<{ task: string; metrics: Record<string, number> }>;
}) {
  const chartBars = useMemo(() => {
    const bars: Array<{ label: string; value: number; group: string; tier: string }> = [];
    for (const t of tasks) {
      if (t.task === "case_analysis") {
        bars.push(
          { label: "Case Acc", value: t.metrics.acc ?? 0, group: "Case Analysis", tier: "emerald" },
          { label: "Fact", value: t.metrics.fact_acc ?? 0, group: "Case Analysis", tier: "indigo" },
          { label: "Law", value: t.metrics.law_acc ?? 0, group: "Case Analysis", tier: "muted" },
          {
            label: "Reason",
            value: t.metrics.reasoning_acc ?? 0,
            group: "Case Analysis",
            tier: "muted",
          },
          {
            label: "Concl.",
            value: t.metrics.conclusion_acc ?? 0,
            group: "Case Analysis",
            tier: "muted",
          }
        );
      } else if (t.task === "legal_consultation") {
        bars.push({
          label: "Consult",
          value: t.metrics.acc ?? 0,
          group: "Legal Consultation",
          tier: "emerald",
        });
      } else if (t.task === "document_generation") {
        bars.push({
          label: "Drafting",
          value: t.metrics.acc ?? 0,
          group: "Document Generation",
          tier: "emerald",
        });
      }
    }
    return bars;
  }, [tasks]);

  if (!chartBars.length) return null;

  return (
    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 grid place-items-center">
            <RiBarChartGroupedLine className="w-3.5 h-3.5" />
          </span>
          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            PLawBench Rubric Breakdown (%)
          </span>
        </div>
        <span className="text-[11px] font-mono text-zinc-400">
          Analysis · Consultation · Drafting
        </span>
      </div>

      <div className="h-[190px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartBars} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(16, 185, 129, 0.05)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-xl bg-zinc-950 text-white px-3.5 py-2 shadow-xl border border-zinc-800 text-xs">
                    <div className="text-zinc-400 text-[10px]">{d.group}</div>
                    <div className="font-semibold mt-0.5">
                      {d.label}: <span className="text-emerald-400 font-mono">{d.value}%</span>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" radius={[6, 6, 3, 3]} maxBarSize={36} isAnimationActive={false}>
              {chartBars.map((b, i) => (
                <Cell
                  key={i}
                  fill={
                    b.tier === "emerald"
                      ? "#10b981"
                      : b.tier === "indigo"
                      ? "#6366f1"
                      : "var(--chart-bar-muted)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function StepTokenTimelineChart({ steps }: { steps: any[] }) {
  const chartData = steps
    .map((s) => ({
      step: `S${s.step_id}`,
      prompt: s.metrics?.prompt_tokens || 0,
      completion: s.metrics?.completion_tokens || 0,
    }))
    .filter((d) => d.prompt > 0 || d.completion > 0);

  if (!chartData.length) return null;

  return (
    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-zinc-500">Context Token Telemetry</span>
        <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
          Execution Trace
        </span>
      </div>
      <div className="h-[100px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="stepEmeraldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="step"
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
            <Area
              type="monotone"
              dataKey="prompt"
              name="Prompt Tokens"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#stepEmeraldGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
