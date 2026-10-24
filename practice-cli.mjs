import {readFile} from 'node:fs/promises';
import {createStore} from './practice-store.mjs';
import {callTool} from './tools.mjs';
const [name,filename]=process.argv.slice(2),store=createStore();
try{const args=filename?JSON.parse(await readFile(filename,'utf8')):{};process.stdout.write(JSON.stringify(callTool(store,name,args),null,2)+'\n');}
catch(e){process.stderr.write((e.message||'操作失败')+'\n');process.exitCode=1;}finally{store.close();}
