// @vitest-environment jsdom
import { beforeAll,afterEach,it,expect,vi } from 'vitest';
import { render,screen,fireEvent,cleanup } from '@testing-library/react';
import { ScoringSettings,SummaryReport } from '../src/components/SummaryReport.js';
import { createSeedDataset } from '../src/data/seed.js';
beforeAll(()=>Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}}));afterEach(cleanup);
it('renders empty rankings and all default models without fabricating scores',()=>{
  render(<SummaryReport data={createSeedDataset()} readOnly={false} openCase={vi.fn()} saveRules={vi.fn()}/>);
  expect(screen.getByText('暂无正式排名。请先完成至少一条当前回答的人工评审。')).toBeDefined();expect(screen.getByRole('table',{name:'模型排名与完成率'})).toBeDefined();
});
it('validates weight sum and sends configuration only on valid save',()=>{
  const save=vi.fn();render(<ScoringSettings dimensions={createSeedDataset().scoring.dimensions} close={vi.fn()} save={save}/>);
  fireEvent.change(screen.getByRole('spinbutton',{name:'权重 1'}),{target:{value:'50'}});fireEvent.click(screen.getByRole('button',{name:'保存评分规则'}));expect(save).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('100%');
  fireEvent.change(screen.getByRole('spinbutton',{name:'权重 2'}),{target:{value:'0'}});fireEvent.click(screen.getByRole('button',{name:'保存评分规则'}));expect(save.mock.calls[0][0][0].weight).toBe(.5);
});
it('keeps custom dimension identity when resetting default weights',()=>{
  const save=vi.fn();render(<ScoringSettings dimensions={createSeedDataset().scoring.dimensions} close={vi.fn()} save={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'新增评分维度'}));expect(screen.getAllByRole('spinbutton')).toHaveLength(6);
  fireEvent.click(screen.getByRole('button',{name:'恢复默认权重'}));fireEvent.click(screen.getByRole('button',{name:'保存评分规则'}));
  expect(save.mock.calls[0][0][5]).toMatchObject({enabled:false,weight:0});expect(save.mock.calls[0][0][5].dimension_id).toMatch(/^dimension-/);
});
