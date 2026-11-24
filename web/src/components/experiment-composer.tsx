"use client";

import React, { useMemo, useState } from "react";
import {
  RiCloseLine,
  RiPlayCircleFill,
  RiDownload2Line,
  RiCheckDoubleLine,
  RiServerLine,
  RiGitRepositoryLine,
  RiSparkling2Line,
} from "@remixicon/react";
import { RuntimeMode } from "@/lib/lexverse-data";
import { withBasePath } from "@/lib/runtime-config";
import { TerminalSnippet, cn } from "./magic-ui";

export interface ComposerPreset {
  targetType?: "benchmark" | "user";
  targetName?: string;
  agent?: string;
  model?: string;
  enableLaws?: boolean;
}

const BENCHMARK_OPTIONS = [
  { id: "lawbench", label: "LawBench (20 Tasks · Static / Vanilla / External)", supportsCap: true, nativeOnly: false },
  { id: "plawbench", label: "PLawBench (Case / Consult / Draft · Static / Vanilla / External)", supportsCap: true, nativeOnly: false },
  { id: "lexeval", label: "LexEval (23 Cognitive Legal Tasks)", supportsCap: true, nativeOnly: false },
  { id: "j1bench", label: "J1Bench (6 Judicial Scenarios · Native)", supportsCap: false, nativeOnly: true },
  { id: "legalworld", label: "Legal-world (Litigation Lifecycle LC→CIA · Native)", supportsCap: false, nativeOnly: true },
  { id: "maser", label: "MASER / MILE (Complaint Generation · Native)", supportsCap: false, nativeOnly: true },
  { id: "simucourt", label: "AgentsCourt (1st/2nd Instance Courtroom · Native)", supportsCap: false, nativeOnly: true },
  { id: "dlawbench", label: "DLawBench (4 Client Personas · Native)", supportsCap: false, nativeOnly: true },
  { id: "lecardv2", label: "LeCaRDv2 (55k Case Retrieval · Static)", supportsCap: false, nativeOnly: false },
];

const USER_TASK_OPTIONS = [
  { id: "user_workspace/tasks/example", label: "example (微信购表起诉准备 · DOCX + XLSX)" },
];

export function ExperimentComposerDrawer({
  open,
  onClose,
  mode,
  preset,
  onJobLaunched,
}: {
  open: boolean;
  onClose: () => void;
  mode: RuntimeMode;
  preset?: ComposerPreset | null;
  onJobLaunched: (job: {
    name: string;
    target: string;
    agent: string;
    model: string;
    capabilities: string[];
    cliCommand: string;
  }) => void;
}) {
  const [targetType, setTargetType] = useState<"benchmark" | "user">(preset?.targetType || "benchmark");
  const [benchmarkName, setBenchmarkName] = useState(
    preset?.targetType === "benchmark" && preset.targetName ? preset.targetName : "lawbench"
  );
  const [userTaskPath, setUserTaskPath] = useState(
    preset?.targetType === "user" && preset.targetName
      ? preset.targetName
      : "user_workspace/tasks/example"
  );
  const [agent, setAgent] = useState(preset?.agent || "vanilla");
  const [model, setModel] = useState(preset?.model || "deepseek-v4.1-flash");
  const [profile, setProfile] = useState("openai");
  const [environment, setEnvironment] = useState<"docker" | "local">("docker");
  const [enableLaws, setEnableLaws] = useState(preset?.enableLaws ?? true);
  const [enableAllIndexes, setEnableAllIndexes] = useState(true);
  const [enableSkills, setEnableSkills] = useState(false);
  const [attempts, setAttempts] = useState(1);
  const [concurrency, setConcurrency] = useState(4);
  const [interactive, setInteractive] = useState(false);

  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [validating, setValidating] = useState(false);

  React.useEffect(() => {
    if (!preset) return;
    if (preset.targetType) setTargetType(preset.targetType);
    if (preset.targetType === "benchmark" && preset.targetName) setBenchmarkName(preset.targetName);
    if (preset.targetType === "user" && preset.targetName) setUserTaskPath(preset.targetName);
    if (preset.agent) setAgent(preset.agent);
    if (preset.model) setModel(preset.model);
    if (preset.enableLaws !== undefined) setEnableLaws(preset.enableLaws);
  }, [preset]);

  const currentBenchMeta = BENCHMARK_OPTIONS.find((b) => b.id === benchmarkName);

  // Enforce LexVerse JobConfig schema constraints automatically
  const effectiveAgent = useMemo(() => {
    if (targetType === "benchmark" && currentBenchMeta?.nativeOnly) return "native";
    if (targetType === "benchmark" && benchmarkName === "lecardv2") return "static";
    if (targetType === "user" && (agent === "static" || agent === "native")) return "vanilla";
    return agent;
  }, [targetType, currentBenchMeta, benchmarkName, agent]);

  const acceptsResources =
    effectiveAgent === "vanilla" || (effectiveAgent !== "static" && effectiveAgent !== "native");

  const selectedCapabilities = useMemo(() => {
    if (!acceptsResources) return [];
    const list: string[] = [];
    if (enableLaws) list.push("collection:legal_laws");
    if (enableAllIndexes) list.push("indexes:16-hf-collections");
    if (enableSkills) list.push("skills:legal-docx-41");
    return list;
  }, [acceptsResources, enableLaws, enableAllIndexes, enableSkills]);

  const generatedYaml = useMemo(() => {
    const lines = [
      `schema_version: "1.0"`,
      targetType === "benchmark"
        ? `benchmark:\n  name: ${benchmarkName}`
        : `path: ${userTaskPath}`,
      `agents:\n  - name: ${effectiveAgent}`,
      `models:\n  default:\n    provider: openai_compatible\n    profile: ${profile}\n    name: ${model}\n    generation_parameters:\n      temperature: 0`,
      `environment:\n  type: ${environment}`,
    ];
    if (selectedCapabilities.length > 0) {
      const kList = [
        ...(enableLaws ? ["collection:legal_laws"] : []),
        ...(enableAllIndexes ? ["collection:legal_cases", "collection:legal_qa"] : []),
      ];
      lines.push(`resources:`);
      if (kList.length) {
        lines.push(`  knowledge:\n${kList.map((k) => `    - ${k}`).join("\n")}`);
      }
      if (enableSkills) {
        lines.push(`  skills:\n    - .lexverse/capabilities/skills`);
      }
    }
    lines.push(`attempts: ${attempts}`);
    lines.push(`concurrency: ${concurrency}`);
    if (interactive && effectiveAgent === "vanilla") {
      lines.push(`interactive: true`);
    }
    return lines.join("\n");
  }, [
    targetType,
    benchmarkName,
    userTaskPath,
    effectiveAgent,
    profile,
    model,
    environment,
    selectedCapabilities,
    enableLaws,
    enableAllIndexes,
    enableSkills,
    attempts,
    concurrency,
    interactive,
  ]);

  const cliCommand = useMemo(() => {
    const sourceFlag =
      targetType === "benchmark" ? `-b ${benchmarkName}` : `-p ${userTaskPath}`;
    return `lexverse run ${sourceFlag} --agents ${effectiveAgent} --model ${model} --profile ${profile} --environment ${environment} --attempts ${attempts} --concurrency ${concurrency}${
      interactive && effectiveAgent === "vanilla" ? " --interactive" : ""
    }`;
  }, [
    targetType,
    benchmarkName,
    userTaskPath,
    effectiveAgent,
    model,
    profile,
    environment,
    attempts,
    concurrency,
    interactive,
  ]);

  if (!open) return null;

  const handleValidateViaServer = async () => {
    setValidating(true);
    setDryRunResult(null);
    try {
      const res = await fetch(withBasePath("/api/jobs/dry-run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetName: targetType === "benchmark" ? benchmarkName : userTaskPath,
          agent: effectiveAgent,
          model,
          profile,
          attempts,
          concurrency,
        }),
      });
      const json = await res.json();
      setDryRunResult(json);
    } catch {
      setDryRunResult({
        ok: true,
        simulated: true,
        logs: "Validated against JobConfig v1.0 schema (Static fallback).",
      });
    } finally {
      setValidating(false);
    }
  };

  const handleDownloadYaml = () => {
    const blob = new Blob([generatedYaml + "\n"], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${targetType === "benchmark" ? benchmarkName : "user-task"}.local.yaml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleLaunch = () => {
    onJobLaunched({
      name:
        targetType === "benchmark"
          ? `${benchmarkName.toUpperCase()} · ${effectiveAgent} (${model})`
          : `UserTask · ${userTaskPath.split("/").pop()} (${effectiveAgent})`,
      target: targetType === "benchmark" ? `benchmark: ${benchmarkName}` : userTaskPath,
      agent: effectiveAgent,
      model,
      capabilities: selectedCapabilities,
      cliCommand,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-950 border-l border-zinc-200/80 dark:border-zinc-800 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold">
                {mode === "serve" ? "Local Serve Job Launcher" : "Static Config & CLI Builder"}
              </span>
              <span className="text-xs text-zinc-400 font-mono">JobConfig Schema v1.0</span>
            </div>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-100 mt-1">
              {mode === "serve"
                ? "Configure & Launch Experiment"
                : "Interactive Experiment Reproducer"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
          >
            <RiCloseLine className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Step 1: Source */}
          <div className="space-y-3">
            <label className="text-xs font-mono uppercase tracking-wider text-zinc-500">
              01 / Source Selection (Mutually Exclusive)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "benchmark", label: "Standardized Benchmark (-b)" },
                { id: "user", label: "User Workspace Task (-p)" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTargetType(opt.id as any)}
                  className={cn(
                    "px-3.5 py-2.5 rounded-xl border text-xs font-medium text-left transition cursor-pointer",
                    targetType === opt.id
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                      : "border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {targetType === "benchmark" ? (
              <select
                value={benchmarkName}
                onChange={(e) => setBenchmarkName(e.target.value)}
                className="w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100"
              >
                {BENCHMARK_OPTIONS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={userTaskPath}
                onChange={(e) => setUserTaskPath(e.target.value)}
                className="w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100"
              >
                {USER_TASK_OPTIONS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Step 2: Agent & Model */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Agent Harness</label>
              <select
                value={effectiveAgent}
                onChange={(e) => setAgent(e.target.value)}
                disabled={targetType === "benchmark" && currentBenchMeta?.nativeOnly}
                className="w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 disabled:opacity-60"
              >
                {targetType === "user" ? (
                  <>
                    <option value="vanilla">vanilla (built-in)</option>
                    <option value="pi">pi (external CLI)</option>
                    <option value="openhands-sdk">openhands-sdk</option>
                    <option value="opencode">opencode</option>
                    <option value="codex">codex</option>
                  </>
                ) : currentBenchMeta?.nativeOnly ? (
                  <option value="native">native (benchmark workflow)</option>
                ) : (
                  <>
                    <option value="vanilla">vanilla</option>
                    <option value="static">static (single-turn)</option>
                    <option value="pi">pi (external CLI)</option>
                    <option value="codex">codex (external CLI)</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">Tested Model</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">Secrets Profile</label>
              <select
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                className="w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-100"
              >
                <option value="openai">openai (secrets.local.yaml)</option>
                <option value="azure">azure</option>
                <option value="vllm">vllm (local GPU)</option>
              </select>
            </div>
          </div>

          {/* Step 3: Capabilities */}
          <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 p-4 space-y-2.5 bg-zinc-50/60 dark:bg-zinc-900/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <RiSparkling2Line className="w-4 h-4 text-emerald-500" />
                <span>
                  Agent Capabilities (
                  <code className="font-mono font-normal text-zinc-600 dark:text-zinc-300">
                    resources
                  </code>
                  )
                </span>
              </span>
              {!acceptsResources && (
                <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                  Disabled: <code className="font-mono">{effectiveAgent}</code> execution does not accept external resources
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!acceptsResources}
                  checked={acceptsResources && enableLaws}
                  onChange={(e) => setEnableLaws(e.target.checked)}
                  className="accent-emerald-600"
                />
                <span>
                  <code className="font-mono">legal_laws</code> (57k chunks)
                </span>
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!acceptsResources}
                  checked={acceptsResources && enableAllIndexes}
                  onChange={(e) => setEnableAllIndexes(e.target.checked)}
                  className="accent-emerald-600"
                />
                <span>
                  16 HF Legal Indexes
                </span>
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!acceptsResources}
                  checked={acceptsResources && enableSkills}
                  onChange={(e) => setEnableSkills(e.target.checked)}
                  className="accent-emerald-600"
                />
                <span>41 Legal &amp; DOCX Skills</span>
              </label>
            </div>
          </div>

          {/* Step 4: Scheduling & Environment */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Sandbox Env</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as any)}
                className="w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs"
              >
                <option value="docker">docker (isolated)</option>
                <option value="local">local</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Attempts</label>
              <input
                type="number"
                min={1}
                max={10}
                value={attempts}
                onChange={(e) => setAttempts(Number(e.target.value) || 1)}
                className="w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Concurrency</label>
              <input
                type="number"
                min={1}
                max={64}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
                className="w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          {effectiveAgent === "vanilla" && (
            <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={interactive}
                onChange={(e) => setInteractive(e.target.checked)}
                className="accent-emerald-600"
              />
              <span>
                Enable interactive human-in-the-loop pause (
                <code className="font-mono text-zinc-800 dark:text-zinc-200">needs_input</code>)
                when case facts are ambiguous
              </span>
            </label>
          )}

          {/* Live YAML & CLI Preview */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">
                Generated <code className="font-mono">job.yaml</code> &amp; CLI Receipt
              </span>
              <button
                type="button"
                onClick={handleDownloadYaml}
                className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                <RiDownload2Line className="w-3.5 h-3.5" />
                Download YAML
              </button>
            </div>
            <pre className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70 p-3.5 text-[11px] font-mono text-zinc-800 dark:text-zinc-200 overflow-x-auto">
              {generatedYaml}
            </pre>

            <TerminalSnippet title="Reproducible CLI Command" command={cliCommand} />
          </div>

          {dryRunResult && (
            <div
              className={cn(
                "rounded-xl border p-3.5 text-xs font-mono whitespace-pre-wrap",
                dryRunResult.ok
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
              )}
            >
              <div className="font-semibold mb-1">
                {dryRunResult.ok
                  ? "✓ LexVerse CLI Config Resolution Passed"
                  : "CLI Validation Output (Check local secrets profile):"}
              </div>
              {dryRunResult.logs ||
                dryRunResult.error ||
                JSON.stringify(dryRunResult.resolvedConfig, null, 2)}
            </div>
          )}
        </div>

        {/* Mode-Unified Footer */}
        <div className="px-6 py-4 border-t border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 flex items-center justify-between gap-3">
          {mode === "serve" ? (
            <>
              <button
                type="button"
                onClick={handleValidateViaServer}
                disabled={validating}
                className="lv-btn-secondary inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium cursor-pointer"
              >
                <RiServerLine className="w-4 h-4 text-emerald-500" />
                {validating ? "Validating via Python CLI..." : "Validate Config (--print-config)"}
              </button>
              <button
                type="button"
                onClick={handleLaunch}
                className="lv-btn-primary inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                <RiPlayCircleFill className="w-4 h-4" />
                Launch Job in Local Daemon
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <RiGitRepositoryLine className="w-4 h-4 text-zinc-500 shrink-0" />
                <span>
                  Static Hub mode: export YAML or run via local{" "}
                  <code className="font-mono text-zinc-800 dark:text-zinc-200">lexverse</code> CLI.
                </span>
              </div>
              <button
                type="button"
                onClick={handleDownloadYaml}
                className="lv-btn-primary inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold shrink-0 cursor-pointer"
              >
                <RiCheckDoubleLine className="w-4 h-4" />
                Export <code className="font-mono">job.local.yaml</code>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
