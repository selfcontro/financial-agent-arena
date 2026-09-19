import { useEffect, useState } from 'react';
import type { EvaluationDataset, EvaluationCase, ModelAnswer, ReviewRecord, ScoringDimension } from '../types/evaluation.js';
import { weightedScore, roundScore } from '../services/aggregation.js';
import { Modal } from './Modal.js';
import { draftScores,reviewReadiness } from '../services/review.js';
import type { ReviewDraft } from '../services/review.js';
import { reviewSchema } from '../services/validation.js';

const time=(s:string)=>new Date(s).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
const names={unreviewed:'未评审',in_progress:'评审中',completed:'已完成'};
export function ReviewSummary({review,dimensions}:{review?:ReviewRecord;dimensions:ScoringDimension[]}) {
  if(!review)return null;
  const readiness=reviewReadiness(review,dimensions);
  const total=weightedScore(review,dimensions);
  return <section className="review-summary" aria-label="已保存评审"><h4>人工评审 · {readiness.label}</h4><p className="review-total">{total===null?'暂无正式分数':`${roundScore(total).toFixed(2)} / 100`}</p>
    <dl>{dimensions.filter(d=>d.enabled).map(d=><div key={d.dimension_id}><dt>{d.label}</dt><dd>{review.dimension_scores.find(s=>s.dimension_id===d.dimension_id)?.score??'—'} / 10</dd></div>)}</dl>
    {!!readiness.missing.length&&review.status==='completed'&&<p className="warning">当前规则新增维度，待补评：{readiness.missing.map(d=>d.label).join('、')}</p>}
    <div className="tags">{review.failure_labels.map(l=><span key={l}>{l}</span>)}</div>{review.comment&&<p className="review-comment">{review.comment}</p>}<small>最近保存 · {time(review.updated_at)}</small>
  </section>;
}

type Props={answer:ModelAnswer;modelName:string;question:EvaluationCase;dimensions:ScoringDimension[];labels:ReviewRecord['failure_labels'];review?:ReviewRecord;events:EvaluationDataset['audit_events'];close:()=>void;save:(input:ReviewDraft)=>void};
export function ReviewForm({answer,modelName,question,dimensions,labels,review,events,close,save}:Props) {
  const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(review?.dimension_scores.map(s=>[s.dimension_id,String(s.score)])??[]));
  const [selected,setSelected]=useState<ReviewRecord['failure_labels']>(review?.failure_labels??[]);
  const [comment,setComment]=useState(review?.comment??'');
  const [status,setStatus]=useState<ReviewRecord['status']>(review?.status??'unreviewed');
  const [dirty,setDirty]=useState(false),[discard,setDiscard]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
  const active=dimensions.filter(d=>d.enabled);
  const filled=active.filter(d=>(values[d.dimension_id]??'').trim()!=='').length;
  const history=events.filter(e=>e.entity_type==='review'&&e.entity_id===review?.review_id).slice().reverse();
  function touch(){setDirty(true);setError('');if(status==='unreviewed')setStatus('in_progress');}
  function reset(){setValues(Object.fromEntries(review?.dimension_scores.map(s=>[s.dimension_id,String(s.score)])??[]));setSelected(review?.failure_labels??[]);setComment(review?.comment??'');setStatus(review?.status??'unreviewed');setDirty(false);setDiscard(false);setError('');}
  function leave(){if(saving)return;if(dirty)setDiscard(true);else close();}
  return <Modal title={`人工评审 · ${modelName} · v${answer.version}`} close={leave}>
    <details className="review-reference"><summary>查看本题、回答及参考答案</summary><p>{question.question}</p><blockquote>{answer.answer}</blockquote><p>参考答案：{question.reference_answer}</p></details>
    <form noValidate onSubmit={e=>{e.preventDefault();setError('');setSaving(true);try{
      save({answer_id:answer.answer_id,answer_version:answer.version,dimension_scores:draftScores(values,dimensions,status,review),failure_labels:selected,comment,status});
    }catch(e){setError(`保存失败：${e instanceof Error?e.message:String(e)}`);}finally{setSaving(false);}}}>
      <div className="review-form-heading"><h3>评分维度</h3><span>已填写 {filled} / {active.length}</span></div>
      <div className="dimension-inputs">{active.map(d=><label key={d.dimension_id}><span>{d.label}<small>权重 {Math.round(d.weight*100)}%</small></span><input type="number" min="0" max="10" step="1" inputMode="numeric" aria-label={d.label} value={values[d.dimension_id]??''} placeholder="未评分" onChange={e=>{setValues(v=>({...v,[d.dimension_id]:e.target.value}));touch();}}/><small>{d.description}</small></label>)}</div>
      <p className="hint">0 分是有效评分；空白表示尚未评分。完成评审需要填齐全部启用维度。</p>
      <fieldset className="failure-choices"><legend>失败标签（可多选）</legend>{labels.map(label=><label className="checkbox-label" key={label}><input type="checkbox" checked={selected.includes(label)} onChange={e=>{setSelected(s=>e.target.checked?[...s,label]:s.filter(v=>v!==label));touch();}}/>{label}</label>)}</fieldset>
      <label>评语<textarea aria-label="评语" rows={3} value={comment} onChange={e=>{setComment(e.target.value);touch();}} placeholder="记录判断依据、错误位置或改进建议（可选）"/></label>
      <label>评审状态<select aria-label="评审状态" value={status} onChange={e=>{setStatus(e.target.value as ReviewRecord['status']);setDirty(true);setError('');}}><option value="unreviewed">未评审</option><option value="in_progress">评审中</option><option value="completed">已完成</option></select></label>
      {error&&<p role="alert" className="warning">{error}</p>}
      {discard&&<div role="alert" className="warning">有未保存的评审。<button type="button" onClick={close}>放弃修改</button><button type="button" onClick={()=>setDiscard(false)}>继续编辑</button></div>}
      <div className="modal-actions"><button type="button" disabled={saving} onClick={reset}>恢复已保存内容</button><button type="button" disabled={saving} onClick={leave}>取消</button><button className="primary" disabled={saving}>{saving?'保存中…':'保存评审'}</button></div>
    </form>
    <details className="review-audit"><summary>评审修改历史（{history.length}）</summary>{history.length===0?<p className="hint">尚无保存记录。</p>:history.map(event=>{
      const before=reviewSchema.safeParse(event.before),after=reviewSchema.safeParse(event.after);
      return <article key={event.event_id}><strong>{event.action==='create'?'创建评审':'修改评审'} · {time(event.occurred_at)}</strong><div className="audit-compare">{[before,after].map((parsed,i)=><div key={i}><small>{i?'修改后':'修改前'}</small>{parsed.success?<><p>{names[parsed.data.status]}</p><ul>{parsed.data.dimension_scores.map(s=><li key={s.dimension_id}>{s.label_snapshot??dimensions.find(d=>d.dimension_id===s.dimension_id)?.label??s.dimension_id}：{s.score}</li>)}</ul><p>{parsed.data.failure_labels.join('、')||'无失败标签'}</p><p className="review-comment">{parsed.data.comment||'无评语'}</p></>:<p>无记录</p>}</div>)}</div></article>;
    })}</details>
  </Modal>;
}
