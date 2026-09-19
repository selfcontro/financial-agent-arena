import {useState} from 'react';
import type {EvaluationDataset} from '../types/evaluation.js';
import {generateReport} from '../services/report.js';
import {downloadJson,downloadText} from './DataManager.js';
import {Modal} from './Modal.js';
export function ReportDownload({data}:{data:EvaluationDataset}){
  const [report,setReport]=useState<Awaited<ReturnType<typeof generateReport>>|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  return <><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{setReport(await generateReport(data));}catch(e){setError(String(e));}finally{setBusy(false);}}}>{busy?'生成中…':'生成对比报告'}</button>{error&&<p role="alert">{error}</p>}{report&&<Modal title="对比报告快照" close={()=>setReport(null)}><p>已冻结生成时的数据。后续修改评分不会改变这份报告。</p><p>有效完成 {report.summary.total_completed} / {report.summary.total_expected} · {report.generated_at}</p><p className="backup-hash">数据 SHA-256：{report.dataset_hash}</p><p className="hint">请同时保留 Markdown 和 JSON 快照。JSON 报告包含完整数据及计算结果，不能直接作为数据集导入；如需恢复，下载数据快照。</p><textarea aria-label="报告预览" readOnly rows={14} value={report.markdown}/><div className="settings-tools"><button onClick={()=>downloadText(report.markdown,'report.md')}>下载 Markdown 报告</button><button onClick={()=>downloadJson(report,'report.json')}>下载 JSON 报告</button><button onClick={()=>downloadJson(report.dataset,'report-dataset.json')}>下载数据快照</button></div></Modal>}</>;
}
