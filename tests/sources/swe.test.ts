// tests/sources/swe.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSwe } from '../../pipeline/sources/swebench';

const fixture = JSON.parse(readFileSync('pipeline/fixtures/swe.json', 'utf8'));

describe('parseSwe', () => {
  const out = parseSwe(fixture);

  it('sorted by resolved desc', () => {
    expect(out.entries.length).toBeGreaterThan(10);
    for (let i = 1; i < out.entries.length; i++) {
      expect(out.entries[i - 1].resolved_pct).toBeGreaterThanOrEqual(out.entries[i].resolved_pct);
    }
  });
  it('dedups multi-agent runs per model keeping best', () => {
    const ids = out.entries.map((e) => e.model_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('keeps agent name of best run', () => {
    expect(out.entries.every((e) => typeof e.agent === 'string' || e.agent === undefined)).toBe(
      true,
    );
  });

  // ---- 补充断言（基于 2026-08-26 实录 fixture 的真实值）----
  it('fixture top model is claude-opus-4-5 @79.2 via live-SWE-agent', () => {
    const top = out.entries[0];
    expect(top.model_id).toBe('claude-opus-4-5');
    expect(top.resolved_pct).toBe(79.2);
    expect(top.agent).toBe('live-SWE-agent');
  });
  it('resolves the full Verified board with no unresolved high-rank gaps', () => {
    // 180 行原始记录去重后命中 models.yaml 的模型数
    // （2026-08-26 实测 14；Task 6 补表登记 GPT-5/Claude Sonnet 4/MiniMax M2.5/GLM-5/
    //   Kimi K2.5/DeepSeek V3.2/Qwen3-Coder-480B/Llama 4 Maverick 后升至 22）
    expect(out.entries.length).toBe(22);
    expect(out.entries).toContainEqual(expect.objectContaining({ model_id: 'gemini-3-pro' }));
    expect(out.entries).toContainEqual(expect.objectContaining({ model_id: 'minimax-m2' }));
    expect(out.entries).toContainEqual(expect.objectContaining({ model_id: 'gpt-5' }));
    expect(out.entries).toContainEqual(expect.objectContaining({ model_id: 'claude-sonnet-4' }));
    expect(out.entries).toContainEqual(expect.objectContaining({ model_id: 'minimax-m2-5' }));
    expect(out.entries).toContainEqual(expect.objectContaining({ model_id: 'glm-5' }));
    expect(out.entries).toContainEqual(expect.objectContaining({ model_id: 'kimi-k2-5' }));
    expect(out.entries).toContainEqual(expect.objectContaining({ model_id: 'deepseek-v3-2' }));
    expect(out.entries).toContainEqual(expect.objectContaining({ model_id: 'qwen3-coder-480b' }));
    expect(out.entries).toContainEqual(expect.objectContaining({ model_id: 'llama-4-maverick' }));
  });
  it('multi-run dedup keeps the highest resolved run per model', () => {
    const claude45 = out.entries.find((e) => e.model_id === 'claude-opus-4-5');
    // 原始榜有 3 条 Claude 4.5 Opus 记录：79.2 / 79.2 / 76.8 → 取并列最高的首条 agent
    expect(claude45?.resolved_pct).toBe(79.2);
  });
  it('placeholder names (Multiple/Undisclosed) never enter entries or pending', () => {
    for (const e of out.entries) expect(e.model_id).not.toBe('');
    expect(out.pending.every((n) => !/^(multiple|undisclosed)$/i.test(n))).toBe(true);
  });
  it('unknown model names land in pending', () => {
    // 榜上真实存在但未登记 models.yaml 的名字（GPT-5/MiniMax M2.5 已于 Task 6 补表转正）
    expect(out.pending).toContain('Claude 4 Opus');
    expect(out.pending).toContain('GPT 5.2');
    expect(Array.isArray(out.pending)).toBe(true);
  });
});
