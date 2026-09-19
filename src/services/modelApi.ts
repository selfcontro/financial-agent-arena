export async function modelApi<T>(path:string, body?:unknown, method='POST'):Promise<T> {
  let response:Response;
  try {response=await fetch(path,{method:body===undefined?'GET':method,headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  catch {throw new Error('本地 API 服务不可用，请运行 npm run dev 或 npm start');}
  let data;try{data=await response.json();}catch{throw new Error('未连接到本地 API，请重启开发服务；静态预览不支持调用');}
  if(!response.ok)throw new Error(data.error??'API 请求失败');return data;
}
