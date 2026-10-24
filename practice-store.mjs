import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),C=require('./core.js'),D=require('./data.js');
export const dataDirectory=process.env.TOEFL_DATA_DIR || fileURLToPath(new URL('./.local/data/',import.meta.url));
export function problem(message,status=400){return Object.assign(new Error(message),{status});}
const iso=()=>new Date().toISOString();
const hash=t=>createHash('sha256').update(JSON.stringify([t.task_type,t.prompt,t.response])).digest('hex');
const parse=row=>row?JSON.parse(row.value):null;
function text(v,max=24000){if(typeof v!=='string'||v.length>max)throw problem('文字字段格式无效或过长。');return v;}
function validType(v){if(!['email','discussion'].includes(v))throw problem('题型必须是 email 或 discussion。');return v;}
function canonicalTask(t){C.checkTask(t);if(!t.response.trim())throw problem('作文不能为空。');return {request_id:text(t.request_id,200),task_type:t.task_type,prompt:t.prompt,response:t.response,title:typeof t.title==='string'?text(t.title,500):'自定义题目',created_at:typeof t.created_at==='string'&&!Number.isNaN(Date.parse(t.created_at))?t.created_at:iso()};}
function canonicalReport(r,t){C.validateReport(r,t);return Object.fromEntries(Object.keys(C.SHAPE).filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));}
export function createStore(filename=path.join(dataDirectory,'writing.sqlite')){
  if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS drafts(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,value TEXT NOT NULL,created_at TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO meta VALUES('revision','0');`);
  function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();const n=Number(parse(db.prepare("SELECT value FROM meta WHERE key='revision'").get()))+1;db.prepare("UPDATE meta SET value=? WHERE key='revision'").run(JSON.stringify(n));db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
  const revision=()=>parse(db.prepare("SELECT value FROM meta WHERE key='revision'").get());
  const active=()=>parse(db.prepare("SELECT value FROM meta WHERE key='active'").get());
  function setActive(value){db.prepare("INSERT INTO meta VALUES('active',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value));}
  const draft=k=>parse(db.prepare('SELECT value FROM drafts WHERE key=?').get(k));
  function putDraft(d){db.prepare('INSERT INTO drafts VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(d.key,JSON.stringify(d));return d;}
  function attempt(id,includeArchived=false){const row=db.prepare('SELECT value,archived FROM attempts WHERE id=?').get(id);if(!row||row.archived&&!includeArchived)throw problem('找不到这次提交。',404);return {...JSON.parse(row.value),archived:!!row.archived};}
  function putAttempt(r){db.prepare('INSERT INTO attempts(id,value,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(r.id,JSON.stringify(r),r.created_at);return r;}
  function rows(includeArchived=false){return db.prepare('SELECT value,archived FROM attempts '+(includeArchived?'':'WHERE archived=0 ')+'ORDER BY created_at DESC,id DESC').all().map(row=>({...JSON.parse(row.value),archived:!!row.archived}));}
  function saveDraft(input){
    text(input.key,200);validType(input.task_type);text(input.prompt,C.LIMITS.prompt);text(input.response,C.LIMITS.response);
    return transaction(()=>{const old=draft(input.key);if(old && input.expected_revision!==old.revision)throw problem('草稿已在另一窗口更新，请先载入最新版本。',409);const d={key:input.key,task_type:input.task_type,prompt:input.prompt,response:input.response,title:typeof input.title==='string'?text(input.title,500):'自定义题目',revision:(old?.revision||0)+1,updated_at:iso(),parent_id:input.parent_id||old?.parent_id||null,author:input.author==='ai'?'ai':input.author==='learner'?'learner':old?.author||'learner'};if(d.parent_id)attempt(d.parent_id);putDraft(d);if(input.activate!==false){const a=active(),same=a?.draft_key===d.key;setActive({...a,draft_key:d.key,task_type:d.task_type,minutes:same?a.minutes:d.task_type==='email'?7:10,started_at:same?a.started_at:null,pending_id:same?a.pending_id:null});}return d;});
  }
  function startPractice(input){
    validType(input.task_type);const topic=input.topic_id?D.prompts.find(p=>p.id===input.topic_id&&p.type===input.task_type):D.prompts.find(p=>p.type===input.task_type);
    if(input.topic_id&&!topic)throw problem('题目编号不存在或题型不匹配。');const prompt=input.prompt===undefined?topic.prompt:text(input.prompt,C.LIMITS.prompt);if(!prompt.trim())throw problem('完整题目不能为空。');
    const minutes=input.minutes??(input.task_type==='email'?7:10);if(!Number.isInteger(minutes)||minutes<1||minutes>60)throw problem('限时必须是1–60分钟。');if(input.parent_id){const p=attempt(input.parent_id);if(p.task.task_type!==input.task_type||p.task.prompt!==prompt)throw problem('重写稿必须与原稿使用同一道题。');}
    return transaction(()=>{const d={key:'practice-'+randomUUID(),task_type:input.task_type,prompt,response:'',title:input.title?text(input.title,500):topic?.title||'Codex 原创练习',revision:1,updated_at:iso(),parent_id:input.parent_id||null,author:'learner'};putDraft(d);setActive({draft_key:d.key,task_type:d.task_type,minutes,started_at:input.start_timer?iso():null,pending_id:null});return {draft:d,active:active()};});
  }
  function submit(input){
    let d;if(input.draft_key){d=draft(input.draft_key);if(!d)throw problem('草稿不存在。',404);if(input.expected_revision!==d.revision)throw problem('草稿版本已改变，请重新读取原稿。',409);}
    const task=canonicalTask(input.task||{request_id:randomUUID(),task_type:d?.task_type||input.task_type,prompt:d?.prompt||input.prompt,response:d?.response??input.response,title:d?.title||input.title,created_at:iso()});
    if(d&&(task.task_type!==d.task_type||task.prompt!==d.prompt||task.response!==d.response))throw problem('提交内容与草稿版本不匹配。',409);
    const parent_id=input.parent_id||d?.parent_id||null;if(parent_id){const parent=attempt(parent_id);if(parent.task.prompt!==task.prompt||parent.task.task_type!==task.task_type)throw problem('重写稿必须与原稿使用同一道题。');}
    return transaction(()=>{let old;try{old=attempt(task.request_id,true);}catch(e){if(e.status!==404)throw e;}if(old){if(old.response_sha256!==hash(task))throw problem('同一个提交编号不能修改原文。',409);if(old.archived)throw problem('这次提交已归档，请先恢复。',409);setActive({...active(),pending_id:old.id});return old;}
      const r={id:task.request_id,created_at:task.created_at,title:task.title,task,report:null,method:'codex',model:'',feedback_revision:0,response_sha256:hash(task),parent_id,author:d?.author||(input.author==='ai'?'ai':'learner'),draft_key:d?.key||null};putAttempt(r);setActive({...active(),pending_id:r.id});return r;});
  }
  function saveFeedback(input){
    return transaction(()=>{const r=attempt(input.submission_id);if(input.response_sha256!==r.response_sha256)throw problem('原文摘要不匹配，请读取正确的提交。',409);const report=canonicalReport(input.report,r.task);
      if(r.report&&JSON.stringify(r.report)===JSON.stringify(report))return r;
      if(input.expected_revision!==r.feedback_revision)throw problem('评分已更新；请重新读取该提交，避免覆盖另一份反馈。',409);
      r.report=report;r.feedback_revision++;r.method=input.method==='api'?'api':input.method==='chat'?'chat':'codex';r.model=typeof input.model==='string'?text(input.model,200):'Codex 当前对话';r.graded_at=iso();r.rubric_checked=C.RUBRIC.checked;
      if(report.essay_title){const metadata=C.validateWritingMetadata({title:report.essay_title,content_summary:report.content_summary});Object.assign(r,metadata,{metadata_source:r.method,metadata_revision:(r.metadata_revision||0)+1});}
      return putAttempt(r);});
  }
  function updateMetadata(input){
    const metadata=C.validateWritingMetadata(input);
    return transaction(()=>{const r=attempt(input.submission_id,true);if(input.response_sha256!==r.response_sha256)throw problem('原文摘要不匹配。',409);if(input.expected_metadata_revision!==(r.metadata_revision||0))throw problem('写作标题已更新，请重新读取记录。',409);
      Object.assign(r,metadata,{metadata_source:'codex',metadata_revision:(r.metadata_revision||0)+1});return putAttempt(r);});
  }
  function archive(id,restore=false){return transaction(()=>{attempt(id,true);db.prepare('UPDATE attempts SET archived=? WHERE id=?').run(restore?0:1,id);return {id,archived:!restore};});}
  function importLegacy(input){
    if(!Array.isArray(input.history)||input.history.length>300)throw problem('迁移记录格式无效或超过300条。');
    const records=input.history.map(r=>{const task=canonicalTask(r.task);if(r.id!==task.request_id)throw problem('迁移记录编号不一致。');const metadata=r.content_summary?C.validateWritingMetadata({title:r.title,content_summary:r.content_summary}):r.report?.essay_title?C.validateWritingMetadata({title:r.report.essay_title,content_summary:r.report.content_summary}):null;return {...r,task,report:r.report?canonicalReport(r.report,task):null,...(metadata||{})};});
    const drafts=Object.entries(input.drafts||{}).map(([key,v])=>({key:text(key,200),task_type:validType(key.split(':')[0]),prompt:text(v.prompt,C.LIMITS.prompt),response:text(v.response,C.LIMITS.response),title:'迁移的浏览器草稿',revision:1,updated_at:iso(),parent_id:null,author:'learner'}));
    return transaction(()=>{let imported=0;for(const r of records){try{const old=attempt(r.id,true);if(old.response_sha256!==hash(r.task))throw problem('备份编号与档案中原文冲突，迁移已取消。',409);continue;}catch(e){if(e.status!==404)throw e;}putAttempt({id:r.id,title:typeof r.title==='string'?text(r.title,500):r.task.title,content_summary:r.content_summary||'',metadata_revision:r.content_summary?1:0,created_at:r.task.created_at,task:r.task,report:r.report,method:r.method==='api'?'api':'chat',model:typeof r.model==='string'?text(r.model,200):'历史导入',feedback_revision:r.report?1:0,response_sha256:hash(r.task),parent_id:null,author:'learner',draft_key:null});imported++;}let draftCount=0;for(const d of drafts)if(!draft(d.key)){putDraft(d);draftCount++;}return {imported,drafts_imported:draftCount};});
  }
  function library(){return {revision:revision(),active:active(),drafts:Object.fromEntries(db.prepare('SELECT value FROM drafts').all().map(row=>{const d=JSON.parse(row.value);return[d.key,d];})),history:rows(),archived:rows(true).filter(r=>r.archived)};}
  function getSubmission(id){const actual=id||active()?.pending_id;if(!actual)throw problem('还没有提交作文。请先在页面点击“提交给 Codex”，或调用 submit_writing。',404);return attempt(actual);}
  function list(input={}){const limit=input.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw problem('limit 必须是1–100。');if(input.task_type)validType(input.task_type);return rows(!!input.include_archived).filter(r=>!input.task_type||r.task.task_type===input.task_type).slice(0,limit).map(r=>({id:r.id,...C.writingMetadata(r),created_at:r.created_at,task_type:r.task.task_type,word_count:C.wordCount(r.task.response),score:r.report?.score??null,parent_id:r.parent_id,author:r.author,archived:r.archived}));}
  function compare(a,b){const original=attempt(a),revised=attempt(b);if(original.task.task_type!==revised.task.task_type||original.task.prompt!==revised.task.prompt)throw problem('只能比较同一道题的两个版本。');return {original,revised,word_count_change:C.wordCount(revised.task.response)-C.wordCount(original.task.response),warning:revised.author==='ai'?'后一个版本标记为AI改写，不代表考生独立能力。':'结合两份原文评估变化，不能只凭预估分差判断进步。'};}
  function progress(){const recent=rows().filter(r=>r.report).slice(0,30);return {total:rows().length,scored:recent.length,scope:'最近30次已评分练习',recent:recent.map(r=>({id:r.id,task_type:r.task.task_type,score:r.report.score,author:r.author,priorities:r.report.priorities})),issues_by_kind:recent.reduce((m,r)=>{for(const x of r.report.issues)m[x.kind]=(m[x.kind]||0)+1;return m;},{}),notice:'问题条目数是诊断线索，不是ETS计分规则；不同题型和AI改写应分开解释。'};}
  return {db,close:()=>db.close(),revision,active,draft,saveDraft,startPractice,submit,saveFeedback,updateMetadata,archive,importLegacy,library,getSubmission,list,compare,progress};
}
