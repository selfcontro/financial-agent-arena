import { describe, expect, it } from 'vitest';
import { createSeedDataset } from '../src/data/seed.js';
import { validateDataset } from '../src/services/validation.js';
import type { ReviewRecord } from '../src/types/evaluation.js';

function reviewed() {
  const d = createSeedDataset();
  const a = d.answers[0];
  const r: ReviewRecord = { review_id:'review-1',case_id:a.case_id,model_id:a.model_id,answer_id:a.answer_id,answer_version:1,scoring_version:1,dimension_scores:d.scoring.dimensions.map(x => ({dimension_id:x.dimension_id,score:8})),failure_labels:[],comment:'测试夹具，不属于内置人工评分',status:'completed',created_at:d.updated_at,updated_at:d.updated_at,reviewed_at:d.updated_at };
  d.reviews.push(r);
  return d;
}

describe('portable evaluation data', () => {
  it('contains five cases with four answers each and no fabricated reviews', () => {
    const d=createSeedDataset();
    expect(d.cases).toHaveLength(5); expect(d.models).toHaveLength(4); expect(d.answers).toHaveLength(20); expect(d.reviews).toEqual([]);
    for (const c of d.cases) expect(new Set(d.answers.filter(a=>a.case_id===c.case_id).map(a=>a.model_id)).size).toBe(4);
    expect(new Set(d.cases.flatMap(c=>c.risk_labels)).size).toBe(7);
  });
  it('returns isolated seed instances', () => {
    const d=createSeedDataset(); d.models[0].display_name='changed';
    expect(createSeedDataset().models[0].display_name).toBe('同花顺问财');
  });
  it('rejects duplicate current answers and dangling model references', () => {
    const d=createSeedDataset(); d.answers.push({...d.answers[0],answer_id:'duplicate'});
    expect(()=>validateDataset(d)).toThrow();
    d.answers.pop(); d.answers[0].model_id='missing'; expect(()=>validateDataset(d)).toThrow();
  });
  it('allows intentionally invalid and future citations for human assessment', () => {
    const d=createSeedDataset();
    expect(d.answers.some(a=>a.citations.some(c=>c.evidence_id==='nonexistent-evidence'))).toBe(true);
    expect(d.answers.some(a=>a.citations.some(c=>c.published_at>'2026-03-31T23:59:59Z'))).toBe(true);
    expect(()=>validateDataset(d)).not.toThrow();
  });
  it('rejects bad review bindings, duplicate dimensions and out of range scores', () => {
    const d=reviewed(); expect(()=>validateDataset(d)).not.toThrow();
    d.reviews[0].answer_version=99; expect(()=>validateDataset(d)).toThrow(); d.reviews[0].answer_version=1;
    d.reviews[0].dimension_scores.push(d.reviews[0].dimension_scores[0]); expect(()=>validateDataset(d)).toThrow(); d.reviews[0].dimension_scores.pop();
    d.reviews[0].dimension_scores[0].score=11; expect(()=>validateDataset(d)).toThrow();
  });
  it('validates completed reviews against their historical rule', () => {
    const d=reviewed(); d.scoring_history.push(structuredClone(d.scoring)); d.scoring.version=2;
    d.scoring.dimensions.push({dimension_id:'new',label:'新维度',weight:0,enabled:true,description:'新增'});
    expect(()=>validateDataset(d)).not.toThrow();
    d.reviews[0].scoring_version=2; expect(()=>validateDataset(d)).toThrow();
  });
  it('rejects invalid weights and nested audit credentials', () => {
    const d=createSeedDataset(); d.scoring.dimensions[0].weight=.9; expect(()=>validateDataset(d)).toThrow();
    d.scoring.dimensions[0].weight=.3;
    d.audit_events.push({event_id:'evt',entity_type:'model',entity_id:'wencai',action:'update',occurred_at:d.updated_at,after:{nested:{api_key:'test-secret'}}});
    expect(()=>validateDataset(d)).toThrow();
  });
  it('round-trips JSON with stable business data', () => {
    const d=reviewed(); expect(validateDataset(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
});
