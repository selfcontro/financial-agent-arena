// @vitest-environment jsdom
import { beforeAll,afterEach,describe,it,expect,vi } from 'vitest';
import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { ReviewForm } from '../src/components/ReviewForm.js';
import { createSeedDataset } from '../src/data/seed.js';
import { ReviewRecord } from '../src/types/evaluation.js';
import { reviewReadiness } from '../src/services/review.js';

beforeAll(()=>{Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});});
afterEach(cleanup);
function setup(review?:ReviewRecord,save=vi.fn(),extra=false) {
  const d=createSeedDataset();if(extra)d.scoring.dimensions.push({dimension_id:'extra',label:'补充维度',weight:0,enabled:true,description:'需要补评'});
  const close=vi.fn();render(<ReviewForm answer={d.answers[0]} modelName="测试模型" question={d.cases[0]} dimensions={d.scoring.dimensions} labels={d.failure_labels} review={review} events={[]} close={close} save={save}/>);
  return {d,save,close};
}
function fill(name:string,value:string){fireEvent.change(screen.getByRole('spinbutton',{name}),{target:{value}});}
function submit(){fireEvent.click(screen.getByRole('button',{name:'保存评审'}));}
function completed():ReviewRecord {
  const d=createSeedDataset(),a=d.answers[0];return {review_id:'r',case_id:a.case_id,model_id:a.model_id,answer_id:a.answer_id,answer_version:1,scoring_version:1,dimension_scores:d.scoring.dimensions.map(x=>({dimension_id:x.dimension_id,score:8})),failure_labels:[],comment:'原始评语',status:'completed',created_at:d.updated_at,updated_at:d.updated_at,reviewed_at:d.updated_at};
}
describe('human review form',()=>{
  it('renders configurable dimensions and saves zero without filling absent scores',()=>{
    const {save}=setup(undefined,vi.fn(),true);expect(screen.getAllByRole('spinbutton')).toHaveLength(6);
    fill('数字正确性','0');fireEvent.click(screen.getByRole('checkbox',{name:'数字错误'}));fireEvent.click(screen.getByRole('checkbox',{name:'引用无效'}));fireEvent.change(screen.getByRole('textbox',{name:'评语'}),{target:{value:'核对依据'}});submit();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({status:'in_progress',dimension_scores:[{dimension_id:'numeric_correctness',score:0,label_snapshot:'数字正确性'}],failure_labels:['数字错误','引用无效'],comment:'核对依据'}));
  });
  it('requires all enabled dimensions before completion',()=>{
    const {save}=setup();fill('数字正确性','8');fireEvent.change(screen.getByRole('combobox',{name:'评审状态'}),{target:{value:'completed'}});submit();
    expect(save).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('引用与证据');
  });
  it('rejects fractions and out of range values',()=>{
    const {save}=setup();for(const value of ['-1','11','2.5']){fill('数字正确性',value);submit();expect(screen.getByRole('alert').textContent).toContain('0～10');}expect(save).not.toHaveBeenCalled();
  });
  it('completes with all scores and optional empty comment and labels',()=>{
    const {d,save}=setup();for(const dim of d.scoring.dimensions)fill(dim.label,'10');fireEvent.change(screen.getByRole('combobox',{name:'评审状态'}),{target:{value:'completed'}});submit();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({status:'completed',comment:'',failure_labels:[],dimension_scores:expect.arrayContaining([{dimension_id:'numeric_correctness',score:10,label_snapshot:'数字正确性'}])}));
  });
  it('edits saved values, offers discard protection and restores saved content',()=>{
    const {close}=setup(completed());expect((screen.getByRole('spinbutton',{name:'数字正确性'}) as HTMLInputElement).value).toBe('8');
    fill('数字正确性','3');fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(close).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('未保存');
    fireEvent.click(screen.getByRole('button',{name:'继续编辑'}));fireEvent.click(screen.getByRole('button',{name:'恢复已保存内容'}));expect((screen.getByRole('spinbutton',{name:'数字正确性'}) as HTMLInputElement).value).toBe('8');
    fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(close).toHaveBeenCalled();
  });
  it('keeps user input when persistence fails',()=>{
    const {close}=setup(undefined,vi.fn(()=>{throw new Error('quota exceeded');}));fill('数字正确性','4');submit();
    expect(screen.getByRole('alert').textContent).toContain('quota');expect((screen.getByRole('spinbutton',{name:'数字正确性'}) as HTMLInputElement).value).toBe('4');expect(close).not.toHaveBeenCalled();
  });
  it('marks old completed reviews as pending when a new dimension is enabled',()=>{
    const old=completed();const {d,save}=setup(old,vi.fn(),true);
    expect(reviewReadiness(old,d.scoring.dimensions).label).toBe('待补评');expect(old.status).toBe('completed');submit();expect(save).not.toHaveBeenCalled();fill('补充维度','7');submit();expect(save).toHaveBeenCalled();
  });
});
