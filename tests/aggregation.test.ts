import { describe,it,expect } from 'vitest';
import { createSeedDataset } from '../src/data/seed.js';
import type { EvaluationDataset,ReviewRecord } from '../src/types/evaluation.js';
import { aggregateDataset,weightedScore } from '../src/services/aggregation.js';
function add(d:EvaluationDataset,model:string,caseId:string,scores:number[],status:ReviewRecord['status']='completed',labels:ReviewRecord['failure_labels']=[]) {
  const a=d.answers.find(a=>a.model_id===model&&a.case_id===caseId)!;
  const review:ReviewRecord={review_id:`${a.answer_id}-review`,case_id:caseId,model_id:model,answer_id:a.answer_id,answer_version:a.version,scoring_version:1,dimension_scores:scores.map((score,i)=>({dimension_id:d.scoring.dimensions[i].dimension_id,score})),failure_labels:labels,comment:'固定测试夹具，非人工评分',status,created_at:d.updated_at,updated_at:d.updated_at,...(status==='completed'?{reviewed_at:d.updated_at}:{})};d.reviews.push(review);return review;
}
describe('scoring and summary statistics',()=>{
  it('matches hand-calculated weighted means, dimensions, labels and completion rate',()=>{
    const d=createSeedDataset();const r=add(d,'wencai','case-001',[8,7,10,9,8],'completed',['数字错误','引用无效']);add(d,'wencai','case-002',[6,6,6,6,6],'completed',['数字错误']);add(d,'doubao','case-001',[9,9,9,9,9]);
    expect(weightedScore(r,d.scoring.dimensions)).toBeCloseTo(83);
    const report=aggregateDataset(d),w=report.models.find(m=>m.model_id==='wencai')!;
    expect(report.models[0].model_id).toBe('doubao');expect(w.rank).toBe(2);expect(w.average_score).toBe(71.5);expect(w.completion_rate).toBe(.4);
    expect(w.dimension_scores[0].average_score).toBe(7);expect(w.failure_distribution.find(f=>f.label==='数字错误')).toEqual({label:'数字错误',count:2,rate:1});expect(w.failure_distribution.find(f=>f.label==='引用无效')?.rate).toBe(.5);expect(report.total_completed).toBe(3);
  });
  it('distinguishes zero from no scores and excludes incomplete reviews',()=>{
    const d=createSeedDataset();add(d,'wencai','case-001',[0,0,0,0,0]);add(d,'doubao','case-001',[10],'in_progress',['数字错误']);const r=aggregateDataset(d);
    expect(r.models[0].average_score).toBe(0);expect(r.models[0].rank).toBe(1);const b=r.models.find(m=>m.model_id==='doubao')!;expect(b.average_score).toBeNull();expect(b.rank).toBeNull();expect(b.failure_distribution[0].rate).toBeNull();expect(b.failure_distribution[0].count).toBe(0);
  });
  it('does not count reviews on previous versions or deleted answers',()=>{
    const d=createSeedDataset();add(d,'wencai','case-001',[10,10,10,10,10]);add(d,'doubao','case-001',[9,9,9,9,9]);const old=d.answers[0];old.is_current=false;d.answers.push({...old,version:2,is_current:true});const deleted=d.answers.find(a=>a.model_id==='doubao'&&a.case_id==='case-001')!;deleted.deleted_at=d.updated_at;
    expect(aggregateDataset(d).total_completed).toBe(0);expect(d.reviews).toHaveLength(2);
  });
  it('excludes stale case versions and inactive models',()=>{
    const d=createSeedDataset();add(d,'wencai','case-001',[10,10,10,10,10]);d.cases.push({...d.cases[0],version:2});d.models[1].enabled=false;
    const r=aggregateDataset(d);expect(r.total_expected).toBe(15);expect(r.total_completed).toBe(0);expect(r.models[0].entries.find(e=>e.case_id==='case-001')!.state).toBe('题目已更新');
  });
  it('reweights original scores without mutation and marks new dimensions as pending',()=>{
    const d=createSeedDataset();add(d,'wencai','case-001',[10,0,0,0,0]);expect(aggregateDataset(d).models[0].average_score).toBe(30);
    d.scoring_history.push(structuredClone(d.scoring));d.scoring.version=2;d.scoring.dimensions[0].weight=.5;d.scoring.dimensions[1].weight=0;
    const original=JSON.stringify(d);expect(aggregateDataset(d).models[0].average_score).toBe(50);expect(JSON.stringify(d)).toBe(original);
    d.scoring.dimensions.push({dimension_id:'extra',label:'新维度',weight:0,enabled:true,description:'测试'});expect(aggregateDataset(d).total_pending).toBe(1);expect(aggregateDataset(d).total_completed).toBe(0);expect(d.reviews[0].status).toBe('completed');
    d.reviews[0].dimension_scores.push({dimension_id:'extra',score:8});d.reviews[0].scoring_version=2;expect(aggregateDataset(d).total_completed).toBe(1);
  });
  it('uses shared ranks for displayed ties and has no fake rankings for empty seed',()=>{
    const d=createSeedDataset();expect(aggregateDataset(d).models.every(m=>m.rank===null)).toBe(true);add(d,'wencai','case-001',[8,8,8,8,8]);add(d,'doubao','case-001',[8,8,8,8,8]);add(d,'qianwen','case-001',[7,7,7,7,7]);expect(aggregateDataset(d).models.map(m=>m.rank)).toEqual([1,1,3,null]);
  });
});
