# LexEval Benchmark

To evaluate legal large language models systematically across the full spectrum of legal cognition, **LexEval** (*A Comprehensive Chinese Legal Benchmark for Evaluating Large Language Models*, NeurIPS 2024 Datasets and Benchmarks Track, [arXiv:2409.20288](https://arxiv.org/abs/2409.20288)) introduces the **LexAbility Taxonomy**, organizing **23 legal tasks (14,150 questions)** into six cognitive ability levels: **Memorization (`1_1`–`1_3`)**, **Understanding (`2_1`–`2_5`)**, **Logic Inference (`3_1`–`3_6`)**, **Discrimination (`4_1`–`4_2`)**, **Generation (`5_1`–`5_4`)**, and **Ethics (`6_1`–`6_3`)**.

---

## 1. Overview

- **Benchmark ID**: `lexeval`
- **Upstream Repository**: [`CSHaitao/LexEval`](https://github.com/CSHaitao/LexEval) (commit `044c695f62894deef41ad9a30797e1da0404945c`)
- **Dataset**: [`CSHaitao/LexEval`](https://huggingface.co/datasets/CSHaitao/LexEval) (**23 tasks, 14,150 samples in total**)
- **Task Taxonomy & Metrics**:
  - **1. Memorization (`1_1`–`1_3`, Accuracy)**: `1_1` (*Concept Recitation*, 500), `1_2` (*Law Article Recitation*, 1,000), `1_3` (*Legal Knowledge QA*, 300)
  - **2. Understanding (`2_1`–`2_5`, Accuracy)**: `2_1` (*Document Proofreading*, 500), `2_2` (*Dispute Focus Identification*, 300), `2_3` (*Event Detection*, 100), `2_4` (*Trigger Extraction*, 500), `2_5` (*Reading Comprehension*, 500)
  - **3. Logic Inference (`3_1`–`3_6`, Accuracy)**: `3_1` (*Fact-based Article Prediction*, 1,000), `3_2` (*Scene-based Article Prediction*, 1,000), `3_3` (*Charge Prediction*, 1,000), `3_4` (*Prison Term Prediction*, 500), `3_5` (*Damages Calculation*, 400), `3_6` (*Case Analysis*, 500)
  - **4. Discrimination (`4_1`–`4_2`, Accuracy)**: `4_1` (*Case Element Matching*, 500), `4_2` (*Similar Case Matching*, 300)
  - **5. Generation (`5_1`–`5_4`, ROUGE-L)**: `5_1` (*Opinion Summarization*, 1,000), `5_2` (*Court View Generation*, 1,000), `5_3` (*Consultation*, 250), `5_4` (*Contract Generation*, 500)
  - **6. Ethics (`6_1`–`6_3`, Accuracy)**: `6_1` (*Legal Ethics*, 1,000), `6_2` (*Privacy Protection*, 1,000), `6_3` (*Fairness & Bias*, 500)

---

## 2. How to Run

### 2.1 Installation

```bash
python -m pip install -e ".[lexeval,openai,test]"
lexverse task catalog lexeval
# Required for vanilla runs
lexverse setup
```

Vanilla runs also require a working Docker daemon and a model service that supports tool calling.

### 2.2 Configuration

Copy `configs/jobs/lexeval.yaml` to `configs/jobs/lexeval.local.yaml` and replace its contents with the example below. Configure the `tested` profile in `configs/secrets.local.yaml` for an OpenAI-compatible service serving `Qwen/Qwen3-4B-Instruct-2507`.

```yaml
schema_version: '1.0'
benchmark:
  name: lexeval
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
      max_tokens: 2048
environment:
  type: docker
generation:
  context_window_tokens: 65536
concurrency: 4
```

Without `benchmark.tasks`, all task types are selected. `default_limit` selects the first items in dataset order; it is a smoke test, not a random sample. Remove the limit for a full run. Each Job contains individual Trials, their answers and trajectories, and a verification report. The native report can exclude failed or unscored Trials; report scored and expected counts and apply an explicit failure policy when comparing Jobs.

For a capability-augmented run, copy this file to `configs/jobs/lexeval-cap.local.yaml`, set `agents: [{name: vanilla}]`, and download the resources first. For example, after `lexverse resources download indexes --collections legal_laws`, add:

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
lexverse run -c configs/jobs/lexeval.local.yaml --dry-run
lexverse run -c configs/jobs/lexeval.local.yaml --output-dir runs/lexeval-static

# Run the same resource-free configuration with vanilla in Docker
lexverse run -c configs/jobs/lexeval.local.yaml --agents vanilla --environment docker --output-dir runs/lexeval-vanilla

# Run the separately configured capability-augmented Job
lexverse run -c configs/jobs/lexeval-cap.local.yaml --output-dir runs/lexeval-vanilla-cap

# Resume, re-evaluate, or rebuild the Job report
lexverse job resume runs/lexeval-vanilla-cap
lexverse job verify runs/lexeval-vanilla-cap
lexverse job report runs/lexeval-vanilla-cap
```

---

## 3. Upstream Adaptation & Rationale

LexVerse executes the native `code/evaluation/evaluate.py` evaluator and `code/generation/model_gen.py` loader from `CSHaitao/LexEval` via three targeted patches (`patches/001..003`):

1. **Lazy Heavy Imports in `evaluate.py` and `model_gen.py` (`001-defer-heavy-imports.patch` & `002-defer-vllm-import.patch`)**:
   - **Context**: Upstream `code/evaluation/evaluate.py` and `code/generation/model_gen.py` eagerly import `torch`, `transformers`, `bert_score`, `pandas`, `rouge`, and `vllm` at module import time even when only running multiple-choice accuracy or API-based generation.
   - **Adaptation**: Moves optional heavy imports inside the methods that actually use them (`get_rouge_l`, `get_bert_score`, `get_bart_score`, `init_model_vllm`).
2. **Blank-Line Tolerance in JSONL Task Files (`003-skip-blank-lines.patch`)**:
   - **Context**: Upstream `code/generation/model_gen.py` calls `json.loads(line)` on every line in `data/*.json`, which raises `JSONDecodeError` on trailing blank lines.
   - **Adaptation**: Skips empty lines (`if not line.strip(): continue`) when loading task records.

---

## 4. Reference Results (`lexverse run`) & Implementation Notes

The reference tables in this section use `Qwen/Qwen-7B-Chat`. The full-data three-arm validation described in Section 5 uses `Qwen/Qwen3.8-27B` and must be reported separately.

The tables below report the full **14,150-sample (23 tasks)** zero-shot evaluation of the open-source model **`Qwen/Qwen-7B-Chat`** (run locally via `vllm` on an NVIDIA A100 GPU), alongside the reference numbers from Table 3 of the LexEval paper ([arXiv:2409.20288](https://arxiv.org/abs/2409.20288), all scores in `%`):

### 4.1 Category Summary (`Qwen/Qwen-7B-Chat`, Zero-Shot, 14,150 Samples)

| Model | Source | Memorization (`1_1–1_3`) | Understanding (`2_1–2_5`) | Logic Inference (`3_1–3_6`) | Discrimination (`4_1–4_2`) | Generation (`5_1–5_4`) | Ethics (`6_1–6_3`) | **Overall Average (23 Tasks)** |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| *GPT-4* | Paper Table 3 | 31.13 | 75.56 | 56.55 | 25.45 | 28.08 | 49.40 | 48.77 |
| *Qwen-14B-Chat* | Paper Table 3 | 29.73 | 81.20 | 61.97 | 42.10 | 26.83 | 49.60 | 52.49 |
| **`Qwen-7B-Chat`** | **Paper Table 3** | **23.37** | **73.86** | **53.63** | **24.80** | **25.70** | **39.27** | **45.17** *(44.80)* |
| | **`lexverse run lexeval` (Full 14,150)** | **23.18** | **74.19** | **53.74** | **24.50** | **27.74** | **39.37** | **45.26** |

### 4.2 Per-Task Breakdown (`Qwen/Qwen-7B-Chat`, All 23 Tasks / 14,150 Samples)

| Task ID | Task Name | Samples | Metric | Upstream Reference (`Qwen_7B_chat`) | **`lexverse run lexeval` (Full 14,150)** | Diff |
| :---: | :--- | ---: | :---: | ---: | ---: | ---: |
| `1_1` | Concept Recitation | 500 | Accuracy | 21.80 | **22.40** | +0.60 |
| `1_2` | Law Article Recitation | 1,000 | Accuracy | 40.30 | **38.80** | -1.50 |
| `1_3` | Legal Knowledge QA | 300 | Accuracy | 8.00 | **8.33** | +0.33 |
| `2_1` | Document Proofreading | 500 | Accuracy | 80.20 | **79.80** | -0.40 |
| `2_2` | Dispute Focus Identification | 300 | Accuracy | 42.33 | **43.33** | +1.00 |
| `2_3` | Event Detection | 100 | Accuracy | 87.00 | **88.00** | +1.00 |
| `2_4` | Trigger Extraction | 500 | Accuracy | 67.60 | **67.20** | -0.40 |
| `2_5` | Reading Comprehension | 500 | Accuracy | 92.20 | **92.60** | +0.40 |
| `3_1` | Fact-based Article Prediction | 1,000 | Accuracy | 78.60 | **79.10** | +0.50 |
| `3_2` | Scene-based Article Prediction | 1,000 | Accuracy | 84.30 | **84.10** | -0.20 |
| `3_3` | Charge Prediction | 1,000 | Accuracy | 53.60 | **53.20** | -0.40 |
| `3_4` | Prison Term Prediction | 500 | Accuracy | 23.80 | **24.60** | +0.80 |
| `3_5` | Damages Calculation | 400 | Accuracy | 36.25 | **36.25** | 0.00 |
| `3_6` | Case Analysis | 500 | Accuracy | 45.20 | **45.20** | 0.00 |
| `4_1` | Case Element Matching | 500 | Accuracy | 19.60 | **20.00** | +0.40 |
| `4_2` | Similar Case Matching | 300 | Accuracy | 30.00 | **29.00** | -1.00 |
| `5_1` | Opinion Summarization | 1,000 | ROUGE-L | 32.02 | **34.09** | +2.07 |
| `5_2` | Court View Generation | 1,000 | ROUGE-L | 17.64 | **18.66** | +1.02 |
| `5_3` | Consultation | 250 | ROUGE-L | 31.69 | **35.48** | +3.79 |
| `5_4` | Contract Generation | 500 | ROUGE-L | 21.46 | **22.74** | +1.28 |
| `6_1` | Legal Ethics | 1,000 | Accuracy | 22.10 | **22.10** | 0.00 |
| `6_2` | Privacy Protection | 1,000 | Accuracy | 39.70 | **39.20** | -0.50 |
| `6_3` | Fairness & Bias | 500 | Accuracy | 56.00 | **56.80** | +0.80 |
| **All** | **23-Task Macro Average (14,150 Samples)** | **14,150** | **Mean** | **45.17** | **45.26** | **+0.09** |

### Implementation & Protocol Notes

- **Full-Dataset Reproduction (`45.26` vs. `45.17`, `+0.09` Overall Difference)**: Across all 14,150 questions in the 23 LexEval tasks, `python -m lexverse run lexeval` with `Qwen/Qwen-7B-Chat` matches the upstream `Qwen_7B_chat` reference outputs within `0.09–0.33` points on all five multiple-choice categories (`Memorization: 23.18 vs. 23.37`, `Understanding: 74.19 vs. 73.86`, `Logic Inference: 53.74 vs. 53.63`, `Discrimination: 24.50 vs. 24.80`, `Ethics: 39.37 vs. 39.27`) and achieves `+0.09` overall macro-average parity (`45.26` vs. `45.17`).
- **Context Window Handling (`max_model_len: 8192`)**: In upstream `code/generation/Qwen_gen.py`, prompts exceeding `max_Length = 3500` characters are middle-truncated (`half = int(max_Length / 2)`). In LexVerse, `LocalBackend` applies token-level head+tail middle truncation only when a prompt plus `max_tokens` exceeds the 8,192-token model context window (`11` ultra-long case documents in `3_2`, `4_1`, and `5_4`), preserving full case context on `99.92%` of the benchmark.

## 5. Full-Data Three-Arm Validation (2026-11-05)

This validation covers `static`, resource-free `vanilla`, and `vanilla` with knowledge and skills. The tested model is **`Qwen/Qwen3.8-27B`**, with `temperature: 0`, `max_tokens: 8192`, and `chat_template_kwargs.enable_thinking: false`. Static calls the model service directly; the two vanilla arms use a compatibility bridge that restores tool calls from the service's output. Vanilla runs use the Local environment, with context windows of 32,768 tokens without resources and 65,536 with resources. The augmented arm uses the same 13 knowledge indexes and 38 skills as the preceding pilot. The corrected validation configuration uses 8 model calls (including summary and final-answer calls), 16 tool calls, and 900 seconds of active execution per trial. The aggregate generation budgets are 16 concurrent static trials, 8 resource-free vanilla trials, and 8 augmented vanilla trials. Generation and scoring are independently scheduled: after PLawBench generation, LawBench and LexEval generation can run together, splitting each arm's budget into 8/4/4 trials per Job. PLawBench scoring uses concurrency 4 per Job, with up to two scoring Jobs in parallel; deterministic native scoring has its own queue. A completed generation Job does not wait for its scoring before later benchmarks start. The initial unguarded 30-call and 8-call batches are retained as separate diagnostics. Corrected Jobs use a new frozen source snapshot and do not merge earlier answers into their scores.

Both vanilla benchmark arms use the same budget-aware answering controller. For knowledge-augmented runs, successful identical searches are cached within each trial, and two consecutive cache hits with no new tool result end retrieval. Approaching the model/tool budget or time limit also starts a separate answering request using the original task messages and deduplicated evidence, without the prior tool-action history or available tools. Space is kept for a possible summary and the final-answer call. This adds a final-answer instruction; the original task and shared system preamble are unchanged. Invalid or empty final answers remain failures. Execution completion is not a claim of legal correctness.

The source and configuration are frozen for all three arms. Task prompts and the shared system preamble are unchanged in this validation; the current knowledge-tool descriptions include readable source names. Run manifests retain source/configuration hashes and the exact selected resources. This is an engineering validation of the current setup; resource overlap with the evaluation data has not been independently ruled out.

**Scope: all 14,150 items across 23 task types, zero-shot, in each arm. Judge model: none (native deterministic scoring).** Accuracy and ROUGE-L are computed by the native scorer. This differs from PLawBench, whose rubric is graded by an LLM. The tested model also differs from the `Qwen/Qwen-7B-Chat` reference table in Section 4.

The full-data run is in progress; no full-data score is claimed here. Report planned and completed executions, execution failures, scored items, and scoring failures together with each score. The earlier 20-case pilot is a separate diagnostic and must not be labeled as a full-data result. Any average over scored items must be accompanied by its denominator; failed or unscored items must not silently disappear from a comparison.
