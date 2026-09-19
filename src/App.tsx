import { useEffect, useRef, useState } from 'react';
import { EvaluationStore } from './store/evaluationStore.js';
import { Repository } from './store/storage.js';
import { Modal } from './components/Modal.js';
import { ReviewForm, ReviewSummary } from './components/ReviewForm.js';
import { ReviewExplorer } from './components/ReviewExplorer.js';
import { emptyFilters,type ReviewFilters } from './services/filtering.js';
import { SummaryReport } from './components/SummaryReport.js';
import { reviewReadiness } from './services/review.js';
import { modelApi } from './services/modelApi.js';
import type { EvaluationCase, ModelAnswer, Model } from './types/evaluation.js';

const headings=['营收同比','单位换算','数据时效','风险识别','因果判断'];
const statusNames={unreviewed:'未评审',in_progress:'评审中',completed:'已完成'};
const stamp=(s:string)=>new Date(s).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'});

export function App() {
  const [store]=useState(()=>new EvaluationStore(new Repository(window.localStorage)));
  const [data,setData]=useState(()=>store.getState());
  const [selected,setSelected]=useState(data.cases[0].case_id);
  const [notice,setNotice]=useState('');
  const [view,setView]=useState<'cases'|'summary'|'filters'>('cases');
  const [filters,setFilters]=useState<ReviewFilters>({...emptyFilters});
  const [editor,setEditor]=useState<{modelId:string;answer?:ModelAnswer}|null>(null);
  const [deleting,setDeleting]=useState<ModelAnswer|null>(null);
  const [history,setHistory]=useState<string|null>(null);
  const [reviewing,setReviewing]=useState<ModelAnswer|null>(null);
  const [addingModel,setAddingModel]=useState(false);
  const [configModel,setConfigModel]=useState<Model|null>(null);
  const [generating,setGenerating]=useState<Model|null>(null);
  useEffect(()=>store.subscribe(()=>setData(store.getState())),[store]);
  const cases=data.cases.filter(c=>!data.cases.some(other=>other.case_id===c.case_id&&other.version>c.version));
  const question=cases.find(c=>c.case_id===selected)??cases[0];
  const models=data.models.filter(m=>m.enabled);
  const activeAnswers=data.answers.filter(a=>a.case_id===question.case_id&&a.is_current&&!a.deleted_at);
  function act(action:()=>void,success:string) {try {action();setNotice(success);} catch(e){setNotice(`操作失败：${String(e)}`);}}
  return <div className="layout">
    <aside className="sidebar"><a className="brand" href="#"><span className="brand-icon">评</span><span>金融 Agent<span className="brand-sub">EVALUATION ARENA</span></span></a>
      <button className={`case-nav ${view==='summary'?'selected':''}`} onClick={()=>setView('summary')}>▥ 评测汇总与排行榜</button>
      <button className={`case-nav ${view==='filters'?'selected':''}`} onClick={()=>setView('filters')}>⌕ 分级筛选</button>
      <div className="section-label">评测工作台 <span>{cases.length.toString().padStart(2,'0')}</span></div>
      <nav aria-label="评测题目">{cases.map((c,i)=><button key={c.case_id} className={`case-nav ${view==='cases'&&c.case_id===question.case_id?'selected':''}`} onClick={()=>{setSelected(c.case_id);setView('cases');setNotice('');}} aria-current={view==='cases'&&c.case_id===question.case_id?'page':undefined}><span className="case-number">{String(i+1).padStart(2,'0')}</span><span><strong>{headings[i]??c.case_id}</strong><small>{c.case_id}</small></span></button>)}</nav>
      <div className="sidebar-note"><span className="dot"/> 本地模拟数据集<p>内置回答为模拟样本，<br/>API 生成回答单独标识。</p></div>
    </aside>
    <main><header className="topbar"><span>工作台 <span className="slash">/</span> {view==='summary'?'评测汇总':view==='filters'?'分级筛选':'单题对比'}</span><span className="local-badge">本地保存 · 可选 API 调用</span></header>
      <div className="workspace">{view==='filters'?<ReviewExplorer data={data} filters={filters} change={setFilters} openCase={id=>{setSelected(id);setView('cases');}}/>:view==='summary'?<SummaryReport data={data} readOnly={!!store.warning} openCase={id=>{setSelected(id);setView('cases');}} saveRules={dims=>store.updateScoring(dims)}/>:<><div className="page-heading"><div><div className="eyebrow">COMPARE & REVIEW</div><h1>让每个回答，都有据可查。</h1><p>对照参考证据，比较不同模型在同一问题上的回答。</p></div><button className="primary" onClick={()=>setAddingModel(true)} disabled={!!store.warning}>＋ 添加模型</button></div>
      {store.warning&&<p role="alert" className="warning">{store.warning}</p>}{notice&&<p role="status" className={notice.startsWith('操作失败')?'warning':'notice'}>{notice}</p>}
      <section className="question-panel"><div className="question-meta"><span className="pill">评测题 {question.case_id}</span><span>截止时间 · {stamp(question.cutoff_at)}（北京时间）</span></div><h2>{question.question}</h2><div className="tags">{question.risk_labels.map(l=><span key={l}>{l}</span>)}</div>
        <details><summary>参考答案与证据 <span>展开核对 ↓</span></summary><p className="reference-answer">{question.reference_answer}</p><div className="reference-values">{question.reference_values.map(v=><div key={v.key}><small>{v.label}</small><strong>{v.value} <em>{v.unit}</em></strong><small>{v.period}</small></div>)}</div>
          <div className="evidence-grid">{question.allowed_evidence.map(e=><article key={e.evidence_id}><strong>{e.title}</strong><small>{e.source_name} · {stamp(e.published_at)}</small><p>{e.content}</p>{Date.parse(e.published_at)>Date.parse(question.cutoff_at)&&<p className="warning">截止日后发布，仅供对照核查。</p>}</article>)}</div></details>
      </section>
      <div className="compare-heading"><h2>模型回答 <span>{activeAnswers.length} / {models.length}</span></h2><span>左右滑动对比 · 修改后需重新评审</span></div>
      <div className="answer-grid">{models.map((model,i)=>{
        const answer=activeAnswers.find(a=>a.model_id===model.model_id);
        const review=answer&&data.reviews.find(r=>r.answer_id===answer.answer_id&&r.answer_version===answer.version&&!r.deleted_at);
        const historical=data.answers.some(a=>a.case_id===question.case_id&&a.model_id===model.model_id);
        return <article className="answer-card" key={model.model_id} aria-label={`${model.display_name}回答`}><div className="card-heading"><div className={`avatar tone-${i%4}`}>{model.display_name.slice(0,1)}</div><div><h3>{model.display_name}</h3><small>{answer?`v${answer.version} · ${answer.simulated?'模拟回答':'API 生成'}`:'等待添加回答'}</small></div><span className="status">{reviewReadiness(review,data.scoring.dimensions).label}</span></div>
          <div className="connection-actions"><button onClick={()=>setConfigModel(model)} disabled={!!store.warning}>API 配置</button><button onClick={()=>setGenerating(model)} disabled={!!store.warning}>生成回答</button><small>{model.model_name??'未配置接口模型'}</small></div>
          {answer?<><p className="answer-text">{answer.answer}</p><div className="citation-list"><h4>引用与来源 <span>{answer.citations.length}</span></h4>{!answer.citations.length&&<p className="warning">未提供引用，请人工核查。</p>}{answer.citations.map(c=><div className="citation" key={c.citation_id}><strong>{c.title}</strong><small>{c.source_name} · {stamp(c.published_at)}</small><p>{c.excerpt}</p>{!question.allowed_evidence.some(e=>e.evidence_id===c.evidence_id)&&<p className="warning">未匹配到本题证据，请人工核查。</p>}{Date.parse(c.published_at)>Date.parse(question.cutoff_at)&&<p className="warning">引用晚于数据截止时间。</p>}{Date.parse(c.published_at)>Date.parse(answer.generated_at)&&<p className="warning">引用发布时间晚于回答生成时间。</p>}</div>)}</div><ReviewSummary review={review||undefined} dimensions={data.scoring.dimensions}/><div className="review-entry"><button className="primary" disabled={!!store.warning} onClick={()=>setReviewing(answer)}>{review?'编辑评审':'开始评审'}</button></div><div className="card-bottom"><small>生成于 {stamp(answer.generated_at)}</small><div className="card-actions"><button onClick={()=>setEditor({modelId:model.model_id,answer})} disabled={!!store.warning}>编辑回答</button><button onClick={()=>setHistory(model.model_id)}>历史</button><button className="danger" onClick={()=>setDeleting(answer)} disabled={!!store.warning}>删除</button></div></div></>:<div className="empty"><span>＋</span><h3>该模型暂无回答</h3><p>添加模拟回答后即可参与对比。</p><button onClick={()=>setEditor({modelId:model.model_id})} disabled={!!store.warning}>添加回答</button>{historical&&<button onClick={()=>setHistory(model.model_id)}>查看历史</button>}</div>}
        </article>;
      })}</div><footer>人工评分为最终依据 <span>共 {data.models.length} 个模型 · {data.audit_events.length} 条审计事件</span></footer></>}</div>
    </main>
    {reviewing&&<ReviewForm answer={reviewing} modelName={models.find(m=>m.model_id===reviewing.model_id)!.display_name} question={question} dimensions={data.scoring.dimensions} labels={data.failure_labels} review={data.reviews.find(r=>r.answer_id===reviewing.answer_id&&r.answer_version===reviewing.version&&!r.deleted_at)} events={data.audit_events} close={()=>setReviewing(null)} save={draft=>{store.saveReview(draft);setReviewing(null);setNotice('评审已保存');}}/>}
    {editor&&<AnswerEditor question={question} modelName={models.find(m=>m.model_id===editor.modelId)!.display_name} answer={editor.answer} close={()=>setEditor(null)} save={edit=>{if(editor.answer)store.editAnswer(editor.answer.answer_id,edit);else store.addAnswer(question.case_id,editor.modelId,edit);setEditor(null);setNotice('回答已保存');}}/>}
    {(addingModel||configModel)&&<ConnectionEditor model={configModel??undefined} close={()=>{setAddingModel(false);setConfigModel(null);}} saveLocal={(input,id)=>{if(id){store.updateModel(id,input);return id;}return store.addModel(input);}} done={()=>{setAddingModel(false);setConfigModel(null);setNotice('模型配置已保存');}}/>}
    {generating&&<GenerateAnswer model={generating} question={question} close={()=>setGenerating(null)} save={result=>{const current=activeAnswers.find(a=>a.model_id===generating.model_id);if(current)store.editAnswer(current.answer_id,result);else store.addAnswer(question.case_id,generating.model_id,result);setGenerating(null);setNotice('API 回答已保存，待人工评审');}}/>}
    {deleting&&<Modal title="删除当前回答" close={()=>setDeleting(null)}><p>删除后退出当前对比。回答版本、关联评审及审计历史仍然保留。</p><div className="modal-actions"><button onClick={()=>setDeleting(null)}>取消</button><button className="danger" onClick={()=>act(()=>{store.deleteAnswer(deleting.answer_id);setDeleting(null);},'回答已软删除，历史已保留')}>确认删除</button></div></Modal>}
    {history&&<Modal title={`${models.find(m=>m.model_id===history)?.display_name} · 回答历史`} close={()=>setHistory(null)}><div className="history-list">{data.answers.filter(a=>a.case_id===question.case_id&&a.model_id===history).sort((a,b)=>b.version-a.version).map(a=>{
      const r=data.reviews.find(r=>r.answer_id===a.answer_id&&r.answer_version===a.version);
      return <article key={`${a.answer_id}-${a.version}`}><h3>v{a.version} · {a.deleted_at?'已删除':a.is_current?'当前版本':'历史版本'}</h3><small>生成于 {stamp(a.generated_at)}</small>{a.deleted_at&&<small>删除于 {stamp(a.deleted_at)}</small>}<p>{a.answer}</p><details><summary>引用快照（{a.citations.length}）</summary>{a.citations.map(c=><p key={c.citation_id}>{c.source_name} · {stamp(c.published_at)}<br/>{c.excerpt}</p>)}</details><p>评审：{r?statusNames[r.status]:'未评审'}</p>{r&&<><p>{r.comment}</p><ul>{r.dimension_scores.map(s=><li key={s.dimension_id}>{s.label_snapshot??s.dimension_id}：{s.score}</li>)}</ul><p>{r.failure_labels.join('、')||'无失败标签'}</p></>}</article>;
    })}</div></Modal>}
  </div>;
}

type ConnectionInput=Pick<Model,'display_name'|'base_url'|'model_name'>;
function ConnectionEditor({model,close,saveLocal,done}:{model?:Model;close:()=>void;saveLocal:(input:ConnectionInput,id?:string)=>string;done:()=>void}) {
  const [name,setName]=useState(model?.display_name??'');
  const [base,setBase]=useState(model?.base_url??'');
  const [modelName,setModelName]=useState(model?.model_name??'');
  const [key,setKey]=useState('');const [hasKey,setHasKey]=useState(false);
  const [enabled,setEnabled]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const savedId=useRef(model?.model_id);
  useEffect(()=>{if(model)modelApi<{has_key?:boolean}>(`/api/connections/${encodeURIComponent(model.model_id)}`).then(r=>setHasKey(!!r.has_key)).catch(()=>setHasKey(false));},[model]);
  return <Modal title={model?'配置模型 API':'添加模型与 API'} close={()=>{if(!busy)close();}}><form onSubmit={async e=>{
    e.preventDefault();setError('');setBusy(true);
    try {
      const input={display_name:name.trim(),...(enabled?{base_url:base.trim(),model_name:modelName.trim()}:{})};
      if(enabled){const u=new URL(base);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error('Base URL 应为不含密钥或查询参数的 HTTP(S) 地址');}
      savedId.current=saveLocal(input,savedId.current);
      if(enabled)await modelApi(`/api/connections/${encodeURIComponent(savedId.current)}`,{base_url:base.trim(),model_name:modelName.trim(),...(key?{api_key:key}:{})},'PUT');
      setKey('');done();
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }}><label>模型显示名称<input required value={name} onChange={e=>setName(e.target.value)} maxLength={80}/></label>
    {!model&&<label className="checkbox-label"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>配置 API（取消后仅添加模拟模型）</label>}
    {enabled&&<><label>Base URL<input type="url" required placeholder="https://your-provider.example/v1" value={base} onChange={e=>{setBase(e.target.value);setHasKey(false);}}/></label><label>Model Name<input required placeholder="供应商提供的模型 ID" value={modelName} onChange={e=>{setModelName(e.target.value);setHasKey(false);}}/></label><label>API Key<input type="password" autoComplete="off" placeholder={hasKey?'已设置，留空保留':'填写供应商密钥；无鉴权本地接口可留空'} value={key} onChange={e=>setKey(e.target.value)}/></label><p className="hint">OpenAI 兼容协议。Base URL 后自动追加 /chat/completions，也可填写完整接口地址。保存配置不会发送模型请求。</p><p className="hint">密钥仅保留在本地服务内存中，刷新页面仍可用；重启服务需重新填写。更换地址或模型时请重新提供密钥。</p></>}
    {error&&<p role="alert" className="warning">{error}</p>}<div className="modal-actions"><button type="button" disabled={busy} onClick={close}>取消</button><button className="primary" disabled={busy}>{busy?'保存中…':'保存模型'}</button></div></form></Modal>;
}

type GeneratedResult=Pick<ModelAnswer,'answer'|'citations'|'generated_at'|'simulated'|'connection_snapshot'>;
function GenerateAnswer({model,question,close,save}:{model:Model;question:EvaluationCase;close:()=>void;save:(r:GeneratedResult)=>void}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [result,setResult]=useState<GeneratedResult|null>(null);
  return <Modal title={`生成回答 · ${model.display_name}`} close={()=>{if(!busy)close();}}><p>{question.question}</p><p className="hint">发送本题问题、截止时间及截止前已发布的本地证据，不发送参考答案或评审记录。调用可能消耗接口额度。</p><p>模型：{model.model_name??'尚未配置'}<br/>Base URL：{model.base_url??'请先打开 API 配置'}</p>
    {result&&<><h3>生成结果预览</h3><p className="generated-text">{result.answer}</p><p className="hint">引用保留在原始回答中，结构化引用待人工核对补录。保存为当前回答的新版本，旧回答与旧评分保留。</p></>}
    {error&&<p role="alert" className="warning">{error}</p>}
    <div className="modal-actions"><button disabled={busy} onClick={close}>关闭</button>{result?<button className="primary" onClick={()=>{try{save(result);}catch(e){setError(String(e));}}}>保存为新回答</button>:<button className="primary" disabled={busy||!model.base_url||!model.model_name} onClick={async()=>{setBusy(true);setError('');try{setResult(await modelApi<GeneratedResult>('/api/generate',{model_id:model.model_id,base_url:model.base_url,model_name:model.model_name,question}));}catch(e){setError(String(e));}finally{setBusy(false);}}}>{busy?'正在生成…':'发送请求'}</button>}</div></Modal>;
}

function AnswerEditor({question,modelName,answer,close,save}:{question:EvaluationCase;modelName:string;answer?:ModelAnswer;close:()=>void;save:(edit:Pick<ModelAnswer,'answer'|'citations'|'generated_at'>)=>void}) {
  const [text,setText]=useState(answer?.answer??'');
  const [generated,setGenerated]=useState(answer?.generated_at??new Date().toISOString());
  const [citations,setCitations]=useState<ModelAnswer['citations']>(answer?.citations??[]);
  const [error,setError]=useState('');
  const [dirty,setDirty]=useState(false);
  const [discard,setDiscard]=useState(false);
  useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return ()=>window.removeEventListener('beforeunload',handler);},[dirty]);
  function update(index:number,field:string,value:string) {setDirty(true);setCitations(c=>c.map((c,i)=>i===index?{...c,[field]:value}:c));}
  return <Modal title={`${answer?'编辑':'添加'}回答 · ${modelName}`} close={()=>dirty?setDiscard(true):close()}><form onSubmit={e=>{e.preventDefault();try {save({answer:text,citations,generated_at:generated});}catch(e){setError(String(e));}}} onChange={()=>setDirty(true)}>
    <label>模拟回答<textarea required value={text} onChange={e=>setText(e.target.value)} rows={5}/></label><label>生成时间（ISO 8601，含时区）<input required value={generated} onChange={e=>setGenerated(e.target.value)}/></label>
    <label>从本题证据添加引用<select defaultValue="" onChange={e=>{const ev=question.allowed_evidence.find(v=>v.evidence_id===e.target.value);if(ev)setCitations(c=>[...c,{citation_id:crypto.randomUUID(),evidence_id:ev.evidence_id,title:ev.title,source_name:ev.source_name,published_at:ev.published_at,excerpt:ev.content}]);e.target.value='';}}><option value="">选择证据…</option>{question.allowed_evidence.map(ev=><option key={ev.evidence_id} value={ev.evidence_id}>{ev.title}</option>)}</select></label>
    <button type="button" onClick={()=>{setDirty(true);setCitations(c=>[...c,{citation_id:crypto.randomUUID(),source_name:'',title:'',published_at:'2026-03-20T00:00:00Z',excerpt:''}]);}}>＋ 自定义引用</button>
    {citations.map((c,i)=><fieldset key={c.citation_id}><legend>引用 {i+1}</legend><label>来源名称<input required value={c.source_name} onChange={e=>update(i,'source_name',e.target.value)}/></label><label>标题<input required value={c.title} onChange={e=>update(i,'title',e.target.value)}/></label><label>发布时间（ISO 8601）<input required value={c.published_at} onChange={e=>update(i,'published_at',e.target.value)}/></label><label>摘录<textarea value={c.excerpt} onChange={e=>update(i,'excerpt',e.target.value)}/></label><button type="button" className="danger" onClick={()=>{setDirty(true);setCitations(c=>c.filter((_,j)=>j!==i));}}>移除此引用</button></fieldset>)}
    {answer&&<p className="hint">内容变化将生成新版本，旧评分保留在历史中，新版需重新评审。</p>}{error&&<p role="alert" className="warning">保存失败：{error}</p>}
    {discard&&<div role="alert" className="warning">有未保存的修改。<button type="button" onClick={close}>放弃修改</button><button type="button" onClick={()=>setDiscard(false)}>继续编辑</button></div>}
    <div className="modal-actions"><button type="button" onClick={()=>dirty?setDiscard(true):close()}>取消</button><button className="primary">保存回答</button></div></form></Modal>;
}
