import {it,expect} from 'vitest';
import {generateReport,verifyReport} from '../src/services/report.js';
import {createSeedDataset} from '../src/data/seed.js';
const time='2026-09-19T14:00:00Z';
it('generates a reproducible unscored four-model report with evidence and all cases',async()=>{
  const d=createSeedDataset();const r=await generateReport(d,time);
  expect(r.summary.models).toHaveLength(4);expect(r.summary.total_completed).toBe(0);expect(r.markdown).toContain('暂无有效已完成人工评审');
  for(const c of d.cases)expect(r.markdown).toContain(c.case_id);
  for(const m of d.models)expect(r.markdown).toContain(m.display_name);
  expect(r.markdown).toContain(d.cases[0].allowed_evidence[0].content);
  expect(await verifyReport(JSON.parse(JSON.stringify(r)))).toEqual(r);
  expect(await generateReport(d,time)).toEqual(r);
});
it('freezes source data and rejects changed snapshots or results',async()=>{
  const d=createSeedDataset();const r=await generateReport(d,time);d.models[0].display_name='changed';expect(r.dataset.models[0].display_name).not.toBe('changed');
  const changed=structuredClone(r);changed.dataset.models[0].display_name='tampered';await expect(verifyReport(changed)).rejects.toThrow('不匹配');
  const summary=structuredClone(r);summary.summary.total_completed=99;await expect(verifyReport(summary)).rejects.toThrow('不匹配');
  const text=structuredClone(r);text.markdown+='edited';await expect(verifyReport(text)).rejects.toThrow('不匹配');
});
it('includes real saved scores and escapes table and HTML content',async()=>{
  const d=createSeedDataset(),a=d.answers[0];d.models[0].display_name='test|<script>';
  d.reviews.push({review_id:'test-review',case_id:a.case_id,model_id:a.model_id,answer_id:a.answer_id,answer_version:a.version,scoring_version:1,dimension_scores:d.scoring.dimensions.map(v=>({dimension_id:v.dimension_id,score:8})),failure_labels:['数字错误'],comment:'test only',status:'completed',created_at:time,updated_at:time,reviewed_at:time});
  const r=await generateReport(d,time);expect(r.summary.models[0].average_score).toBe(80);expect(r.markdown).toContain('80.00');expect(r.markdown).toContain('test&#124;&lt;script&gt;');expect(r.markdown).toContain('test only');
  expect(r.dataset_hash).toBe((await generateReport(d,'2026-09-20T14:00:00Z')).dataset_hash);
});
