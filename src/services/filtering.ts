import type { EvaluationDataset } from '../types/evaluation.js';
import { aggregateDataset } from './aggregation.js';

export type ReviewFilters = { modelId:string; labels:string[]; labelMode:'any'|'all'; status:string; caseId:string };
export const emptyFilters:ReviewFilters={modelId:'',labels:[],labelMode:'any',status:'',caseId:''};
export const filterStatuses=['未评审','评审中','已完成','待补评','缺少回答','题目已更新'];
export function filterReviews(data:EvaluationDataset,filters:ReviewFilters) {
  const report=aggregateDataset(data);
  const rows=report.models.flatMap(m=>m.entries.map(e=>({...e,model_id:m.model_id,model_name:m.model_name})));
  const modelRows=rows.filter(r=>filters.modelId==='*'||r.model_id===filters.modelId);
  const labelRows=modelRows.filter(r=>!filters.labels.length||(filters.labelMode==='all'
    ?filters.labels.every(l=>r.review?.failure_labels.some(label=>label===l))
    :filters.labels.some(l=>r.review?.failure_labels.some(label=>label===l))));
  const statusRows=labelRows.filter(r=>!filters.status||r.state===filters.status);
  return {
    rows:statusRows.filter(r=>!filters.caseId||r.case_id===filters.caseId),
    labels:data.failure_labels.map(label=>({label,count:modelRows.filter(r=>r.review?.failure_labels.includes(label)).length})),
    statuses:filterStatuses.map(status=>({status,count:labelRows.filter(r=>r.state===status).length})),
    cases:data.cases.filter(c=>!data.cases.some(n=>n.case_id===c.case_id&&n.version>c.version)).map(c=>({...c,count:statusRows.filter(r=>r.case_id===c.case_id).length})),
    total:modelRows.length,
  };
}
