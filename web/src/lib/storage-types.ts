export type StorageRootId = "upstream" | "workspace";

export interface StoredJobFile {
  name: string;
  relPath: string;
  storageRoot: StorageRootId;
  sizeBytes: number;
  kind: "metadata" | "verification" | "log" | "trials";
  downloadable: boolean;
}

export interface StoredMetricBadge {
  name: string;
  label: string;
  value: number;
  unit: string;
  max?: number;
}

export interface StoredSubtaskMetric {
  task: string;
  label?: string;
  primaryValue: number | null;
  primaryName: string;
  total?: number;
  completed?: number;
  failed?: number;
  scored?: number;
  metrics: Record<string, number>;
}

export interface StoredSampledTrial {
  id: string;
  task: string;
  sampleId: string;
  status: string;
  instruction: string;
  content: string;
  response: string;
  reference: string;
  evaluationMetrics: Record<string, number> | null;
}

export interface StoredJobRecord {
  key: string;
  jobId: string;
  storageRoot: StorageRootId;
  storagePath: string;
  cohort: string;
  sourceKind: "benchmark" | "user";
  taskName: string;
  taskTitle: string;
  agent: string;
  model: string;
  arm: string;
  armLabel: string;
  status: string;
  verificationStatus: string;
  plannedTrials: number;
  completedTrials: number;
  failedTrials: number;
  scoredTrials: number;
  primaryMetric: StoredMetricBadge | null;
  macroScore: number | null;
  weightedScore: number | null;
  submissionValid?: boolean | null;
  subtaskMetrics: StoredSubtaskMetric[];
  hasTrajectories: boolean;
  trajectoryCount: number;
  hasArtifacts: boolean;
  artifactCount: number;
  updatedAt: string;
  files: StoredJobFile[];
  sampledTrials: StoredSampledTrial[];
  cliInspectCommand: string;
  cliRunCommand: string;
}

export interface StoredTrialIndexEntry {
  id: string;
  trialId: string;
  taskId: string;
  configId: string;
  attempt: number;
  jobKey: string;
  jobId: string;
  cohort: string;
  storageRoot: StorageRootId;
  storagePath: string;
  runDir: string;
  sourceKind: "benchmark" | "user";
  taskName: string;
  taskType: string;
  sampleId: string;
  agent: string;
  model: string;
  arm: string;
  armLabel: string;
  title: string;
  status: string;
  stopReason: string | null;
  updatedAt: string | null;
  score: number | null;
  scoreUnit: string;
  scoreLabel: string;
  steps: number | null;
  toolCalls: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  hasArtifacts: boolean;
  artifactNames: string[];
  usedRetrieval: boolean;
  usedSkill: boolean;
  staticFile?: string;
}

export interface StoredMetricItem {
  key: string;
  label: string;
  value: number;
  unit: string;
  max?: number;
  isPrimary?: boolean;
}

export interface StoredArtifactItem {
  name: string;
  relPath: string;
  storageRoot: StorageRootId;
  sizeBytes?: number;
  sha256?: string;
  format?: string;
}

export interface StoredTrialFileItem {
  name: string;
  relPath: string;
  storageRoot: StorageRootId;
  sizeBytes: number;
  kind: "result" | "trajectory" | "artifact" | "internal";
  downloadable: boolean;
}

export interface StoredSiblingTrial {
  id: string;
  storageRoot: StorageRootId;
  storagePath: string;
  staticFile?: string;
  jobKey: string;
  jobId: string;
  cohort: string;
  agent: string;
  arm: string;
  armLabel: string;
  score?: number | null;
  scoreUnit?: string;
}

export interface StoredTrialDetail {
  id: string;
  trialId: string;
  taskId: string;
  configId: string;
  attempt: number;
  jobKey: string;
  jobId: string;
  cohort: string;
  storageRoot: StorageRootId;
  storagePath: string;
  runDir: string;
  sourceKind: "benchmark" | "user";
  taskName: string;
  taskType: string;
  sampleId: string;
  agent: string;
  model: string;
  arm: string;
  armLabel: string;
  title: string;
  subtitle: string;
  status: string;
  stopReason: string | null;
  updatedAt: string | null;
  primaryMetric: StoredMetricBadge | null;
  metrics: Record<string, StoredMetricItem>;
  answer: string;
  reference: string;
  artifacts: StoredArtifactItem[];
  files: StoredTrialFileItem[];
  rawResult: Record<string, any> | null;
  usage: {
    steps: number;
    toolCalls: number;
    modelCalls: number | null;
    activeElapsedSec: number | null;
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    totalCostUsd: number | null;
    mcpCalls: number;
    usedRetrieval: boolean;
    usedSkill: boolean;
  };
  siblings: StoredSiblingTrial[];
  harborWorkspace?: TrialHarborWorkspace | null;
  trajectory: {
    schema_version: string;
    session_id: string;
    agent: any;
    final_metrics: any;
    steps: any[];
  };
  cliCommand: string;
}

export interface AgentWorkspaceFile {
  id: string;
  path: string;
  name: string;
  category: "artifact" | "written" | "persisted";
  sizeBytes: number;
  stepId?: number;
  toolName?: string;
  sha256?: string;
  format?: string;
  previewText?: string;
  downloadable: boolean;
  storageRoot?: StorageRootId;
  relPath?: string;
}

export interface TrialHarborWorkspace {
  verifierChecks: {
    scope?: string;
    checks?: Record<string, boolean>;
  } | null;
  verifierReward: Record<string, number> | null;
  verifierJudge: {
    status?: string;
    model?: string;
    rubric_version?: string;
    metrics?: Record<string, number>;
    assessment?: {
      dimensions?: Record<string, { score: number; max?: number; reason: string }>;
      serious_errors?: Record<string, { present: boolean; reason: string }>;
      summary?: string;
      limitations?: string[];
    };
    usage?: Record<string, any>;
    sources_sha256?: Record<string, string>;
  } | null;
  mountedSkills: string[];
  invokedSkills: string[];
  workFiles: AgentWorkspaceFile[];
  accessedInputs: Array<{ path: string; stepId: number; toolName: string }>;
  artifactsManifest: Array<Record<string, any>>;
  knowledgeIndexes: Array<{
    name: string;
    indexHash: string;
    mode: string;
    topK: number;
    embeddingModel: string;
  }>;
  lifecycleEvents: Array<Record<string, any>>;
}

export interface HarborTreeNode {
  name: string;
  relPath: string;
  kind: "dir" | "file";
  sizeBytes: number;
  ext: string;
  previewable: boolean;
  content?: string;
  downloadable: boolean;
  storageRoot: StorageRootId;
  scope: "task" | "config";
  roleLabel?: string;
  children?: HarborTreeNode[];
}

export interface HarborTaskPackage {
  id: string;
  title: string;
  rootPath: string;
  storageRoot: StorageRootId;
  environmentMode: string;
  artifactSource: string;
  tree: HarborTreeNode[];
}

export interface HarborWorkspaceData {
  generatedAt: string;
  taskPackages: HarborTaskPackage[];
  jobConfigs: HarborTreeNode[];
  storageRoots: StorageOverviewResponse["storageRoots"];
}

export interface ModeComparisonGroup {
  id: string;
  title: string;
  subtitle: string;
  taskName: string;
  metricName: string;
  unit: string;
  arms: Array<{
    arm: string;
    armLabel: string;
    value: number;
    delta: number | null;
    jobKey: string;
    sampleCount: number;
  }>;
}

export interface MultiArmSubtaskRow {
  task: string;
  label: string;
  static: number | null;
  vanilla: number | null;
  vanilla_cap: number | null;
}

export interface ExampleAgentPairRow {
  agent: string;
  model: string;
  baseScore: number | null;
  fullScore: number | null;
  delta: number | null;
  baseValid: boolean;
  fullValid: boolean;
  baseSteps: number | null;
  fullSteps: number | null;
  baseTools: number | null;
  fullTools: number | null;
  baseJobKey: string | null;
  fullJobKey: string | null;
  baseTrialPath: string | null;
  fullTrialPath: string | null;
}

export interface ResultsSummaryData {
  totalJobs: number;
  totalPlannedTrials: number;
  totalCompletedTrials: number;
  totalVerifiedTrials: number;
  completionRate: number;
  distinctTasks: string[];
  distinctAgents: string[];
  distinctModels: string[];
  modeComparisons: ModeComparisonGroup[];
  lawbenchMultiArm: MultiArmSubtaskRow[];
  plawbenchMultiArm: MultiArmSubtaskRow[];
  exampleCohortComparison: ExampleAgentPairRow[];
}

export interface StorageOverviewResponse {
  generatedAt: string;
  mode: "serve" | "static";
  storageRoots: Array<{
    id: StorageRootId;
    label: string;
    rootPath: string;
    jobCount: number;
    trialCount: number;
  }>;
  jobs: StoredJobRecord[];
  facets: {
    taskNames: string[];
    cohorts: string[];
    arms: Array<{ id: string; label: string }>;
    agents: string[];
    models: string[];
  };
  resultsSummary: ResultsSummaryData;
}

export interface TrialsPageResponse {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  items: StoredTrialIndexEntry[];
}

export interface CapabilitySkillItem {
  id: string;
  name: string;
  packId: string;
  packLabel: string;
  category: string;
  description: string;
  mountPath: string;
  repository: string | null;
  commit: string | null;
  upstreamPath: string | null;
  fileCount: number;
  files: string[];
  sizeBytes: number;
  previewMarkdown: string;
}

export interface CapabilitySkillPack {
  id: string;
  label: string;
  repository: string | null;
  commit: string | null;
  upstreamPath: string | null;
  skillCount: number;
}

export interface CapabilityKnowledgeCollection {
  id: string;
  domain: string;
  sourceId: string;
  indexHash: string;
  chunkCount: number;
  origin: "upstream_prebuilt" | "workspace_local";
  mode: string;
  embeddingModel: string;
  chunkTokens: number;
  overlapTokens: number;
  keywordCandidates: number;
  vectorCandidates: number;
  topK: number;
}

export interface CapabilityMcpToolParam {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  description: string;
}

export interface CapabilityMcpTool {
  name: string;
  kind: "tool" | "resource";
  signature: string;
  description: string;
  params: CapabilityMcpToolParam[];
  returns: string;
}

export interface CapabilityMcpServer {
  id: string;
  name: string;
  serverTitle: string;
  transports: string[];
  entrypoint: string;
  description: string;
  tools: CapabilityMcpTool[];
  yamlExample: string;
}

export interface CapabilityBuiltinTool {
  name: string;
  group: "knowledge" | "interactive" | "workspace";
  disableable: boolean;
  description: string;
}

export interface CapabilitiesCatalogData {
  generatedAt: string;
  summary: {
    totalSkills: number;
    legalSkills: number;
    officeSkills: number;
    prebuiltCollections: number;
    prebuiltChunks: number;
    localWorkspaceIndexes: number;
    mcpServers: number;
    mcpToolsAndResources: number;
    builtinTools: number;
  };
  skillPacks: CapabilitySkillPack[];
  skills: CapabilitySkillItem[];
  retrievalDefaults: {
    mode: string;
    embeddingModel: string;
    chunkTokens: number;
    overlapTokens: number;
    keywordCandidates: number;
    vectorCandidates: number;
    topK: number;
    chunkTokensByKind: Record<string, number>;
  };
  knowledgeCollections: CapabilityKnowledgeCollection[];
  mcpServers: CapabilityMcpServer[];
  builtinAgentTools: CapabilityBuiltinTool[];
}
