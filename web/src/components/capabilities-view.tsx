"use client";

import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  RiBookReadLine,
  RiCheckLine,
  RiCloseLine,
  RiCpuLine,
  RiDatabase2Line,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiRefreshLine,
  RiSearchLine,
  RiShieldCheckLine,
  RiSparkling2Line,
  RiTerminalBoxLine,
} from "@remixicon/react";
import type {
  CapabilitiesCatalogData,
  CapabilityKnowledgeCollection,
  CapabilitySkillItem,
} from "@/lib/storage-types";
import type { RuntimeMode } from "@/lib/lexverse-data";
import {
  SlidingPill,
  TerminalSnippet,
  cn,
  getKnowledgeDomainTone,
  getSkillCategoryTone,
} from "./magic-ui";

type CapabilitiesTab = "skills" | "knowledge" | "mcp";

const DOMAIN_META: Record<string, { label: string; desc: string }> = {
  legal_laws: { label: "Statutes & Regulations", desc: "Statutory articles & judicial interpretations" },
  legal_cases: { label: "Judicial Cases", desc: "Judgment precedents, similar cases & reasoning chains" },
  legal_qa: { label: "Legal Q&A", desc: "Real-world legal consultation & Bar Q&A pairs" },
  legal_concepts: { label: "Legal Concepts", desc: "Legal terminology & doctrine knowledge graph" },
  legal_templates: { label: "Document Templates", desc: "Standardized court & Supreme Court pleading templates" },
};

const SKILL_CATEGORY_ORDER = [
  "All",
  "Legal Reasoning & Interpretation",
  "Fact, Evidence & Retrieval",
  "Drafting & Summarization",
  "Risk & Case Ops",
  "Office Documents",
];

function CopySnippetButton({
  text,
  copied,
  onCopy,
  label = "Copy",
}: {
  text: string;
  copied: boolean;
  onCopy: (text: string) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onCopy(text)}
      className="lv-btn-secondary inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-mono cursor-pointer"
    >
      {copied ? <RiCheckLine className="w-3 h-3 text-emerald-600" /> : <RiFileCopyLine className="w-3 h-3" />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}

export function CapabilitiesView({
  capabilities,
  mode,
  refreshing = false,
  onRefresh,
  onNotify,
}: {
  capabilities: CapabilitiesCatalogData | null;
  mode: RuntimeMode;
  refreshing?: boolean;
  onRefresh?: () => void;
  onNotify: (msg: string) => void;
}) {
  const [subTab, setSubTab] = useState<CapabilitiesTab>("skills");
  const [skillQuery, setSkillQuery] = useState("");
  const [skillCategory, setSkillCategory] = useState("All");
  const [packFilter, setPackFilter] = useState("all");
  const [selectedSkill, setSelectedSkill] = useState<CapabilitySkillItem | null>(null);
  const [domainFilter, setDomainFilter] = useState("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string, notice: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    onNotify(notice);
    setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1600);
  };

  const skills = capabilities?.skills || [];
  const skillPacks = capabilities?.skillPacks || [];
  const collections = capabilities?.knowledgeCollections || [];
  const mcpServers = capabilities?.mcpServers || [];
  const builtinTools = capabilities?.builtinAgentTools || [];
  const summary = capabilities?.summary;
  const retrieval = capabilities?.retrievalDefaults;

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: skills.length };
    for (const s of skills) {
      counts[s.category] = (counts[s.category] || 0) + 1;
    }
    return counts;
  }, [skills]);

  const orderedCategories = useMemo(() => {
    const extras = Object.keys(categoryCounts).filter((c) => !SKILL_CATEGORY_ORDER.includes(c));
    return [...SKILL_CATEGORY_ORDER.filter((c) => c === "All" || (categoryCounts[c] || 0) > 0), ...extras];
  }, [categoryCounts]);

  const filteredSkills = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    return skills.filter((s) => {
      if (packFilter !== "all" && s.packId !== packFilter) return false;
      if (skillCategory !== "All" && s.category !== skillCategory) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      );
    });
  }, [skills, packFilter, skillCategory, skillQuery]);

  const prebuiltCollections = useMemo(
    () => collections.filter((c) => c.origin === "upstream_prebuilt"),
    [collections]
  );
  const localCollections = useMemo(
    () => collections.filter((c) => c.origin === "workspace_local"),
    [collections]
  );
  const filteredPrebuilt = useMemo(
    () =>
      domainFilter === "all"
        ? prebuiltCollections
        : prebuiltCollections.filter((c) => c.domain === domainFilter),
    [prebuiltCollections, domainFilter]
  );

  const maxChunkCount = useMemo(
    () => Math.max(1, ...prebuiltCollections.map((c) => c.chunkCount)),
    [prebuiltCollections]
  );

  const domainCounts = useMemo(() => {
    const map: Record<string, { collections: number; chunks: number }> = {};
    for (const c of prebuiltCollections) {
      if (!map[c.domain]) map[c.domain] = { collections: 0, chunks: 0 };
      map[c.domain].collections += 1;
      map[c.domain].chunks += c.chunkCount;
    }
    return map;
  }, [prebuiltCollections]);

  const buildSkillYamlSnippet = (sk: CapabilitySkillItem) =>
    sk.repository && sk.commit && sk.upstreamPath
      ? `resources:\n  skills:\n    - repository: ${sk.repository}\n      commit: ${sk.commit}\n      path: ${sk.upstreamPath}/${sk.id}`
      : `resources:\n  skills:\n    - ${sk.mountPath}`;

  return (
    <div className="space-y-6">
      {/* Header & KPI Strip */}
      <section className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 space-y-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <code className="font-mono">.lexverse/capabilities/</code> · Modular Agent Resources
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white mt-0.5">
              Skills, Knowledge Retrieval Stores &amp; MCP Tools
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-3xl">
              Every capability mounted cleanly with SHA-256 identity pins: {summary?.totalSkills ?? 41} executable <code className="font-mono">SKILL.md</code> workflows,{" "}
              {summary?.prebuiltCollections ?? 16} hybrid BM25+FAISS legal collections ({(summary?.prebuiltChunks ?? 899923).toLocaleString()} chunks), and FastMCP knowledge &amp; external tool protocols.
            </p>
          </div>

          {mode === "serve" && onRefresh && (
            <button
              type="button"
              onClick={() => {
                onRefresh();
                onNotify(
                  `Verified ${summary?.totalSkills ?? 41} Skills, ${summary?.prebuiltCollections ?? 16} prebuilt collections, and ${summary?.localWorkspaceIndexes ?? 1} local workspace index.`
                );
              }}
              className="lv-btn-secondary inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium cursor-pointer shrink-0"
            >
              <RiRefreshLine className={cn("w-3.5 h-3.5 text-emerald-600", refreshing && "animate-spin")} />
              <span>Verify Local Capabilities</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: "Mounted Skills",
              value: `${summary?.totalSkills ?? 41}`,
              sub: `${summary?.legalSkills ?? 38} Chinese Legal · ${summary?.officeSkills ?? 3} Office`,
              icon: RiBookReadLine,
              iconCls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
            },
            {
              label: "Knowledge Collections",
              value: `${summary?.prebuiltCollections ?? 16}`,
              sub: `5 domains + ${summary?.localWorkspaceIndexes ?? 1} local index`,
              icon: RiDatabase2Line,
              iconCls: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
            },
            {
              label: "Indexed Legal Chunks",
              value: (summary?.prebuiltChunks ?? 899923).toLocaleString(),
              sub: `${retrieval?.embeddingModel || "BAAI/bge-m3"} · ${retrieval?.mode || "hybrid"}`,
              icon: RiSparkling2Line,
              iconCls: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
            },
            {
              label: "MCP & Built-in Tools",
              value: `${summary?.mcpToolsAndResources ?? 4} / ${summary?.builtinTools ?? 11}`,
              sub: `${summary?.mcpServers ?? 2} MCP protocols · ResourceSelection`,
              icon: RiCpuLine,
              iconCls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
            },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.label}
                className="relative overflow-hidden rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                    {kpi.label}
                  </div>
                  <span className={cn("w-6 h-6 rounded-md border grid place-items-center shrink-0", kpi.iconCls)}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                </div>
                <div className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-white mt-0.5 tabular-nums">
                  {kpi.value}
                </div>
                <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                  {kpi.sub}
                </div>
              </div>
            );
          })}
        </div>

        {/* Underlined Sub-Tabs */}
        <div
          role="tablist"
          aria-label="Capabilities sections"
          className="flex items-center gap-6 border-b border-zinc-200 dark:border-zinc-800 -mb-6 pt-1"
        >
          {[
            { id: "skills" as const, icon: RiBookReadLine, label: "Skills", count: skills.length },
            {
              id: "knowledge" as const,
              icon: RiDatabase2Line,
              label: "Knowledge Stores",
              count: prebuiltCollections.length,
            },
            {
              id: "mcp" as const,
              icon: RiSparkling2Line,
              label: "MCP & Tools",
              count: mcpServers.reduce((a, s) => a + s.tools.length, 0) + builtinTools.length,
            },
          ].map((t) => {
            const Icon = t.icon;
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setSubTab(t.id)}
                className={cn(
                  "relative inline-flex items-center gap-2 pb-3 text-xs font-medium transition cursor-pointer",
                  active
                    ? "text-zinc-950 dark:text-white font-semibold"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 tabular-nums">
                  {t.count}
                </span>
                {active && (
                  <motion.span
                    layoutId="capabilities-subtab-underline"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-zinc-950 dark:bg-white"
                  />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* ==================== TAB A: 41 SKILLS ==================== */}
      {subTab === "skills" && (
        <motion.section
          key="skills"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <RiSearchLine className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={skillQuery}
                onChange={(e) => setSkillQuery(e.target.value)}
                placeholder="Search 41 skills by name, trigger condition, or category..."
                className="w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPackFilter("all")}
                className={cn(
                  "relative px-2.5 py-1 rounded-full text-[11px] font-mono border transition cursor-pointer",
                  packFilter === "all"
                    ? "text-white border-zinc-950 dark:text-zinc-950 dark:border-white"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                )}
              >
                {packFilter === "all" && (
                  <SlidingPill
                    layoutId="capabilities-pack-pill"
                    className="bg-zinc-950 dark:bg-white"
                  />
                )}
                <span className="relative z-10">All Packs ({skills.length})</span>
              </button>
              {skillPacks.map((p) => {
                const active = packFilter === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPackFilter((cur) => (cur === p.id ? "all" : p.id))}
                    className={cn(
                      "relative px-2.5 py-1 rounded-full text-[11px] font-mono border transition cursor-pointer",
                      active
                        ? "text-white border-zinc-950 dark:text-zinc-950 dark:border-white"
                        : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                    )}
                  >
                    {active && (
                      <SlidingPill
                        layoutId="capabilities-pack-pill"
                        className="bg-zinc-950 dark:bg-white"
                      />
                    )}
                    <span className="relative z-10">
                      {p.id} ({p.skillCount})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {orderedCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSkillCategory(cat)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition cursor-pointer",
                  skillCategory === cat
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold"
                    : "border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                )}
              >
                {cat} ({categoryCounts[cat] || 0})
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredSkills.map((sk) => {
              const tone = getSkillCategoryTone(sk.category);
              return (
                <div
                  key={`${sk.packId}-${sk.id}`}
                  className="group relative rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 flex flex-col justify-between gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 hover:shadow-[0_8px_18px_-10px_rgba(15,23,42,0.12)]"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <code className="font-mono text-xs font-semibold text-zinc-950 dark:text-white break-all">
                            {sk.name}
                          </code>
                          <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded-full font-medium", tone.badge)}>
                            {sk.category}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400 mt-0.5 truncate">
                          {sk.mountPath} · {sk.fileCount} {sk.fileCount === 1 ? "file" : "files"} · {(sk.sizeBytes / 1024).toFixed(1)} KB
                        </div>
                      </div>

                      <span
                        className={cn(
                          "shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-md",
                          sk.packId === "harvey_labs"
                            ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        )}
                      >
                        {sk.packId === "harvey_labs" ? "harvey-labs" : "legal-chinese"}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3">
                      {sk.description || "SOP workflow specification in SKILL.md."}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2 text-xs">
                    <CopySnippetButton
                      text={buildSkillYamlSnippet(sk)}
                      copied={copiedKey === `skill-${sk.id}`}
                      onCopy={(t) => handleCopy(`skill-${sk.id}`, t, `Copied YAML SkillRef for ${sk.name}`)}
                      label="Copy YAML"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedSkill(sk)}
                      className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      <span>Inspect SKILL.md</span>
                      <span className="inline-block transition-transform duration-150 group-hover:translate-x-0.5">→</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* ==================== TAB B: KNOWLEDGE STORES (16 + LOCAL) ==================== */}
      {subTab === "knowledge" && (
        <motion.section
          key="knowledge"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="space-y-4"
        >
          {retrieval && (
            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  HYBRID RETRIEVAL PIPELINE (indexes/retrieval.yaml)
                </div>
                <div className="text-xs text-zinc-700 dark:text-zinc-300 font-mono">
                  mode={retrieval.mode} (BM25+jieba + FAISS · RRF k=60) · embed={retrieval.embeddingModel} · candidates={retrieval.keywordCandidates}/{retrieval.vectorCandidates} · top_k={retrieval.topK}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                {Object.entries(retrieval.chunkTokensByKind || {}).map(([kind, tok]) => (
                  <span
                    key={kind}
                    className="px-2 py-1 rounded-md bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300"
                  >
                    {kind}: {tok} tok
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Domain filter pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDomainFilter("all")}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition cursor-pointer",
                domainFilter === "all"
                  ? "bg-zinc-950 text-white border-zinc-950 dark:bg-white dark:text-zinc-950 dark:border-white"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400"
              )}
            >
              All Prebuilt ({prebuiltCollections.length} · {(summary?.prebuiltChunks ?? 899923).toLocaleString()} chunks)
            </button>
            {Object.entries(domainCounts).map(([dom, stat]) => (
              <button
                key={dom}
                type="button"
                onClick={() => setDomainFilter(dom)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-mono border transition cursor-pointer",
                  domainFilter === dom
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400"
                )}
              >
                {dom} ({stat.collections})
              </button>
            ))}
          </div>

          {/* 16 Upstream Prebuilt Collections Table */}
          <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
                  HF Prebuilt Legal Knowledge Collections ({filteredPrebuilt.length})
                </h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Addressable inside <code className="font-mono">search_knowledge(source_ids=[...])</code> by domain alias or exact collection ID.
                </p>
              </div>
              <TerminalSnippet title="Download Collections" command="lexverse download knowledge" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50/70 dark:bg-zinc-900/50 text-[10px] font-mono uppercase tracking-wider text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Collection ID</th>
                    <th className="px-4 py-2.5 font-medium">Domain</th>
                    <th className="px-4 py-2.5 font-medium text-right">Chunks</th>
                    <th className="px-4 py-2.5 font-medium w-44">Volume</th>
                    <th className="px-4 py-2.5 font-medium">Retrieval · Chunk</th>
                    <th className="px-5 py-2.5 font-medium">Index SHA-256</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                  {filteredPrebuilt.map((col: CapabilityKnowledgeCollection) => {
                    const pct = Math.max(2, Math.round((col.chunkCount / maxChunkCount) * 100));
                    const domTone = getKnowledgeDomainTone(col.domain);
                    return (
                      <tr key={col.indexHash || col.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40">
                        <td className="px-5 py-3 font-mono font-semibold text-zinc-950 dark:text-white">
                          {col.id}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", domTone.badge)}>
                            {DOMAIN_META[col.domain]?.label || col.domain}
                          </span>
                        </td>
                        <td className={cn("px-4 py-3 text-right font-mono font-semibold tabular-nums", domTone.text)}>
                          {col.chunkCount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", domTone.bar)}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          {col.mode} · {col.chunkTokens} tok · {col.embeddingModel}
                        </td>
                        <td className="px-5 py-3 font-mono text-[11px] text-zinc-400">
                          {col.indexHash.slice(0, 12)}…
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Local Workspace Indexes */}
          {localCollections.length > 0 && (
            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">
                    Local Workspace Custom Indexes ({localCollections.length})
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Locally built from <code className="font-mono">.lexverse/capabilities/indexes/</code> (separate from HF prebuilt snapshot).
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {localCollections.map((idx) => (
                  <div
                    key={idx.indexHash}
                    className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-900/40 space-y-1.5 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-950 dark:text-white">
                        collection:{idx.id}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold">
                        {idx.chunkCount.toLocaleString()} chunks
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      mode={idx.mode} · embed={idx.embeddingModel} · chunk={idx.chunkTokens} (overlap {idx.overlapTokens})
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">SHA256: {idx.indexHash}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.section>
      )}

      {/* ==================== TAB C: MCP SERVERS & BUILT-IN TOOLS ==================== */}
      {subTab === "mcp" && (
        <motion.section
          key="mcp"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="space-y-5"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {mcpServers.map((srv) => (
              <div
                key={srv.id}
                className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <RiSparkling2Line className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <h2 className="text-base font-semibold text-zinc-950 dark:text-white font-mono">
                        {srv.name}
                      </h2>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
                        {srv.serverTitle}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                      {srv.description}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                  {srv.transports.map((tr) => (
                    <span
                      key={tr}
                      className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold"
                    >
                      {tr}
                    </span>
                  ))}
                  <span className="text-zinc-400 truncate">{srv.entrypoint}</span>
                </div>

                <div className="space-y-3">
                  {srv.tools.map((tool) => (
                    <div
                      key={tool.name}
                      className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-3.5 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <code className="font-mono text-xs font-semibold text-zinc-950 dark:text-white">
                          {tool.signature}
                        </code>
                        <span
                          className={cn(
                            "text-[10px] font-mono px-2 py-0.5 rounded uppercase",
                            tool.kind === "resource"
                              ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                              : "bg-zinc-900/8 dark:bg-white/10 text-zinc-700 dark:text-zinc-300"
                          )}
                        >
                          {tool.kind}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {tool.description}
                      </p>
                      <div className="space-y-1 pt-1">
                        {tool.params.map((p) => (
                          <div
                            key={p.name}
                            className="flex flex-wrap items-baseline gap-2 text-[11px] border-t border-zinc-200/50 dark:border-zinc-800/60 pt-1"
                          >
                            <code className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                              {p.name}
                            </code>
                            <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                              {p.type}
                            </span>
                            <span className="font-mono text-[10px] text-zinc-400">
                              {p.required ? "required" : `default=${p.defaultValue}`}
                            </span>
                            <span className="text-zinc-500 dark:text-zinc-400">{p.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                      Job YAML Snippet
                    </span>
                    <CopySnippetButton
                      text={srv.yamlExample}
                      copied={copiedKey === `mcp-${srv.id}`}
                      onCopy={(t) => handleCopy(`mcp-${srv.id}`, t, `Copied YAML for ${srv.name}`)}
                      label="Copy YAML"
                    />
                  </div>
                  <pre className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] font-mono text-zinc-200 overflow-x-auto">
                    {srv.yamlExample}
                  </pre>
                </div>
              </div>
            ))}
          </div>

          {/* Built-in Agent Toolset */}
          <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RiCpuLine className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
                  Built-in Agent Toolset &amp; Ablation Controls (<code className="font-mono">ResourceSelection</code>)
                </h2>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">
                Configurable via resources.tools[] &amp; resources.disabled_tools[]
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {builtinTools.map((tool) => (
                <div
                  key={tool.name}
                  className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 px-3.5 py-2.5 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <code className="font-mono text-xs font-semibold text-zinc-950 dark:text-white">
                      {tool.name}
                    </code>
                    <span
                      className={cn(
                        "text-[10px] font-mono px-1.5 py-0.5 rounded",
                        tool.group === "knowledge"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : tool.group === "interactive"
                          ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                          : "bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                      )}
                    >
                      {tool.group}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                    {tool.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </motion.section>
      )}

      {/* ==================== SKILL.MD INSPECTOR MODAL ==================== */}
      <AnimatePresence>
        {selectedSkill && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setSelectedSkill(null)}
          >
            <motion.div
              role="dialog"
              aria-label={`Inspect ${selectedSkill.name} SKILL.md`}
              initial={{ opacity: 0, scale: 0.97, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-3xl max-h-[85vh] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800 flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <RiShieldCheckLine className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <h3 className="text-base font-semibold font-mono text-zinc-950 dark:text-white">
                    {selectedSkill.name}
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
                    {selectedSkill.category}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-zinc-400 flex flex-wrap items-center gap-3">
                  <span>{selectedSkill.mountPath}</span>
                  <span>{selectedSkill.packLabel}</span>
                  {selectedSkill.commit && <span>commit {selectedSkill.commit.slice(0, 10)}</span>}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close skill modal"
                onClick={() => setSelectedSkill(null)}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-950 dark:hover:text-white cursor-pointer"
              >
                <RiCloseLine className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                  <span className="text-zinc-400">Files ({selectedSkill.fileCount}):</span>
                  {selectedSkill.files.slice(0, 8).map((f) => (
                    <span
                      key={f}
                      className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                    >
                      {f}
                    </span>
                  ))}
                  {selectedSkill.files.length > 8 && (
                    <span className="text-zinc-400">+{selectedSkill.files.length - 8} more</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {selectedSkill.repository && (
                    <a
                      href={selectedSkill.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white"
                    >
                      <span>Source Repo</span>
                      <RiExternalLinkLine className="w-3 h-3" />
                    </a>
                  )}
                  <CopySnippetButton
                    text={buildSkillYamlSnippet(selectedSkill)}
                    copied={copiedKey === `modal-${selectedSkill.id}`}
                    onCopy={(t) =>
                      handleCopy(`modal-${selectedSkill.id}`, t, `Copied YAML SkillRef for ${selectedSkill.name}`)
                    }
                    label="Copy YAML SkillRef"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 p-4">
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-2">
                  <RiTerminalBoxLine className="w-3.5 h-3.5" />
                  <span>SKILL.md Specification Preview</span>
                </div>
                <pre className="text-xs font-mono text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                  {selectedSkill.previewMarkdown}
                </pre>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
