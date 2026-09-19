import type { EvaluationDataset } from '../types/evaluation.js';
import { emptyFilters,filterReviews,type ReviewFilters } from '../services/filtering.js';
import { roundScore } from '../services/aggregation.js';

export function ReviewExplorer({data,filters,change,openCase}:{data:EvaluationDataset;filters:ReviewFilters;change:(f:ReviewFilters)=>void;openCase:(id:string)=>void}) {
  const result=filterReviews(data,filters);
  return <section aria-label="分级筛选" className="summary-page">
    <div className="page-heading"><div><div className="eyebrow">FIND & COMPARE</div><h1>评审记录筛选</h1><p>先选择模型，再逐级缩小范围。筛选不改变正式排行榜。</p></div><button onClick={()=>change({...emptyFilters})}>重置筛选</button></div>
    <section className="report-panel filter-controls">
      <label>1 · 模型<select value={filters.modelId} onChange={e=>change({...emptyFilters,modelId:e.target.value})}><option value="">请选择模型</option><option value="*">全部模型</option>{data.models.filter(m=>m.enabled).map(m=><option key={m.model_id} value={m.model_id}>{m.display_name}</option>)}</select></label>
      <fieldset disabled={!filters.modelId}><legend>2 · 失败类型（可多选）</legend><p className="hint">未选择标签时包含所有记录；计数基于所选模型，包含评审中的标签。</p><div className="filter-tags">{result.labels.map(l=><label key={l.label}><input type="checkbox" checked={filters.labels.includes(l.label)} onChange={e=>change({...filters,labels:e.target.checked?[...filters.labels,l.label]:filters.labels.filter(v=>v!==l.label),status:'',caseId:''})}/>{l.label}（{l.count}）</label>)}</div><label>多标签匹配<select value={filters.labelMode} onChange={e=>change({...filters,labelMode:e.target.value as ReviewFilters['labelMode'],status:'',caseId:''})}><option value="any">命中任一标签</option><option value="all">同时包含所有标签</option></select></label></fieldset>
      <div className="filter-row"><label>3 · 评审状态<select disabled={!filters.modelId} value={filters.status} onChange={e=>change({...filters,status:e.target.value,caseId:''})}><option value="">全部状态</option>{result.statuses.map(s=><option key={s.status} value={s.status}>{s.status}（{s.count}）</option>)}</select></label><label>4 · 题目<select disabled={!filters.modelId} value={filters.caseId} onChange={e=>change({...filters,caseId:e.target.value})}><option value="">全部题目</option>{result.cases.map(c=><option key={c.case_id} value={c.case_id}>{c.case_id} · {c.question}（{c.count}）</option>)}</select></label></div>
      <p className="hint">更换模型会重置后续条件；更改标签会重置状态和题目。每一级在上一级结果中筛选。</p>
    </section>
    <section className="report-panel"><h2>筛选结果</h2><p role="status">{filters.modelId?`找到 ${result.rows.length} 条 / 模型范围内 ${result.total} 条`:'请先选择模型或全部模型。'}</p>
      {!!filters.modelId&&!result.rows.length&&<p>没有符合条件的记录。可减少失败标签或重置筛选。</p>}
      {!!result.rows.length&&<div className="table-scroll"><table><caption>当前回答与评审记录</caption><thead><tr><th>题目</th><th>模型 / 回答版本</th><th>状态</th><th>总分 / 100</th><th>失败标签</th><th>评语</th><th>操作</th></tr></thead><tbody>{result.rows.map(r=><tr key={`${r.case_id}-${r.model_id}`}><th scope="row">{r.case_id}<small>{r.question}</small></th><td>{r.model_name}<small>{r.answer?`v${r.answer.version}`:'暂无回答'}</small></td><td>{r.state}</td><td>{r.score===null?'—':roundScore(r.score).toFixed(2)}</td><td>{r.review?.failure_labels.join('、')||'—'}</td><td className="filter-comment">{r.review?.comment||'—'}</td><td><button aria-label={`查看同题全部模型 ${r.case_id} ${r.model_name}`} onClick={()=>openCase(r.case_id)}>查看同题全部模型</button></td></tr>)}</tbody></table></div>}
    </section>
  </section>;
}
