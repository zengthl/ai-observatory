// pipeline/schema.ts —— zod 运行时校验（镜像 src/types.ts）
// 快照在落盘前必须通过 snapshotSchema.parse，脏数据在此抛出而非污染 git 留档
import { z } from 'zod';

export const sourceInfoSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  fetched_at: z.string().optional(),
  last_ok: z.string().optional(),
});

const arenaEntrySchema = z.object({
  model_id: z.string(),
  score: z.number(),
  ci95: z.tuple([z.number(), z.number()]).optional(),
  votes: z.number().optional(),
  categories: z.record(z.string(), z.number()).optional(),
  rank_prev: z.number().nullable(),
  delta_score: z.number().nullable(),
});

const aaEntrySchema = z.object({
  model_id: z.string(),
  index: z.number(),
  coding_index: z.number().nullable().optional(),
  math_index: z.number().nullable().optional(),
  output_speed_tps: z.number().nullable().optional(),
  ttft_s: z.number().nullable().optional(),
  price_blin_per_m: z.number().nullable().optional(),
  price_in_per_m: z.number().nullable().optional(),
  price_out_per_m: z.number().nullable().optional(),
  tbench_v21_pct: z.number().nullable().optional(),
  rank_prev: z.number().nullable(),
  delta_score: z.number().nullable(),
});

/** 通用 LLM 榜条目（AA 6 个新子榜 + LiveBench 6 个子榜都用此形态） */
const genericLLMEntrySchema = z.object({
  model_id: z.string(),
  score: z.number(),
  rank_prev: z.number().nullable(),
  delta_score: z.number().nullable(),
});

const sweEntrySchema = z.object({
  model_id: z.string(),
  resolved_pct: z.number(),
  agent: z.string().optional(),
  cost_usd_per_instance: z.number().nullable().optional(),
  rank_prev: z.number().nullable(),
  delta_score: z.number().nullable(),
});

const tbenchEntrySchema = z.object({
  model_id: z.string(),
  score: z.number(),
  rank_prev: z.number().nullable(),
  delta_score: z.number().nullable(),
});

export const modelMetaSchema = z.object({
  model_id: z.string(),
  display_name: z.string(),
  org: z.string(),
  license: z.enum(['closed', 'open']),
  aliases: z.array(z.string()),
});

export const snapshotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sources: z.record(z.string(), sourceInfoSchema),
  llm: z.object({
    arena_elo: z.array(arenaEntrySchema),
    aa_index: z.array(aaEntrySchema),
    aa_mmlu_pro: z.array(genericLLMEntrySchema),
    aa_gpqa: z.array(genericLLMEntrySchema),
    aa_hle: z.array(genericLLMEntrySchema),
    aa_livecodebench: z.array(genericLLMEntrySchema),
    aa_ifeval: z.array(genericLLMEntrySchema),
    aa_lcr: z.array(genericLLMEntrySchema),
    livebench_coding: z.array(genericLLMEntrySchema),
    livebench_math: z.array(genericLLMEntrySchema),
    livebench_reasoning: z.array(genericLLMEntrySchema),
    livebench_language: z.array(genericLLMEntrySchema),
    livebench_data_analysis: z.array(genericLLMEntrySchema),
    livebench_instruction_following: z.array(genericLLMEntrySchema),
  }),
  agent: z.object({
    swebench_verified: z.array(sweEntrySchema),
    terminal_bench: z.array(tbenchEntrySchema),
  }),
  models: z.array(modelMetaSchema),
});

export const historySchema = z.record(
  z.string(),
  z.object({
    arena_elo: z.array(z.tuple([z.string(), z.number()])).optional(),
    aa_index: z.array(z.tuple([z.string(), z.number()])).optional(),
    swebench_verified: z.array(z.tuple([z.string(), z.number()])).optional(),
    terminal_bench: z.array(z.tuple([z.string(), z.number()])).optional(),
    aa_mmlu_pro: z.array(z.tuple([z.string(), z.number()])).optional(),
    aa_gpqa: z.array(z.tuple([z.string(), z.number()])).optional(),
    aa_hle: z.array(z.tuple([z.string(), z.number()])).optional(),
    aa_livecodebench: z.array(z.tuple([z.string(), z.number()])).optional(),
    aa_ifeval: z.array(z.tuple([z.string(), z.number()])).optional(),
    aa_lcr: z.array(z.tuple([z.string(), z.number()])).optional(),
    livebench_coding: z.array(z.tuple([z.string(), z.number()])).optional(),
    livebench_math: z.array(z.tuple([z.string(), z.number()])).optional(),
    livebench_reasoning: z.array(z.tuple([z.string(), z.number()])).optional(),
    livebench_language: z.array(z.tuple([z.string(), z.number()])).optional(),
    livebench_data_analysis: z.array(z.tuple([z.string(), z.number()])).optional(),
    livebench_instruction_following: z.array(z.tuple([z.string(), z.number()])).optional(),
  }),
);
