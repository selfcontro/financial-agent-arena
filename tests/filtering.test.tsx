// @vitest-environment jsdom
import {afterEach,describe,it,expect} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import type { ReviewRecord } from '../src/types/evaluation.js';
import {useState} from 'react';
import {createSeedDataset} from '../src/data/seed.js';
import {emptyFilters,filterReviews,type ReviewFilters} from '../src/services/filtering.js';
import {ReviewExplorer} from '../src/components/ReviewExplorer.js';
afterEach(cleanup);
function fixture(){
  const d=createSeedDataset();
  for(const [i,labels] of ([['数字错误','引用无效'],['数字错误']] as ReviewRecord['failure_labels'][]).entries()){
    const a=d.answers.find(a=>a.model_id==='wencai'&&a.case_id===`case-00${i+1}`)!;
    d.reviews.push({review_id:`r${i}`,answer_id:a.answer_id,answer_version:a.version,case_id:a.case_id,model_id:a.model_id,scoring_version:1,dimension_scores:d.scoring.dimensions.map(v=>({dimension_id:v.dimension_id,score:0})),failure_labels:labels,comment:'仅供测试',status:i?'in_progress':'completed',created_at:d.updated_at,updated_at:d.updated_at,...(!i?{reviewed_at:d.updated_at}:{})});
  }return d;
}
describe('hierarchical filters',()=>{
  it('requires model selection and includes unreviewed records and missing answers',()=>{
    const d=fixture();expect(filterReviews(d,emptyFilters).rows).toHaveLength(0);
    expect(filterReviews(d,{...emptyFilters,modelId:'*'}).rows).toHaveLength(20);
    d.answers.find(a=>a.model_id==='wencai'&&a.case_id==='case-003')!.deleted_at=d.updated_at;
    expect(filterReviews(d,{...emptyFilters,modelId:'wencai',status:'缺少回答'}).rows).toHaveLength(1);
  });
  it('matches any/all labels then status and case, with upstream counts',()=>{
    const d=fixture(),f={...emptyFilters,modelId:'wencai',labels:['数字错误','引用无效']};
    expect(filterReviews(d,f).rows).toHaveLength(2);
    expect(filterReviews(d,{...f,labelMode:'all'}).rows).toHaveLength(1);
    const r=filterReviews(d,{...f,status:'评审中',caseId:'case-002'});
    expect(r.rows).toHaveLength(1);expect(r.rows[0].score).toBeNull();expect(r.labels[0].count).toBe(2);
    expect(filterReviews(d,{...f,status:'已完成'}).rows[0].score).toBe(0);
  });
  it('never matches old-version labels and distinguishes pending reviews',()=>{
    const d=fixture(),a=d.answers.find(a=>a.model_id==='wencai'&&a.case_id==='case-001')!;
    a.is_current=false;d.answers.push({...a,version:2,is_current:true});
    expect(filterReviews(d,{...emptyFilters,modelId:'wencai',labels:['引用无效']}).rows).toHaveLength(0);
    a.is_current=true;d.answers.pop();d.scoring_history.push(structuredClone(d.scoring));d.scoring.version=2;d.scoring.dimensions.push({dimension_id:'extra',label:'新增',weight:0,enabled:true,description:'测试'});
    expect(filterReviews(d,{...emptyFilters,modelId:'wencai',status:'待补评'}).rows).toHaveLength(1);
    expect(filterReviews(d,{...emptyFilters,modelId:'wencai',status:'已完成'}).rows).toHaveLength(0);
  });
  it('resets downstream controls and opens the matching case without hiding other models',()=>{
    let opened='';function Harness(){const[f,setF]=useState<ReviewFilters>({...emptyFilters});return <ReviewExplorer data={fixture()} filters={f} change={setF} openCase={id=>{opened=id;}}/>;}render(<Harness/>);
    expect((screen.getByLabelText('3 · 评审状态') as HTMLSelectElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('1 · 模型'),{target:{value:'wencai'}});
    fireEvent.click(screen.getByLabelText('数字错误（2）'));
    fireEvent.change(screen.getByLabelText('3 · 评审状态'),{target:{value:'已完成'}});
    fireEvent.click(screen.getByRole('button',{name:'查看同题全部模型 case-001 同花顺问财'}));expect(opened).toBe('case-001');
    fireEvent.change(screen.getByLabelText('1 · 模型'),{target:{value:'doubao'}});
    expect((screen.getByLabelText('3 · 评审状态') as HTMLSelectElement).value).toBe('');expect((screen.getByLabelText('数字错误（0）') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole('status').textContent).toContain('找到 5 条');
    fireEvent.click(screen.getByRole('button',{name:'重置筛选'}));expect(screen.getByRole('status').textContent).toContain('请先选择');
  });
});
