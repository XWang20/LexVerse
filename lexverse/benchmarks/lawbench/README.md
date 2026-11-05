# LawBench Benchmark

To assist reliably in Chinese legal practice, a large language model must progress through three cognitive levels derived from Bloom's taxonomy: **Legal Knowledge Memorization** (recalling statutory articles and basic legal facts), **Legal Knowledge Understanding** (extracting entities, issues, marital/contractual triggers, and reading comprehension from case narratives), and **Legal Knowledge Application** (predicting charges, applicable articles, prison terms, civil damages, and consultative answers from real-world facts).

**LawBench** (*Benchmarking Legal Knowledge of Large Language Models*, [arXiv:2309.16289](https://arxiv.org/abs/2309.16289)) evaluates LLMs across **20 tasks (500 samples per task, 10,000 samples in total)** spanning these three cognitive dimensions under both zero-shot (`zero_shot`) and one-shot (`one_shot`) settings.

---

## 1. Overview

- **Benchmark ID**: `lawbench`
- **Upstream Repository**: [`open-compass/LawBench`](https://github.com/open-compass/LawBench) (commit `e30981bb3ff54c41571f222e0b23e92d27375388`)
- **Dataset**: `data/zero_shot/*.json` & `data/one_shot/*.json` (**20 tasks × 500 samples = 10,000 samples**)
- **Task Taxonomy & Metrics**:
  - **1. Legal Knowledge Memorization (`1-1` to `1-2`)**:
    - `1-1` (*Article Recitation*, ROUGE-L)
    - `1-2` (*Knowledge Question Answering*, Accuracy)
  - **2. Legal Knowledge Understanding (`2-1` to `2-10`)**:
    - `2-1` (*Document Proofreading*, F0.5), `2-2` (*Dispute Focus Identification*, F1), `2-3` (*Marital Disputes Identification*, F1), `2-4` (*Issue Topic Identification*, ROUGE-L), `2-5` (*Reading Comprehension*, rc-F1), `2-6` (*Named Entity Recognition*, soft-F1), `2-7` (*Opinion Summarization*, ROUGE-L), `2-8` (*Argument Mining*, Accuracy), `2-9` (*Event Detection*, F1), `2-10` (*Trigger Word Extraction*, soft-F1)
  - **3. Legal Knowledge Application (`3-1` to `3-8`)**:
    - `3-1` (*Fact-based Article Prediction*, F1), `3-2` (*Scene-based Article Prediction*, ROUGE-L), `3-3` (*Charge Prediction*, F1), `3-4` (*Prison Term Prediction w/o Article*, Normalized Log Distance), `3-5` (*Prison Term Prediction w/ Article*, Normalized Log Distance), `3-6` (*Case Analysis*, Accuracy), `3-7` (*Criminal Damages Calculation*, Accuracy), `3-8` (*Consultation*, ROUGE-L)

---

## 2. How to Run

### 2.1 Installation

```bash
python -m pip install -e ".[lawbench,openai,test]"
lexverse task catalog lawbench
# Required for vanilla runs
lexverse setup
```

Vanilla runs also require a working Docker daemon and a model service that supports tool calling.

### 2.2 Configuration

Copy `configs/jobs/lawbench.yaml` to `configs/jobs/lawbench.local.yaml` and replace its contents with the example below. Configure the `tested` profile in `configs/secrets.local.yaml` for an OpenAI-compatible service serving `Qwen/Qwen3-4B-Instruct-2507`.

```yaml
schema_version: '1.0'
benchmark:
  name: lawbench
  shot: zero_shot
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

For a capability-augmented run, copy this file to `configs/jobs/lawbench-cap.local.yaml`, set `agents: [{name: vanilla}]`, and download the resources first. For example, after `lexverse resources download indexes --collections legal_laws`, add:

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
lexverse run -c configs/jobs/lawbench.local.yaml --dry-run
lexverse run -c configs/jobs/lawbench.local.yaml --output-dir runs/lawbench-static

# Run the same resource-free configuration with vanilla in Docker
lexverse run -c configs/jobs/lawbench.local.yaml --agents vanilla --environment docker --output-dir runs/lawbench-vanilla

# Run the separately configured capability-augmented Job
lexverse run -c configs/jobs/lawbench-cap.local.yaml --output-dir runs/lawbench-vanilla-cap

# Resume, re-evaluate, or rebuild the Job report
lexverse job resume runs/lawbench-vanilla-cap
lexverse job verify runs/lawbench-vanilla-cap
lexverse job report runs/lawbench-vanilla-cap
```

---

## 3. Upstream Adaptation & Rationale

LexVerse executes the native `evaluation/evaluation_functions/*.py` modules from `open-compass/LawBench` with two targeted patches (`patches/001..002`):

1. **Lazy `rouge_chinese` Import (`001-optional-rouge-chinese.patch`)**:
   - **Context**: Upstream `evaluation/utils/function_utils.py` imports `from rouge_chinese import Rouge` at the top level even when running non-ROUGE tasks.
   - **Adaptation**: Moves the `rouge_chinese` import inside `compute_rouge(hyps, refs)` with an actionable `ImportError` message.
2. **Thread-Safe & Relocatable `wsjd.py` Execution (`002-wsjd-relocatable.patch`)**:
   - **Context**: Upstream `evaluation/evaluation_functions/wsjd.py` (`2-1` Document Proofreading) calls `os.chdir('utils')`, writes fixed filenames (`tmp_pred.para`, `tmp_gold.para`) in the current directory, and shells out to `python3 parallel_to_m2.py`.
   - **Adaptation**: Resolves `evaluation/utils` relative to `__file__`, writes ChERRANT intermediate files inside an isolated `tempfile.TemporaryDirectory`, and invokes `sys.executable` with `cwd=utils_dir` without mutating the process working directory.
3. **Legacy `Qwen-7B-Chat` ChatML Stop Tokens & Middle Truncation (`lexverse/providers/local.py`)**:
   - **Context**: First-generation `Qwen-7B-Chat` uses a custom `tiktoken` vocabulary without a Jinja `chat_template`; its ChatML turn terminator `<|im_end|>` (`151645`) differs from `eos_token_id` (`<|endoftext|>` = `151643`), and a handful of long legal case documents exceed the 8,192-token context window.
   - **Adaptation**: `LocalBackend` passes `stop_token_ids=[im_end_id, im_start_id, eod_id]` to `vllm.SamplingParams` and applies head+tail middle truncation when a prompt plus `max_tokens` exceeds `context_limit`.

---

## 4. Reference Results (`lexverse run`) & Implementation Notes

The reference tables in this section use `Qwen/Qwen-7B-Chat`. The full-data three-arm validation described in Section 5 uses `Qwen/Qwen3.8-27B` and must be reported separately.

The tables below report the full **10,000-sample (20 tasks × 500 samples)** zero-shot evaluation of the open-source model **`Qwen/Qwen-7B-Chat`** (run locally via `vllm` on an NVIDIA A100 GPU), alongside the reference numbers from the LawBench paper ([arXiv:2309.16289](https://arxiv.org/abs/2309.16289), all scores in `%`):

### 4.1 Category Summary (`Qwen/Qwen-7B-Chat`, Zero-Shot, 10,000 Samples)

| Model | Source | Memorization (`1-1..1-2`) | Understanding (`2-1..2-10`) | Application (`3-1..3-8`) | **Overall Average (20 Tasks)** |
| :--- | :--- | ---: | ---: | ---: | ---: |
| *GPT-4* | Paper Table | 54.02 | 64.26 | 62.65 | 62.59 |
| *ChatGPT (`gpt-3.5-turbo`)* | Paper Table | 36.17 | 50.65 | 51.63 | 49.59 |
| *InternLM-Chat-20B* | Paper Table | 31.12 | 38.68 | 46.12 | 40.90 |
| **`Qwen-7B-Chat`** | **Paper Table** | **26.27** | **32.65** | **45.11** | **37.00** |
| | **`lexverse run lawbench` (Full 10,000)** | **29.66** | **36.21** | **49.95** | **41.05** |

### 4.2 Per-Task Breakdown (`Qwen/Qwen-7B-Chat`, 20 Tasks × 500 Samples)

| Task ID | Task Name | Metric | Paper (`Qwen-7B-Chat`) | **`lexverse run lawbench` (500/task)** | Abstention Rate |
| :---: | :--- | :---: | ---: | ---: | ---: |
| `1-1` | Article Recitation | ROUGE-L | 18.54 | **19.93** | 0.00% |
| `1-2` | Knowledge Question Answering | Accuracy | 34.00 | **39.40** | 0.20% |
| `2-1` | Document Proofreading | F0.5 | 15.27 | **16.67** | 0.00% |
| `2-2` | Dispute Focus Identification | F1 | 27.93 | **32.40** | 22.60% |
| `2-3` | Marital Disputes Identification | F1 | 35.98 | **35.38** | 11.80% |
| `2-4` | Issue Topic Identification | ROUGE-L | 28.48 | **32.00** | 14.00% |
| `2-5` | Reading Comprehension | rc-F1 | 44.33 | **48.84** | 0.00% |
| `2-6` | Named Entity Recognition | soft-F1 | 51.83 | **66.69** | 0.00% |
| `2-7` | Opinion Summarization | ROUGE-L | 34.03 | **38.28** | 0.00% |
| `2-8` | Argument Mining | Accuracy | 24.80 | **26.80** | 0.00% |
| `2-9` | Event Detection | F1 | 44.88 | **44.93** | 10.20% |
| `2-10` | Trigger Word Extraction | soft-F1 | 18.90 | **20.07** | 0.00% |
| `3-1` | Fact-based Article Prediction | F1 | 40.91 | **59.63** | 3.00% |
| `3-2` | Scene-based Article Prediction | ROUGE-L | 27.60 | **32.86** | 0.00% |
| `3-3` | Charge Prediction | F1 | 40.66 | **45.09** | 21.20% |
| `3-4` | Prison Term Prediction (w/o Article) | Norm. Log Dist. | 79.66 | **81.73** | 2.60% |
| `3-5` | Prison Term Prediction (w/ Article) | Norm. Log Dist. | 77.31 | **78.92** | 4.40% |
| `3-6` | Case Analysis | Accuracy | 35.80 | **37.80** | 0.40% |
| `3-7` | Criminal Damages Calculation | Accuracy | 39.20 | **44.00** | 0.00% |
| `3-8` | Consultation | ROUGE-L | 19.72 | **19.58** | 0.00% |
| **All** | **20-Task Macro Average (10,000 Samples)** | **Mean** | **37.00** | **41.05** | **4.52%** |

### Implementation & Protocol Notes

- **Exact Evaluator Parity (`0.00` Diff on Upstream Predictions)**: Scoring the 18 public `qwen-7b-chat-hf` prediction files included in `open-compass/LawBench` (`predictions/zero_shot/qwen-7b-chat-hf/`) through `LawBenchEvaluator` reproduces the paper's published numbers to two decimal places (`0.00` discrepancy across all 18 tasks).
- **Why Standard ChatML Formatting (`You are a helpful assistant.`) Outperforms Upstream OpenCompass `origin_prompt` (`41.05` vs. `37.00`)**:
  1. **System Message vs. Bare `user` Turn**: Inspecting `origin_prompt` in upstream's `predictions/zero_shot/qwen-7b-chat-hf/*.json` shows that OpenCompass constructed a bare single-turn template (`"\n<|im_start|>user\n...\n<|im_end|>\n<|im_start|>assistant\n"`) without the `<|im_start|>system\nYou are a helpful assistant.<|im_end|>` header used by `Qwen-7B-Chat`'s official `make_context()` (`modeling_qwen.py`) and by LexVerse (`lexverse/providers/local.py:encode`).
  2. **Interaction with `2-6` (`xxcq.py`) Delimiter Parsing**: With the standard system prompt, `Qwen-7B-Chat` formats extracted entities one per line (`\n`), whereas without the system prompt it frequently joins all 10 entity types on a single line with full-width semicolons (`；`). Because upstream `evaluation/utils/comprehension_scores.py:__extract_entities_pred` splits each entity value only on `\n` or ASCII space (`re.split("\n| ", ...)`), semicolon-joined lines cause the parser to swallow the remaining string into a single entity value, explaining why `2-6` rises from `51.83` to `66.69` under standard ChatML formatting.
  3. **HuggingFace `generation_config.json` Defaults**: In addition, the official `Qwen/Qwen-7B-Chat` checkpoint's `generation_config.json` sets `repetition_penalty: 1.1` by default; even when OpenCompass enabled greedy decoding (`do_sample=False`), `transformers.GenerationMixin.generate()` still applies `RepetitionPenaltyLogitsProcessor(1.1)` unless `repetition_penalty=1.0` is explicitly overridden, whereas `vllm` with `generation_config="vllm"` uses pure unpenalized greedy decoding (`repetition_penalty=1.0`).

## 5. Full-Data Three-Arm Validation (2026-11-05)

This validation covers `static`, resource-free `vanilla`, and `vanilla` with knowledge and skills. The tested model is **`Qwen/Qwen3.8-27B`**, with `temperature: 0`, `max_tokens: 8192`, and `chat_template_kwargs.enable_thinking: false`. Static calls the model service directly; the two vanilla arms use a compatibility bridge that restores tool calls from the service's output. Vanilla runs use the Local environment, with context windows of 32,768 tokens without resources and 65,536 with resources. The augmented arm uses the same 13 knowledge indexes and 38 skills as the preceding pilot. The corrected validation configuration uses 8 model calls (including summary and final-answer calls), 16 tool calls, and 900 seconds of active execution per trial. The aggregate generation budgets are 16 concurrent static trials, 8 resource-free vanilla trials, and 8 augmented vanilla trials. Generation and scoring are independently scheduled: after PLawBench generation, LawBench and LexEval generation can run together, splitting each arm's budget into 8/4/4 trials per Job. PLawBench scoring uses concurrency 4 per Job, with up to two scoring Jobs in parallel; deterministic native scoring has its own queue. A completed generation Job does not wait for its scoring before later benchmarks start. The initial unguarded 30-call and 8-call batches are retained as separate diagnostics. Corrected Jobs use a new frozen source snapshot and do not merge earlier answers into their scores.

Both vanilla benchmark arms use the same budget-aware answering controller. For knowledge-augmented runs, successful identical searches are cached within each trial, and two consecutive cache hits with no new tool result end retrieval. Approaching the model/tool budget or time limit also starts a separate answering request using the original task messages and deduplicated evidence, without the prior tool-action history or available tools. Space is kept for a possible summary and the final-answer call. This adds a final-answer instruction; the original task and shared system preamble are unchanged. Invalid or empty final answers remain failures. Execution completion is not a claim of legal correctness.

The source and configuration are frozen for all three arms. Task prompts and the shared system preamble are unchanged in this validation; the current knowledge-tool descriptions include readable source names. Run manifests retain source/configuration hashes and the exact selected resources. This is an engineering validation of the current setup; resource overlap with the evaluation data has not been independently ruled out.

**Scope: all 10,000 items across 20 task types, zero-shot, in each arm. Judge model: none (native deterministic scoring).** This differs from PLawBench, whose rubric is graded by an LLM. The tested model also differs from the `Qwen/Qwen-7B-Chat` reference table in Section 4.

The full-data run is in progress; no full-data score is claimed here. Report planned and completed executions, execution failures, scored items, and scoring failures together with each score. The earlier 20-case pilot is a separate diagnostic and must not be labeled as a full-data result. Any average over scored items must be accompanied by its denominator; failed or unscored items must not silently disappear from a comparison.
