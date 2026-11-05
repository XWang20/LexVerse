# PLawBench Benchmark

In practical legal work, an assistant must handle three distinct tasks across a case's lifecycle: (1) asking neutral, verifiable intake questions during a **public legal consultation**, (2) decomposing a complex dispute into a structured **practical case analysis** (`【结论】`, `【案件事实】`, `【推理过程】`, `【法条依据】`), and (3) drafting a formal **civil complaint or statement of defense** from a party's raw narrative.

**PLawBench** (*A Rubric-Based Benchmark for Evaluating LLMs in Real-World Legal Practice*, [`SKYLENAGE-AI/PLawBench`](https://github.com/SKYLENAGE-AI/PLawBench)) evaluates LLMs across all three tasks using expert-annotated, case-specific rubrics rather than surface N-gram overlap.

---

## 1. Overview

- **Benchmark ID**: `plawbench`
- **Upstream Repository**: [`SKYLENAGE-AI/PLawBench`](https://github.com/SKYLENAGE-AI/PLawBench) (commit `f6ee07b36c1f4c0bfc2af8ca27183d3dd3175c56`)
- **Dataset**:
  - `public_legal_consultation_18.json` (18 consultation scenarios with point-weighted inquiry rubrics)
  - `practical_case_analysis_250.jsonl` (250 real-world case analysis questions with 4-part rubrics)
  - `Plantiffs_Statement.json` & `Defendants_Statement.json` (12 document drafting scenarios: 6 plaintiff complaints + 6 defendant statements of defense)
- **Tasks & Metrics**:
  - `legal_consultation` (Task 1): Outputs a numbered list of 10–25 follow-up questions; scored on `acc` (`total_points / max_points`) and `failed`.
  - `case_analysis` (Task 2): Outputs a four-section legal analysis; scored on overall `acc`, four sub-dimensions (`conclusion_acc`, `fact_acc`, `reasoning_acc`, `law_acc`), and `failed`.
  - `document_generation` (Task 3): Drafts a 2,500–3,000 character pleading; scored on `acc`, `failed`, and role subtypes (`plaintiff` and `defendant`).

---

## 2. How to Run

### 2.1 Installation

```bash
python -m pip install -e ".[plawbench,openai,test]"
lexverse task catalog plawbench
# Required for vanilla runs
lexverse setup
```

Vanilla runs also require a working Docker daemon and a model service that supports tool calling.

### 2.2 Configuration

Copy `configs/jobs/plawbench.yaml` to `configs/jobs/plawbench.local.yaml` and replace its contents with the example below. Configure the `tested` profile in `configs/secrets.local.yaml` for an OpenAI-compatible service serving `Qwen/Qwen3-4B-Instruct-2507`. PLawBench also needs a separate `judge` profile pointing to the scoring service. Judge choice affects scores; the `gpt-5.2` reference results below cannot be directly compared with this example.

```yaml
schema_version: '1.0'
benchmark:
  name: plawbench
  tasks:
  - id: case_analysis
  - id: legal_consultation
  default_limit: 20  # first 20 items per task; remove for the full selection
agents:
- name: static
models:
  default:
    provider: openai_compatible
    profile: tested
    name: Qwen/Qwen3-4B-Instruct-2507
    generation_parameters:
      temperature: 0
      max_tokens: 8192
  verifiers:
  - provider: openai_compatible
    profile: judge
    name: Qwen/Qwen3.8-27B
    generation_parameters:
      temperature: 0
      max_tokens: 16384
verification:
  concurrency: 4
  max_attempts: 3
environment:
  type: docker
generation:
  context_window_tokens: 65536
concurrency: 4
```

Without `benchmark.tasks`, all task types are selected. `default_limit` selects the first items in dataset order; it is a smoke test, not a random sample. The example selects case analysis and consultation. To evaluate document generation separately, replace `benchmark.tasks` with just `document_generation`; the selected Qwen judge has produced inconsistent document-generation totals, so those results need independent validation. Remove the limit for a full run. Each Job contains individual Trials, their answers and trajectories, and a verification report. The native report can exclude failed or unscored Trials; report scored and expected counts and apply an explicit failure policy when comparing Jobs.

For a capability-augmented run, copy this file to `configs/jobs/plawbench-cap.local.yaml`, set `agents: [{name: vanilla}]`, and download the resources first. For example, after `lexverse resources download indexes --collections legal_laws`, add:

```yaml
resources:
  knowledge:
  - collection:legal_laws
  # skills: list the directories containing SKILL.md, relative to this YAML
```

Hybrid retrieval also requires the `BAAI/bge-small-zh-v1.5` embedding model to be reachable or cached. To use skills, run `lexverse resources download skills`, then add each directory containing a `SKILL.md` under `resources.skills`; paths are relative to the YAML file. Select collections and skills for the experiment and check for overlap with evaluation data. Resource settings apply to agent runs, so keep the static configuration resource-free. See the [project README](../../../README.md) for resource preparation and [Job configuration](../../../configs/jobs/README.md) for path resolution.

### 2.3 Execution Commands

```bash
# Preview and run the resource-free static Job
lexverse run -c configs/jobs/plawbench.local.yaml --dry-run
lexverse run -c configs/jobs/plawbench.local.yaml --output-dir runs/plawbench-static

# Run the same resource-free configuration with vanilla in Docker
lexverse run -c configs/jobs/plawbench.local.yaml --agents vanilla --environment docker --output-dir runs/plawbench-vanilla

# Run the separately configured capability-augmented Job
lexverse run -c configs/jobs/plawbench-cap.local.yaml --output-dir runs/plawbench-vanilla-cap

# Resume, re-evaluate, or rebuild the Job report
lexverse job resume runs/plawbench-vanilla-cap
lexverse job verify runs/plawbench-vanilla-cap
lexverse job report runs/plawbench-vanilla-cap
```

---

## 3. Upstream Adaptation & Rationale

When inspecting the public [`SKYLENAGE-AI/PLawBench`](https://github.com/SKYLENAGE-AI/PLawBench) repository (`commit f6ee07b3`), we found two scripts (`prompt_generate.py` and `prompt_zh.py`) with hardcoded placeholder paths and unimplemented API stubs. LexVerse adapts them via `patches/001-inject-judge.patch` and `tasks.py`:

1. **AST Template Extraction & Rubric Isolation (`tasks.py`)**:
   - **Context**: Upstream `prompt_generate.py` executes top-level `open(PATH + "...")` file I/O using a literal placeholder `PATH = "your_path"`, and `public_legal_consultation_18.json` stores item rubrics in a field named `"rubrics"` without a pre-computed `"score"` field.
   - **Adaptation**: `PLawBenchImporter` extracts `prompt_template_dict` and `user_prompt_dict` from `prompt_generate.py` via `ast.parse` without executing top-level file I/O, computes the exact rubric point sum (`(+X分)`) for consultation items, interleaves `plaintiff` and `defendant` drafting items, and isolates the ground-truth rubrics strictly inside `evaluation`.
2. **Injectable Judge Callable & Strict Numeric Validation (`001-inject-judge.patch` & `evaluation.py`)**:
   - **Context**: In upstream `prompt_zh.py`, `call_llm_api(messages)` is an empty placeholder (`pass`) that returns `None`, and `_calculate_metrics` silently defaults missing `total_points` / `max_points` to `0` / `1`.
   - **Adaptation**: Our patch allows `LegalEvaluator` to accept a run-scoped judge callable (`LegalEvaluator(call_judge)`), and `validate_grading` verifies that all required rubric score fields (`total_points` and `max_points`, or all four sections in `case_analysis_merge`) are finite numbers before accepting a judge response.

---

## 4. Reference Results (`lexverse run`) & Implementation Notes

**Judge for the reference table: `gpt-5.2`. Judge for the full-data three-arm validation in Section 5: `Qwen/Qwen3.8-27B`.** The judge models differ, so their scores must be reported separately and cannot establish a directly comparable capability ranking.

The table below compares the scores obtained directly by running `python -m lexverse run plawbench` on two open-weight models from the official PLawBench leaderboard—**`Qwen/Qwen3-4B-Instruct-2507`** and **`Qwen/Qwen3-4B-Thinking-2507`** (run locally via `vllm` on an NVIDIA A100 GPU, evaluated with `gpt-5.2`)—against the official README ranking table (all scores in `%`):

| Model | Source | Overall | Task 2: Analysis (`acc`) | Task 2: Conclusion | Task 2: Facts | Task 2: Reasoning | Task 2: Statute | Task 1: Consultation (`acc`) | Task 3: Drafting (`acc`) | Task 3: Plaintiff | Task 3: Defendant |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| *DeepSeek-V3.2* | Paper Table | 57.97 | 64.01 | 65.56 | 82.89 | 61.64 | 43.27 | 60.12 | 46.48 | 44.43 | 48.52 |
| **`Qwen-4b-instruct-2507`** | **Paper Table** | **50.53** | **53.72** | **52.61** | **89.98** | **44.77** | **23.76** | **58.49** | **39.37** | **31.08** | **47.66** |
| | **`lexverse run plawbench` (Full 280)** | **52.34** | **51.39** | **45.29** | **91.19** | **38.31** | **24.43** | **65.17** | **40.46** | **34.28** | **46.65** |
| **`Qwen-4b-thinking-2507`** | **Paper Table** | **44.80** | **52.70** | **56.61** | **89.97** | **45.97** | **26.73** | **41.88** | **39.83** | **30.22** | **49.44** |
| | **`lexverse run plawbench` (Full 280)** | **45.10** | **46.75** | **47.45** | **82.43** | **34.78** | **20.35** | **50.09** | **38.45** | **40.00** | **36.90** |

### Implementation & Protocol Notes

- **Judge Model Selection (`gpt-5.2`)**: Because upstream `prompt_zh.py` leaves `call_llm_api()` unimplemented, the judge model must be configured via `models.verifiers[0]`. Using `gpt-5.2` as the rubric evaluator over all **280 public items** (`250` `case_analysis` + `18` `legal_consultation` + `12` `document_generation`) reproduces the paper's overall and sub-dimension scores closely (`52.34` vs. `50.53` overall for `Qwen3-4B-Instruct-2507`, and `45.10` vs. `44.80` overall for `Qwen3-4B-Thinking-2507`, preserving the exact relative ordering across all tasks and sub-dimensions).
- **Public Consultation Split (`public_legal_consultation_18.json`)**: Upstream `prompt_generate.py` assigns `level = "mid"` to the first 50 items and `"hard"` thereafter; because the public repository releases 18 consultation items, all 18 items use the `legal_consultation_mid` prompt (10–25 questions).

## 5. Full-Data Three-Arm Validation (2026-11-05)

This validation covers `static`, resource-free `vanilla`, and `vanilla` with knowledge and skills. The tested model is **`Qwen/Qwen3.8-27B`**, with `temperature: 0`, `max_tokens: 8192`, and `chat_template_kwargs.enable_thinking: false`. Static calls the model service directly; the two vanilla arms use a compatibility bridge that restores tool calls from the service's output. Vanilla runs use the Local environment, with context windows of 32,768 tokens without resources and 65,536 with resources. The augmented arm uses the same 13 knowledge indexes and 38 skills as the preceding pilot. The corrected validation configuration uses 8 model calls (including summary and final-answer calls), 16 tool calls, and 900 seconds of active execution per trial. The aggregate generation budgets are 16 concurrent static trials, 8 resource-free vanilla trials, and 8 augmented vanilla trials. Generation and scoring are independently scheduled: after PLawBench generation, LawBench and LexEval generation can run together, splitting each arm's budget into 8/4/4 trials per Job. PLawBench scoring uses concurrency 4 per Job, with up to two scoring Jobs in parallel; deterministic native scoring has its own queue. A completed generation Job does not wait for its scoring before later benchmarks start. The initial unguarded 30-call and 8-call batches are retained as separate diagnostics. Corrected Jobs use a new frozen source snapshot and do not merge earlier answers into their scores.

Both vanilla benchmark arms use the same budget-aware answering controller. For knowledge-augmented runs, successful identical searches are cached within each trial, and two consecutive cache hits with no new tool result end retrieval. Approaching the model/tool budget or time limit also starts a separate answering request using the original task messages and deduplicated evidence, without the prior tool-action history or available tools. Space is kept for a possible summary and the final-answer call. This adds a final-answer instruction; the original task and shared system preamble are unchanged. Invalid or empty final answers remain failures. Execution completion is not a claim of legal correctness.

The source and configuration are frozen for all three arms. Task prompts and the shared system preamble are unchanged in this validation; the current knowledge-tool descriptions include readable source names. Run manifests retain source/configuration hashes and the exact selected resources. This is an engineering validation of the current setup; resource overlap with the evaluation data has not been independently ruled out.

**Scope: all 280 public items (250 case analysis, 18 legal consultation, and 12 document generation), in each arm. Judge model: `Qwen/Qwen3.8-27B`, with `temperature: 0`, `max_tokens: 16384`, and `verification.max_attempts: 3`. Judge thinking is not explicitly disabled; it follows the service default. Scoring concurrency is 4.** This judge differs from the **`gpt-5.2` judge used in Section 4**, so these scores are not directly comparable with that reference table. The tested model and judge are both 27B here; self-grading bias and malformed or arithmetically inconsistent judge output are recorded as limitations, not silently corrected.

The full-data run is in progress; no full-data score is claimed here. Report planned and completed executions, execution failures, scored items, and scoring failures together with each score. The earlier 20-case pilot is a separate diagnostic and must not be labeled as a full-data result. Any average over scored items must be accompanied by its denominator; failed or unscored items must not silently disappear from a comparison.
