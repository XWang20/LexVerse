export type RuntimeMode = "serve" | "static";

export interface BenchmarkEntry {
  id: string;
  name: string;
  category: string;
  coverage: string;
  samples: number;
  executionModes: ("Static" | "Vanilla" | "External" | "Native")[];
  metricName: string;
  repoUrl: string;
}

export const LAWBENCH_TASK_NAMES: Record<string, string> = {
  "1-1": "Article Recitation",
  "1-2": "Knowledge Q&A",
  "2-1": "Document Proofreading",
  "2-2": "Dispute Focus ID",
  "2-3": "Marital Disputes ID",
  "2-4": "Issue Topic ID",
  "2-5": "Reading Comprehension",
  "2-6": "Named Entity Recognition",
  "2-7": "Opinion Summarization",
  "2-8": "Argument Mining",
  "2-9": "Event Detection",
  "2-10": "Trigger Word Extraction",
  "3-1": "Fact-based Article Pred.",
  "3-2": "Scene-based Article Pred.",
  "3-3": "Charge Prediction",
  "3-4": "Prison Term (w/o Article)",
  "3-5": "Prison Term (w/ Article)",
  "3-6": "Case Analysis",
  "3-7": "Criminal Damages Calc.",
  "3-8": "Legal Consultation",
};

export const PLAWBENCH_TASK_NAMES: Record<string, string> = {
  case_analysis: "Practical Case Analysis (250)",
  legal_consultation: "Public Legal Consultation (18)",
  document_generation: "Civil Complaint & Defense Drafting (12)",
};

export const BENCHMARK_TASK_NAMES: Record<string, Record<string, string>> = {
  lawbench: LAWBENCH_TASK_NAMES,
  plawbench: PLAWBENCH_TASK_NAMES,
  j1bench: {
    CI: "Case Inquiry",
    CR: "Case Retrieval",
    KQ: "Knowledge Q&A",
    LC: "Legal Consultation",
    CD: "Case Decision",
    DD: "Document Drafting",
  },
  dlawbench: {
    P_WD: "Persona: Weakly Defined",
    P_WS: "Persona: Well Specified",
    P_CS: "Persona: Cooperative Skeptic",
    P_CD: "Persona: Conflicting Details",
  },
  legalworld: {
    LC: "Legal Consultation",
    DRAFT: "Complaint Drafting",
    CI: "Courtroom Investigation",
    SD: "Structured Debate",
    APPEAL_DRAFT: "Appeal Drafting",
    CIA: "Appellate Investigation",
  },
  simucourt: {
    first_criminal: "1st Instance Criminal",
    first_civil: "1st Instance Civil",
    first_administrative: "1st Instance Administrative",
    second_criminal: "2nd Instance Criminal",
    second_civil: "2nd Instance Civil",
    second_administrative: "2nd Instance Administrative",
  },
  maser: {
    complaint_generation: "Multi-Agent Consultation & Complaint",
  },
  lecardv2: {
    case_retrieval: "Precedent Retrieval (55,192 Supreme Court Cases)",
  },
};

export const BENCHMARKS: BenchmarkEntry[] = [
  {
    id: "lawbench",
    name: "LawBench",
    category: "Knowledge & Application",
    coverage: "20 legal task types (memorization, understanding, application)",
    samples: 10000,
    executionModes: ["Static", "Vanilla", "External"],
    metricName: "20-Task Macro Avg (%)",
    repoUrl: "https://github.com/open-compass/LawBench",
  },
  {
    id: "plawbench",
    name: "PLawBench",
    category: "Practical Legal Tasks",
    coverage: "Case analysis (250), consultation (18), drafting (12)",
    samples: 280,
    executionModes: ["Static", "Vanilla", "External"],
    metricName: "Weighted Overall (%)",
    repoUrl: "https://github.com/SKYLENAGE-AI/PLawBench",
  },
  {
    id: "lexeval",
    name: "LexEval",
    category: "Cognitive Legal Taxonomy",
    coverage: "23 cognitive legal tasks across 6 dimensions",
    samples: 14150,
    executionModes: ["Static", "Vanilla", "External"],
    metricName: "23-Task Macro Avg (%)",
    repoUrl: "https://github.com/CSHaitao/LexEval",
  },
  {
    id: "j1bench",
    name: "J1Bench",
    category: "Judicial Reasoning",
    coverage: "6 scenarios (CI, CR, KQ, LC, CD, DD) · 16 metrics",
    samples: 508,
    executionModes: ["Native"],
    metricName: "Positive Mean (%)",
    repoUrl: "https://github.com/FudanDISC/J1Bench",
  },
  {
    id: "legalworld",
    name: "Legal-world",
    category: "Litigation Lifecycle",
    coverage: "Plaintiff & Defendant multi-stage simulation (LC → CIA)",
    samples: 120,
    executionModes: ["Native"],
    metricName: "5-Stage Weighted (%)",
    repoUrl: "https://github.com/sii-research/Legal-world",
  },
  {
    id: "maser",
    name: "MASER (MILE)",
    category: "Multi-Agent Complaint",
    coverage: "Interactive client consultation & complaint generation",
    samples: 693,
    executionModes: ["Native"],
    metricName: "0.5×G_AVE + 0.5×I_AVE (%)",
    repoUrl: "https://github.com/FudanDISC/MASER",
  },
  {
    id: "simucourt",
    name: "AgentsCourt",
    category: "Courtroom Trial",
    coverage: "Criminal, civil & administrative 1st/2nd instance trials",
    samples: 180,
    executionModes: ["Native"],
    metricName: "Normalized 5-Metric F1 (%)",
    repoUrl: "https://github.com/Zhitao-He/AgentsCourt",
  },
  {
    id: "dlawbench",
    name: "DLawBench",
    category: "Dynamic Consultation",
    coverage: "60 cases × 4 client personas (P_WD, P_WS, P_CS, P_CD)",
    samples: 240,
    executionModes: ["Native"],
    metricName: "Fidelity / Resolution (%)",
    repoUrl: "https://github.com/SKYLENAGE-AI/DLawBench",
  },
  {
    id: "lecardv2",
    name: "LeCaRDv2",
    category: "Precedent Retrieval",
    coverage: "160 queries over 55,192 Supreme Court cases",
    samples: 160,
    executionModes: ["Static"],
    metricName: "NDCG@10 (%)",
    repoUrl: "https://github.com/THUIR/LeCaRDv2",
  },
];

export interface JobRunRecord {
  id: string;
  name: string;
  sourceKind: "benchmark" | "user";
  target: string;
  agent: string;
  model: string;
  capabilities: string[];
  status: "completed" | "running" | "incomplete";
  verificationStatus: "completed" | "not_configured" | "pending";
  completedTrials: number;
  plannedTrials: number;
  scoreText: string;
  createdAt: string;
  cliCommand: string;
}

export const INITIAL_RUNS: JobRunRecord[] = [];
