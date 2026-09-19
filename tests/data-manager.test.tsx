// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {DataManager} from '../src/components/DataManager.js';
import {EvaluationStore} from '../src/store/evaluationStore.js';
import {Repository,BACKUP_PREFIX} from '../src/store/storage.js';
import {createSeedDataset} from '../src/data/seed.js';
afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks();});
function setup(){const store=new EvaluationStore(new Repository(localStorage));render(<DataManager store={store} data={store.getState()}/>);return store;}
function upload(text:string){fireEvent.change(screen.getByLabelText('选择评测数据文件'),{target:{files:[{name:'test.json',text:async()=>text}]}});}
it('validates files before mutation and requires explicit replacement after preview',async()=>{
  const store=setup();upload('{broken');expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('导入校验失败'));expect((await store.listBackups()).backups).toHaveLength(0);
  const d=createSeedDataset();d.dataset_id='imported-test';upload(JSON.stringify(d));await screen.findByText('待导入：test.json');expect(store.getState().dataset_id).not.toBe('imported-test');
  fireEvent.click(screen.getByRole('button',{name:'备份并确认完整替换'}));await screen.findByText('导入完成，替换前数据已备份');expect(store.getState().dataset_id).toBe('imported-test');expect((await store.listBackups()).backups).toHaveLength(1);
});
it('creates multiple backups and restores selected state with a new pre-restore backup',async()=>{
  const store=setup();fireEvent.click(screen.getByRole('button',{name:'创建备份'}));await screen.findByText('手动备份已保存');const first=(await store.listBackups()).backups[0];
  store.addModel({display_name:'extra'});fireEvent.click(screen.getByRole('button',{name:'创建备份'}));await waitFor(()=>expect(screen.getByText('历史备份（2）')).toBeTruthy());
  fireEvent.change(screen.getByLabelText('选择恢复备份'),{target:{value:first.backup_id}});fireEvent.click(screen.getByRole('button',{name:'备份当前数据并确认恢复'}));await screen.findByText('恢复完成，恢复前数据已另行备份');expect(store.getState().models).toHaveLength(4);expect((await store.listBackups()).backups).toHaveLength(3);
});
it('stops replacement when the backup write fails and retains import preview',async()=>{
  const store=setup(),original=store.getState();const native=Storage.prototype.setItem;
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,k,v){if(k.startsWith(BACKUP_PREFIX))throw new Error('quota exceeded');native.call(this,k,v);});
  upload(JSON.stringify(createSeedDataset()));await screen.findByText('待导入：test.json');fireEvent.click(screen.getByRole('button',{name:'备份并确认完整替换'}));await screen.findByRole('alert');expect(store.getState()).toEqual(original);expect(screen.getByText('待导入：test.json')).toBeTruthy();
});
