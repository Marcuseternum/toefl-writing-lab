import {createRequire} from 'node:module';
import {problem} from './practice-store.mjs';
const require=createRequire(import.meta.url),C=require('./core.js'),D=require('./data.js');
export const definitions=require('./tool-definitions.js');
function validateArgs(input,schema){
  if(!input||typeof input!=='object'||Array.isArray(input))throw problem('工具参数必须是JSON对象。');
  if(Object.keys(input).some(k=>!Object.hasOwn(schema.properties,k)))throw problem('工具参数含有不支持的字段。');
  if(schema.required.some(k=>input[k]===undefined))throw problem('缺少必需的工具参数。');
  for(const [k,v]of Object.entries(input)){const s=schema.properties[k];if(s.type==='integer'&&!Number.isInteger(v)||s.type==='string'&&typeof v!=='string'||s.type==='boolean'&&typeof v!=='boolean'||s.type==='object'&&(!v||typeof v!=='object'||Array.isArray(v)))throw problem(k+' 参数格式无效。');if(s.enum&&!s.enum.includes(v)||s.minimum!==undefined&&v<s.minimum||s.maximum!==undefined&&v>s.maximum)throw problem(k+' 参数不在支持范围内。');}
}
export function callTool(store,name,args={}){
  const definition=definitions.find(t=>t.name===name);if(!definition)throw problem('工具不存在。',404);validateArgs(args,definition.inputSchema);
  switch(name){
    case 'get_status':{const a=store.active();return {revision:store.revision(),active:a,draft:a?.draft_key?store.draft(a.draft_key):null,notice:'草稿可继续编辑；评分应使用get_submission返回的不可修改原文。'};}
    case 'get_rubric':return {task_type:args.task_type||'email',instructions:C.instructions(args.task_type||'email'),report_shape:C.SHAPE,sources:D.sources,checked:C.RUBRIC.checked};
    case 'list_practice_topics':return {topics:D.prompts.filter(t=>!args.task_type||t.type===args.task_type),source:'原创模拟题，非ETS真题'};
    case 'start_practice':return store.startPractice(args);
    case 'submit_writing':return store.submit(args);
    case 'get_submission':return store.getSubmission(args.submission_id);
    case 'save_feedback':return store.saveFeedback(args);
    case 'list_attempts':return {attempts:store.list(args)};
    case 'compare_revisions':return store.compare(args.original_id,args.revised_id);
    case 'get_progress':return store.progress();
  }
}
