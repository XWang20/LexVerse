"use client";

import React, { useRef } from "react";
import { motion } from "motion/react";
import { AnimatedBeam } from "@/components/magicui/animated-beam";
import { AnimatedGradientText } from "@/components/magicui/animated-gradient-text";
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text";
import { AuroraText } from "@/components/magicui/aurora-text";
import { BorderBeam } from "@/components/magicui/border-beam";
import { DotPattern } from "@/components/magicui/dot-pattern";
import { MagicCard } from "@/components/magicui/magic-card";
import { Marquee } from "@/components/magicui/marquee";
import { NumberTicker as MagicNumberTicker } from "@/components/magicui/number-ticker";
import { RainbowButton } from "@/components/magicui/rainbow-button";
import { ShineBorder } from "@/components/magicui/shine-border";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import { StripedPattern } from "@/components/magicui/striped-pattern";
import { cn } from "@/lib/utils";
import {
  RiScales3Line,
  RiRobot2Line,
  RiDatabase2Line,
  RiShieldCheckLine,
  RiFileCopyLine,
  RiCheckLine,
} from "@remixicon/react";

export {
  cn,
  MagicNumberTicker as NumberTicker,
  ShimmerButton,
  RainbowButton,
  AuroraText,
  AnimatedGradientText,
  AnimatedShinyText,
  StripedPattern,
  DotPattern,
  BorderBeam,
  Marquee,
  ShineBorder,
  MagicCard,
};

export interface DomainTone {
  key: "emerald" | "indigo" | "sky" | "amber" | "violet";
  stripe: string;
  leftBorder: string;
  badge: string;
  dot: string;
  iconWell: string;
  bar: string;
  text: string;
  hexFrom: string;
  hexTo: string;
  spotRgba: string;
}

const DOMAIN_TONES: Record<DomainTone["key"], DomainTone> = {
  emerald: {
    key: "emerald",
    stripe: "bg-emerald-500",
    leftBorder: "border-l-emerald-500/75",
    badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
    dot: "bg-emerald-500",
    iconWell: "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400",
    bar: "bg-gradient-to-r from-emerald-500 to-teal-400",
    text: "text-emerald-600 dark:text-emerald-400",
    hexFrom: "#10b981",
    hexTo: "#14b8a6",
    spotRgba: "rgba(16, 185, 129, 0.07)",
  },
  indigo: {
    key: "indigo",
    stripe: "bg-indigo-500",
    leftBorder: "border-l-indigo-500/75",
    badge: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20",
    dot: "bg-indigo-500",
    iconWell: "bg-indigo-500/10 border-indigo-500/25 text-indigo-600 dark:text-indigo-400",
    bar: "bg-gradient-to-r from-indigo-500 to-sky-400",
    text: "text-indigo-600 dark:text-indigo-400",
    hexFrom: "#6366f1",
    hexTo: "#0ea5e9",
    spotRgba: "rgba(99, 102, 241, 0.07)",
  },
  sky: {
    key: "sky",
    stripe: "bg-sky-500",
    leftBorder: "border-l-sky-500/75",
    badge: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border border-sky-500/20",
    dot: "bg-sky-500",
    iconWell: "bg-sky-500/10 border-sky-500/25 text-sky-600 dark:text-sky-400",
    bar: "bg-gradient-to-r from-sky-500 to-cyan-400",
    text: "text-sky-600 dark:text-sky-400",
    hexFrom: "#0ea5e9",
    hexTo: "#10b981",
    spotRgba: "rgba(14, 165, 233, 0.07)",
  },
  amber: {
    key: "amber",
    stripe: "bg-amber-500",
    leftBorder: "border-l-amber-500/75",
    badge: "bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/20",
    dot: "bg-amber-500",
    iconWell: "bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400",
    bar: "bg-gradient-to-r from-amber-500 to-orange-400",
    text: "text-amber-600 dark:text-amber-400",
    hexFrom: "#f59e0b",
    hexTo: "#10b981",
    spotRgba: "rgba(245, 158, 11, 0.07)",
  },
  violet: {
    key: "violet",
    stripe: "bg-violet-500",
    leftBorder: "border-l-violet-500/75",
    badge: "bg-violet-500/12 text-violet-700 dark:text-violet-300 border border-violet-500/20",
    dot: "bg-violet-500",
    iconWell: "bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-400",
    bar: "bg-gradient-to-r from-violet-500 to-indigo-400",
    text: "text-violet-600 dark:text-violet-400",
    hexFrom: "#8b5cf6",
    hexTo: "#6366f1",
    spotRgba: "rgba(139, 92, 246, 0.07)",
  },
};

export function getBenchmarkTone(id: string): DomainTone {
  const map: Record<string, DomainTone["key"]> = {
    lawbench: "emerald",
    plawbench: "indigo",
    lexeval: "sky",
    j1bench: "violet",
    legalworld: "amber",
    maser: "indigo",
    simucourt: "emerald",
    dlawbench: "sky",
    lecardv2: "violet",
    example: "emerald",
  };
  return DOMAIN_TONES[map[id.toLowerCase()] || "emerald"];
}

export function getSkillCategoryTone(category: string): DomainTone {
  const lower = category.toLowerCase();
  if (lower.includes("fact") || lower.includes("retrieval")) return DOMAIN_TONES.sky;
  if (lower.includes("draft")) return DOMAIN_TONES.indigo;
  if (lower.includes("risk") || lower.includes("case ops")) return DOMAIN_TONES.amber;
  if (lower.includes("office")) return DOMAIN_TONES.violet;
  return DOMAIN_TONES.emerald;
}

export function getKnowledgeDomainTone(domain: string): DomainTone {
  const map: Record<string, DomainTone["key"]> = {
    legal_laws: "emerald",
    legal_cases: "indigo",
    legal_qa: "sky",
    legal_concepts: "violet",
    legal_templates: "amber",
  };
  return DOMAIN_TONES[map[domain] || "emerald"];
}

export function SlidingPill({
  layoutId,
  className,
}: {
  layoutId: string;
  className?: string;
}) {
  return (
    <motion.span
      layoutId={layoutId}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={cn(
        "pointer-events-none absolute inset-0 rounded-full bg-white dark:bg-zinc-800 shadow-2xs",
        className
      )}
    />
  );
}

export function TrialDetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading trial inspection view">
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-zinc-100 dark:border-zinc-800/80">
            <div className="flex items-center gap-2.5">
              <div className="lv-skeleton h-5 w-16 rounded-md" />
              <div className="lv-skeleton h-5 w-48 rounded-md" />
            </div>
            <div className="flex items-center gap-2">
              <div className="lv-skeleton h-7 w-24 rounded-full" />
              <div className="lv-skeleton h-7 w-28 rounded-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <div className="lv-skeleton h-3 w-24 rounded" />
              <div className="lv-skeleton h-4 w-full rounded" />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="lv-skeleton h-3 w-16 rounded" />
                <div className="lv-skeleton h-4 w-24 rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/40 flex items-center gap-6">
          <div className="lv-skeleton h-4 w-20 rounded" />
          <div className="lv-skeleton h-4 w-16 rounded" />
          <div className="lv-skeleton h-4 w-24 rounded" />
        </div>
      </div>

      {[0, 1].map((idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="lv-skeleton h-6 w-6 rounded-md" />
              <div className="lv-skeleton h-4 w-36 rounded" />
            </div>
            <div className="lv-skeleton h-3.5 w-24 rounded" />
          </div>
          <div className="lv-skeleton h-16 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function BorderBeamCard({
  children,
  active = false,
  tone = "emerald",
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  tone?: "emerald" | "amber" | "indigo";
  className?: string;
}) {
  const colors = {
    emerald: { from: "#10b981", to: "#6366f1" },
    amber: { from: "#f59e0b", to: "#10b981" },
    indigo: { from: "#6366f1", to: "#0ea5e9" },
  }[tone];

  return (
    <div
      className={cn(
        "relative rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden",
        className
      )}
    >
      {active && (
        <BorderBeam
          size={140}
          duration={7}
          colorFrom={colors.from}
          colorTo={colors.to}
          borderWidth={1.5}
        />
      )}
      {children}
    </div>
  );
}

/**
 * Magic UI Pro `AnimatedBeam` hub connecting Task -> Agent -> Hybrid Knowledge -> Verifier
 */
export function ArchitectureBeam({
  mode,
  borderless = false,
  className,
}: {
  mode: "serve" | "static";
  borderless?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<HTMLDivElement>(null);
  const agentRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const verifierRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex w-full flex-col justify-between overflow-hidden",
        !borderless &&
          "rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]",
        className
      )}
    >
      <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-5 z-10">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          Unified Execution &amp; Provenance Graph
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border",
            mode === "serve"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300"
          )}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              mode === "serve" ? "bg-emerald-500" : "bg-zinc-400"
            )}
          />
          {mode === "serve" ? "Live Subprocess Daemon" : "Static Receipt Archive"}
        </span>
      </div>

      <div className="relative flex items-center justify-between gap-2 py-4 px-2 sm:px-4 z-10">
        <div className="flex flex-col items-center gap-2">
          <div
            ref={taskRef}
            className="z-10 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs text-zinc-900 dark:text-zinc-100"
          >
            <RiScales3Line className="h-5 w-5 text-zinc-800 dark:text-zinc-200" />
          </div>
          <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 text-center">
            9 Suites / Task
          </span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div
            ref={agentRef}
            className="z-10 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-sm"
          >
            <RiRobot2Line className="h-5 w-5" />
          </div>
          <span className="text-[11px] font-semibold text-zinc-950 dark:text-white text-center">
            20 CLI Agents
          </span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div
            ref={capRef}
            className="z-10 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs"
          >
            <RiDatabase2Line className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 text-center">
            57k Laws + Skills
          </span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div
            ref={verifierRef}
            className="z-10 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs"
          >
            <RiShieldCheckLine className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 text-center">
            Trace &amp; Verifier
          </span>
        </div>
      </div>

      <AnimatedBeam
        containerRef={containerRef}
        fromRef={taskRef}
        toRef={agentRef}
        curvature={-16}
        pathOpacity={0.14}
        gradientStartColor="#6366f1"
        gradientStopColor="#10b981"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={agentRef}
        toRef={capRef}
        curvature={16}
        pathOpacity={0.14}
        gradientStartColor="#10b981"
        gradientStopColor="#0ea5e9"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={capRef}
        toRef={verifierRef}
        curvature={-16}
        pathOpacity={0.14}
        gradientStartColor="#0ea5e9"
        gradientStopColor="#6366f1"
      />
    </div>
  );
}

export function TerminalSnippet({
  title,
  command,
  output,
  onCopy,
}: {
  title?: string;
  command: string;
  output?: string;
  onCopy?: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(command);
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70 font-mono text-xs overflow-hidden">
      {title && (
        <div className="px-3.5 py-1.5 border-b border-zinc-200/70 dark:border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-400 flex items-center justify-between">
          <span>{title}</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">CLI Receipt</span>
        </div>
      )}
      <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
        <code className="text-zinc-800 dark:text-zinc-200 break-all">
          <span className="text-zinc-400 select-none mr-2">$</span>
          {command}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy CLI Command"
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-[11px] text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
        >
          {copied ? (
            <>
              <RiCheckLine className="w-3.5 h-3.5 text-emerald-600" />
              Copied
            </>
          ) : (
            <>
              <RiFileCopyLine className="w-3.5 h-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
      {output && (
        <pre className="px-3.5 py-2 border-t border-zinc-200/70 dark:border-zinc-800 text-[11px] text-zinc-500 whitespace-pre-wrap">
          {output}
        </pre>
      )}
    </div>
  );
}
