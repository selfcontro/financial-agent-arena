import { afterEach,describe,expect,it,vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApi,completionUrl } from '../server/api.js';
import { createSeedDataset } from '../src/data/seed.js';
const servers:Server[]=[];
afterEach(async()=>{for(const s of servers.splice(0)){s.closeAllConnections();await new Promise<void>((resolve,reject)=>s.close(e=>e?reject(e):resolve()));}});
async function start(upstream:typeof fetch) {
  const s=createApi(upstream).listen(0,'127.0.0.1');servers.push(s);await new Promise<void>(resolve=>s.once('listening',resolve));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}
const config={base_url:'https://provider.example/v1/',model_name:'test-model',api_key:'secret-test-only'};
async function put(url:string,c:unknown=config) {return fetch(url+'/api/connections/test',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)});}
async function generate(url:string,base=config.base_url){return fetch(url+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model_id:'test',base_url:base,model_name:config.model_name,question:createSeedDataset().cases[2]})});}
describe('local model routes',()=>{
  it('normalizes base paths and full endpoints without losing vendor prefixes',()=>{
    expect(completionUrl('https://provider.example/compatible-mode/v1/')).toBe('https://provider.example/compatible-mode/v1/chat/completions');
    expect(completionUrl('https://provider.example/v1/chat/completions')).toBe('https://provider.example/v1/chat/completions');
    expect(()=>completionUrl('https://provider.example/v1?api_key=x')).toThrow();
  });
  it('routes model, key and allowed evidence, excluding references and future evidence',async()=>{
    const spy=vi.fn<typeof fetch>(async()=>Response.json({choices:[{message:{content:'营收80亿元 [case-003-e1]'}}]}));
    const url=await start(spy);expect((await put(url)).status).toBe(200);
    const metadata=await (await fetch(url+'/api/connections/test')).text();expect(metadata).not.toContain(config.api_key);
    const response=await generate(url);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({answer:'营收80亿元 [case-003-e1]',simulated:false,citations:[],connection_snapshot:{model_name:'test-model'}});
    const [endpoint,options]=spy.mock.calls[0];expect(endpoint).toBe('https://provider.example/v1/chat/completions');
    expect(options?.headers).toMatchObject({Authorization:'Bearer secret-test-only'});
    const payload=JSON.parse(options?.body as string);expect(payload.model).toBe('test-model');expect(payload.stream).toBe(false);
    const prompt=JSON.parse(payload.messages[1].content);expect(prompt).not.toHaveProperty('reference_answer');expect(prompt.evidence).toHaveLength(1);
  });
  it('does not forward a saved key after the endpoint is changed',async()=>{
    const spy=vi.fn<typeof fetch>(async()=>Response.json({choices:[{message:{content:'ok'}}]}));const url=await start(spy);
    await put(url);await put(url,{base_url:'https://other.example/v1',model_name:'test-model'});await generate(url,'https://other.example/v1');
    expect(spy.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
  });
  it('retains an existing key only for unchanged endpoint and model',async()=>{
    const spy=vi.fn<typeof fetch>(async()=>Response.json({choices:[{message:{content:'ok'}}]}));const url=await start(spy);
    await put(url);await put(url,{base_url:config.base_url,model_name:config.model_name});await generate(url);
    expect(spy.mock.calls[0][1]?.headers).toHaveProperty('Authorization','Bearer secret-test-only');
  });
  it('rejects stale page configuration instead of calling the previous endpoint',async()=>{
    const spy=vi.fn<typeof fetch>();const url=await start(spy);await put(url);
    expect((await generate(url,'https://changed.example/v1')).status).toBe(409);
    expect(spy).not.toHaveBeenCalled();
  });
  it('rejects unconfigured calls and cross-origin requests',async()=>{
    const spy=vi.fn<typeof fetch>();const url=await start(spy);
    expect((await generate(url)).status).toBe(409);
    const r=await fetch(url+'/api/connections/test',{method:'PUT',headers:{'Content-Type':'application/json',Origin:'https://untrusted.example'},body:JSON.stringify(config)});
    expect(r.status).toBe(403);expect(spy).not.toHaveBeenCalled();
  });
  it('returns useful errors without reflecting provider error bodies or keys',async()=>{
    const url=await start(async()=>new Response('secret-test-only',{status:401}));await put(url);
    const r=await generate(url);expect(r.status).toBe(502);const body=await r.text();expect(body).toContain('401');expect(body).not.toContain(config.api_key);
  });
  it('rejects empty/non-chat output and handles upstream failures',async()=>{
    const spy=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({choices:[]})).mockRejectedValueOnce(new Error(config.api_key));const url=await start(spy);await put(url);
    expect((await generate(url)).status).toBe(502);const r=await generate(url);expect(r.status).toBe(502);expect(await r.text()).not.toContain(config.api_key);
  });
});
