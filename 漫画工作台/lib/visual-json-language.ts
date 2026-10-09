import {translateChineseFields} from './python-translation';
import {resolveStoryLocation} from './story-location';
const cjk = /\p{Script=Han}/u;
const idKeys = new Set(['id','characterId','actorCharacterId','targetCharacterId','outfitId','shoeId','propId','instanceId','targetId','sceneId','ownerCharacterId','ownershipBefore','ownershipAfter']);

/** IDs are opaque references. All prose, including evidence and warnings, is English. */
export function assertEnglishVisualJson(value:unknown):void {
  const failures:string[]=[];
  const visit=(item:unknown,path:string,key='')=>{
    if(typeof item==='string'){if(cjk.test(item)&&!idKeys.has(key))failures.push(`${path}: ${JSON.stringify(item.slice(0,100))}`);return;}
    if(Array.isArray(item)){item.forEach((v,i)=>visit(v,`${path}[${i}]`,key));return;}
    if(item&&typeof item==='object')for(const [k,v] of Object.entries(item))visit(v,`${path}.${k}`,k);
  };
  visit(value,'$');
  if(failures.length)throw new Error(`Visual output must use English prose. Translate these fields into English (including provenance evidence, warnings and notes): ${failures.slice(0,12).join('; ')}`);
}

export class VisualLanguageCompilationError extends Error {candidate?:{data:unknown;model?:unknown;usage?:unknown};}
const phrases:Record<string,string>={
  '动作完成后':'follow_through','动作进行中':'contact','动作前':'anticipation','接触中':'contact','尚未接触':'approach','已经松开':'released','双手':'both','左手':'left','右手':'right',
  '手中持有':'held','位于支持物上':'on_support','未明确':'unspecified','独立方向':'independent','物体':'object','人物':'character',
  '取物':'pick','放置':'place','打开':'open','关闭':'close','操作设施':'operate_environment','书写':'write','使用工具':'tool','持有':'hold','查看':'inspect','饮用':'drink','携带':'carry','触摸':'touch','阅读':'read',
  '坐在书桌前':'seated in front of the desk',
  '室内柔和光线':'soft indoor lighting','眼睛看向':'eyes focused on','视线集中在':'eyes focused on','低头看着':'looking downward at','轻轻抚摸':'gently touching','从包裹里拿出':'taking out of the package',
  '快递包裹':'delivery package','书桌':'desk','包裹':'package','快递':'delivery package','剪刀':'scissors','封面':'covers','书页':'pages','书本':'book','书籍':'book','桌面':'tabletop','桌子':'table','地面':'floor','货架':'shelf',
  '手机屏幕':'smartphone screen','手机':'smartphone','瓶子':'bottle','杯子':'cup','书':'book','碗':'bowl','盘子':'plate','工具':'tool','把手':'handle','指尖':'fingertips','手掌':'palm','刀刃':'blade','表面':'surface',
  '中近景':'medium close-up','近景':'close-up','中景':'medium shot','全景':'wide shot','平视':'eye-level','俯视':'high angle','仰视':'low angle','居中':'centered',
  '白天':'daytime','夜晚':'nighttime','晴天':'clear weather','阴天':'overcast weather','下雨':'rain','室内':'interior','室外':'exterior','客厅':'living room','厨房':'kitchen','卧室':'bedroom','窗户':'window',
  '期待':'expectant','满意':'satisfied','微笑':'smiling','小心地':'carefully','轻轻':'gently','自然':'natural','柔和':'soft','光线':'lighting','接触':'contact','拿出':'taking out','拿着':'holding','拆开':'opening','握住':'gripping','用':'using',
};

/** Conservative local compiler: unknown prose is an error, never deleted or replaced with invented detail. */
export function compileVisualJsonToEnglish(value:unknown,glossary:Record<string,string>={}){
  const audit:Array<{path:string;original:string;compiled:string}>=[];
  const entries=Object.entries({...phrases,...glossary}).sort((a,b)=>b[0].length-a[0].length);
  const visit=(item:unknown,path:string,key=''):unknown=>{
    if(typeof item==='string'){
      if(!cjk.test(item)||idKeys.has(key))return item;
      // Reuse the existing scene compiler rather than treating a Chinese scene
      // label as an opaque ID or inventing furniture around it.
      let compiled=key==='location'?resolveStoryLocation(item)?.location||item:item;
      // A tool clause is compiled compositionally, not as a task-specific sentence.
      compiled=compiled.replace(/用(.{1,12}?)(小心地|轻轻|仔细地)?(拆开|剪开|剪断|打开)([^，。；]*)/g,(_,tool,adverb,verb,target)=>`${adverb==='轻轻'?'gently':adverb?'carefully':''} ${verb==='剪断'?'cutting':verb==='剪开'?'cutting open':'opening'} ${target} with ${tool}`);
      for(const [from,to] of entries)compiled=compiled.split(from).join(` ${to} `);
      compiled=compiled.replace(/([一二三四五六七八九十两])(?:本|个|瓶|只|件|把|张|双)/g,(_,n)=>` ${{一:'one',二:'two',两:'two',三:'three',四:'four',五:'five',六:'six',七:'seven',八:'eight',九:'nine',十:'ten'}[n as string]} `).replace(/[，、]/g,', ').replace(/[。；]/g,'; ').replace(/\s+/g,' ').trim();
      if(cjk.test(compiled))throw new VisualLanguageCompilationError(`本地英文编译无法明确转换 ${path}，未保存：${item.slice(0,160)}`);
      audit.push({path,original:item,compiled});return compiled;
    }
    if(Array.isArray(item))return item.map((v,i)=>visit(v,`${path}[${i}]`,key));
    if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([k,v])=>[k,visit(v,`${path}.${k}`,k)]));
    return item;
  };
  const data=visit(value,'$');assertEnglishVisualJson(data);return {data,audit};
}

/** Only Chinese prose leaves are sent to Python; structure and IDs remain in JS. */
export async function compileVisualJsonWithPython(value:unknown,glossary:Record<string,string>={},translate:typeof translateChineseFields=translateChineseFields){
  const fields:Array<{path:string;original:string}>=[];
  const collect=(item:unknown,path:string,key='')=>{
    if(typeof item==='string'){if(cjk.test(item)&&!idKeys.has(key))fields.push({path,original:item});return;}
    if(Array.isArray(item)){item.forEach((v,i)=>collect(v,`${path}[${i}]`,key));return;}
    if(item&&typeof item==='object')for(const [k,v] of Object.entries(item))collect(v,`${path}.${k}`,k);
  };
  collect(value,'$');
  if(!fields.length)return {data:value,audit:[],mode:'direct_english'};
  let translations:string[];
  try{
    translations=await translate(fields.map(f=>f.original),glossary);
    if(!Array.isArray(translations)||translations.length!==fields.length||translations.some(t=>typeof t!=='string'||!t.trim()||cjk.test(t)))throw new Error('翻译字段缺失、为空或仍含中文');
  }catch(error){throw new VisualLanguageCompilationError(`Python自动英文翻译失败，未保存：${error instanceof Error?error.message:String(error)}`);}
  const audit=fields.map((f,i)=>({...f,compiled:translations[i].trim()}));
  let index=0;
  const replace=(item:unknown,key=''):unknown=>{
    if(typeof item==='string')return cjk.test(item)&&!idKeys.has(key)?audit[index++].compiled:item;
    if(Array.isArray(item))return item.map(v=>replace(v,key));
    if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([k,v])=>[k,replace(v,k)]));
    return item;
  };
  const data=replace(value);assertEnglishVisualJson(data);
  return {data,audit,mode:'python_argos_translation'};
}

export async function requestEnglishVisualJson<T extends {data:unknown}>(invoke:(system:string,user:string)=>Promise<T>,system:string,user:string,validate:(data:any)=>void=()=>{},glossary:Record<string,string>={},translate:typeof translateChineseFields=translateChineseFields):Promise<T & {languageCompilation:{mode:string;audit:Array<{path:string;original:string;compiled:string}>}}>{
  const language='Output JSON only. Every descriptive value, including provenance evidence, warnings, notes and scene names, must be English even when the input story is Chinese. Translate scene.location and named homes into English too: scene labels are NOT immutable IDs. Keep supplied IDs unchanged. Do not copy Chinese source phrases into evidence; translate their meaning faithfully.';
  const result=await invoke(`${system}\n${language}`,user);
  let compiled:Awaited<ReturnType<typeof compileVisualJsonWithPython>>;
  try{compiled=await compileVisualJsonWithPython(result.data,glossary,translate);}catch(error){if(error instanceof VisualLanguageCompilationError)error.candidate=result;throw error;}
  validate(compiled.data);
  return {...result,data:compiled.data,languageCompilation:{mode:compiled.mode,audit:compiled.audit}};
}
