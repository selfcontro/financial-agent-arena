import type {EvaluationDataset} from '../types/evaluation.js';
import {validateDataset} from './validation.js';
import {aggregateDataset,roundScore} from './aggregation.js';
import {contentHash,canonicalJson} from '../store/storage.js';

const cell=(v:unknown)=>String(v??'—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\|/g,'&#124;').replace(/[\r\n]+/g,'<br>');
const table=(headers:string[],rows:unknown[][])=>[headers,headers.map(()=> '---'),...rows].map(row=>`| ${row.map(cell).join(' | ')} |`).join('\n');
const score=(n:number|null)=>n===null?'—':roundScore(n).toFixed(2);
export async function generateReport(input:EvaluationDataset,generatedAt=new Date().toISOString()){
  if(!Number.isFinite(Date.parse(generatedAt)))throw new Error('报告生成时间无效');
  const dataset=validateDataset(structuredClone(input));
  const hash=await contentHash(dataset),summary=aggregateDataset(dataset);
  const cases=dataset.cases.filter(c=>!dataset.cases.some(n=>n.case_id===c.case_id&&n.version>c.version));
  const sections=[
    '# 金融 Agent 模型对比报告',
    `生成时间：${cell(generatedAt)}\n\n数据集：${cell(dataset.dataset_id)}\n\n数据 SHA-256：${hash}\n\n计算版本：1 · 评分规则：v${summary.scoring_version}`,
    '题目及内置回答为模拟样本，不代表真实产品表现。人工评分为最终依据；本程序只汇总已保存评分，不自动评分。',
    `有效完成：${summary.total_completed}/${summary.total_expected}；待补评：${summary.total_pending}。${summary.total_completed?'各模型完成样本可能不同，请结合完成率解读。':'暂无有效已完成人工评审，本报告为未评分的数据对比报告，不给出模型优劣结论。'}`,
    '## 评分规则',
    '总分 = Σ(维度分数 / 10 × 权重) × 100。模型总分取有效完成题目的平均值；同分并列。缺分不计为零。仅纳入启用模型、最新题目对应的当前未删除回答及维度齐全的已完成评审。',
    table(['维度','权重'],summary.dimensions.map(d=>[d.label,`${roundScore(d.weight*100)}%`])),
    '## 模型排行榜',table(['排名','模型','平均总分 / 100','完成数','完成率'],summary.models.map(m=>[m.rank,m.model_name,score(m.average_score),`${m.completed_count}/${m.total_case_count}`,`${roundScore(m.completion_rate*100)}%`])),
    '## 分维度均分',table(['模型',...summary.dimensions.map(d=>d.label)],summary.models.map(m=>[m.model_name,...m.dimension_scores.map(d=>score(d.average_score))])),
    '## 失败标签分布', '每格为数量 / 有效完成评审中的比例，多标签独立计数，不额外扣分。',
    table(['模型',...dataset.failure_labels],summary.models.map(m=>[m.model_name,...m.failure_distribution.map(f=>f.rate===null?'—':`${f.count} / ${roundScore(f.rate*100)}%`)])),
    '## 单题对比',
  ];
  for(const c of cases){
    sections.push(`### ${cell(c.case_id)} · v${c.version}`,cell(c.question),`参考结论：${cell(c.reference_answer)}\n\n数据截止：${cell(c.cutoff_at)}\n\n风险标签：${cell(c.risk_labels.join('、'))}`,
      table(['关键数字','数值','单位','期间'],c.reference_values.map(v=>[v.label,v.value,v.unit,v.period])),
      table(['证据 ID','来源','发布时间','内容'],c.allowed_evidence.map(e=>[e.evidence_id,e.source_name,e.published_at,e.content])));
    for(const m of summary.models){const entry=m.entries.find(e=>e.case_id===c.case_id)!;const a=entry.answer,r=entry.review;
      sections.push(`#### ${cell(m.model_name)}`,`状态：${cell(entry.state)} · 总分：${score(entry.score)}\n\n回答版本：${a?`${cell(a.answer_id)} / v${a.version}（题目 v${a.case_version}）`:'无'} · 生成时间：${cell(a?.generated_at)} · 来源：${a?(a.simulated?'模拟回答':'API 生成'):'无'}`,cell(a?.answer??'暂无回答'));
      if(a)sections.push(table(['引用 ID','证据 ID','来源','发布时间','摘录'],a.citations.map(v=>[v.citation_id,v.evidence_id,v.source_name,v.published_at,v.excerpt])));
      if(r)sections.push(`评审 ID：${cell(r.review_id)} · 原始状态：${cell(r.status)} · 评分时规则：v${r.scoring_version} · 更新时间：${cell(r.updated_at)}`,
        table(['维度 ID','评分'],r.dimension_scores.map(s=>[s.dimension_id,s.score])),`失败标签：${cell(r.failure_labels.join('、')||'无')}\n\n评语：${cell(r.comment||'无')}`);
    }
  }
  sections.push('## 追溯与复现','配套 report.json 包含完整数据快照、原始评分、历史回答、规则历史和审计事件。使用同一计算版本及快照重新生成即可核对数据摘要与汇总；生成时间不属于数据摘要。报告采用全部启用模型，不应用页面筛选条件。');
  return {report_version:1 as const,calculation_version:1 as const,generated_at:generatedAt,dataset_hash:hash,dataset,summary,markdown:sections.join('\n\n')+'\n'};
}
export async function verifyReport(input:unknown){
  if(!input||typeof input!=='object')throw new Error('报告格式无效');
  const r=input as Awaited<ReturnType<typeof generateReport>>;
  if(r.report_version!==1||r.calculation_version!==1)throw new Error('不支持的报告版本');
  const fresh=await generateReport(r.dataset,r.generated_at);
  if(canonicalJson(fresh)!==canonicalJson(r))throw new Error('报告快照、摘要或计算结果不匹配');
  return fresh;
}
