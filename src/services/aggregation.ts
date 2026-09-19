import type { EvaluationDataset, ReviewRecord, ScoringDimension } from '../types/evaluation.js';
import { reviewReadiness } from './review.js';
import { validateDataset } from './validation.js';
export const roundScore=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
export function weightedScore(review:ReviewRecord|undefined,dimensions:ScoringDimension[]):number|null {
  if(!review||review.deleted_at||!reviewReadiness(review,dimensions).completed)return null;
  return dimensions.filter(d=>d.enabled).reduce((sum,d)=>sum+review.dimension_scores.find(s=>s.dimension_id===d.dimension_id)!.score*d.weight*10,0);
}
export function aggregateDataset(input:EvaluationDataset) {
  const data=validateDataset(input);
  const dimensions=data.scoring.dimensions.filter(d=>d.enabled);
  const cases=data.cases.filter(c=>!data.cases.some(other=>other.case_id===c.case_id&&other.version>c.version));
  const models=data.models.filter(m=>m.enabled);
  const rows=models.map(model=>{
    const entries=cases.map(c=>{
      const answer=data.answers.find(a=>a.model_id===model.model_id&&a.case_id===c.case_id&&a.is_current&&!a.deleted_at);
      const review=answer?data.reviews.find(r=>r.answer_id===answer.answer_id&&r.answer_version===answer.version&&!r.deleted_at):undefined;
      const stale=!!answer&&answer.case_version!==c.version;
      const readiness=reviewReadiness(review,dimensions);
      const score=stale?null:weightedScore(review,dimensions);
      return {case_id:c.case_id,question:c.question,answer,review,score,state:!answer?'缺少回答':stale?'题目已更新':readiness.label};
    });
    const completed=entries.filter(e=>e.score!==null);
    return {
      model_id:model.model_id,model_name:model.display_name,rank:null as number|null,
      average_score:completed.length?roundScore(completed.reduce((sum,e)=>sum+e.score!,0)/completed.length):null,
      completed_count:completed.length,total_case_count:cases.length,completion_rate:cases.length?completed.length/cases.length:0,
      pending_count:entries.filter(e=>e.state==='待补评').length,
      dimension_scores:dimensions.map(d=>({dimension_id:d.dimension_id,label:d.label,average_score:completed.length?roundScore(completed.reduce((sum,e)=>sum+e.review!.dimension_scores.find(s=>s.dimension_id===d.dimension_id)!.score,0)/completed.length):null})),
      failure_distribution:data.failure_labels.map(label=>{const count=completed.filter(e=>e.review!.failure_labels.includes(label)).length;return {label,count,rate:completed.length?count/completed.length:null};}),
      entries,
    };
  });
  // Ties use the displayed two-decimal mean. Input model order only stabilizes display.
  const ranked=rows.filter(r=>r.average_score!==null).sort((a,b)=>b.average_score!-a.average_score!);
  ranked.forEach((r,i)=>{r.rank=i>0&&r.average_score===ranked[i-1].average_score?ranked[i-1].rank:i+1;});
  return {scoring_version:data.scoring.version,dimensions,models:[...ranked,...rows.filter(r=>r.average_score===null)],total_expected:cases.length*models.length,total_completed:rows.reduce((n,r)=>n+r.completed_count,0),total_pending:rows.reduce((n,r)=>n+r.pending_count,0)};
}
