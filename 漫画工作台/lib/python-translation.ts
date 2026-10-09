import {spawn} from 'node:child_process';
import path from 'node:path';

/** One bounded process per translation batch; no shell or network translation. */
export function translateChineseFields(texts:string[],glossary:Record<string,string>={}):Promise<string[]> {
  const python=process.env.STUDIO_TRANSLATION_PYTHON||path.join(process.cwd(),'workspace','translation-venv',process.platform==='win32'?'Scripts':'bin',process.platform==='win32'?'python.exe':'python');
  return new Promise((resolve,reject)=>{
    const child=spawn(python,[path.join(process.cwd(),'scripts','translate-visual.py')],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8',ARGOS_DEVICE_TYPE:'cpu'}});
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let output='',errors='',settled=false;
    const finish=(error?:Error,result?:string[])=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result!);};
    const timer=setTimeout(()=>{child.kill();finish(new Error('本地翻译超时（120秒）'));},120_000);
    child.on('error',()=>finish(new Error('无法启动本地翻译 Python，请检查翻译环境安装')));
    child.stdin.on('error',()=>finish(new Error('本地翻译进程无法接收输入')));
    child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>4_000_000){child.kill();finish(new Error('本地翻译输出超出限制'));}});
    child.stderr.on('data',chunk=>{errors=(errors+chunk.toString()).slice(-2000);});
    child.on('close',code=>{
      if(code!==0){finish(new Error(`本地翻译失败：${errors.trim()||`退出码 ${code}`}`));return;}
      try{const result=JSON.parse(output);if(!Array.isArray(result.translations))throw new Error();finish(undefined,result.translations);}catch{finish(new Error('本地翻译返回了无效JSON'));}
    });
    child.stdin.end(JSON.stringify({texts,glossary}));
  });
}
