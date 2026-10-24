// Credentials arrive through hidden stdin, never command-line arguments or a file.
const tty=!!process.stdin.isTTY;
if(tty)process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdout.write('Ready for private API configuration on stdin (input is hidden).\n');
let buffer='';
process.stdin.on('data',async chunk=>{
  buffer+=chunk;
  if(buffer.length>12000){process.stderr.write('Configuration is too large.\n');process.exit(1);}
  if(!buffer.includes('\n')&&!buffer.includes('\r'))return;
  process.stdin.pause();if(tty)process.stdin.setRawMode(false);
  try{
    const config=JSON.parse(buffer.trim());buffer='';
    const port=Number(process.env.TOEFL_PORT||8765);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid port.');
    const origin='http://127.0.0.1:'+port;
    const response=await fetch(origin+'/api/provider',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(config),signal:AbortSignal.timeout(5000)});
    config.apiKey='';const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Configuration failed.');
    process.stdout.write(JSON.stringify({configured:result.hasKey,profile_id:result.profile_id,endpoint:result.endpoint,model:result.model,keyStorage:result.keyStorage})+'\n');process.exit(0);
  }catch{process.stderr.write('Unable to configure the local API session. No credentials were printed or saved.\n');process.exit(1);}
});
