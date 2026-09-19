import express from 'express';
import { z } from 'zod';
import { caseSchema } from '../src/services/validation.js';

export function completionUrl(base: string) {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Base URL 必须是无认证信息和查询参数的 HTTP(S) 地址');
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/chat/completions')) url.pathname += '/chat/completions';
  return url.toString();
}
const configSchema=z.object({base_url:z.url(),model_name:z.string().trim().min(1),api_key:z.string().trim().optional()}).strict();
type Config=z.infer<typeof configSchema>;
export function createApi(request:typeof fetch=fetch) {
  const api=express(); const configs=new Map<string,Config>();
  api.use('/api', (req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    const origin=req.get('origin');
    if(origin && origin!==`http://${req.get('host')}` && origin!==`https://${req.get('host')}`){res.status(403).json({error:'只接受同源请求'});return;}
    if(req.method!=='GET' && !req.is('application/json')){res.status(415).json({error:'需要 application/json'});return;}
    next();
  });
  api.use(express.json({limit:'1mb'}));
  api.get('/api/connections/:id',(req,res)=>{
    const c=configs.get(req.params.id);
    res.json(c?{configured:true,base_url:c.base_url,model_name:c.model_name,endpoint:completionUrl(c.base_url),has_key:!!c.api_key}:{configured:false});
  });
  api.put('/api/connections/:id',(req,res)=>{
    try {
      const c=configSchema.parse(req.body);completionUrl(c.base_url);
      const previous=configs.get(req.params.id);
      // A key must never silently move to a different endpoint/model.
      if(!c.api_key && previous?.base_url===c.base_url && previous.model_name===c.model_name)c.api_key=previous.api_key;
      configs.set(req.params.id,c);
      res.json({configured:true,endpoint:completionUrl(c.base_url),has_key:!!c.api_key});
    }catch{res.status(400).json({error:'连接配置无效，请检查 Base URL 和 Model Name'});}
  });
  api.post('/api/generate',async(req,res)=>{
    const parsed=z.object({model_id:z.string(),base_url:z.string(),model_name:z.string(),question:caseSchema}).safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:'题目或模型参数无效'});return;}
    const config=configs.get(parsed.data.model_id);
    if(!config){res.status(409).json({error:'请先配置 API；本地服务重启后需要重新保存连接'});return;}
    if(config.base_url!==parsed.data.base_url || config.model_name!==parsed.data.model_name){res.status(409).json({error:'当前模型配置与服务内存不一致，请重新保存 API 配置'});return;}
    const question=parsed.data.question;
    // Send only the task and admissible evidence, never the reference answer or reviews.
    const evidence=question.allowed_evidence.filter(e=>Date.parse(e.published_at)<=Date.parse(question.cutoff_at));
    const messages=[{role:'system',content:'回答金融评测题。只依据给定资料，注意截止时间、单位和风险。引用资料时注明证据 ID，不编造引用。不输出自动评分。'},
      {role:'user',content:JSON.stringify({question:question.question,cutoff_at:question.cutoff_at,evidence})}];
    try {
      const upstream=await request(completionUrl(config.base_url),{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{'Content-Type':'application/json',...(config.api_key?{Authorization:`Bearer ${config.api_key}`}:{})},body:JSON.stringify({model:config.model_name,messages,stream:false})});
      if(!upstream.ok){res.status(502).json({error:`模型接口返回 HTTP ${upstream.status}，请检查地址、密钥、模型权限或额度`});return;}
      const raw=await upstream.json();
      const result=z.object({choices:z.array(z.object({message:z.object({content:z.string().trim().min(1)})})).min(1)}).safeParse(raw);
      if(!result.success){res.status(502).json({error:'接口未返回非空 choices[0].message.content，请检查协议兼容性'});return;}
      let answer=result.data.choices[0].message.content;
      if(config.api_key)answer=answer.split(config.api_key).join('[REDACTED]');
      res.json({answer,citations:[],generated_at:new Date().toISOString(),simulated:false,connection_snapshot:{base_url:config.base_url,model_name:config.model_name}});
    }catch{res.status(502).json({error:'模型请求失败或超时（60 秒），请检查网络与接口地址'});}
  });
  api.use('/api',(_req,res)=>{res.status(404).json({error:'API 路由不存在'});});
  api.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(400).json({error:'请求格式无效或过大'});});
  return api;
}
