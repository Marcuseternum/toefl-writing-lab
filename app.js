(function () {
  'use strict';
  const C = window.ToeflCore, D = window.ToeflData;
  const P=window.ToeflProviderDefaults||{base:'https://api.openai.com/v1',model:'gpt-6.1-sol',jsonMode:true};
  const $ = id => document.getElementById(id);
  const STORE = 'toefl-writing-lab-v1';
  let state = {reviewMode:'chat', type:'email', selected:{email:'e1',discussion:'d1'}, nativeKeys:{}, drafts:{}, history:[], archived:[], nativeOutbox:{}, pending:null, preferences:{...P}};
  let nativeMode=false, draftDetails=new Map();
  const openHistoryGroups=new Set();
  let providerHasKey=false,providerBusy=false,serverReady = false,timerHandle = null,remaining = 420,deadline = null,statusHandle;
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && saved.version === 1) {
      if (['chat','api','codex'].includes(saved.reviewMode))state.reviewMode=saved.reviewMode;
      if (['email','discussion'].includes(saved.type)) state.type = saved.type;
      if (saved.selected && typeof saved.selected === 'object') ['email','discussion'].forEach(type=>{if(typeof saved.selected[type]==='string')state.selected[type]=saved.selected[type];});
      if (saved.drafts && typeof saved.drafts === 'object' && !Array.isArray(saved.drafts)) Object.entries(saved.drafts).forEach(([key,v])=>{if(v && typeof v.prompt==='string'&&typeof v.response==='string'&&v.prompt.length<=C.LIMITS.prompt&&v.response.length<=C.LIMITS.response)state.drafts[key]={prompt:v.prompt,response:v.response};});
      if (Array.isArray(saved.history)) state.history = saved.history.filter(validRecord).slice(0,300);
      if (saved.pending) { try {state.pending = C.checkTask(saved.pending);} catch {} }
      if (saved.nativeKeys && typeof saved.nativeKeys==='object')state.nativeKeys=saved.nativeKeys;
      if (Array.isArray(saved.archived))state.archived=saved.archived.filter(validRecord);
      if (saved.nativeOutbox && typeof saved.nativeOutbox==='object')state.nativeOutbox=Object.fromEntries(Object.entries(saved.nativeOutbox).filter(([,r])=>validRecord(r)));
      if (saved.preferences && typeof saved.preferences.base==='string' && typeof saved.preferences.model==='string') state.preferences={base:saved.preferences.base,model:saved.preferences.model,jsonMode:saved.preferences.jsonMode!==false,...(['gpt','claude','deepseek','qwen','custom'].includes(saved.preferences.profile_id)?{profile_id:saved.preferences.profile_id}:{})};
    }
  } catch { /* A fresh session remains usable when storage is unavailable. */ }
  function id() { return globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+'-'+Math.random().toString(36).slice(2); }
  function node(tag, text, className) {const n=document.createElement(tag); if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
  function button(text, fn, cls='inline-button') {const n=node('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;}
  function notice(message, error=false, persistent=false) {clearTimeout(statusHandle);$('status').textContent=message;$('status').className=error?'error':'';$('status').hidden=false;if(!persistent)statusHandle=setTimeout(()=>$('status').hidden=true,error?14000:6500);}
  function persist() {
    try {localStorage.setItem(STORE,JSON.stringify({version:1,...state}));$('draft-status').textContent=nativeMode?'· 本地档案已连接，浏览器有草稿副本':'· 草稿保存在本浏览器';return true;}
    catch {$('draft-status').textContent='· 本次未能保存，请导出备份';notice('浏览器存储不可用或已满。请导出练习记录，并将当前作文另存。',true);return false;}
  }
  function key() {return state.selected[state.type]==='native'?state.nativeKeys[state.type]:state.type+':'+state.selected[state.type];}
  function captureDraft() {state.drafts[key()]={prompt:$('prompt').value,response:$('essay').value};persist();window.ToeflNative?.scheduleSave();}
  function page(name) {
    if (!$(name)?.classList.contains('page')) return;
    if (!$('practice').hidden) captureDraft();
    document.querySelectorAll('.page').forEach(n=>n.hidden=n.id!==name);
    document.querySelectorAll('.nav').forEach(n=>{n.classList.toggle('active',n.dataset.page===name);n.setAttribute('aria-current',n.dataset.page===name?'page':'false');});
    if(name==='history')renderHistory();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function fillTask() {
    const preset=$('preset');preset.replaceChildren();
    D.prompts.filter(x=>x.type===state.type).forEach(p=>{const o=node('option',p.title);o.value=p.id;preset.append(o);});
    const custom=node('option','自定义题目 / 粘贴官方练习题');custom.value='custom';preset.append(custom);
    if(state.nativeKeys[state.type]&&state.drafts[state.nativeKeys[state.type]]){const o=node('option','当前练习 / 重写');o.value='native';preset.append(o);}
    if(![...preset.options].some(x=>x.value===state.selected[state.type]))state.selected[state.type]=D.prompts.find(x=>x.type===state.type).id;
    preset.value=state.selected[state.type];
    const original=D.prompts.find(x=>x.id===preset.value && x.type===state.type);
    const draft=state.drafts[key()] || {prompt:original?.prompt || '',response:''};
    $('prompt').value=draft.prompt;$('essay').value=draft.response;
    document.querySelector('.prompt-card .badge').textContent=original?(draft.prompt===original.prompt?'原创模拟题':'已编辑题目'):'自定义题目';
    document.querySelectorAll('[data-type]').forEach(n=>{n.classList.toggle('active',n.dataset.type===state.type);n.setAttribute('aria-pressed',String(n.dataset.type===state.type));});
    $('feedback').hidden=true;
    const hints=state.type==='email'?['先确定写给谁、为什么写，以及希望对方做什么。','逐项覆盖题目要求，用必要细节使请求可以执行。','根据关系选择语气，给自己留一点检查时间。']:['先回应教授的问题，提出清楚的立场。','用理由、细节或例子展开，增加自己的贡献。','与现有讨论保持相关；无需逐个回应同学。'];
    $('checklist').replaceChildren(...hints.map(x=>node('li',x)));
    $('writing-tip').textContent=state.type==='email'?'邮件先完成交际目的。内容、语气和清晰度比堆砌难词更重要。':'官方练习建议有效讨论回应至少 100 词。工具按实际展开判断，不按字数机械扣分。';
    resetTimer();updateCount();updatePending();persist();window.ToeflNative?.scheduleSave();
  }
  function updateCount() {$('word-count').textContent=C.wordCount($('essay').value);}
  function resetTimer() {clearInterval(timerHandle);timerHandle=null;deadline=null;remaining=state.type==='email'?420:600;renderClock();$('timer-toggle').textContent='开始计时';}
  function renderClock() {const n=Math.max(0,remaining);$('clock').textContent=String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');$('clock').style.color=n<60?'var(--danger)':'';}
  function tick() {
    remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));renderClock();
    if(remaining===0){clearInterval(timerHandle);timerHandle=null;deadline=null;$('timer-toggle').textContent='已到时';captureDraft();notice('限时已结束，草稿已保存。练习模式仍可继续编辑，或复制请求评分。');}
  }
  function toggleTimer() {
    if(timerHandle){remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));clearInterval(timerHandle);timerHandle=null;deadline=null;$('timer-toggle').textContent='继续';renderClock();return;}
    if(!remaining)resetTimer();deadline=Date.now()+remaining*1000;timerHandle=setInterval(tick,250);$('timer-toggle').textContent='暂停';
  }
  function snapshot() {
    captureDraft();
    const t={request_id:id(),task_type:state.type,prompt:$('prompt').value.trim(),response:$('essay').value,title:$('preset').selectedOptions[0].textContent,created_at:new Date().toISOString()};
    C.checkTask(t);if(!t.response.trim())throw new Error('请先写一篇英文回应，再请求评分。');return t;
  }
  function updatePending() {
    const p=state.pending;
    $('pending-label').textContent=p?`等待导入：${p.task_type==='email'?'邮件':'学术讨论'} · ${C.wordCount(p.response)}词 · ${new Date(p.created_at || Date.now()).toLocaleString('zh-CN')}。导入结果将绑定这次提交时的原文。`:'先复制评分请求，再导入该次结果。工具会核对请求编号和原文引用。';
  }
  function newRequest() {const t=snapshot();state.pending=t;persist();updatePending();return t;}
  async function scoringRequest() {
    if(!nativeMode)return newRequest();
    const reusable=state.history.find(r=>r.id===state.pending?.request_id&&!r.report&&sameText(r.task));
    const record=await window.ToeflNative.submit({silent:true,reusePending:reusable});
    return record.task;
  }
  async function copyRequest() {
    try {
      const text=C.makePrompt(await scoringRequest());document.querySelector('.manual-feedback').open=true;
      try {await navigator.clipboard.writeText(text);$('prompt-fallback').hidden=true;notice('已复制。把完整请求发给你使用的 AI（如 DeepSeek、豆包、通义千问），再将返回的 JSON 粘贴到下方。');}
      catch {document.querySelector('.manual-feedback').open=true;$('copy-fallback').value=text;$('prompt-fallback').hidden=false;$('prompt-fallback').open=true;$('copy-fallback').focus();$('copy-fallback').select();notice('浏览器未允许自动复制。下方已展开完整请求，请按 Ctrl+C 手动复制。');}
    } catch(e) {notice(e.message,true);}
  }
  function download(filename,text,type='text/plain;charset=utf-8') {const a=node('a');const url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function sameText(t) {return t.task_type===state.type&&t.prompt===$('prompt').value.trim()&&t.response===$('essay').value;}
  function makeRecord(t,report=null,method='saved',model='') {return {id:t.request_id,created_at:t.created_at||new Date().toISOString(),title:report?.essay_title||t.title||'自定义题目',content_summary:report?.content_summary||'',task:t,report,method,model,parent_id:draftDetails.get(key())?.parent_id||null,author:draftDetails.get(key())?.author||'learner',feedback_revision:state.history.find(r=>r.id===t.request_id)?.feedback_revision||0};}
  function localRecord(rec) {const i=state.history.findIndex(x=>x.id===rec.id);if(i>=0)state.history[i]=rec;else state.history.unshift(rec);delete state.nativeOutbox[rec.id];persist();}
  function saveRecord(rec) {localRecord(rec);if(nativeMode){state.nativeOutbox[rec.id]=rec;persist();window.ToeflNative.storeRecord(rec).catch(e=>notice('浏览器副本已保留，本地档案未更新：'+e.message,true));}}
  function importReport() {
    try {
      if(!state.pending)throw new Error('请先复制或下载本次评分请求。');
      const t=state.pending,r=C.validateReport(C.parseReport($('report-json').value),t);
      const rec=makeRecord(t,r,'chat','手动导入');saveRecord(rec);renderReport(rec,$('feedback'));$('feedback').hidden=false;$('report-json').value='';
      notice(sameText(t)?'已导入并保存评分。可以查看原文依据，选择一项重点重写。':'已保存提交时原文的评分。当前草稿已改动；下方反馈对应原提交，可展开查看。');
      $('feedback').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){notice(e.message,true);}
  }
  const LEVELS={strong:'较强',adequate:'基本到位',developing:'有待展开',weak:'主要短板',met:'已覆盖',partial:'部分覆盖',missing:'未覆盖',major:'影响理解',minor:'局部问题',suggestion:'可选优化'};
  const KINDS={grammar:'语法',vocabulary:'用词',clarity:'清晰度',register:'语气',style:'表达优化'};
  function quote(text){return node('blockquote',text,'quote');}
  function card(title){const n=node('section',undefined,'card');n.append(node('h2',title));return n;}
  function renderReport(rec,host) {
    host.replaceChildren();const r=rec.report,t=rec.task,metadata=C.writingMetadata(rec);
    const banner=node('section',undefined,'score-card');const score=node('div');const n=node('div',String(r.score),'score-number');n.append(node('small',' / 5'));score.append(n,node('div','AI 单题练习预估','score-label'),node('div',`合理档位范围 ${r.plausible_range[0]}–${r.plausible_range[1]}`,'small'));
    const info=node('div');info.append(node('h2',metadata.title));if(metadata.content_summary)info.append(node('p','内容概览：'+metadata.content_summary));info.append(node('p',r.summary),node('p',r.band_reason),node('p',r.uncertainty,'small'),node('p',`${t.task_type==='email'?'邮件':'学术讨论'} · 对应 ${C.wordCount(t.response)} 词原文 · ${rec.model || '聊天评阅'} · ${new Date(rec.created_at).toLocaleString('zh-CN')}`,'small'));banner.append(score,info);host.append(banner);
    if(rec.author==='ai')info.append(node('p','该提交标记为 AI 改写，不能作为本人独立写作能力的证明。','small'));
    const toolbar=node('div',undefined,'report-toolbar');toolbar.append(button('导出反馈 Markdown',()=>download('TOEFL-feedback-'+rec.id.slice(0,8)+'.md',reportMarkdown(rec))),button('将改写放入练习区',()=>{if($('record-dialog').open)$('record-dialog').close();newRevision(rec,true);}));host.append(toolbar);
    const grid=node('div',undefined,'feedback-grid'),diag=card('四个诊断维度'),coverage=card('任务要求逐项检查');
    r.dimensions.forEach(x=>{const s=node('div',undefined,'diagnostic'),head=node('div',undefined,'diagnostic-title');head.append(node('span',x.name),node('span',LEVELS[x.level],'badge level-'+x.level));s.append(head,node('p',x.feedback));if(x.evidence)s.append(quote(x.evidence));diag.append(s);});
    diag.append(node('p','诊断等级不单独计分，也不按权重平均。','small'));
    r.coverage.forEach(x=>{const s=node('div',undefined,'diagnostic'),head=node('div',undefined,'diagnostic-title');head.append(node('span',x.requirement),node('span',LEVELS[x.status],'badge level-'+x.status));s.append(head,node('p',x.feedback));if(x.evidence)s.append(quote(x.evidence));coverage.append(s);});grid.append(diag,coverage);host.append(grid);
    const issues=card('把修改落到具体句子');if(!r.issues.length)issues.append(node('p','本次评阅没有指出需要纠正的局部语言问题。'));
    r.issues.forEach((x,i)=>{const s=node('div',undefined,'diagnostic');s.append(node('div',`${i+1}. ${KINDS[x.kind]} · ${LEVELS[x.severity]}`,'diagnostic-title'),quote(x.quote),node('div','→ '+x.correction,'correction'),node('p',x.explanation));issues.append(s);});host.append(issues);
    const nextGrid=node('div',undefined,'feedback-grid'),strengths=card('值得保留的表达'),priorities=card('下一次，只练这些');
    if(!r.strengths.length)strengths.append(node('p','先把任务要求表达完整，再积累可以复用的好表达。'));
    r.strengths.forEach(x=>{strengths.append(quote(x.quote),node('p',x.explanation));});
    r.priorities.forEach((x,i)=>{const s=node('div',undefined,'diagnostic');s.append(node('h3',`${i+1}. ${x.action}`),node('p',x.drill));priorities.append(s);});nextGrid.append(strengths,priorities);host.append(nextGrid);
    const rewrite=card('保留你的观点，试着这样写');rewrite.classList.add('rewrite-card');rewrite.append(node('p',`这份示范 ${C.wordCount(r.revised_response)} 词${t.task_type==='email'?' · 邮件改写训练目标 140–150 词':''}`,'small'),node('p',r.revised_response,'report-text'),node('p','这是 AI 修改示例，没有 ETS 认证分数。不要直接把改写当成原作文的评分依据。','small'));host.append(rewrite);
    const original=card('评分对应的原始提交');const details=node('details');details.append(node('summary','展开完整题目与原文'),node('h3','题目'),node('p',t.prompt,'report-text'),node('h3','原文'),node('p',t.response,'report-text'));original.append(details);host.append(original);
  }
  function reportMarkdown(rec) {
    const r=rec.report,t=rec.task,metadata=C.writingMetadata(rec);let s=`# ${metadata.title}\n\nTOEFL 写作练习反馈\n\n日期：${rec.created_at}\n题型：${t.task_type}\n来源：${rec.method} / ${rec.model}\n${metadata.content_summary?'\n内容概览：'+metadata.content_summary+'\n':''}\n**AI 单题预估 ${r.score}/5，合理范围 ${r.plausible_range.join('–')}。非 ETS 官方评分。**\n\n${r.summary}\n\n${r.band_reason}\n\n${r.uncertainty}\n\n## 诊断\n`;
    r.dimensions.forEach(x=>s+=`\n### ${x.name} · ${LEVELS[x.level]}\n\n${x.feedback}\n\n原文：${x.evidence || '无 / 缺失'}\n`);
    s+='\n## 任务检查\n';r.coverage.forEach(x=>s+=`\n- ${x.requirement} (${LEVELS[x.status]})：${x.feedback}\n  原文：${x.evidence || '无 / 缺失'}\n`);
    s+='\n## 保留的优点\n';r.strengths.forEach(x=>s+=`\n原文：${x.quote}\n\n${x.explanation}\n`);
    s+='\n## 局部修改\n';r.issues.forEach(x=>s+=`\n原文：${x.quote}\n\n建议：${x.correction}\n\n${KINDS[x.kind]} / ${LEVELS[x.severity]}：${x.explanation}\n`);
    s+='\n## 下次训练\n';r.priorities.forEach(x=>s+=`\n- ${x.action}\n  ${x.drill}\n`);
    return s+`\n## 修改示例\n\n${r.revised_response}\n\n## 原题\n\n${t.prompt}\n\n## 原文\n\n${t.response}\n\n评分标准：${C.RUBRIC.source}\n`;
  }
  function validRecord(rec) {
    try {if(!rec||typeof rec.id!=='string'||typeof rec.created_at!=='string'||Number.isNaN(Date.parse(rec.created_at))||typeof rec.title!=='string'||(rec.model!==undefined&&typeof rec.model!=='string')||(rec.method!==undefined&&typeof rec.method!=='string'))return false;C.checkTask(rec.task);if(rec.task.request_id!==rec.id)return false;if(rec.report)C.validateReport(rec.report,rec.task);return true;}catch{return false;}
  }
  function renderHistory() {
    function grouped(records){const groups=new Map();for(const rec of records.filter(Boolean).slice().sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id))){const key=JSON.stringify([rec.task.task_type,rec.task.prompt.trim().replace(/\r\n?/g,'\n')]);if(!groups.has(key))groups.set(key,{key,records:[]});groups.get(key).records.push(rec);}return [...groups.values()].sort((a,b)=>Date.parse(b.records.at(-1).created_at)-Date.parse(a.records.at(-1).created_at));}
    function metaLine(rec){return `${rec.task.task_type==='email'?'邮件':'学术讨论'} · ${new Date(rec.created_at).toLocaleString('zh-CN')} · ${C.wordCount(rec.task.response)}词${rec.author==='ai'?' · AI改写':rec.parent_id?' · 独立重写':''}${rec.model?' · '+rec.model:''}`;}
    function scoreNode(rec){const score=node('span',rec.report?rec.report.score+' / 5':'待评分','history-score');if(!rec.report)score.style.fontSize='14px';return score;}
    function actionsFor(rec,archived){const actions=node('div',undefined,'history-actions');actions.append(button('查看',()=>showRecord(rec)));if(archived)actions.append(button('恢复',()=>nativeArchive(rec.id,true)));else actions.append(button('独立重写',()=>newRevision(rec)),button('归档',()=>nativeArchive(rec.id)));return actions;}
    function renderGroups(host,groups,archived=false){host.replaceChildren();for(const group of groups){
      const records=group.records,latest=records.at(-1),representative=records.find(r=>r.report?.essay_title||r.content_summary)||records[0],metadata=C.writingMetadata(representative),info=node('div',undefined,'history-info'),heading=node('div',undefined,'history-heading');heading.append(node('h3',metadata.title));info.append(heading);if(metadata.content_summary)info.append(node('p',metadata.content_summary,'history-preview'));
      if(records.length===1){info.append(node('p',metaLine(latest),'history-meta'));const row=node('article',undefined,'history-row');row.append(info,scoreNode(latest),actionsFor(latest,archived));host.append(row);continue;}
      heading.append(node('span',records.length+' 次练习','badge'));info.append(node('p',`${latest.task.task_type==='email'?'邮件':'学术讨论'} · 最近练习 ${new Date(latest.created_at).toLocaleString('zh-CN')}`,'history-meta'));
      const details=node('details',undefined,'history-group'),summary=node('summary',undefined,'history-group-summary'),recent=node('div',undefined,'history-latest'),toggle=node('span',undefined,'history-group-toggle'),children=node('div',undefined,'history-attempts');
      recent.append(node('span','最近一次','small'),scoreNode(latest));toggle.append(node('span','展开记录','when-closed'),node('span','收起记录','when-open'),node('span','⌄','history-chevron'));summary.append(info,recent,toggle);details.append(summary,children);
      records.forEach((rec,i)=>{const row=node('article',undefined,'history-row history-attempt'),attempt=node('div',undefined,'history-info');attempt.append(node('h4','第'+(i+1)+'次练习','history-attempt-title'),node('p',metaLine(rec),'history-meta'));row.append(attempt,scoreNode(rec),actionsFor(rec,archived));children.append(row);});
      const openKey=(archived?'archived:':'active:')+group.key;details.open=openHistoryGroups.has(openKey);details.addEventListener('toggle',()=>{if(!details.isConnected)return;if(details.open)openHistoryGroups.add(openKey);else openHistoryGroups.delete(openKey);});host.append(details);
    }}
    const h=state.history,groups=grouped(h),scored=h.filter(x=>x.report);$('history-summary').replaceChildren(node('span',`${groups.length} 道题`),node('span',`${h.length} 次练习`),node('span',`${scored.length} 次已评分`),node('span',`${h.filter(x=>x.task.task_type==='email').length} 邮件 / ${h.filter(x=>x.task.task_type==='discussion').length} 讨论`));
    if($('archived-list'))renderGroups($('archived-list'),grouped(state.archived),true);
    const host=$('history-list');renderGroups(host,groups);if(!h.length)host.append(node('div','写完第一篇，保存练习或导入评分，它就会出现在这里。','empty'));
  }
  function nativeArchive(id,restore=false){if(nativeMode)window.ToeflNative.archive(id,restore).then(()=>renderHistory()).catch(e=>notice(e.message,true));else{if(restore){const r=state.archived.find(x=>x.id===id);if(r)state.history.unshift(r);state.archived=state.archived.filter(x=>x.id!==id);}else{state.archived.push(state.history.find(r=>r.id===id));state.history=state.history.filter(r=>r.id!==id);}persist();renderHistory();}}
  function showRecord(rec) {const host=$('record-content');host.replaceChildren();if(rec.report)renderReport(rec,host);else {host.append(node('h2',rec.title),node('h3','题目'),node('p',rec.task.prompt,'report-text'),node('h3','原文'),node('p',rec.task.response,'report-text'));host.append(button('用这篇作文生成评分请求',()=>{state.pending=rec.task;persist();updatePending();$('close-record').click();page('practice');$('copy-fallback').value=C.makePrompt(rec.task);document.querySelector('.manual-feedback').open=true;$('prompt-fallback').hidden=false;$('prompt-fallback').open=true;$('copy-fallback').focus();$('copy-fallback').select();notice('请求已展开，请复制后发给你使用的 AI。');},'secondary'));}$('record-dialog').showModal();}
  function renderSources() {
    $('rubric-bands').replaceChildren(...C.RUBRIC.bands.map((x,i)=>{const n=node('div',undefined,'band');n.append(node('strong',String(i)),node('span',x.slice(3)));return n;}).reverse());
    $('source-list').replaceChildren(...D.sources.map(x=>{const a=node('a',undefined,'source-item');a.href=x.url;a.target='_blank';a.rel='noopener noreferrer';a.append(node('h3',x.title+' ↗'),node('p',x.note));return a;}));
  }
  function renderSentences() {
    $('sentence-list').replaceChildren();D.sentences.forEach((item,i)=>{let selected=[];const cardEl=card((i+1)+'. '+item.question),bank=node('div',undefined,'word-bank'),answer=node('div',undefined,'word-answer'),result=node('div','','sentence-result');
      function render(){bank.replaceChildren();answer.replaceChildren();item.bank.forEach((word,j)=>{if(!selected.includes(j))bank.append(button(word,()=>{selected.push(j);result.textContent='';render();},'chip'));});selected.forEach(j=>answer.append(button(item.bank[j],()=>{selected=selected.filter(k=>k!==j);result.textContent='';render();},'chip')));if(!selected.length)answer.append(node('span','点击上方词块，在这里组成句子；再次点击可移回。','small'));}
      const actions=node('div',undefined,'actions');actions.append(button('检查答案',()=>{const text=selected.map(j=>item.bank[j]).join(' ');result.textContent=C.gradeSentence(text,item.answers)?'✓ 顺序正确。'+item.note:'请再检查句子结构。也可以查看预设答案与说明。';},'secondary'),button('查看答案',()=>{result.textContent='预设答案：'+item.answers.join(' / ')+' '+item.note+' 判题忽略大小写和句末标点，只接受列出的顺序。';}),button('重置',()=>{selected=[];result.textContent='';render();}));cardEl.append(bank,answer,actions,result);$('sentence-list').append(cardEl);render();});
  }
  async function loadProvider(){
    const suffix=state.preferences.profile_id?'?profile_id='+encodeURIComponent(state.preferences.profile_id):'';
    const response=await fetch('/api/provider'+suffix,{signal:AbortSignal.timeout(4000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'无法读取API设置。');return showProvider(data);
  }
  function showProvider(data){
    providerHasKey=data.hasKey===true;state.preferences={base:data.base,model:data.model,jsonMode:data.jsonMode!==false,profile_id:data.profile_id};
    for(const select of [$('practice-provider'),$('api-profile')]){select.replaceChildren(...(data.profiles||[]).map(p=>{const o=node('option',p.name+' · '+p.model+(p.hasKey?'':' · 待配置 Key'));o.value=p.profile_id;return o;}));select.value=data.profile_id;}
    $('api-base').value=data.endpoint;$('api-model').value=data.model;$('api-profile-name').textContent=data.model;$('json-mode').checked=data.jsonMode!==false;$('api-key').value='';$('api-key').placeholder=providerHasKey?'此配置已载入 Key；留空可继续使用':'填写此配置的 Key，仅保留在本机服务内存';persist();updateApiUI();return data;
  }
  function busyProvider(value){providerBusy=value;for(const id of ['review-mode','practice-provider','api-profile','api-base','api-model','api-key','json-mode','clear-api-key'])$(id).disabled=value;$('settings-form').querySelector('button[type="submit"]').disabled=value;$('api-grade').disabled=value||!serverReady||!providerHasKey;}
  async function switchProvider(profile_id){
    if(providerBusy)return;
    busyProvider(true);
    try{const response=await fetch('/api/provider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile_id}),signal:AbortSignal.timeout(5000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'切换失败。');showProvider(data);notice('已切换为 '+data.model+(data.hasKey?'，可以直接评分。':'，请在 AI 设置中填写该配置的 Key。'));}
    catch(e){$('practice-provider').value=state.preferences.profile_id;$('api-profile').value=state.preferences.profile_id;notice(e.message,true);}finally{busyProvider(false);}
  }
  async function applySettings(event) {
    event.preventDefault();if(providerBusy)return;busyProvider(true);
    try{
      if(!serverReady)throw new Error('请先运行 start.cmd 并通过本地HTTP地址使用。');
      const input={profile_id:state.preferences.profile_id,base:$('api-base').value.trim(),model:$('api-model').value.trim(),jsonMode:$('json-mode').checked};if($('api-key').value.trim())input.apiKey=$('api-key').value.trim();
      const response=await fetch('/api/provider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(5000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'设置失败。');showProvider(data);notice('此模型配置已应用。Key 仅保留在本机服务内存，切换模型与刷新网页后仍可使用。');
    }catch(e){notice(e.message,true);}finally{busyProvider(false);}
  }
  function updateApiUI() {
    const enabled=serverReady&&providerHasKey&&!!state.preferences.model,mode=state.reviewMode;
    $('review-mode').value=mode;
    $('copy-prompt').hidden=mode!=='chat';$('copy-prompt').className='primary';
    $('api-grade').hidden=mode!=='api';$('api-grade').disabled=providerBusy||!enabled;$('api-grade').className='primary';
    $('submit-codex').hidden=mode!=='codex';$('submit-codex').disabled=!nativeMode;$('submit-codex').className='primary';
    $('practice-provider-wrap').hidden=mode!=='api'||!serverReady;
    $('review-setup').hidden=mode==='chat'||(mode==='api'?enabled:nativeMode);
    const hints={chat:'无需 API Key。将完整评分请求发给你常用的 AI，再粘贴返回的 JSON。',api:'使用自己的 API Key 自动评分；支持 DeepSeek、通义千问及其他 Chat Completions 兼容服务。',codex:'可选进阶方式：需要本地服务及 Codex 的 MCP 或网页工具连接；提交后在聊天中发起评阅。'};
    $('review-help').textContent=hints[mode];
    $('mode-label').textContent=mode==='chat'?'任意 AI 对话 · 无需 API Key':mode==='api'?(enabled?'API 自动评分 · '+state.preferences.model:'API 自动评分 · 待配置'):'Codex / MCP · 可选';
    $('api-availability').textContent=serverReady?(providerHasKey?'Key 已载入本机服务内存。网页刷新不会清除；服务重启后须重新填写。':'选择服务并填写自己的 Key，再点击“应用设置”。'):'请运行 start.cmd，并通过本地地址使用 API 评分。';
    $('clear-api-key').hidden=!providerHasKey;
    document.querySelector('.workflow').textContent=mode==='chat'?'写完 → 复制评分请求到常用 AI → 粘贴 JSON → 导入评分结果':mode==='api'?(enabled?'写完 → 点击“API 自动评分” → 反馈与原文自动保存':'先在 AI 设置填写 API Key → 应用设置 → 返回自动评分'):'写完 → 提交给 Codex → 在聊天中说“给刚才的作文评分” → 反馈自动显示';
  }
  function readDraft(){const detail=draftDetails.get(key());return {key:key(),task_type:state.type,prompt:$('prompt').value,response:$('essay').value,title:detail?.title||$('preset').selectedOptions[0].textContent,parent_id:detail?.parent_id||null,author:detail?.author||'learner'};}
  function activateDraft(d,active={}){
    window.ToeflNative?.adoptDraft(d);state.pending=active.pending_id?state.history.find(r=>r.id===active.pending_id)?.task||null:null;
    state.type=d.task_type;state.nativeKeys[state.type]=d.key;state.selected[state.type]='native';state.drafts[d.key]={prompt:d.prompt,response:d.response};draftDetails.set(d.key,d);fillTask();page('practice');
    remaining=(active.minutes|| (d.task_type==='email'?7:10))*60;renderClock();
    if(active.started_at){deadline=Date.parse(active.started_at)+remaining*1000;clearInterval(timerHandle);timerHandle=setInterval(tick,250);$('timer-toggle').textContent='暂停';tick();}
  }
  async function newRevision(rec,ai=false){
    if(!nativeMode){captureDraft();state.type=rec.task.task_type;state.selected[state.type]='custom';state.drafts[key()]={prompt:rec.task.prompt,response:ai?rec.report.revised_response:''};draftDetails.set(key(),{title:rec.title,parent_id:rec.id,author:ai?'ai':'learner'});fillTask();page('practice');return;}
    try{await window.ToeflNative.flush();const res=await fetch('/api/tools/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'start_practice',arguments:{task_type:rec.task.task_type,prompt:rec.task.prompt,title:rec.title+' · '+(ai?'AI改写':'独立重写'),parent_id:rec.id}})});const data=await res.json();if(!res.ok)throw new Error(data.error);if(ai){const response=await fetch('/api/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data.draft,response:rec.report.revised_response,expected_revision:data.draft.revision,author:'ai'})});const result=await response.json();if(!response.ok)throw new Error(result.error);activateDraft(result,data.active);}else activateDraft(data.draft,data.active);notice(ai?'已载入AI改写，后续提交将标记为AI文本。':'已开始同题独立重写，原稿已保留。');}catch(e){notice(e.message,true);}
  }
  async function apiGrade() {
    if(providerBusy)return;const btn=$('api-grade'),selected={...state.preferences};try {
      if(!serverReady||!providerHasKey)throw new Error('请先在 AI 设置中配置 API Key。');
      busyProvider(true);document.querySelector('.editor-card').classList.add('is-grading');btn.setAttribute('aria-busy','true');btn.textContent='正在评阅…';
      const reusable=state.history.find(r=>r.id===state.pending?.request_id&&!r.report&&sameText(r.task));
      const submitted=nativeMode?await window.ToeflNative.submit({silent:true,reusePending:reusable}):null,t=submitted?.task||(state.pending&&sameText(state.pending)?state.pending:newRequest());notice('正在通过 '+selected.model+' 评阅，请稍候。',false,true);
      const response=await fetch('/api/grade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(submitted?{submission_id:submitted.id}:{task:t}),profile_id:selected.profile_id}),signal:AbortSignal.timeout(195000)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'评分请求失败');const report=C.validateReport(result.report,t),rec=result.record||makeRecord(t,report,'api',result.requested_model||selected.model);if(result.record)localRecord(rec);else saveRecord(rec);renderReport(rec,$('feedback'));$('feedback').hidden=false;notice('API 评分已完成，原文和反馈已保存。');$('feedback').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){notice(e.name==='TimeoutError'?'请求超时，原稿仍保留；可以稍后重试。':e.message,true,true);}finally{busyProvider(false);document.querySelector('.editor-card').classList.remove('is-grading');btn.setAttribute('aria-busy','false');btn.textContent='API 自动评分';}
  }
  document.querySelectorAll('[data-page]').forEach(n=>n.addEventListener('click',()=>page(n.dataset.page)));
  document.querySelectorAll('[data-type]').forEach(n=>n.addEventListener('click',()=>{if(n.dataset.type===state.type)return;captureDraft();state.type=n.dataset.type;fillTask();}));
  $('preset').addEventListener('change',()=>{captureDraft();state.selected[state.type]=$('preset').value;fillTask();});
    ['prompt','essay'].forEach(k=>$(k).addEventListener('input',()=>{updateCount();captureDraft();$('feedback').hidden=true;if(k==='prompt')document.querySelector('.prompt-card .badge').textContent='已编辑题目';}));
  $('timer-toggle').addEventListener('click',toggleTimer);$('timer-reset').addEventListener('click',resetTimer);
  $('clear-draft').addEventListener('click',()=>{const old=$('essay').value;if(!old)return;try{saveRecord(makeRecord(snapshot(),null,'saved'));}catch{}$('essay').value='';updateCount();captureDraft();$('feedback').hidden=true;notice('作文已清空；刚才的原稿已保存在练习记录中。');});
  $('copy-prompt').addEventListener('click',copyRequest);$('import-report').addEventListener('click',importReport);$('api-grade').addEventListener('click',apiGrade);
  $('save-attempt').addEventListener('click',()=>{try{saveRecord(makeRecord(snapshot()));notice('练习已保存。你可以稍后从记录中查看或评分。');}catch(e){notice(e.message,true);}});
  $('download-prompt').addEventListener('click',async()=>{try{const t=await scoringRequest();download('TOEFL-scoring-request.txt',C.makePrompt(t));notice('已下载评分请求。请复制其中全文到你使用的 AI 对话。');}catch(e){notice(e.message,true);}});
  $('export-history').addEventListener('click',()=>download('TOEFL-writing-backup.json',JSON.stringify({version:1,exported_at:new Date().toISOString(),history:state.history},null,2),'application/json'));
  $('import-backup').addEventListener('click',()=>$('backup-file').click());$('backup-file').addEventListener('change',async()=>{try{const file=$('backup-file').files[0];if(!file)return;if(file.size>12000000)throw new Error('备份超过12MB，请拆分后导入。');const backup=JSON.parse(await file.text());if(backup.version!==1||!Array.isArray(backup.history)||backup.history.length>300||backup.history.some(x=>!validRecord(x)))throw new Error('备份格式或评分记录无效，请选择本工具导出的记录。');const merged=new Map(state.history.map(x=>[x.id,x]));backup.history.forEach(x=>merged.set(x.id,x));if(merged.size>300)throw new Error('合并后超过300条。请先导出并删除部分当前记录。');state.history=[...merged.values()].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));persist();if(nativeMode)await window.ToeflNative.importRecords(backup.history);renderHistory();notice('备份已合并，重复编号的记录已更新。');}catch(e){notice(e.message,true);}finally{$('backup-file').value='';}});
  $('go-sources').addEventListener('click',()=>page('sources'));$('sentence-link').addEventListener('click',()=>{renderSentences();page('sentences');});$('back-writing').addEventListener('click',()=>page('practice'));$('close-record').addEventListener('click',()=>$('record-dialog').close());
  $('review-mode').addEventListener('change',()=>{state.reviewMode=$('review-mode').value;persist();updateApiUI();document.querySelector('.manual-feedback').open=state.reviewMode==='chat';});
  $('review-setup').addEventListener('click',()=>page('settings'));
  $('settings-form').addEventListener('submit',applySettings);$('api-base').value=state.preferences.base;$('api-model').value=state.preferences.model;$('json-mode').checked=state.preferences.jsonMode;
  for(const id of ['practice-provider','api-profile'])$(id).addEventListener('change',event=>switchProvider(event.target.value));
  $('clear-api-key').addEventListener('click',async()=>{if(providerBusy)return;busyProvider(true);try{const response=await fetch('/api/provider?profile_id='+encodeURIComponent(state.preferences.profile_id),{method:'DELETE'});const data=await response.json();if(!response.ok)throw new Error(data.error||'清除失败。');showProvider(data);notice('已清除此模型配置的 Key，其他配置仍保留。');}catch(e){notice(e.message,true);}finally{busyProvider(false);}});
  window.addEventListener('beforeunload',()=>{if(!$('practice').hidden)captureDraft();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&deadline)tick();});
  window.ToeflApp={
    notice,readDraft,activate:activateDraft,localRecord,
    connection:text=>{$('connection-state').textContent=text;},
    saved:text=>{$('draft-status').textContent=text;},
    showConflict:()=>{$('draft-conflict').hidden=false;},hideConflict:()=>{$('draft-conflict').hidden=true;},
    backupConflict:d=>{state.drafts['conflict-'+id()]={prompt:d.prompt,response:d.response};persist();},
    legacy:()=>({history:state.history,drafts:Object.fromEntries(Object.entries(state.drafts).filter(([k])=>/^(email|discussion):/.test(k)))}),
    canSyncPending:t=>state.reviewMode!=='chat'||!state.pending||state.pending.request_id===t.request_id,
    pending:t=>{state.pending=t;updatePending();persist();},
    library:lib=>{state.history=[...lib.history,...Object.values(state.nativeOutbox).filter(r=>!lib.history.some(x=>x.id===r.id))];state.archived=lib.archived;for(const[k,d]of Object.entries(lib.drafts)){draftDetails.set(k,d);if(!state.drafts[k])state.drafts[k]={prompt:d.prompt,response:d.response};}persist();},
    nativeHistoryUpdated:()=>{if(!$('history').hidden)renderHistory();},
    feedback:rec=>{renderReport(rec,$('feedback'));$('feedback').hidden=false;},
    nativeReady:()=>{nativeMode=true;updateApiUI();Object.values(state.nativeOutbox).forEach(r=>window.ToeflNative.storeRecord(r).catch(e=>notice(e.message,true)));}
  };
  $('submit-codex').addEventListener('click',async()=>{const b=$('submit-codex');b.disabled=true;try{await window.ToeflNative.submit();}catch(e){notice(e.message,true);}finally{b.disabled=false;}});
  $('keep-local-draft').addEventListener('click',()=>window.ToeflNative.resolveConflict(true).catch(e=>notice(e.message,true)));
  $('load-remote-draft').addEventListener('click',()=>window.ToeflNative.resolveConflict(false).catch(e=>notice(e.message,true)));
  renderSources();fillTask();updateApiUI();document.querySelector('.manual-feedback').open=state.reviewMode==='chat';
  if(/^https?:$/.test(location.protocol))fetch('/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>r.json()).then(async x=>{serverReady=x.app==='toefl-writing-lab';updateApiUI();if(serverReady)await loadProvider();}).catch(()=>{});
})();
