import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { EvaluationStore } from './store/evaluationStore.js';
import { Repository } from './store/storage.js';
import type { EvaluationCase, ModelAnswer } from './types/evaluation.js';

const headings=['营收同比','单位换算','数据时效','风险识别','因果判断'];
const statusNames={unreviewed:'未评审',in_progress:'评审中',completed:'已完成'};
const stamp=(s:string)=>new Date(s).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'});
function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} onCancel={e=>{e.preventDefault();close();}} aria-label={title}><div className="modal-head"><h2>{title}</h2><button onClick={close} aria-label="关闭弹窗">×</button></div>{children}</dialog>;
}

export function App() {
  const [store]=useState(()=>new EvaluationStore(new Repository(window.localStorage)));
  const [data,setData]=useState(()=>store.getState());
  const [selected,setSelected]=useState(data.cases[0].case_id);
  const [notice,setNotice]=useState('');
  const [editor,setEditor]=useState<{modelId:string;answer?:ModelAnswer}|null>(null);
  const [deleting,setDeleting]=useState<ModelAnswer|null>(null);
  const [history,setHistory]=useState<string|null>(null);
  const [addingModel,setAddingModel]=useState(false);
  useEffect(()=>store.subscribe(()=>setData(store.getState())),[store]);
  const cases=data.cases.filter(c=>!data.cases.some(other=>other.case_id===c.case_id&&other.version>c.version));
  const question=cases.find(c=>c.case_id===selected)??cases[0];
  const models=data.models.filter(m=>m.enabled);
  const activeAnswers=data.answers.filter(a=>a.case_id===question.case_id&&a.is_current&&!a.deleted_at);
  function act(action:()=>void,success:string) {try {action();setNotice(success);} catch(e){setNotice(`操作失败：${String(e)}`);}}
  return <div className="layout">
    <aside className="sidebar"><a className="brand" href="#"><span className="brand-icon">评</span><span>金融 Agent<span className="brand-sub">EVALUATION ARENA</span></span></a>
      <div className="section-label">评测工作台 <span>{cases.length.toString().padStart(2,'0')}</span></div>
      <nav aria-label="评测题目">{cases.map((c,i)=><button key={c.case_id} className={`case-nav ${c.case_id===question.case_id?'selected':''}`} onClick={()=>{setSelected(c.case_id);setNotice('');}} aria-current={c.case_id===question.case_id?'page':undefined}><span className="case-number">{String(i+1).padStart(2,'0')}</span><span><strong>{headings[i]??c.case_id}</strong><small>{c.case_id}</small></span></button>)}</nav>
      <div className="sidebar-note"><span className="dot"/> 本地模拟数据集<p>所有回答均为模拟样本，<br/>不代表产品真实表现。</p></div>
    </aside>
    <main><header className="topbar"><span>工作台 <span className="slash">/</span> 单题对比</span><span className="local-badge">本地保存 · 无模型调用</span></header>
      <div className="workspace"><div className="page-heading"><div><div className="eyebrow">COMPARE & REVIEW</div><h1>让每个回答，都有据可查。</h1><p>对照参考证据，比较不同模型在同一问题上的回答。</p></div><button className="primary" onClick={()=>setAddingModel(true)} disabled={!!store.warning}>＋ 添加模型</button></div>
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
        return <article className="answer-card" key={model.model_id} aria-label={`${model.display_name}回答`}><div className="card-heading"><div className={`avatar tone-${i%4}`}>{model.display_name.slice(0,1)}</div><div><h3>{model.display_name}</h3><small>{answer?`回答版本 v${answer.version}`:'等待添加回答'}</small></div><span className="status">{review?statusNames[review.status]:'未评审'}</span></div>
          {answer?<><p className="answer-text">{answer.answer}</p><div className="citation-list"><h4>引用与来源 <span>{answer.citations.length}</span></h4>{!answer.citations.length&&<p className="warning">未提供引用，请人工核查。</p>}{answer.citations.map(c=><div className="citation" key={c.citation_id}><strong>{c.title}</strong><small>{c.source_name} · {stamp(c.published_at)}</small><p>{c.excerpt}</p>{!question.allowed_evidence.some(e=>e.evidence_id===c.evidence_id)&&<p className="warning">未匹配到本题证据，请人工核查。</p>}{Date.parse(c.published_at)>Date.parse(question.cutoff_at)&&<p className="warning">引用晚于数据截止时间。</p>}{Date.parse(c.published_at)>Date.parse(answer.generated_at)&&<p className="warning">引用发布时间晚于回答生成时间。</p>}</div>)}</div><div className="card-bottom"><small>生成于 {stamp(answer.generated_at)}</small><div className="card-actions"><button onClick={()=>setEditor({modelId:model.model_id,answer})} disabled={!!store.warning}>编辑回答</button><button onClick={()=>setHistory(model.model_id)}>历史</button><button className="danger" onClick={()=>setDeleting(answer)} disabled={!!store.warning}>删除</button></div></div></>:<div className="empty"><span>＋</span><h3>该模型暂无回答</h3><p>添加模拟回答后即可参与对比。</p><button onClick={()=>setEditor({modelId:model.model_id})} disabled={!!store.warning}>添加回答</button>{historical&&<button onClick={()=>setHistory(model.model_id)}>查看历史</button>}</div>}
        </article>;
      })}</div><footer>模拟数据 · 人工评分为最终依据 <span>共 {data.models.length} 个模型 · {data.audit_events.length} 条审计事件</span></footer></div>
    </main>
    {editor&&<AnswerEditor question={question} modelName={models.find(m=>m.model_id===editor.modelId)!.display_name} answer={editor.answer} close={()=>setEditor(null)} save={edit=>{if(editor.answer)store.editAnswer(editor.answer.answer_id,edit);else store.addAnswer(question.case_id,editor.modelId,edit);setEditor(null);setNotice('回答已保存');}}/>}
    {addingModel&&<ModelEditor close={()=>setAddingModel(false)} save={(display_name)=>{store.addModel({display_name});setAddingModel(false);setNotice('模型已添加，可为各题添加回答');}}/>}
    {deleting&&<Modal title="删除当前回答" close={()=>setDeleting(null)}><p>删除后退出当前对比。回答版本、关联评审及审计历史仍然保留。</p><div className="modal-actions"><button onClick={()=>setDeleting(null)}>取消</button><button className="danger" onClick={()=>act(()=>{store.deleteAnswer(deleting.answer_id);setDeleting(null);},'回答已软删除，历史已保留')}>确认删除</button></div></Modal>}
    {history&&<Modal title={`${models.find(m=>m.model_id===history)?.display_name} · 回答历史`} close={()=>setHistory(null)}><div className="history-list">{data.answers.filter(a=>a.case_id===question.case_id&&a.model_id===history).sort((a,b)=>b.version-a.version).map(a=>{
      const r=data.reviews.find(r=>r.answer_id===a.answer_id&&r.answer_version===a.version);
      return <article key={`${a.answer_id}-${a.version}`}><h3>v{a.version} · {a.deleted_at?'已删除':a.is_current?'当前版本':'历史版本'}</h3><small>生成于 {stamp(a.generated_at)}</small>{a.deleted_at&&<small>删除于 {stamp(a.deleted_at)}</small>}<p>{a.answer}</p><details><summary>引用快照（{a.citations.length}）</summary>{a.citations.map(c=><p key={c.citation_id}>{c.source_name} · {stamp(c.published_at)}<br/>{c.excerpt}</p>)}</details><p>评审：{r?statusNames[r.status]:'未评审'}</p>{r&&<><p>{r.comment}</p><ul>{r.dimension_scores.map(s=><li key={s.dimension_id}>{s.label_snapshot??s.dimension_id}：{s.score}</li>)}</ul><p>{r.failure_labels.join('、')||'无失败标签'}</p></>}</article>;
    })}</div></Modal>}
  </div>;
}

function ModelEditor({close,save}:{close:()=>void;save:(name:string)=>void}) {
  const [name,setName]=useState('');const [error,setError]=useState('');
  return <Modal title="添加对比模型" close={close}><form onSubmit={e=>{e.preventDefault();try{save(name.trim());}catch(e){setError(String(e));}}}><p>为新模型创建回答栏。当前使用本地模拟数据。</p><label>模型显示名称<input required value={name} onChange={e=>setName(e.target.value)} maxLength={80}/></label>{error&&<p role="alert" className="warning">{error}</p>}<div className="modal-actions"><button type="button" onClick={close}>取消</button><button className="primary">保存模型</button></div></form></Modal>;
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
