import test from 'node:test';
import assert from 'node:assert/strict';
import {apiEndpoint,createProviderSession,createProviderRegistry} from '../api-provider.mjs';
import {createApp} from '../server.mjs';
import {createStore} from '../practice-store.mjs';
import {evidenceCatalog,expandEvidence} from '../api-evidence.mjs';
const credential='fixture-only-credential-not-real';
const task={request_id:'api-profile-test-001',task_type:'email',prompt:'Write to a librarian about a booking conflict and ask for another room.',response:'Dear librarian, our group has a booking conflict on Thursday. Could we use another room before noon? Thank you.',title:'API回归测试',created_at:new Date().toISOString()};
const report=t=>({request_id:t.request_id,task_type:t.task_type,score:3,plausible_range:[3,4],summary:'测试报告。',band_reason:'测试判断。',uncertainty:'仅用于程序检查。',dimensions:['任务','展开','组织','语言'].map(name=>({name,level:'adequate',evidence:'',feedback:'测试反馈。'})),coverage:[{requirement:'说明冲突',status:'met',evidence:'booking conflict',feedback:'测试反馈。'}],strengths:[],issues:[],priorities:[{action:'展开说明',drill:'补充重要背景。'}],revised_response:t.response});
test('full endpoint and base normalize exactly once',()=>{const endpoint='https://api.openai.com/v1/chat/completions';assert.equal(apiEndpoint(endpoint),endpoint);assert.equal(apiEndpoint(endpoint+'/'),endpoint);assert.equal(apiEndpoint('https://api.openai.com/v1'),endpoint);});
test('provider credentials are session-only and never returned by metadata',()=>{const p=createProviderSession({apiKey:credential});assert.equal(p.get().hasKey,true);assert.ok(!JSON.stringify(p.get()).includes(credential));assert.equal(p.resolve().apiKey,credential);p.set({model:'gpt-6.1-sol'});assert.equal(p.resolve().apiKey,credential);assert.throws(()=>p.set({base:'https://different.example/v1'}),/重新填写/);assert.equal(p.get().base,'https://api.openai.com/v1');assert.throws(()=>p.set({apiKey:'bad\nvalue'}));p.clear();assert.equal(p.get().hasKey,false);assert.throws(()=>p.resolve());assert.equal(createProviderSession().get().hasKey,false);});
test('domain root expands to v1 without duplicating a full endpoint',()=>{assert.equal(apiEndpoint('https://api.openai.com'),'https://api.openai.com/v1/chat/completions');assert.equal(apiEndpoint('https://api.openai.com/'),'https://api.openai.com/v1/chat/completions');});
test('Claude citation IDs expand only to literal original slices; invented IDs and combined references fail',()=>{
 const original="Dear Mr. Lee,\r\nI'm sorry about the meeting-room booking! I was drink coffee.";
 const catalog=evidenceCatalog(original);assert.ok(Object.keys(catalog).length>=3);for(const text of Object.values(catalog))assert.ok(original.includes(text));
 const r={dimensions:[{evidence:'[[original:1]]'}],issues:[{quote:'[[original:3]]',correction:'corrected English'}],summary:'[[original:1]]'};expandEvidence(r,catalog);assert.equal(r.dimensions[0].evidence,catalog['[[original:1]]']);assert.equal(r.issues[0].quote,catalog['[[original:3]]']);assert.equal(r.issues[0].correction,'corrected English');assert.equal(r.summary,'[[original:1]]');
 for(const value of ['[[original:999]]','[[original:1]] [[original:2]]'])assert.throws(()=>expandEvidence({strengths:[{quote:value}]},catalog),/编号无效/);
 const longText=('word '.repeat(100)+'\n').repeat(5);for(const text of Object.values(evidenceCatalog(longText))){assert.ok(text.length<=320);assert.ok(longText.includes(text));}
});
test('GPT and Claude retain separate credentials; clearing or editing one leaves the other intact',()=>{
 const p=createProviderRegistry();p.set({profile_id:'gpt',apiKey:'fixture-gpt-key'});p.set({profile_id:'claude',apiKey:'fixture-claude-key'});
 assert.equal(p.get().profile_id,'claude');assert.equal(p.get().model,'claude-opus-5.5');assert.equal(p.resolve('gpt').apiKey,'fixture-gpt-key');assert.equal(p.resolve('claude').apiKey,'fixture-claude-key');assert.ok(!JSON.stringify(p.get()).includes('fixture-'));
 p.set({profile_id:'gpt'});assert.equal(p.get().model,'gpt-6.1-sol');assert.equal(p.resolve('claude').model,'claude-opus-5.5');
 assert.throws(()=>p.set({profile_id:'unknown',apiKey:'bad'}));assert.throws(()=>p.set({profile_id:'claude',base:'https://other.example/v1'}),/重新填写/);
 assert.equal(p.get().profile_id,'gpt');p.clear('gpt');assert.throws(()=>p.resolve('gpt'));assert.equal(p.resolve('claude').apiKey,'fixture-claude-key');assert.equal(p.get('claude').hasKey,true);
});
test('HTTP grades pin the selected profile and save its model even if another page switches profiles',async()=>{
 const store=createStore(':memory:'),provider=createProviderRegistry();provider.set({profile_id:'gpt',apiKey:'fixture-gpt-key'});provider.set({profile_id:'claude',apiKey:'fixture-claude-key'});
 const first=store.submit({task:{...task,request_id:'profile-pin-gpt'}}),second=store.submit({task:{...task,request_id:'profile-pin-claude'}});const calls=[];
 const app=createApp({store,provider,fetchImpl:async(url,options)=>{const payload=JSON.parse(options.body);calls.push(payload.model);assert.equal(url,payload.model==='gpt-6.1-sol'?'https://api.openai.com/v1/chat/completions':'https://api.example.com/v1/chat/completions');assert.equal(options.headers.Authorization,payload.model==='gpt-6.1-sol'?'Bearer fixture-gpt-key':'Bearer fixture-claude-key');provider.set({profile_id:payload.model==='gpt-6.1-sol'?'claude':'gpt'});const t=JSON.parse(payload.messages[1].content.slice('仅评阅以下 JSON 数据：\n'.length)),result=report(t);if(payload.model==='claude-opus-5.5'){assert.equal(payload.messages.length,3);assert.ok(payload.messages[0].content.includes('reference ID'));result.coverage[0].evidence='[[original:1]]';}return new Response(JSON.stringify({model:payload.model,choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]}));}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.address().port;
 const post=(route,data)=>fetch(base+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(data)});
 try{
  assert.equal((await fetch(base+'/api/provider?profile_id=unknown')).status,400);
  for(const [profile_id,submission,model] of [['gpt',first,'gpt-6.1-sol'],['claude',second,'claude-opus-5.5']]){const response=await post('/api/grade',{profile_id,submission_id:submission.id,base:'https://attacker.example/v1'});assert.equal(response.status,200);const result=await response.json();assert.equal(result.profile_id,profile_id);assert.equal(result.record.model,model);assert.equal(result.record.method,'api');}
  assert.deepEqual(calls,['gpt-6.1-sol','claude-opus-5.5']);
  const cleared=await fetch(base+'/api/provider?profile_id=claude',{method:'DELETE',headers:{Origin:base}});assert.equal(cleared.status,200);assert.equal((await cleared.json()).hasKey,false);assert.equal(provider.get('gpt').hasKey,true);
  assert.ok(!JSON.stringify(store.library()).includes('fixture-'));assert.equal((await post('/api/grade',{profile_id:'claude',submission_id:second.id})).status,400);
 }finally{await new Promise(resolve=>app.close(resolve));store.close();}
});
test('server-held credential cannot be redirected; real submission feedback is saved once',async()=>{
 const store=createStore(':memory:'),provider=createProviderSession({apiKey:credential}),submission=store.submit({task});let calls=0;
 const app=createApp({store,provider,fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer '+credential);const payload=JSON.parse(options.body);assert.equal(payload.model,'gpt-6.1-sol');assert.ok(!options.body.includes(credential));const t=JSON.parse(payload.messages[1].content.slice('仅评阅以下 JSON 数据：\n'.length));await new Promise(resolve=>setTimeout(resolve,35));return new Response(JSON.stringify({model:'gpt-6.1-sol',usage:{total_tokens:100},choices:[{finish_reason:'stop',message:{content:JSON.stringify(report(t))}}]}));}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.address().port;
 const post=(route,data,origin=base)=>fetch(base+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
 try{
  const meta=await(await fetch(base+'/api/provider')).json();assert.equal(meta.hasKey,true);assert.ok(!JSON.stringify(meta).includes(credential));
  assert.equal((await post('/api/provider',{apiKey:'replacement'},'https://another.example')).status,403);
  const results=await Promise.all([post('/api/grade',{submission_id:submission.id,base:'https://different.example/v1'}),post('/api/grade',{submission_id:submission.id})]);
  for(const r of results){assert.equal(r.status,200);const data=await r.json();assert.equal(data.record.method,'api');assert.equal(data.record.report.score,3);assert.equal(data.record.model,'gpt-6.1-sol');assert.equal(data.usage.total_tokens,100);assert.ok(!JSON.stringify(data).includes(credential));}
  assert.equal(calls,1);assert.equal(store.getSubmission(submission.id).feedback_revision,1);assert.ok(!JSON.stringify(store.library()).includes(credential));
  assert.equal((await fetch(base+'/api/provider',{method:'DELETE',headers:{Origin:'https://another.example'}})).status,403);
  assert.equal((await fetch(base+'/api/provider',{method:'DELETE',headers:{Origin:base}})).status,200);
  assert.equal((await post('/api/grade',{submission_id:submission.id})).status,400);assert.equal(calls,1);
 }finally{await new Promise(resolve=>app.close(resolve));store.close();}
});
