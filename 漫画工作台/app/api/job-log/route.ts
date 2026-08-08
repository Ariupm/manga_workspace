import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getGenerationJobById } from "@/lib/db";

export const runtime="nodejs";
export const dynamic="force-dynamic";

type LogEntry={time:string;level:"event"|"warning"|"error"|"output";message:string};

function summarizeEvent(event:Record<string,unknown>):LogEntry|null {
  const type=String(event.type||"");
  const item=(event.item||{}) as Record<string,unknown>;
  const itemType=String(item.type||"");
  if(type==="thread.started")return {time:"",level:"event",message:`会话已建立 · ${String(event.thread_id||"")}`};
  if(type==="turn.started")return {time:"",level:"event",message:"Codex 开始处理本格任务"};
  if(type==="turn.completed")return {time:"",level:"event",message:"本轮处理完成，正在校验输出"};
  if(type==="item.started"&&itemType==="mcp_tool_call")return {time:"",level:"event",message:`调用工具 · ${String(item.server||"")}/${String(item.tool||"")}`};
  if(type==="item.started"&&itemType==="command_execution")return {time:"",level:"event",message:`执行命令 · ${String(item.command||"").slice(0,240)}`};
  if(type==="item.completed"&&itemType==="agent_message")return {time:"",level:"output",message:String(item.text||"").slice(0,600)};
  if(type==="item.completed"&&String(item.status||"")==="failed")return {time:"",level:"error",message:`步骤失败 · ${String(item.aggregated_output||item.error||"未知错误").slice(0,500)}`};
  return null;
}

export async function GET(request:Request) {
  const jobId=Number(new URL(request.url).searchParams.get("jobId"));
  const job=getGenerationJobById(jobId);
  if(!job||job.provider!=="codex")return NextResponse.json({error:"Codex任务不存在"},{status:404});
  const file=path.join(process.cwd(),"workspace","codex-jobs",`job-${jobId}.jsonl`);
  if(!fs.existsSync(file))return NextResponse.json({entries:[],raw:"日志文件尚未创建"});
  const lines=fs.readFileSync(file,"utf8").split(/\r?\n/).filter(Boolean).slice(-160);
  const entries:LogEntry[]=[];
  for(const line of lines) {
    try {
      const entry=summarizeEvent(JSON.parse(line) as Record<string,unknown>);
      if(entry)entries.push(entry);
    } catch {
      const match=line.match(/^(\S+Z)\s+(WARN|ERROR)\s+[^:]+:\s*(.*)$/);
      if(match)entries.push({time:match[1],level:match[2]==="ERROR"?"error":"warning",message:match[3].slice(0,500)});
      else if(!line.startsWith("Reading "))entries.push({time:"",level:"output",message:line.slice(0,500)});
    }
  }
  return NextResponse.json({entries:entries.slice(-60),updatedAt:fs.statSync(file).mtime.toISOString()});
}
