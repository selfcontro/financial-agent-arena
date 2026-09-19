import { useState } from 'react';
import type { EvaluationDataset, ScoringDimension } from '../types/evaluation.js';
import { aggregateDataset, roundScore } from '../services/aggregation.js';
import { createSeedDataset } from '../data/seed.js';
import { ReportDownload } from './ReportDownload.js';
import { Modal } from './Modal.js';

export function SummaryReport({data,openCase,saveRules,readOnly}:{data:EvaluationDataset;openCase:(id:string)=>void;saveRules:(d:ScoringDimension[])=>void;readOnly:boolean}) {
  const report=aggregateDataset(data);const [settings,setSettings]=useState(false);
  return <section aria-label="评测汇总" className="summary-page">
    <div className="page-heading"><div><div className="eyebrow">SCORES & INSIGHTS</div><h1>评测汇总</h1><p>统计当前回答版本，只纳入已完成且维度齐全的人工评审。</p></div><div className="settings-tools"><ReportDownload data={data}/><button onClick={()=>setSettings(true)} disabled={readOnly}>评分规则与权重</button></div></div>
    <div className="summary-metrics"><article><small>当前规则已完成</small><strong>{report.total_completed} <em>/ {report.total_expected}</em></strong></article><article><small>待补评</small><strong>{report.total_pending}</strong></article><article><small>评分规则版本</small><strong>v{report.scoring_version}</strong></article></div>
    <section className="report-panel"><h2>正式排行榜</h2><p className="hint">模型总分为已完成题目的平均分，满分 100。不同模型可能覆盖不同题目，请结合完成率解读；未完成题目不按 0 分处理。</p>
      {!report.total_completed&&<p className="empty-report">暂无正式排名。请先完成至少一条当前回答的人工评审。</p>}
      <div className="table-scroll"><table><caption>模型排名与完成率</caption><thead><tr><th>排名</th><th>模型</th><th>平均总分 / 100</th><th>完成评审</th><th>完成率</th></tr></thead><tbody>{report.models.map(m=><tr key={m.model_id}><td>{m.rank??'—'}</td><th scope="row">{m.model_name}</th><td>{m.average_score===null?'暂无正式排名':<div className="score-bar"><span style={{width:`${m.average_score}%`}}/><strong>{m.average_score.toFixed(2)}</strong></div>}</td><td>{m.completed_count} / {m.total_case_count}</td><td>{roundScore(m.completion_rate*100)}%</td></tr>)}</tbody></table></div>
    </section>
    <section className="report-panel"><h2>各维度平均分</h2><p className="hint">原始评分满分 10；仅统计与排行榜相同的有效评审。</p><div className="table-scroll"><table><caption>动态评分维度对比</caption><thead><tr><th>模型</th>{report.dimensions.map(d=><th key={d.dimension_id}>{d.label}<small>{roundScore(d.weight*100)}%</small></th>)}</tr></thead><tbody>{report.models.map(m=><tr key={m.model_id}><th scope="row">{m.model_name}</th>{m.dimension_scores.map(d=><td key={d.dimension_id}>{d.average_score===null?'—':d.average_score.toFixed(2)}</td>)}</tr>)}</tbody></table></div></section>
    <section className="report-panel"><h2>失败标签分布</h2><p className="hint">数量 / 占该模型有效完成评审的比例。多标签分别计数，比例总和可能超过 100%；不额外扣分。</p><div className="table-scroll"><table><caption>失败标签数量与比例</caption><thead><tr><th>模型</th>{data.failure_labels.map(l=><th key={l}>{l}</th>)}</tr></thead><tbody>{report.models.map(m=><tr key={m.model_id}><th scope="row">{m.model_name}</th>{m.failure_distribution.map(f=><td key={f.label}>{f.rate===null?'—':`${f.count} / ${roundScore(f.rate*100)}%`}</td>)}</tr>)}</tbody></table></div></section>
    <section className="report-panel"><h2>临时进度与单题明细</h2><p className="hint">缺少回答、未评审、评审中、待补评和题目已更新的记录都不进入正式排名。</p>{report.models.map(m=><details className="progress-detail" key={m.model_id}><summary>{m.model_name} · {m.completed_count}/{m.total_case_count} 已完成 · {m.pending_count} 待补评</summary><div className="table-scroll"><table><thead><tr><th>题目</th><th>状态</th><th>当前总分</th><th>操作</th></tr></thead><tbody>{m.entries.map(e=><tr key={e.case_id}><th scope="row">{e.case_id}<small>{e.question}</small></th><td>{e.state}</td><td>{e.score===null?'—':roundScore(e.score).toFixed(2)}</td><td><button onClick={()=>openCase(e.case_id)}>查看单题</button></td></tr>)}</tbody></table></div></details>)}</section>
    {settings&&<ScoringSettings dimensions={data.scoring.dimensions} close={()=>setSettings(false)} save={d=>{saveRules(d);setSettings(false);}}/>}
  </section>;
}
export function ScoringSettings({dimensions,close,save}:{dimensions:ScoringDimension[];close:()=>void;save:(d:ScoringDimension[])=>void}) {
  const [draft,setDraft]=useState(()=>dimensions.map(d=>({...d,percent:String(roundScore(d.weight*100))})));
  const [error,setError]=useState('');const [dirty,setDirty]=useState(false);const [discard,setDiscard]=useState(false);
  const total=draft.filter(d=>d.enabled).reduce((n,d)=>n+Number(d.percent),0);
  const patch=(i:number,changes:Partial<typeof draft[number]>)=>{setDraft(ds=>ds.map((d,j)=>j===i?{...d,...changes}:d));setDirty(true);setError('');};
  const leave=()=>dirty?setDiscard(true):close();
  return <Modal title="评分规则与权重" close={leave}><form noValidate onSubmit={e=>{e.preventDefault();setError('');try{
    if(!draft.some(d=>d.enabled)||!Number.isFinite(total)||Math.abs(total-100)>1e-7)throw new Error('启用维度的权重合计必须为 100%');
    const next=draft.map(({percent,...d})=>{const weight=Number(percent)/100;if(!d.label.trim()||percent.trim()===''||!Number.isFinite(weight)||weight<0||weight>1)throw new Error('请填写维度名称及 0～100 的权重');return {...d,label:d.label.trim(),weight};});save(next);
  }catch(e){setError(e instanceof Error?e.message:String(e));}}}>
    <p className="hint">修改权重会重算当前总分，原始人工分数不变。新增或启用维度后，缺少该分数的旧记录需补评。</p>
    {draft.map((d,i)=><fieldset key={d.dimension_id}><legend>{d.label||'新维度'}</legend><label>维度名称<input aria-label={`维度名称 ${i+1}`} value={d.label} onChange={e=>patch(i,{label:e.target.value})}/></label><label>权重（%）<input aria-label={`权重 ${i+1}`} type="number" min="0" max="100" step="0.01" value={d.percent} onChange={e=>patch(i,{percent:e.target.value})}/></label><label className="checkbox-label"><input aria-label={`启用 ${i+1}`} type="checkbox" checked={d.enabled} onChange={e=>patch(i,{enabled:e.target.checked})}/>启用此维度</label></fieldset>)}
    <div className="settings-tools"><button type="button" onClick={()=>{setDraft(ds=>[...ds,{dimension_id:`dimension-${crypto.randomUUID()}`,label:'新维度',weight:0,percent:'0',enabled:true,description:'新增人工评分维度，0～10整数分。'}]);setDirty(true);}}>新增评分维度</button><button type="button" onClick={()=>{const defaults=createSeedDataset().scoring.dimensions;setDraft([...defaults,...draft.filter(d=>!defaults.some(x=>x.dimension_id===d.dimension_id)).map(d=>({...d,enabled:false,weight:0}))].map(d=>({...d,percent:String(d.weight*100)})));setDirty(true);setError('');}}>恢复默认权重</button><strong>启用权重合计：{Number.isFinite(total)?roundScore(total):'—'}%</strong></div>
    {error&&<p role="alert" className="warning">{error}</p>}{discard&&<p role="alert" className="warning">有未保存的配置。<button type="button" onClick={close}>放弃修改</button><button type="button" onClick={()=>setDiscard(false)}>继续编辑</button></p>}
    <div className="modal-actions"><button type="button" onClick={leave}>取消</button><button className="primary">保存评分规则</button></div>
  </form></Modal>;
}
