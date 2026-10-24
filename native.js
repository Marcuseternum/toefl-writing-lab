(function(){
  'use strict';
  const API=window.ToeflApp;
  let ready=false,revision=-1,draftVersions=new Map(),draftQueue=Promise.resolve(),saveTimer,polling=false,conflict=false,lastFeedback='',modelContext;
  const migrationKey='toefl-writing-native-migrated-v2';
  async function request(route,input){const options=input===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)};options.signal=AbortSignal.timeout(12000);const response=await fetch(route,options);const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'本地服务请求失败。'),{status:response.status});return result;}
  function status(text,error=false){API.connection(text);if(error)API.notice(text,true);}
  function current(){return API.readDraft();}
  async function saveCurrent(activate=true){
    if(!ready||conflict)return null;
    const value=current();
    const job=draftQueue.then(async()=>{
      const saved=await request('/api/draft',{...value,activate,expected_revision:draftVersions.get(value.key)??0});draftVersions.set(value.key,saved.revision);API.saved('· 已保存到本地档案');return saved;
    });draftQueue=job.catch(()=>{});
    try{return await job;}catch(e){if(e.status===409){conflict=true;API.saved('· 草稿版本冲突，当前文字仍保留');API.showConflict();}else API.saved('· 本地保存失败，浏览器副本仍保留');API.notice(e.message,true);throw e;}
  }
  function scheduleSave(){if(!ready)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveCurrent().catch(()=>{}),400);API.saved('· 正在保存到本地档案…');}
  async function flush(){clearTimeout(saveTimer);if(conflict)throw new Error('草稿有版本冲突，请先在连接栏选择保留或载入。');return saveCurrent();}
  async function submit({silent=false,reusePending=null}={}){
    if(!ready)throw new Error('请通过 start.cmd 启动本地服务，再使用“提交给 Codex”。');
    const saved=await flush();if(!saved?.response.trim())throw new Error('请先完成英文作文。');
    if(reusePending&&!reusePending.report&&reusePending.task.task_type===saved.task_type&&reusePending.task.prompt===saved.prompt&&reusePending.task.response===saved.response)return reusePending;
    const result=await request('/api/submit',{draft_key:saved.key,expected_revision:saved.revision});API.pending(result.task);API.localRecord(result);revision=-1;await sync(false);if(!silent)API.notice('原文已提交。在 Codex 聊天中说：“给刚才提交的作文评分”。无需复制 JSON。');return result;
  }
  async function storeRecord(rec){if(!ready)return;const result=await request('/api/record',{task:rec.task,report:rec.report,method:rec.method,model:rec.model,parent_id:rec.parent_id,author:rec.author,expected_revision:rec.feedback_revision});API.localRecord(result);revision=-1;await sync(false);return result;}
  async function sync(allowActivate=true){
    if(!ready||polling)return;polling=true;
    try{
      const lib=await request('/api/library');if(lib.revision===revision)return;
      revision=lib.revision;for(const[k,d]of Object.entries(lib.drafts))if(!draftVersions.has(k))draftVersions.set(k,d.revision);
      API.library(lib);
      const active=lib.active,d=active&&lib.drafts[active.draft_key],present=current();
      if(d&&allowActivate&&d.key!==present.key){clearTimeout(saveTimer);await saveCurrent(false);draftVersions.set(d.key,d.revision);API.activate(d,active);}
      if(active?.pending_id){const rec=lib.history.find(r=>r.id===active.pending_id);if(rec){API.pending(rec.task);const signature=rec.id+':'+rec.feedback_revision;if(rec.report&&signature!==lastFeedback){lastFeedback=signature;API.feedback(rec);API.notice((rec.method==='api'?'API':'Codex')+' 反馈已自动写回，并保存到本地档案。');}}}
      API.nativeHistoryUpdated();
    }catch(e){API.saved('· 本地连接中断，浏览器草稿仍保留');}finally{polling=false;}
  }
  async function archive(id,restore=false){await request('/api/archive',{id,restore});revision=-1;await sync(false);}
  async function importRecords(history){await request('/api/import',{history,drafts:{}});revision=-1;await sync(false);}
  async function resolveConflict(keep){
    const draft=current(),lib=await request('/api/library'),latest=lib.drafts[draft.key];
    if(keep){const result=await request('/api/draft',{...draft,key:'recovered-'+crypto.randomUUID(),expected_revision:0});draftVersions.set(result.key,result.revision);API.activate(result,{minutes:result.task_type==='email'?7:10});}
    else if(latest){API.backupConflict(draft);draftVersions.set(latest.key,latest.revision);API.activate(latest,lib.active);}
    conflict=false;API.hideConflict();revision=-1;await sync(false);API.notice(keep?'已将当前文字另存为新草稿。':'已载入档案中的最新草稿；原页面文字已保存为浏览器副本。');
  }
  async function toolExecute(name,args){
    if(['start_practice','submit_writing'].includes(name))await flush();
    if(name==='submit_writing'&&!args.task_type&&!args.draft_key){const d=await flush();args={...args,draft_key:d.key,expected_revision:d.revision};}
    const result=await request('/api/tools/call',{name,arguments:args});
    if(name==='start_practice'){draftVersions.set(result.draft.key,result.draft.revision);API.activate(result.draft,result.active);API.notice('Codex 已准备好新题。请独立写作，再提交评分。');}
    if(name==='submit_writing'){API.pending(result.task);API.localRecord(result);}
    if(name==='save_feedback'){API.localRecord(result);API.feedback(result);lastFeedback=result.id+':'+result.feedback_revision;}
    revision=-1;if(!window.ToeflToolDefinitions.find(t=>t.name===name).annotations.readOnlyHint)await sync(false);return result;
  }
  async function register(){
    modelContext=document.modelContext||navigator.modelContext;
    if(typeof modelContext?.registerTool!=='function'){status('本地档案已连接 · 网页工具在此客户端不可用，可使用已配置的 MCP');return;}
    try{for(const t of window.ToeflToolDefinitions)await modelContext.registerTool({...t,execute:args=>toolExecute(t.name,args||{})});status('Codex 网页工具已连接 · 提交后直接在聊天中说“评分”');}
    catch(e){status('本地档案已连接 · 网页工具注册失败，可使用 MCP');}
  }
  async function initialize(){
    if(!/^https?:$/.test(location.protocol)){status('文件直开：聊天复制模式 · 原生连接请运行 start.cmd');return;}
    try{
      const health=await request('/api/health');if(health.version!==2)throw new Error('请重启 start.cmd，载入新版本地服务。');
      // Existing records are copied, never removed. The server does not overwrite existing archive entries.
      let migrated=false;try{migrated=!!localStorage.getItem(migrationKey);}catch{}
      if(!migrated){await request('/api/import',API.legacy());try{localStorage.setItem(migrationKey,'true');}catch{}}
      const lib=await request('/api/library');for(const[k,d]of Object.entries(lib.drafts))draftVersions.set(k,d.revision);
      API.library(lib);ready=true;API.nativeReady();
      if(lib.active?.draft_key&&lib.drafts[lib.active.draft_key])API.activate(lib.drafts[lib.active.draft_key],lib.active);
      else await flush();
      revision=-1;await sync(false);await register();
      setInterval(()=>{if(!document.hidden)sync().catch(()=>{});},2000);
    }catch(e){status(e.message+' 浏览器草稿仍保留。',true);}
  }
  window.ToeflNative={scheduleSave,flush,submit,storeRecord,archive,importRecords,resolveConflict,adoptDraft:d=>draftVersions.set(d.key,d.revision),isReady:()=>ready};
  initialize();
})();
