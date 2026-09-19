import {useEffect,useState} from 'react';
import type {EvaluationStore} from '../store/evaluationStore.js';
import type {EvaluationDataset} from '../types/evaluation.js';
import type {Backup} from '../store/storage.js';
import {validateDataset} from '../services/validation.js';

export function downloadJson(value:unknown,name:string){downloadText(JSON.stringify(value,null,2),name);}
export function downloadText(text:string,name:string){
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function Counts({data}:{data:EvaluationDataset}){return <p>数据集：{data.dataset_id} · 题目 {new Set(data.cases.map(c=>c.case_id)).size} 道（含历史 {data.cases.length} 条） · 模型 {data.models.length} 个 · 回答 {data.answers.length} 条 · 评审 {data.reviews.length} 条 · 审计 {data.audit_events.length} 条 · 规则 v{data.scoring.version}</p>;}
export function DataManager({store,data}:{store:EvaluationStore;data:EvaluationDataset}){
  const [backups,setBackups]=useState<Backup[]>([]);const [errors,setErrors]=useState<string[]>([]);
  const [preview,setPreview]=useState<EvaluationDataset|null>(null);const [source,setSource]=useState('');
  const [target,setTarget]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  async function refresh(){const list=await store.listBackups();setBackups(list.backups);setErrors(list.errors.map(e=>`${e.backup_id}：${e.message}`));}
  useEffect(()=>{void refresh().catch(e=>setError(String(e)));},[store]);
  async function run(action:()=>Promise<void>,success:string){setBusy(true);setError('');setMessage('');try{await action();setMessage(success);}catch(e){setError(String(e));}finally{try{await refresh();}catch(e){setError(String(e));}setBusy(false);}}
  const chosen=backups.find(b=>b.backup_id===target);
  return <section className="summary-page" aria-label="数据与备份"><div className="page-heading"><div><div className="eyebrow">DATA & BACKUPS</div><h1>数据与备份</h1><p>完整导出题目、回答、评审、评分规则及审计历史。</p></div></div>
    {store.warning&&<p role="alert" className="warning">{store.warning}</p>}{error&&<p role="alert" className="warning">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}
    <section className="report-panel"><h2>当前数据</h2><Counts data={data}/><div className="settings-tools"><button disabled={busy} onClick={()=>downloadJson(data,`arena-${Date.now()}.json`)}>{store.warning?'导出只读模拟副本':'导出当前 JSON'}</button>{store.warning&&<button onClick={()=>{try{const raw=store.rawCurrent();if(raw===null)throw new Error('没有可导出的原始数据');downloadText(raw,`arena-recovery-${Date.now()}.json`);}catch(e){setError(String(e));}}}>导出原始数据以修复</button>}<button disabled={busy||!!store.warning} onClick={()=>void run(async()=>{await store.backup();},'手动备份已保存')}>创建备份</button></div><p className="hint">备份保存在当前浏览器，请下载 JSON 留存。清除浏览器数据会删除本地评审与备份。API Key 不在导出文件中。</p></section>
    <section className="report-panel"><h2>导入 JSON · 完整替换</h2><label>选择评测数据文件<input aria-label="选择评测数据文件" type="file" accept=".json,application/json" disabled={busy||!!store.warning} onChange={e=>{const file=e.target.files?.[0];e.target.value='';setPreview(null);setError('');setMessage('');if(!file)return;setBusy(true);void file.text().then(text=>{setPreview(validateDataset(JSON.parse(text)));setSource(file.name);}).catch(e=>setError(`导入校验失败：${String(e)}`)).finally(()=>setBusy(false));}}/></label>
      <p className="hint">先校验文件并预览数量，再确认替换。替换前自动创建备份；备份失败则停止替换。原数据的完整历史保留在该备份中。</p>
      {preview&&<div><h3>待导入：{source}</h3><Counts data={preview}/><div className="settings-tools"><button disabled={busy||!!store.warning} className="primary" onClick={()=>void run(async()=>{await store.importDataset(preview);setPreview(null);setTarget('');},'导入完成，替换前数据已备份')}>备份并确认完整替换</button><button disabled={busy} onClick={()=>setPreview(null)}>取消导入</button></div></div>}
    </section>
    <section className="report-panel"><h2>历史备份（{backups.length}）</h2><p className="hint">读取时校验 SHA-256 内容摘要；损坏备份不会出现在可恢复列表。恢复前也会备份当前数据。恢复会新增审计事件，因此操作时间与审计记录会变化。</p><button disabled={busy} onClick={()=>void run(async()=>{},'备份列表已刷新')}>刷新备份列表</button>
      {errors.map(e=><p className="warning" key={e}>不可用备份：{e}</p>)}
      <label>选择恢复备份<select aria-label="选择恢复备份" disabled={busy} value={target} onChange={e=>setTarget(e.target.value)}><option value="">请选择历史备份</option>{backups.map(b=><option key={b.backup_id} value={b.backup_id}>{b.created_at} · {b.reason} · {b.backup_id}</option>)}</select></label>
      {chosen&&<div><Counts data={chosen.data}/><p className="backup-hash">SHA-256：{chosen.content_hash}</p><div className="settings-tools"><button disabled={busy} onClick={()=>void run(async()=>{const b=await store.readBackup(chosen.backup_id);downloadJson(b.data,`arena-backup-${b.backup_id}.json`);},'备份 JSON 已导出')}>导出所选备份 JSON</button><button className="primary" disabled={busy||!!store.warning} onClick={()=>void run(async()=>{await store.restoreBackup(chosen.backup_id);setTarget('');setPreview(null);},'恢复完成，恢复前数据已另行备份')}>备份当前数据并确认恢复</button></div></div>}
    </section>
  </section>;
}
