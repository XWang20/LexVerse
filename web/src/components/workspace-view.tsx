"use client";

import React, { useEffect, useState } from "react";
import {
  RiFolderOpenLine,
  RiFileTextLine,
  RiFileCodeLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiDownload2Line,
  RiFileCopyLine,
  RiCheckLine,
  RiPlayCircleLine,
  RiStackLine,
} from "@remixicon/react";
import type { HarborTreeNode, HarborWorkspaceData } from "@/lib/storage-types";
import type { RuntimeMode } from "@/lib/lexverse-data";
import { withBasePath } from "@/lib/runtime-config";
import { cn } from "./magic-ui";
import type { ComposerPreset } from "./experiment-composer";

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function findFirstFile(nodes: HarborTreeNode[], preferredPath = "task.toml"): HarborTreeNode | null {
  const flat: HarborTreeNode[] = [];
  const walk = (list: HarborTreeNode[]) => {
    for (const n of list) {
      if (n.kind === "file") flat.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return flat.find((f) => f.relPath === preferredPath) || flat[0] || null;
}

export function HarborExampleShowcase({
  harborWorkspace,
  mode,
  onOpenJobsForTask,
  onOpenComposer,
}: {
  harborWorkspace: HarborWorkspaceData | null;
  mode: RuntimeMode;
  onOpenJobsForTask: (taskName: string) => void;
  onOpenComposer: (preset?: ComposerPreset) => void;
}) {
  const pkg = harborWorkspace?.taskPackages?.[0] || null;
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({
    environment: true,
    "environment/inputs": true,
    tests: true,
    solution: true,
  });
  const [selectedNode, setSelectedNode] = useState<HarborTreeNode | null>(null);
  const [fetchedContent, setFetchedContent] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!selectedNode && pkg?.tree?.length) {
      const def = findFirstFile(pkg.tree, "task.toml");
      if (def) setSelectedNode(def);
    }
  }, [pkg, selectedNode]);

  useEffect(() => {
    setFetchedContent(null);
    if (!selectedNode || selectedNode.kind !== "file") return;
    if (selectedNode.content !== undefined) return;
    if (mode !== "serve" || !selectedNode.previewable) return;

    let cancelled = false;
    setLoadingFile(true);
    fetch(
      withBasePath(
        `/api/live/workspace-file?scope=${encodeURIComponent(
          selectedNode.scope
        )}&path=${encodeURIComponent(selectedNode.relPath)}`
      )
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.ok && typeof data.content === "string") {
          setFetchedContent(data.content);
        }
        setLoadingFile(false);
      })
      .catch(() => {
        if (!cancelled) setLoadingFile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedNode, mode]);

  const activeTextContent = selectedNode?.content ?? fetchedContent;

  const toggleDir = (relPath: string) => {
    setExpandedDirs((prev) => ({ ...prev, [relPath]: !prev[relPath] }));
  };

  const renderTree = (nodes: HarborTreeNode[], depth = 0) => {
    return nodes.map((node) => {
      if (node.kind === "dir") {
        const open = Boolean(expandedDirs[node.relPath]);
        return (
          <div key={node.relPath}>
            <button
              type="button"
              onClick={() => toggleDir(node.relPath)}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
              className="w-full text-left py-1.5 pr-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center gap-1.5 text-xs font-mono text-zinc-700 dark:text-zinc-300 cursor-pointer"
            >
              {open ? (
                <RiArrowDownSLine className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              ) : (
                <RiArrowRightSLine className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              )}
              <RiFolderOpenLine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate font-semibold">{node.name}/</span>
            </button>
            {open && node.children && <div>{renderTree(node.children, depth + 1)}</div>}
          </div>
        );
      }

      const active =
        selectedNode?.scope === node.scope && selectedNode?.relPath === node.relPath;
      return (
        <button
          key={`${node.scope}:${node.relPath}`}
          type="button"
          onClick={() => setSelectedNode(node)}
          style={{ paddingLeft: `${depth * 14 + 24}px` }}
          className={cn(
            "w-full text-left py-1.5 pr-2 rounded-lg flex items-center justify-between gap-2 text-xs font-mono transition cursor-pointer",
            active
              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold"
              : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
          )}
        >
          <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
            {node.previewable ? (
              <RiFileCodeLine className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            ) : (
              <RiFileTextLine className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
          </span>
          <span className="text-[10px] text-zinc-400 shrink-0">{formatBytes(node.sizeBytes)}</span>
        </button>
      );
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold">
            {pkg?.rootPath || "user_workspace/tasks/example"}
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">
            Offline Docker Sandbox + Separate Verifier
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenJobsForTask("example")}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 px-4 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer"
          >
            <RiStackLine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>View 39 Example Runs →</span>
          </button>

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
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950 px-4 py-1.5 text-xs font-medium cursor-pointer"
          >
            <RiPlayCircleLine className="w-3.5 h-3.5" />
            <span>{mode === "serve" ? "Run Example Task" : "CLI Config"}</span>
          </button>
        </div>
      </div>

      {/* 2-Column IDE Showcase (Example Task Package only; configs/jobs removed) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-4">
          {pkg && (
            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3.5 space-y-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="px-2 pb-2 border-b border-zinc-100 dark:border-zinc-800/80">
                <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
                  Example Task Package
                </div>
                <div className="text-xs font-mono font-semibold text-zinc-950 dark:text-white mt-0.5">
                  {pkg.rootPath}/
                </div>
              </div>
              <div className="space-y-0.5 max-h-[480px] overflow-y-auto">
                {renderTree(pkg.tree)}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-8 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          {selectedNode ? (
            <>
              <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold">
                      {selectedNode.roleLabel || "File"}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {formatBytes(selectedNode.sizeBytes)}
                    </span>
                  </div>
                  <div className="text-xs font-mono font-semibold text-zinc-950 dark:text-white mt-1 truncate">
                    user_workspace/tasks/example/{selectedNode.relPath}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeTextContent && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(activeTextContent);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1600);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1 text-[11px] font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      {copied ? (
                        <RiCheckLine className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <RiFileCopyLine className="w-3.5 h-3.5" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  )}

                  {mode === "serve" && selectedNode.downloadable && (
                    <a
                      href={withBasePath(
                        `/api/live/workspace-file?scope=${encodeURIComponent(
                          selectedNode.scope
                        )}&path=${encodeURIComponent(selectedNode.relPath)}&download=1`
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
                {loadingFile ? (
                  <div className="py-10 text-center text-xs font-mono text-zinc-400">
                    Loading package file…
                  </div>
                ) : activeTextContent !== undefined && activeTextContent !== null ? (
                  <pre className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-4 text-xs font-mono text-zinc-800 dark:text-zinc-200 overflow-x-auto max-h-[480px] leading-relaxed whitespace-pre-wrap">
                    {activeTextContent}
                  </pre>
                ) : (
                  <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-8 text-center space-y-3">
                    <RiFileTextLine className="w-8 h-8 text-indigo-500 mx-auto" />
                    <div className="text-xs font-mono font-semibold text-zinc-950 dark:text-white">
                      {selectedNode.name}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                      Binary dossier or reference asset ({formatBytes(selectedNode.sizeBytes)}) mounted read-only inside the Harbor sandbox environment.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-10 text-center text-xs font-mono text-zinc-400">
              Select a task package file on the left to inspect it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
