import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),defaults=require('./provider-defaults.js');
export function apiEndpoint(base){
  let u;try{u=new URL(base);}catch{throw new Error('API 地址无效。');}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search)throw new Error('API 地址必须是无用户名、密码和查询参数的 HTTPS 地址。');
  const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(host==='localhost'||host.endsWith('.localhost')||host==='::1'||host.includes(':')||/^(0|10|127)\./.test(host)||/^169\.254\./.test(host)||/^192\.168\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host))throw new Error('请使用公网 AI 服务地址。');
  const pathname=u.pathname.replace(/\/+$/,'')||'/v1';u.pathname=pathname.endsWith('/chat/completions')?pathname:pathname+'/chat/completions';return u.href;
}
function validKey(key){if(typeof key!=='string'||key.length>2000||/[\r\n\x00-\x1f\x7f]/.test(key))throw new Error('API Key 格式无效。');return key.trim();}
export function createProviderSession(initial={}){
  let config={...defaults},secret='';
  function get(){return {...config,endpoint:apiEndpoint(config.base),hasKey:!!secret,keyStorage:'server-memory'};}
  function set(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('连接设置格式无效。');
    const endpoint=apiEndpoint(input.base||input.endpoint||config.base),base=endpoint.slice(0,-'/chat/completions'.length);
    const model=input.model===undefined?config.model:input.model;if(typeof model!=='string'||!model.trim()||model.length>200)throw new Error('请填写有效的模型名称。');
    const supplied=input.apiKey===undefined?'':validKey(input.apiKey);
    if(secret&&endpoint!==apiEndpoint(config.base)&&!supplied)throw new Error('更换 API 服务地址时，请重新填写该服务的 Key。');
    config={base,model:model.trim(),jsonMode:input.jsonMode===undefined?config.jsonMode:input.jsonMode!==false};
    if(supplied)secret=supplied;return get();
  }
  function resolve(){if(!secret)throw new Error('本地服务尚未配置 Key，请在“AI 设置”中填写并应用。');return {...config,apiKey:secret};}
  function clear(){secret='';return get();}
  set(initial);return {get,set,resolve,clear};
}

// Each profile has an independent in-memory credential, including on one gateway.
export function createProviderRegistry(){
  const profiles=new Map([
    ['gpt',{name:'GPT',session:createProviderSession()}],
    ['claude',{name:'Claude',session:createProviderSession({base:'https://api.example.com/v1',model:'claude-opus-5.5',jsonMode:true})}]
  ]);
  for(const [id,name,config] of [
    ['deepseek','DeepSeek',{base:'https://api.deepseek.com/v1',model:'deepseek-chat',jsonMode:true}],
    ['qwen','通义千问',{base:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus',jsonMode:true}],
    ['custom','自定义兼容服务',{base:'https://api.example.com/v1',model:'your-model-id',jsonMode:false}]
  ])profiles.set(id,{name,session:createProviderSession(config)});
  let active='gpt';
  function profile(id=active){const value=profiles.get(id);if(!value)throw new Error('未知的 API 配置，请从列表中选择服务。');return value;}
  function get(id=active){return {...profile(id).session.get(),profile_id:id,active_profile:active,profiles:[...profiles].map(([profile_id,p])=>({profile_id,name:p.name,...p.session.get()}))};}
  function set(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('连接设置格式无效。');
    const id=input.profile_id??active;profile(id).session.set(input);active=id;return get();
  }
  function resolve(id=active){return {...profile(id).session.resolve(),profile_id:id};}
  function clear(id=active){profile(id).session.clear();return get(id);}
  return {get,set,resolve,clear};
}
