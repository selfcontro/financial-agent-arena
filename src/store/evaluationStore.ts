import type { EvaluationDataset, ReviewRecord, ModelAnswer, Model } from '../types/evaluation.js';
import { validateDataset } from '../services/validation.js';
import { Repository } from './storage.js';

type ReviewInput=Pick<ReviewRecord,'answer_id'|'answer_version'|'dimension_scores'|'failure_labels'|'comment'|'status'>;
type AnswerEdit=Pick<ModelAnswer,'answer'|'citations'|'generated_at'> & Partial<Pick<ModelAnswer,'simulated'|'connection_snapshot'>>;
type Event=EvaluationDataset['audit_events'][number];
export class EvaluationStore {
  private state:EvaluationDataset;
  readonly warning?:string;
  private busy=false;
  private listeners=new Set<()=>void>();
  constructor(private repository:Repository, private now:()=>string=()=>new Date().toISOString(), private id:()=>string=()=>globalThis.crypto.randomUUID()) {
    const loaded=repository.load(); this.state=loaded.data; this.warning=loaded.warning;
  }
  getState() {return structuredClone(this.state);}
  subscribe(listener:()=>void) {this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
  addModel(input:Omit<Model,'model_id'|'enabled'>) {
    this.ensureIdle(); const next=this.getState();
    const model:Model={...structuredClone(input),model_id:this.id(),enabled:true};
    next.models.push(model);next.audit_events.push(this.event('model',model.model_id,'create',undefined,model));this.commit(next);
    return model.model_id;
  }
  updateModel(modelId:string, input:Pick<Model,'display_name'|'base_url'|'model_name'>) {
    this.ensureIdle();const next=this.getState();const model=next.models.find(m=>m.model_id===modelId);
    if(!model) throw new Error('模型不存在');const before=structuredClone(model);
    Object.assign(model,structuredClone(input));
    next.audit_events.push(this.event('model',modelId,'update',before,model));this.commit(next);
  }
  addAnswer(caseId:string,modelId:string,edit:AnswerEdit) {
    this.ensureIdle(); const next=this.getState();
    if(!next.models.some(m=>m.model_id===modelId&&m.enabled)) throw new Error('模型不存在或已停用');
    const question=next.cases.filter(c=>c.case_id===caseId).sort((a,b)=>b.version-a.version)[0];
    if(!question) throw new Error('题目不存在');
    if(next.answers.some(a=>a.case_id===caseId&&a.model_id===modelId&&a.is_current&&!a.deleted_at)) throw new Error('该模型已有当前回答，请编辑原回答');
    const previous=next.answers.filter(a=>a.case_id===caseId&&a.model_id===modelId).sort((a,b)=>b.version-a.version)[0];
    const answer:ModelAnswer={...structuredClone(edit),answer_id:previous?.answer_id??this.id(),version:previous?previous.version+1:1,case_id:caseId,case_version:question.version,model_id:modelId,is_current:true,simulated:edit.simulated??true};
    next.answers.push(answer);next.audit_events.push(this.event('answer',answer.answer_id,'create',undefined,answer));this.commit(next);
  }
  deleteAnswer(answerId:string) {
    this.ensureIdle(); const next=this.getState();
    const answer=next.answers.find(a=>a.answer_id===answerId&&a.is_current&&!a.deleted_at);
    if(!answer) throw new Error('当前回答不存在');
    const before=structuredClone(answer);answer.is_current=false;answer.deleted_at=this.now();
    next.audit_events.push(this.event('answer',answerId,'delete',before,answer));this.commit(next);
  }
  private ensureIdle() {if(this.busy) throw new Error('备份或恢复操作进行中');}
  private event(type:Event['entity_type'], entityId:string, action:Event['action'], before:unknown, after:unknown):Event {
    return {event_id:this.id(),entity_type:type,entity_id:entityId,action,occurred_at:this.now(),before:structuredClone(before),after:structuredClone(after)};
  }
  private commit(next:EvaluationDataset) {
    next.updated_at=this.now();
    this.repository.save(next);
    this.state=validateDataset(next);
    for(const listener of this.listeners) {try {listener();} catch { /* Consumer errors do not undo a committed write. */ }}
  }
  saveReview(input:ReviewInput) {
    this.ensureIdle();
    const next=this.getState();
    const answer=next.answers.find(a=>a.answer_id===input.answer_id&&a.version===input.answer_version&&a.is_current&&!a.deleted_at);
    if(!answer) throw new Error('只能评审当前有效回答版本');
    const old=next.reviews.find(r=>r.answer_id===answer.answer_id&&r.answer_version===answer.version);
    const time=this.now();
    const review:ReviewRecord={...structuredClone(input),review_id:old?.review_id??this.id(),case_id:answer.case_id,model_id:answer.model_id,scoring_version:next.scoring.version,created_at:old?.created_at??time,updated_at:time};
    if(review.status==='completed') review.reviewed_at=time;
    if(old && old.scoring_version===review.scoring_version && ['dimension_scores','failure_labels','comment','status'].every(k=>JSON.stringify(old[k as keyof ReviewRecord])===JSON.stringify(review[k as keyof ReviewRecord]))) return;
    if(old) next.reviews[next.reviews.indexOf(old)]=review; else next.reviews.push(review);
    next.audit_events.push(this.event('review',review.review_id,old?'update':'create',old,review));
    this.commit(next);
  }
  editAnswer(answerId:string, edit:AnswerEdit) {
    this.ensureIdle(); const next=this.getState();
    const old=next.answers.find(a=>a.answer_id===answerId&&a.is_current&&!a.deleted_at);
    if(!old) throw new Error('当前回答不存在');
    if(['answer','citations','generated_at','simulated','connection_snapshot'].every(k=>edit[k as keyof AnswerEdit]===undefined || JSON.stringify(old[k as keyof ModelAnswer])===JSON.stringify(edit[k as keyof AnswerEdit]))) return;
    const before=structuredClone(old); old.is_current=false;
    const revised={...before,...structuredClone(edit),version:Math.max(...next.answers.filter(a=>a.answer_id===answerId).map(a=>a.version))+1};
    next.answers.push(revised);
    next.audit_events.push(this.event('answer',answerId,'update',before,revised));
    this.commit(next);
  }
  updateScoring(dimensions:EvaluationDataset['scoring']['dimensions']) {
    this.ensureIdle(); const next=this.getState();
    if(JSON.stringify(dimensions)===JSON.stringify(next.scoring.dimensions)) return;
    const before=structuredClone(next.scoring);
    next.scoring_history.push(before);
    next.scoring={version:Math.max(...next.scoring_history.map(r=>r.version))+1,dimensions:structuredClone(dimensions)};
    next.audit_events.push(this.event('settings','scoring','update',before,next.scoring)); this.commit(next);
  }
  async backup(reason='manual') {
    this.ensureIdle(); this.busy=true;
    try {return await this.repository.createBackup(this.getState(),reason,this.now(),this.id());} finally {this.busy=false;}
  }
  rawCurrent() {return this.repository.rawCurrent();}
  readBackup(id:string) {return this.repository.readBackup(id);}
  listBackups() {return this.repository.listBackups();}
  async importDataset(input:unknown) {await this.replace(validateDataset(input),'import');}
  async restoreBackup(backupId:string) {
    this.ensureIdle(); this.busy=true;
    try {const target=await this.repository.readBackup(backupId); await this.replaceLocked(target.data,'restore',backupId);} finally {this.busy=false;}
  }
  private async replace(data:EvaluationDataset, action:'import'|'restore') {
    this.ensureIdle(); this.busy=true;
    try {await this.replaceLocked(data,action);} finally {this.busy=false;}
  }
  private async replaceLocked(data:EvaluationDataset, action:'import'|'restore', sourceBackup?:string) {
    const next=validateDataset(structuredClone(data));
    const old=await this.repository.createBackup(this.getState(),`before-${action}`,this.now(),this.id());
    next.audit_events.push(this.event('dataset',next.dataset_id,action,{dataset_id:this.state.dataset_id,backup_id:old.backup_id},{dataset_id:next.dataset_id,...(sourceBackup?{backup_id:sourceBackup}:{})}));
    this.commit(next);
  }
}
