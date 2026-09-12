import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { callDeepSeekJson, callDeepSeekJsonWithConfig, deleteDeepSeekConfig, getDeepSeekConfig, saveDeepSeekConfig } from "@/lib/deepseek";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET() {
  const provider=process.env.IMAGE_PROVIDER||"";
  const url=process.env.SD_WEBUI_URL||"http://127.0.0.1:7860";
  let reachable=false,apiEnabled=false,controlNet=false,ipAdapter=false;
  let handRefiner={available:false,module:false,model:false,dependencies:false,missing:[] as string[]};
  let code="NOT_CONFIGURED",message="请在漫画工作台根目录创建 .env.local，并重启服务。";
  if(provider==="sd-webui") {
    try {
      const response=await fetch(`${url.replace(/\/$/,"")}/sdapi/v1/options`,{signal:AbortSignal.timeout(1500),cache:"no-store"});
      reachable=true;apiEnabled=response.ok;
      if(!response.ok){code="API_DISABLED";message=`WebUI可访问，但API返回 ${response.status}。请使用 --api 启动。`;}
      else {
        code="CONNECTED";message="SD WebUI API 已连接。";
        try {
          const scripts=await fetch(`${url.replace(/\/$/,"")}/sdapi/v1/scripts`,{signal:AbortSignal.timeout(1500),cache:"no-store"}).then(r=>r.ok?r.json():null) as {txt2img?:string[]}|null;
          const names=(scripts?.txt2img??[]).map(x=>x.toLowerCase());
          controlNet=names.some(x=>x.includes("controlnet"));
          ipAdapter=names.some(x=>x.includes("ip-adapter")||x.includes("ip adapter"));
        } catch {}
        try {
          const controlBase=url.replace(/\/$/,"");
          const modules=await fetch(`${controlBase}/controlnet/module_list?alias_names=true`,{signal:AbortSignal.timeout(2000),cache:"no-store"}).then(r=>r.ok?r.json():null) as {module_list?:string[]}|null;
          const models=await fetch(`${controlBase}/controlnet/model_list`,{signal:AbortSignal.timeout(2000),cache:"no-store"}).then(r=>r.ok?r.json():null) as {model_list?:string[]}|null;
          controlNet=Boolean(modules?.module_list?.includes("reference_only"));
          ipAdapter=Boolean(
            modules?.module_list?.some(name=>name.startsWith("ip-adapter"))&&
            models?.model_list?.some(name=>name.includes("ip-adapter")&&!name.includes("[e3b0c442]"))
          );
          const modelDirectory=process.env.SD_CONTROLNET_MODEL_DIR||"D:\\stable-diffusion-webui-master\\extensions\\sd-webui-controlnet\\models";
          const dependencyDirectory=path.resolve(modelDirectory,"..","annotator","downloads","hand_refiner","hr16","ControlNet-HandRefiner-pruned");
          const requiredFiles=[
            {name:"control_sd15_inpaint_depth_hand_fp16.safetensors",path:path.join(modelDirectory,"control_sd15_inpaint_depth_hand_fp16.safetensors"),bytes:722601104},
            {name:"graphormer_hand_state_dict.bin",path:path.join(dependencyDirectory,"graphormer_hand_state_dict.bin"),bytes:855658184},
            {name:"hrnetv2_w64_imagenet_pretrained.pth",path:path.join(dependencyDirectory,"hrnetv2_w64_imagenet_pretrained.pth"),bytes:513111608},
          ];
          const missing=requiredFiles.filter(file=>!fs.existsSync(file.path)||fs.statSync(file.path).size!==file.bytes).map(file=>file.name);
          const moduleAvailable=Boolean(modules?.module_list?.includes("depth_hand_refiner"));
          const modelAvailable=Boolean(models?.model_list?.some(name=>name.startsWith("control_sd15_inpaint_depth_hand_fp16")));
          handRefiner={available:moduleAvailable&&modelAvailable&&!missing.length,module:moduleAvailable,model:modelAvailable,dependencies:!missing.length,missing};
        } catch {}
      }
    } catch {code="UNREACHABLE";message="无法连接SD WebUI，请检查地址、端口和服务是否启动。";}
  }
  return NextResponse.json({provider:provider||null,url,configured:provider==="sd-webui",reachable,apiEnabled,controlNet,ipAdapter,handRefiner,code,message,envFile:`${process.cwd()}\\.env.local`,restartRequired:true,deepseek:getDeepSeekConfig()});
}

export async function PATCH(request: Request) {
  try {
    const body=await request.json();
    const deepseek=saveDeepSeekConfig({enabled:Boolean(body.enabled),baseUrl:String(body.baseUrl||""),model:String(body.model||""),apiKey:typeof body.apiKey==="string"?body.apiKey:undefined});
    return NextResponse.json({ok:true,deepseek});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"配置保存失败"},{status:400});
  }
}

export async function POST(request: Request) {
  const body=await request.json().catch(()=>({}));
  if(body.action!=="test-deepseek")return NextResponse.json({error:"未知操作"},{status:400});
  try {
    const result=typeof body.apiKey==="string"&&body.apiKey.trim()
      ? await callDeepSeekJsonWithConfig("Return JSON only.","Return this JSON object exactly: {\"ok\":true}",{baseUrl:String(body.baseUrl||"https://api.deepseek.com").replace(/\/$/,""),model:String(body.model||"deepseek-v4-pro"),apiKey:body.apiKey.trim()},{timeoutMs:30_000,maxTokens:64})
      : await callDeepSeekJson("Return JSON only.","Return this JSON object exactly: {\"ok\":true}",{timeoutMs:30_000,maxTokens:64});
    return NextResponse.json({ok:true,model:result.model,latencyMs:result.latencyMs,testedAt:new Date().toISOString()});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"连接测试失败"},{status:502});
  }
}

export async function DELETE() {
  deleteDeepSeekConfig();
  return NextResponse.json({ok:true,deepseek:getDeepSeekConfig()});
}
