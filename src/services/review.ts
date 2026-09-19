import type { ReviewRecord, ScoringDimension } from '../types/evaluation.js';

export type ReviewDraft=Pick<ReviewRecord,'answer_id'|'answer_version'|'dimension_scores'|'failure_labels'|'comment'|'status'>;
export function reviewReadiness(review:ReviewRecord|undefined, dimensions:ScoringDimension[]) {
  const active=dimensions.filter(d=>d.enabled);
  const missing=active.filter(d=>!review || !review.dimension_scores.some(s=>s.dimension_id===d.dimension_id&&Number.isInteger(s.score)&&s.score>=0&&s.score<=10));
  const completed=!!review && review.status==='completed' && missing.length===0;
  return {missing,completed,label:review?.status==='completed'?(missing.length?'待补评':'已完成'):review?.status==='in_progress'?'评审中':'未评审'};
}
export function draftScores(values:Record<string,string>,dimensions:ScoringDimension[],status:ReviewRecord['status'],previous?:ReviewRecord) {
  // Preserve known disabled dimensions, while rendering active dimensions only.
  const scores=(previous?.dimension_scores??[]).filter(s=>dimensions.some(d=>d.dimension_id===s.dimension_id&&!d.enabled));
  for(const d of dimensions.filter(d=>d.enabled)) {
    const raw=(values[d.dimension_id]??'').trim();
    if(raw==='') {if(status==='completed')throw new Error(`请填写「${d.label}」后再标记为已完成`);continue;}
    const score=Number(raw);
    if(!Number.isInteger(score)||score<0||score>10)throw new Error(`「${d.label}」必须为 0～10 的整数`);
    scores.push({dimension_id:d.dimension_id,score,label_snapshot:d.label});
  }
  return scores;
}
