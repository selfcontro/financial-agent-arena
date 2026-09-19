import { z } from 'zod';
import { datasetSchema, validateDataset } from '../services/validation.js';
import { createSeedDataset } from '../data/seed.js';
import type { EvaluationDataset } from '../types/evaluation.js';

export const CURRENT_KEY = 'financial-agent-arena:v1';
export const BACKUP_PREFIX = 'financial-agent-arena:backup:v1:';
export interface StorageAdapter {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function contentHash(data: EvaluationDataset) {
  const bytes = new TextEncoder().encode(canonicalJson(data));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,'0')).join('');
}
const backupSchema = z.object({ backup_id:z.string().min(1), created_at:z.iso.datetime({offset:true}), reason:z.string(), calculation_version:z.literal(1), content_hash:z.string().regex(/^[a-f0-9]{64}$/), data:datasetSchema }).strict();
export type Backup = z.infer<typeof backupSchema>;

export class Repository {
  private expected: string | null = null;
  private blocked = false;
  constructor(private storage: StorageAdapter) {}
  load(): { data: EvaluationDataset; warning?: string } {
    try {
      this.expected = this.storage.getItem(CURRENT_KEY);
      const data = this.expected===null ? createSeedDataset() : validateDataset(JSON.parse(this.expected));
      this.blocked=false;
      return { data };
    } catch (error) {
      this.blocked=true;
      return {data:createSeedDataset(),warning:`本地数据无法读取，原数据未覆盖，当前为只读模拟数据：${String(error)}`};
    }
  }
  assertWritable() {
    if (this.blocked) throw new Error('原数据无法读取，请先导出原始数据并修复，禁止覆盖');
    if (this.storage.getItem(CURRENT_KEY)!==this.expected) throw new Error('本地数据已被其他页面修改，请重新加载');
  }
  save(data: EvaluationDataset) {
    const encoded=JSON.stringify(validateDataset(data));
    this.assertWritable();
    this.storage.setItem(CURRENT_KEY,encoded);
    this.expected=encoded;
  }
  rawCurrent() { return this.storage.getItem(CURRENT_KEY); }
  async createBackup(data: EvaluationDataset, reason: string, now: string, backupId: string): Promise<Backup> {
    const snapshot=validateDataset(structuredClone(data));
    const backup=backupSchema.parse({backup_id:backupId,created_at:now,reason,calculation_version:1,content_hash:await contentHash(snapshot),data:snapshot});
    this.assertWritable();
    const key=BACKUP_PREFIX+backupId;
    if(this.storage.getItem(key)!==null) throw new Error('备份 ID 已存在，不覆盖旧备份');
    this.storage.setItem(key,JSON.stringify(backup));
    return structuredClone(backup);
  }
  async readBackup(id: string) {
    const raw=this.storage.getItem(BACKUP_PREFIX+id);
    if(raw===null) throw new Error('备份不存在');
    const b=backupSchema.parse(JSON.parse(raw));
    if(b.backup_id!==id || await contentHash(b.data)!==b.content_hash) throw new Error('备份内容摘要不匹配');
    return b;
  }
  async listBackups() {
    const ids:string[]=[];
    for(let i=0;i<this.storage.length;i++) {
      const k=this.storage.key(i); if(k?.startsWith(BACKUP_PREFIX)) ids.push(k.slice(BACKUP_PREFIX.length));
    }
    const backups:Backup[]=[]; const errors:{backup_id:string;message:string}[]=[];
    for(const id of ids) { try {backups.push(await this.readBackup(id));} catch(e) {errors.push({backup_id:id,message:String(e)});} }
    backups.sort((a,b)=>b.created_at.localeCompare(a.created_at)||a.backup_id.localeCompare(b.backup_id));
    return {backups,errors};
  }
}
