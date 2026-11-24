"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RiScales3Line,
  RiSunLine,
  RiMoonLine,
  RiGithubFill,
  RiSearchLine,
  RiArrowRightUpLine,
  RiDatabase2Line,
  RiFileCodeLine,
  RiShieldCheckLine,
  RiFileCopyLine,
  RiCheckLine,
  RiArrowRightSLine,
  RiArrowRightLine,
  RiTerminalBoxLine,
  RiStackLine,
  RiSparkling2Line,
  RiCpuLine,
  RiBookReadLine,
  RiRouteLine,
} from "@remixicon/react";
import {
  BENCHMARKS,
  INITIAL_RUNS,
  JobRunRecord,
  RuntimeMode,
} from "@/lib/lexverse-data";
import { BUILD_MODE, withBasePath } from "@/lib/runtime-config";
import type {
  CapabilitiesCatalogData,
  HarborWorkspaceData,
  StorageOverviewResponse,
  StoredTrialIndexEntry,
} from "@/lib/storage-types";
import {
  AnimatedShinyText,
  DotPattern,
  Marquee,
  RainbowButton,
  StripedPattern,
  cn,
} from "./magic-ui";
import { JobsExplorer, type JobsNavTarget } from "./jobs-explorer";
import { HarborExampleShowcase } from "./workspace-view";
import { TasksView } from "./tasks-view";
import { CapabilitiesView } from "./capabilities-view";
import { ExperimentComposerDrawer, ComposerPreset } from "./experiment-composer";

type PrimaryTab = "overview" | "jobs" | "tasks" | "capabilities";

export function LexVerseApp({ initialTab = "overview" }: { initialTab?: PrimaryTab }) {
  const router = useRouter();
  const mode: RuntimeMode = BUILD_MODE;
  const activeTab: PrimaryTab = initialTab;

  const [dark, setDark] = useState(false);
  const [jobsNavTarget, setJobsNavTarget] = useState<JobsNavTarget | null>(null);

  const [snapshot, setSnapshot] = useState<any>(null);
  const [liveOverview, setLiveOverview] = useState<StorageOverviewResponse | null>(null);
  const [liveWorkspace, setLiveWorkspace] = useState<HarborWorkspaceData | null>(null);
  const [liveCapabilities, setLiveCapabilities] = useState<CapabilitiesCatalogData | null>(null);
  const [refreshingStorage, setRefreshingStorage] = useState(false);
  const [runs, setRuns] = useState<JobRunRecord[]>(INITIAL_RUNS);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPreset, setComposerPreset] = useState<ComposerPreset | null>(null);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedHeroCli, setCopiedHeroCli] = useState(false);

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((cur) => (cur === msg ? null : cur)), 3800);
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    fetch(withBasePath("/data/lexverse-snapshot.json"))
      .then((r) => r.json())
      .then((data) => setSnapshot(data))
      .catch(() => {});
  }, []);

  const loadLiveData = useCallback((refresh = false) => {
    if (refresh) setRefreshingStorage(true);
    Promise.all([
      fetch(withBasePath(`/api/live/storage${refresh ? "?refresh=1" : ""}`)).then((r) => r.json()),
      fetch(withBasePath("/api/live/workspace")).then((r) => r.json()),
      fetch(withBasePath(`/api/live/capabilities${refresh ? "?refresh=1" : ""}`)).then((r) => r.json()),
    ])
      .then(([stData, wsData, capData]) => {
        if (stData?.ok && stData?.overview) setLiveOverview(stData.overview);
        if (wsData?.ok && wsData?.workspace) setLiveWorkspace(wsData.workspace);
        if (capData?.ok && capData?.capabilities) setLiveCapabilities(capData.capabilities);
      })
      .catch(() => {})
      .finally(() => setRefreshingStorage(false));
  }, []);

  useEffect(() => {
    if (mode === "serve") {
      loadLiveData(false);
    }
  }, [mode, loadLiveData]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        setCmdPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeStorageOverview: StorageOverviewResponse | null = useMemo(() => {
    if (mode === "serve" && liveOverview) return liveOverview;
    if (snapshot?.jobs && snapshot?.resultsSummary) {
      return {
        generatedAt: snapshot.generatedAt || "",
        mode: "static",
        storageRoots: snapshot.storageRoots || [],
        jobs: snapshot.jobs || [],
        facets: snapshot.facets || {
          taskNames: [],
          cohorts: [],
          arms: [],
          agents: [],
          models: [],
        },
        resultsSummary: snapshot.resultsSummary,
      };
    }
    return null;
  }, [mode, liveOverview, snapshot]);

  const activeWorkspace: HarborWorkspaceData | null = useMemo(() => {
    if (mode === "serve" && liveWorkspace) return liveWorkspace;
    return snapshot?.harborWorkspace || null;
  }, [mode, liveWorkspace, snapshot]);

  const activeCapabilities: CapabilitiesCatalogData | null = useMemo(() => {
    if (mode === "serve" && liveCapabilities) return liveCapabilities;
    return snapshot?.capabilitiesCatalog || null;
  }, [mode, liveCapabilities, snapshot]);

  const staticTrials: StoredTrialIndexEntry[] = snapshot?.trials || [];
  const hasActiveRun = useMemo(() => runs.some((r) => r.status === "running"), [runs]);

  const openJobsTarget = (target: JobsNavTarget = {}) => {
    const params = new URLSearchParams();
    if (target.taskName) params.set("task", target.taskName);
    if (target.jobKey) params.set("job", target.jobKey);
    if (target.trial?.storagePath) {
      params.set("trial", target.trial.storagePath);
      params.set("root", target.trial.storageRoot);
    }
    const qs = params.toString();
    const href = `/jobs/${qs ? `?${qs}` : ""}`;
    if (activeTab === "jobs") {
      setJobsNavTarget({
        ...target,
        reset: !target.taskName && !target.jobKey && !target.trial,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      router.push(href);
    }
  };

  const openExampleShowcase = () => {
    if (activeTab === "overview") {
      document
        .getElementById("harbor-example-showcase")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      router.push("/#harbor-example-showcase");
    }
  };

  const openComposer = (preset?: ComposerPreset) => {
    setComposerPreset(preset || null);
    setComposerOpen(true);
  };

  const handleJobLaunched = (newJob: {
    name: string;
    target: string;
    agent: string;
    model: string;
    capabilities: string[];
    cliCommand: string;
  }) => {
    const created: JobRunRecord = {
      id: `live-${Date.now().toString(36)}`,
      name: newJob.name,
      sourceKind: newJob.target.startsWith("benchmark:") ? "benchmark" : "user",
      target: newJob.target,
      agent: newJob.agent,
      model: newJob.model,
      capabilities: newJob.capabilities,
      status: "running",
      verificationStatus: "pending",
      completedTrials: 0,
      plannedTrials: 4,
      scoreText: "Executing in Sandbox (0/4)...",
      createdAt: "Just now",
      cliCommand: newJob.cliCommand,
    };
    setRuns((prev) => [created, ...prev]);
    openJobsTarget({});
    notify(`Launched local job "${newJob.name}" in background worker.`);

    setTimeout(() => {
      setRuns((prev) =>
        prev.map((r) =>
          r.id === created.id
            ? { ...r, completedTrials: 2, scoreText: "Executing in Sandbox (2/4)..." }
            : r
        )
      );
    }, 2200);
    setTimeout(() => {
      setRuns((prev) =>
        prev.map((r) =>
          r.id === created.id
            ? {
                ...r,
                status: "completed",
                verificationStatus: "completed",
                completedTrials: 4,
                scoreText: "Completed · Verified (100%)",
              }
            : r
        )
      );
    }, 5200);
  };

  const heroQuickCommand =
    mode === "serve"
      ? "lexverse run -b plawbench --agents vanilla --model deepseek-v4.1-flash --profile openai"
      : "pip install -e '.[lawbench,plawbench,legalworld,maser,simucourt,openai]' && lexverse setup";

  const resultsSummary = activeStorageOverview?.resultsSummary;

  const marqueeItems = useMemo(() => {
    const agentChips = (resultsSummary?.exampleCohortComparison || [])
      .slice(0, 6)
      .map((a) => ({
        name: a.agent,
        tag: a.fullScore !== null ? `${a.fullScore} pts` : `${a.fullSteps || "-"} steps`,
      }));
    return [
      ...BENCHMARKS.map((b) => ({ name: b.name, tag: `${b.samples.toLocaleString()} tasks` })),
      ...agentChips,
    ];
  }, [resultsSummary]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#09090b] text-zinc-950 dark:text-zinc-50">
      {/* ==================== STICKY GLASS HEADER ==================== */}
      <header className="sticky top-0 z-40 h-14 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/85 dark:bg-[#09090b]/85 backdrop-blur-md">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-left"
            >
              <span className="w-7 h-7 rounded-lg bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 grid place-items-center shadow-2xs">
                <RiScales3Line className="w-4 h-4" />
              </span>
              <span className="font-semibold text-sm tracking-tight text-zinc-950 dark:text-white">
                LexVerse
              </span>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                v1.1
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {[
                { id: "overview" as const, href: "/", label: "Overview" },
                { id: "jobs" as const, href: "/jobs/", label: "Jobs", dot: hasActiveRun },
                { id: "tasks" as const, href: "/tasks/", label: "Tasks" },
                { id: "capabilities" as const, href: "/capabilities/", label: "Capabilities" },
              ].map((nav) => {
                const active = activeTab === nav.id;
                return (
                  <Link
                    key={nav.id}
                    href={nav.href}
                    onClick={() => {
                      if (nav.id === "jobs" && activeTab === "jobs") {
                        setJobsNavTarget({ reset: true });
                      }
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition",
                      active
                        ? "bg-zinc-100 dark:bg-zinc-900 text-zinc-950 dark:text-white font-semibold"
                        : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                    )}
                  >
                    <span>{nav.label}</span>
                    {nav.dot && <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCmdPaletteOpen(true)}
              aria-label="Open Command Search"
              className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70 px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-950 dark:hover:text-white hover:border-zinc-300 dark:hover:border-zinc-700 transition cursor-pointer"
            >
              <RiSearchLine className="w-3.5 h-3.5" />
              <kbd className="text-[10px] font-mono text-zinc-400">⌘K</kbd>
            </button>

            <span
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300"
              title={
                mode === "serve"
                  ? "Local Serve Mode: Direct filesystem runs/ & live workspace APIs active."
                  : "Static Hub Mode: Pre-exported snapshot bundle for GitHub Pages."
              }
            >
              {mode === "serve" ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Local Serve</span>
                </>
              ) : (
                <>
                  <RiGithubFill className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
                  <span>Static Hub</span>
                </>
              )}
            </span>

            <button
              type="button"
              aria-label="Toggle Theme"
              onClick={() => setDark((d) => !d)}
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-950 dark:hover:text-white transition cursor-pointer"
            >
              {dark ? <RiSunLine className="w-4 h-4" /> : <RiMoonLine className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => openComposer()}
              className="inline-flex items-center gap-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 px-3.5 py-1.5 text-xs font-medium transition cursor-pointer"
            >
              <span>{mode === "serve" ? "Run Eval" : "CLI Builder"}</span>
              <RiArrowRightSLine className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ==================== ARCHITECTURAL SHELL WITH SIDE RAILS ==================== */}
      <div className="max-w-[1280px] mx-auto flex min-h-[calc(100vh-3.5rem)]">
        <aside
          aria-hidden="true"
          className="hidden xl:block w-10 shrink-0 border-x border-zinc-200/75 dark:border-zinc-800/75 relative overflow-hidden"
        >
          <StripedPattern
            width={10}
            height={10}
            className="text-zinc-200/75 dark:text-zinc-800/60"
          />
        </aside>

        <div className="flex-1 min-w-0 bg-white dark:bg-[#09090b] flex flex-col">
          {toastMsg && (
            <div className="px-6 sm:px-10 pt-4">
              <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-2.5 text-xs text-zinc-800 dark:text-zinc-200 flex items-center justify-between">
                <span>{toastMsg}</span>
                <button
                  type="button"
                  onClick={() => setToastMsg(null)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-900 dark:hover:text-white ml-4 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* ==================== TAB 1: OVERVIEW ==================== */}
          {activeTab === "overview" && (
            <main className="flex-1">
              <section className="relative overflow-hidden border-b border-zinc-200/80 dark:border-zinc-800/80 pt-14 pb-16 sm:pt-20 sm:pb-24 px-6 sm:px-10">
                <DotPattern
                  width={20}
                  height={20}
                  cr={1}
                  className="text-zinc-300/70 dark:text-zinc-800/80 [mask-image:radial-gradient(620px_circle_at_50%_22%,white,transparent)]"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-zinc-100/80 via-transparent to-transparent dark:from-zinc-900/40"
                />

                <div className="relative z-10 max-w-3xl mx-auto text-center space-y-6">
                  <a
                    href="https://github.com/thunlp/LexVerse"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 rounded-full border border-zinc-200/90 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 px-3.5 py-1 text-xs font-medium shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <AnimatedShinyText className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Open-Source Legal Agent Infrastructure · THUNLP × Tsinghua AI &amp; Law × NEU
                    </AnimatedShinyText>
                    <RiArrowRightUpLine className="w-3.5 h-3.5 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                  </a>

                  <h1 className="text-4xl sm:text-6xl lg:text-[62px] font-semibold tracking-[-0.035em] leading-[1.06]">
                    <span className="bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-600 dark:from-white dark:via-zinc-100 dark:to-zinc-400 bg-clip-text text-transparent">
                      Learn, act, and evaluate
                    </span>
                    <br />
                    <span className="text-zinc-950 dark:text-white">
                      legal agents in one{" "}
                      <span className="font-serif italic font-normal">unified</span>{" "}
                      platform.
                    </span>
                  </h1>

                  <p className="text-base sm:text-lg text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
                    Legal agents are moving beyond answering isolated questions toward autonomously completing complex legal work. LexVerse integrates task environments, agent execution, modular legal resources, and verifiable evaluation in one open-source framework.
                  </p>

                  {/* Three Core Workflows from Press Release */}
                  <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-mono">
                    {[
                      "01 · Benchmark Evaluation",
                      "02 · Capability Augmentation",
                      "03 · Custom Legal Environments",
                    ].map((pill) => (
                      <span
                        key={pill}
                        className="px-3 py-1 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 text-zinc-700 dark:text-zinc-300"
                      >
                        {pill}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                    <RainbowButton
                      size="lg"
                      onClick={() => openJobsTarget({})}
                      className="rounded-full px-7 text-sm font-medium"
                    >
                      <span>Browse Jobs</span>
                      <RiArrowRightLine className="w-4 h-4" />
                    </RainbowButton>

                    <button
                      type="button"
                      onClick={() => router.push("/tasks/")}
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-6 h-11 text-sm font-medium transition cursor-pointer"
                    >
                      <RiFileCodeLine className="w-4 h-4 text-zinc-500" />
                      <span>Explore Tasks</span>
                    </button>

                    <a
                      href="https://github.com/thunlp/LexVerse"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-5 h-11 text-sm font-medium transition"
                    >
                      <RiGithubFill className="w-4 h-4" />
                      <span>GitHub</span>
                    </a>
                  </div>

                  <div className="max-w-lg mx-auto pt-1">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70 px-3.5 py-2 font-mono text-xs">
                      <div className="truncate text-left">
                        <span className="text-zinc-400 select-none mr-2">$</span>
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {heroQuickCommand}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(heroQuickCommand);
                          setCopiedHeroCli(true);
                          setTimeout(() => setCopiedHeroCli(false), 1600);
                        }}
                        aria-label="Copy quick command"
                        className="shrink-0 p-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-zinc-500 transition cursor-pointer"
                      >
                        {copiedHeroCli ? (
                          <RiCheckLine className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <RiFileCopyLine className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* MARQUEE */}
              <section className="border-b border-zinc-200/80 dark:border-zinc-800/80 py-7 bg-zinc-50/40 dark:bg-zinc-950/50">
                <div className="text-center text-[11px] font-mono uppercase tracking-widest text-zinc-400 mb-3">
                  Integrated Suites &amp; Evaluated Harnesses
                </div>
                <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
                  <Marquee pauseOnHover className="[--duration:38s] [--gap:0.75rem]">
                    {marqueeItems.map((item, idx) => (
                      <div
                        key={`${item.name}-${idx}`}
                        className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3.5 py-1.5 text-xs"
                      >
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {item.name}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-400">{item.tag}</span>
                      </div>
                    ))}
                  </Marquee>
                </div>
              </section>

              {/* SECTION 2: OVERALL ARCHITECTURE & ECOSYSTEM */}
              <section className="border-b border-zinc-200/80 dark:border-zinc-800/80 py-16 sm:py-20 px-6 sm:px-10 space-y-10">
                <div className="max-w-2xl mx-auto text-center space-y-2.5">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">
                    ARCHITECTURE &amp; ECOSYSTEM
                  </div>
                  <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                    Shared infrastructure for researchers, developers &amp; practitioners
                  </h2>
                  <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400">
                    Uniting benchmark evaluation, environment scaling, agentic RL, and comparative trajectory analysis around a single Task · Capability · Agent · Verifier core.
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white p-4 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={withBasePath("/images/lexverse-framework.png")}
                    alt="LexVerse Overall Framework"
                    className="w-full h-auto rounded-xl border border-zinc-100"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-zinc-500 pt-1">
                    <span>Figure: LexVerse Unified Interactive Environment &amp; Ecosystem</span>
                    <span>Unified Evaluation · Environment Scaling · Interactive Learning · Comparative Analysis</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    {
                      icon: RiStackLine,
                      title: "For Legal AI Researchers",
                      desc: "Compare models and agent frameworks under identical conditions with unified entry points, controlled resource ablations, and full execution trajectories.",
                    },
                    {
                      icon: RiCpuLine,
                      title: "For Agent Developers",
                      desc: "Plug existing CLI agents or native multi-agent harnesses into standardized legal environments, inspect workspace state, and pinpoint retrieval or reasoning errors.",
                    },
                    {
                      icon: RiScales3Line,
                      title: "For Legal Professionals",
                      desc: "Turn real case dossiers, contracts, and review rubrics into reproducible tasks producing auditable Word/text deliverables with structured verification.",
                    },
                  ].map((role) => {
                    const Icon = role.icon;
                    return (
                      <div
                        key={role.title}
                        className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                      >
                        <span className="w-8 h-8 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 grid place-items-center text-zinc-900 dark:text-zinc-100">
                          <Icon className="w-4 h-4" />
                        </span>
                        <div className="text-sm font-semibold text-zinc-950 dark:text-white">
                          {role.title}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          {role.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* SECTION 3: HIGHLIGHT 01 — UNIFIED BENCHMARK INTEGRATION */}
              <section className="border-b border-zinc-200/80 dark:border-zinc-800/80 py-16 sm:py-20 px-6 sm:px-10 space-y-8 bg-zinc-50/40 dark:bg-zinc-950/50">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="max-w-2xl space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-semibold">
                      HIGHLIGHT 01 · UNIFIED BENCHMARK INTEGRATION
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                      Integrate once, evaluate both models and agents
                    </h2>
                    <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      Transform static QA datasets into interactive agent execution environments spanning legal knowledge, case retrieval, courtroom debate, and multi-agent simulation — extensible via clean benchmark plugins.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push("/tasks/")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer"
                  >
                    <span>Explore All 9 Benchmark Catalogs</span>
                    <RiArrowRightLine className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {BENCHMARKS.map((b) => {
                    const hasStoredJobs = b.id !== "lecardv2";
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          if (hasStoredJobs) {
                            openJobsTarget({ taskName: b.id });
                          } else {
                            router.push("/tasks/");
                          }
                        }}
                        className="text-left rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-300 dark:hover:border-zinc-700 p-4 sm:p-5 flex flex-col justify-between gap-3 transition cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-zinc-950 dark:text-white">
                              {b.name}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
                              {b.category}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                            {b.coverage}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px] font-mono">
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {b.samples.toLocaleString()} items · {b.executionModes.join(" / ")}
                          </span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            {hasStoredJobs ? "Jobs →" : "Specs →"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* SECTION 4: HIGHLIGHT 02 — CAPABILITY-AUGMENTED EXECUTION ENVIRONMENT */}
              <section className="border-b border-zinc-200/80 dark:border-zinc-800/80 py-16 sm:py-20 px-6 sm:px-10 space-y-8">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="max-w-2xl space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-semibold">
                      HIGHLIGHT 02 · CAPABILITY AUGMENTATION
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                      Same tasks, same verifiers — controlled legal resource ablations
                    </h2>
                    <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      Enable Knowledge, Skills, or MCP independently or in combination to isolate what helps on which tasks, and trace failures directly to missing retrieval, misused statutes, or reasoning slips.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push("/capabilities/")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer"
                  >
                    <span>Explore Capabilities Hub</span>
                    <RiArrowRightLine className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    {
                      icon: RiDatabase2Line,
                      badge: "5 Core Domains",
                      title: "Knowledge Retrieval Stores",
                      desc: "Pre-indexed BM25/FAISS legal collections spanning Statutes & Regulations, Judicial Cases, Legal Q&A, Legal Concepts, and Document Templates — download-ready and updated with statutory revisions.",
                    },
                    {
                      icon: RiBookReadLine,
                      badge: "41 Mounted Skills",
                      title: "Legal Practice & Office Skills",
                      desc: "38 Chinese litigation & contract review SOP skills + 3 Office (docx, pptx, xlsx) workflows so agents operate like practitioners.",
                    },
                    {
                      icon: RiSparkling2Line,
                      badge: "Modular MCP",
                      title: "External Services & Tools",
                      desc: "Standard Model Context Protocol endpoints exposing search, statute fetch, and specialized domain tools cleanly inside reproducible CLI and sandbox runs.",
                    },
                  ].map((cap) => {
                    const Icon = cap.icon;
                    return (
                      <div
                        key={cap.title}
                        className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="w-8 h-8 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 grid place-items-center text-zinc-900 dark:text-zinc-100">
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold">
                            {cap.badge}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-zinc-950 dark:text-white">
                          {cap.title}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          {cap.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* SECTION 5: HIGHLIGHT 03 — CUSTOMIZABLE LEGAL ENVIRONMENT + EXAMPLE TASK SHOWCASE */}
              <section
                id="harbor-example-showcase"
                className="border-b border-zinc-200/80 dark:border-zinc-800/80 py-16 sm:py-20 px-6 sm:px-10 space-y-8 bg-zinc-50/40 dark:bg-zinc-950/50"
              >
                <div className="max-w-2xl space-y-2">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-semibold">
                    HIGHLIGHT 03 · USER-CUSTOMIZABLE LEGAL ENVIRONMENT
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                    Package real case dossiers into isolated, verifiable tasks
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Pair one manifest (<code className="font-mono">task.toml</code>) and instruction prompt with input materials, optional reference scripts, and isolated verifier containers — runnable locally or inside offline Docker sandboxes with strict network boundaries.
                  </p>
                </div>

                <HarborExampleShowcase
                  harborWorkspace={activeWorkspace}
                  mode={mode}
                  onOpenJobsForTask={(taskName) => openJobsTarget({ taskName })}
                  onOpenComposer={openComposer}
                />
              </section>

              {/* SECTION 6: ROADMAP — FROM OPEN SOURCE TO CONTINUOUS EVOLUTION */}
              <section className="border-b border-zinc-200/80 dark:border-zinc-800/80 py-16 sm:py-20 px-6 sm:px-10 space-y-8">
                <div className="max-w-2xl space-y-2">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-400 font-semibold">
                    ROADMAP · CONTINUOUS EVOLUTION
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                    From open source to multi-task workflows and agentic learning
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    {
                      icon: RiFileCodeLine,
                      tag: "01 · Coverage",
                      title: "More Legal Benchmarks",
                      desc: "Continuously onboard new legal benchmarks alongside streamlined plugin guides and templates so contributors can integrate datasets with minimal boilerplate.",
                    },
                    {
                      icon: RiRouteLine,
                      tag: "02 · Complexity",
                      title: "Multi-Task & Long-Horizon Workflows",
                      desc: "Support chained multi-stage workflows spanning dossier review, statutory lookup, argumentation, and drafting — opening multi-role collaboration to custom user tasks.",
                    },
                    {
                      icon: RiShieldCheckLine,
                      tag: "03 · Freshness",
                      title: "Evolving Legal Environments",
                      desc: "Maintain versioned statutory and precedent updates while co-designing realistic tasks and verification criteria alongside practicing legal professionals.",
                    },
                    {
                      icon: RiCpuLine,
                      tag: "04 · Learning",
                      title: "From Execution Trajectories to Learning",
                      desc: "Curate high-signal execution trajectories and build reliable domain reward signals from verifiable runs to improve legal agent policies through agentic RL.",
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.title}
                        className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                            {item.tag}
                          </span>
                          <Icon className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div className="text-sm font-semibold text-zinc-950 dark:text-white">
                          {item.title}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* SECTION 7: COMMUNITY CTA */}
              <section className="py-16 sm:py-20 px-6 sm:px-10 text-center relative overflow-hidden">
                <DotPattern
                  width={22}
                  height={22}
                  cr={1}
                  className="text-zinc-300/60 dark:text-zinc-800/60 [mask-image:radial-gradient(500px_circle_at_50%_50%,white,transparent)]"
                />
                <div className="relative z-10 max-w-xl mx-auto space-y-5">
                  <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                    Build open legal agent infrastructure together
                  </h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Contribute a benchmark plugin, add a legal skill, inspect real trajectories, or bring a practical legal workflow into LexVerse.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                    <a
                      href="https://github.com/thunlp/LexVerse"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 px-6 py-2.5 text-xs font-semibold transition"
                    >
                      <RiGithubFill className="w-4 h-4" />
                      <span>thunlp/LexVerse</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => openJobsTarget({})}
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-6 py-2.5 text-xs font-medium transition cursor-pointer"
                    >
                      <span>Browse Jobs</span>
                      <RiArrowRightLine className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openComposer()}
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-5 py-2.5 text-xs font-medium transition cursor-pointer"
                    >
                      <RiTerminalBoxLine className="w-3.5 h-3.5" />
                      <span>{mode === "serve" ? "Launch Job" : "Generate CLI"}</span>
                    </button>
                  </div>
                </div>
              </section>
            </main>
          )}

          {/* ==================== TAB 2: UNIFIED 4-LEVEL JOBS EXPLORER ==================== */}
          {activeTab === "jobs" && (
            <main className="flex-1 py-8 px-6 sm:px-10">
              <JobsExplorer
                storageOverview={activeStorageOverview}
                staticTrials={staticTrials}
                runs={runs}
                mode={mode}
                navTarget={jobsNavTarget}
                refreshing={refreshingStorage}
                onRefreshStorage={() => loadLiveData(true)}
                onOpenComposer={openComposer}
              />
            </main>
          )}

          {/* ==================== TAB 3: TASKS ==================== */}
          {activeTab === "tasks" && (
            <main className="flex-1 py-8 px-6 sm:px-10">
              <TasksView
                snapshot={snapshot}
                mode={mode}
                onOpenComposer={openComposer}
                onOpenJobsTarget={openJobsTarget}
                onOpenExampleShowcase={openExampleShowcase}
              />
            </main>
          )}

          {/* ==================== TAB 4: CAPABILITIES HUB ==================== */}
          {activeTab === "capabilities" && (
            <main className="flex-1 py-8 px-6 sm:px-10">
              <CapabilitiesView
                capabilities={activeCapabilities}
                mode={mode}
                refreshing={refreshingStorage}
                onRefresh={() => loadLiveData(true)}
                onNotify={notify}
              />
            </main>
          )}

          {/* Footer */}
          <footer className="border-t border-zinc-200/80 dark:border-zinc-800/80 px-6 sm:px-10 py-8 text-xs text-zinc-400 flex flex-wrap items-center justify-between gap-4 font-mono">
            <div>
              LexVerse Unified Web · Same codebase powers{" "}
              <code className="text-zinc-700 dark:text-zinc-300">bun dev</code> (Local Serve) &amp;{" "}
              <code className="text-zinc-700 dark:text-zinc-300">bun run build:static</code>{" "}
              (GitHub Pages)
            </div>
            <div>Apache-2.0 · THUNLP · Tsinghua Institute for AI &amp; Law · NEU</div>
          </footer>
        </div>

        <aside
          aria-hidden="true"
          className="hidden xl:block w-10 shrink-0 border-x border-zinc-200/75 dark:border-zinc-800/75 relative overflow-hidden"
        >
          <StripedPattern
            width={10}
            height={10}
            className="text-zinc-200/75 dark:text-zinc-800/60"
          />
        </aside>
      </div>

      <ExperimentComposerDrawer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        mode={mode}
        preset={composerPreset}
        onJobLaunched={handleJobLaunched}
      />

      {/* Cmd+K Command Palette */}
      {cmdPaletteOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-start justify-center pt-24 px-4"
          onClick={() => setCmdPaletteOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
              <RiSearchLine className="w-4 h-4 text-zinc-400" />
              <input
                autoFocus
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                placeholder="Jump to Jobs (by Task), Harbor Workspace, Tasks, or Capabilities..."
                className="w-full bg-transparent text-sm outline-none text-zinc-900 dark:text-white"
              />
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
                ESC
              </kbd>
            </div>
            <div className="p-2 max-h-72 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60 text-xs">
              {[
                {
                  title: "Jobs: PLawBench Runs, Results & Trajectories",
                  sub: "View Weighted/Macro mode comparisons and drill into 280 trials",
                  action: () => openJobsTarget({ taskName: "plawbench" }),
                },
                {
                  title: "Jobs: LawBench Runs, Results & Trajectories",
                  sub: "View 20-subtask overlay and drill into 10,000 trials per mode",
                  action: () => openJobsTarget({ taskName: "lawbench" }),
                },
                {
                  title: "Jobs: Example User Task (39 Agent Runs)",
                  sub: "Compare Base vs Full Capabilities cohorts & inspect Harbor verifier outputs",
                  action: () => openJobsTarget({ taskName: "example" }),
                },
                {
                  title: "Overview: Harbor Example Task Showcase",
                  sub: "Inspect user_workspace/tasks/example (task.toml, environment/, tests/, solution/)",
                  action: openExampleShowcase,
                },
                {
                  title: "Tasks: All 9 Benchmark Suites & Catalogs",
                  sub: "Browse catalog.yaml tasks & user_workspace/tasks/example",
                  action: () => router.push("/tasks/"),
                },
                {
                  title: "Capabilities: 41 Skills, 16 Collections & MCP",
                  sub: "Browse executable skills, BM25/FAISS stores & MCP server tools",
                  action: () => router.push("/capabilities/"),
                },
              ]
                .filter(
                  (item) =>
                    !cmdQuery.trim() ||
                    (item.title + item.sub).toLowerCase().includes(cmdQuery.toLowerCase())
                )
                .map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      item.action();
                      setCmdPaletteOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-medium text-zinc-900 dark:text-white">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-zinc-500">{item.sub}</div>
                    </div>
                    <RiArrowRightUpLine className="w-4 h-4 text-zinc-400" />
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
