import { describe,it,expect } from 'vitest';
import { Repository,CURRENT_KEY,BACKUP_PREFIX } from '../src/store/storage.js';
import type { StorageAdapter } from '../src/store/storage.js';
import { EvaluationStore } from '../src/store/evaluationStore.js';
import { createSeedDataset } from '../src/data/seed.js';

class MemoryStorage implements StorageAdapter {
  data=new Map<string,string>(); failPrefix?:string;
  get length(){return this.data.size;}
  key(i:number){return [...this.data.keys()][i]??null;}
  getItem(k:string){return this.data.get(k)??null;}
  setItem(k:string,v:string){if(this.failPrefix && k.startsWith(this.failPrefix)) throw new Error('quota exceeded');this.data.set(k,v);}
}
let sequence=0;
function store(storage=new MemoryStorage()) {return new EvaluationStore(new Repository(storage),()=> '2026-09-19T12:00:00Z',()=>`id-${++sequence}`);}
function review(s:EvaluationStore) {
  const d=s.getState(); const a=d.answers.find(a=>a.is_current)!;
  return {answer_id:a.answer_id,answer_version:a.version,dimension_scores:d.scoring.dimensions.map(x=>({dimension_id:x.dimension_id,score:8})),failure_labels:[] as ('数字错误')[],comment:'人工测试记录',status:'completed' as const};
}

describe('local persistence and audit history',()=>{
  it('adds a model and answer, persists both and rejects duplicate answers',()=>{
    const disk=new MemoryStorage(),s=store(disk);
    const modelId=s.addModel({display_name:'新增模型'});
    const input={answer:'模拟回答',citations:[],generated_at:'2026-09-19T12:00:00Z'};
    s.addAnswer('case-001',modelId,input);
    expect(store(disk).getState().models).toHaveLength(5);
    expect(store(disk).getState().answers).toHaveLength(21);
    expect(()=>s.addAnswer('case-001',modelId,input)).toThrow('已有当前回答');
    expect(s.getState().answers).toHaveLength(21);
  });
  it('soft deletes answers without deleting reviews and re-adds a new version',()=>{
    const disk=new MemoryStorage(),s=store(disk);s.saveReview(review(s));
    const old=s.getState().answers[0];s.deleteAnswer(old.answer_id);
    expect(store(disk).getState().answers[0]).toMatchObject({is_current:false,deleted_at:'2026-09-19T12:00:00Z'});
    expect(s.getState().reviews[0].answer_version).toBe(1);
    s.addAnswer(old.case_id,old.model_id,{answer:'重新添加',citations:[],generated_at:old.generated_at});
    const current=s.getState().answers.find(a=>a.answer_id===old.answer_id&&a.is_current)!;
    expect(current.version).toBe(2);expect(current.deleted_at).toBeUndefined();
    expect(s.getState().reviews.some(r=>r.answer_version===2)).toBe(false);
  });
  it('rolls back soft deletion and model addition when persistence fails',()=>{
    const disk=new MemoryStorage(),s=store(disk);s.saveReview(review(s));const before=s.getState();disk.failPrefix=CURRENT_KEY;
    expect(()=>s.deleteAnswer(before.answers[0].answer_id)).toThrow('quota');
    expect(()=>s.addModel({display_name:'失败模型'})).toThrow('quota');
    expect(s.getState()).toEqual(before);expect(store(disk).getState()).toEqual(before);
  });
  it('persists partial reviews without treating missing scores as zero',()=>{
    const disk=new MemoryStorage(),s=store(disk);
    const draft={...review(s),status:'in_progress' as const,dimension_scores:[{dimension_id:'numeric_correctness',score:0}]};
    s.saveReview(draft);
    expect(store(disk).getState().reviews[0]).toMatchObject({status:'in_progress',dimension_scores:draft.dimension_scores});
    expect(()=>s.saveReview({...draft,status:'completed'})).toThrow();
    expect(store(disk).getState().reviews[0].status).toBe('in_progress');
  });
  it('saves a review and restores all fields in a fresh store',()=>{
    const disk=new MemoryStorage(),s=store(disk); s.saveReview(review(s));
    expect(store(disk).getState()).toEqual(s.getState());
    expect(s.getState().reviews[0].reviewed_at).toBeDefined();
  });
  it('edits in place with before/after history; no-op saves produce no events',()=>{
    const s=store();const r=review(s);s.saveReview(r);
    s.saveReview({...r,comment:'修改评语',failure_labels:['数字错误'],dimension_scores:r.dimension_scores.map(d=>({...d,score:6}))});
    const data=s.getState();expect(data.reviews).toHaveLength(1);expect(data.audit_events).toHaveLength(2);
    expect(data.audit_events[1].before).toMatchObject({comment:'人工测试记录'});
    expect(data.audit_events[1].after).toMatchObject({comment:'修改评语'});
    s.saveReview({...r,comment:'修改评语',failure_labels:['数字错误'],dimension_scores:r.dimension_scores.map(d=>({...d,score:6}))});
    expect(s.getState()).toEqual(data);
  });
  it('keeps memory, disk, audit and notifications unchanged on failed save',()=>{
    const disk=new MemoryStorage(),s=store(disk);s.saveReview(review(s));const before=s.getState(),raw=disk.getItem(CURRENT_KEY);
    let notices=0;s.subscribe(()=>notices++);disk.failPrefix=CURRENT_KEY;
    expect(()=>s.saveReview({...review(s),comment:'未保存'})).toThrow('quota');
    expect(s.getState()).toEqual(before);expect(disk.getItem(CURRENT_KEY)).toBe(raw);expect(notices).toBe(0);
  });
  it('preserves corrupt data and blocks fallback writes',()=>{
    const disk=new MemoryStorage();disk.setItem(CURRENT_KEY,'broken-json');const s=store(disk);
    expect(s.warning).toContain('只读');expect(()=>s.saveReview(review(s))).toThrow();expect(disk.getItem(CURRENT_KEY)).toBe('broken-json');
  });
  it('rejects stale tab writes without overwriting the other tab',()=>{
    const disk=new MemoryStorage(),a=store(disk),b=store(disk);a.saveReview(review(a));
    expect(()=>b.saveReview(review(b))).toThrow('其他页面');expect(store(disk).getState()).toEqual(a.getState());
  });
  it('does not expose mutable internal state',()=>{
    const s=store();s.getState().models[0].display_name='bad';expect(s.getState().models[0].display_name).toBe('同花顺问财');
  });
  it('creates a new unanswered version and preserves old review and answer',()=>{
    const s=store();s.saveReview(review(s));const old=s.getState().answers[0];
    s.editAnswer(old.answer_id,{answer:'修改后的回答',citations:old.citations,generated_at:old.generated_at});
    const d=s.getState();expect(d.answers.filter(a=>a.answer_id===old.answer_id)).toHaveLength(2);
    expect(d.answers[0]).toMatchObject({version:1,is_current:false});expect(d.reviews[0].answer_version).toBe(1);
    expect(d.reviews.some(r=>r.answer_id===old.answer_id&&r.answer_version===2)).toBe(false);
    expect(()=>s.saveReview({...review(s),answer_id:old.answer_id,answer_version:1})).toThrow('当前有效');
  });
  it('keeps historical rule for old completed reviews and requires added dimensions on save',()=>{
    const s=store();const r=review(s);s.saveReview(r);const dims=s.getState().scoring.dimensions;
    s.updateScoring([...dims,{dimension_id:'extra',label:'额外',enabled:true,weight:0,description:'新增'}]);
    expect(s.getState().reviews[0]).toMatchObject({status:'completed',scoring_version:1});
    expect(()=>s.saveReview(r)).toThrow('historical dimensions');
    s.saveReview({...r,dimension_scores:[...r.dimension_scores,{dimension_id:'extra',score:9}]});
    expect(s.getState().reviews[0].scoring_version).toBe(2);
  });
});

describe('multiple immutable backups',()=>{
  it('refuses to overwrite an existing backup identifier',async()=>{
    const disk=new MemoryStorage(),repo=new Repository(disk);const {data}=repo.load();
    const b=await repo.createBackup(data,'manual','2026-09-19T12:00:00Z','fixed-id');
    await expect(repo.createBackup(data,'other','2026-09-19T12:00:00Z','fixed-id')).rejects.toThrow('不覆盖');
    expect(await repo.readBackup('fixed-id')).toEqual(b);
  });
  it('retains multiple snapshots, restores selected one, backs up the replaced state',async()=>{
    const disk=new MemoryStorage(),s=store(disk);const first=await s.backup();
    s.saveReview(review(s));const second=await s.backup();
    await s.restoreBackup(first.backup_id);
    expect(s.getState().reviews).toEqual([]);expect((await s.listBackups()).backups).toHaveLength(3);
    expect(store(disk).getState()).toEqual(s.getState());
    await s.restoreBackup(second.backup_id);expect(s.getState().reviews).toHaveLength(1);
    expect((await s.listBackups()).backups).toHaveLength(4);
  });
  it('imports full replacement only after a backup',async()=>{
    const s=store();s.saveReview(review(s));const d=createSeedDataset();d.dataset_id='another';await s.importDataset(d);
    expect(s.getState().reviews).toHaveLength(0);expect(s.getState().dataset_id).toBe('another');
    expect((await s.listBackups()).backups[0].data.reviews).toHaveLength(1);
  });
  it('rejects invalid import before creating any backup',async()=>{
    const s=store();const before=s.getState();await expect(s.importDataset({})).rejects.toThrow();
    expect(s.getState()).toEqual(before);expect((await s.listBackups()).backups).toEqual([]);
  });
  it('aborts replacement if backup fails',async()=>{
    const disk=new MemoryStorage(),s=store(disk);s.saveReview(review(s));const before=s.getState();disk.failPrefix=BACKUP_PREFIX;
    await expect(s.importDataset(createSeedDataset())).rejects.toThrow('quota');expect(s.getState()).toEqual(before);expect(store(disk).getState()).toEqual(before);
  });
  it('retains the new backup and old active state when replacement write fails',async()=>{
    const disk=new MemoryStorage(),s=store(disk);s.saveReview(review(s));const before=s.getState();disk.failPrefix=CURRENT_KEY;
    await expect(s.importDataset(createSeedDataset())).rejects.toThrow('quota');expect(s.getState()).toEqual(before);
    expect((await s.listBackups()).backups[0].data).toEqual(before);expect(store(disk).getState()).toEqual(before);
  });
  it('rejects corrupted snapshot and reports it without hiding valid backups',async()=>{
    const disk=new MemoryStorage(),s=store(disk);const b=await s.backup();await s.backup();
    const raw=JSON.parse(disk.getItem(BACKUP_PREFIX+b.backup_id)!);raw.data.description='tampered';disk.setItem(BACKUP_PREFIX+b.backup_id,JSON.stringify(raw));
    const before=s.getState();await expect(s.restoreBackup(b.backup_id)).rejects.toThrow('摘要');
    expect(s.getState()).toEqual(before);const listed=await s.listBackups();expect(listed.backups).toHaveLength(1);expect(listed.errors).toHaveLength(1);
  });
  it('prevents edits during an asynchronous snapshot operation',async()=>{
    const s=store();const pending=s.backup();expect(()=>s.saveReview(review(s))).toThrow('进行中');await pending;
    expect(()=>s.saveReview(review(s))).not.toThrow();
  });
});
