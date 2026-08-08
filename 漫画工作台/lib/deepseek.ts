import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { LlmProviderConfig } from "./types";

const configPath = path.join(process.cwd(), "data", "deepseek-config.json");
const defaults = {
  enabled: false,
  baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  model: process.env.DEEPSEEK_MODEL || "deepseek-v4-pro",
  encryptedApiKey: "",
  apiKeyLast4: "",
};
type StoredConfig = typeof defaults;

function readStored(): StoredConfig {
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(configPath, "utf8")) };
  } catch {
    return { ...defaults };
  }
}

function dpapi(operation: "Protect" | "Unprotect", input: string) {
  if (process.platform !== "win32")
    throw new Error("当前系统不支持 Windows DPAPI，密钥未保存。");
  const prefix = "Add-Type -AssemblyName System.Security;";
  const script = prefix + (operation === "Protect"
    ? "$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))"
    : "$v=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($v);$p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($p))");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input,
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
  });
  if (result.status !== 0 || !result.stdout)
    throw new Error("Windows DPAPI 操作失败，密钥未以明文降级保存。");
  return result.stdout.trim();
}

export function getDeepSeekConfig(): LlmProviderConfig {
  const stored = readStored();
  return {
    enabled: stored.enabled,
    baseUrl: stored.baseUrl,
    model: stored.model,
    apiKeyConfigured: Boolean(stored.encryptedApiKey),
    apiKeyLast4: stored.apiKeyLast4,
  };
}

export function saveDeepSeekConfig(input: {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey?: string;
}) {
  const current = readStored();
  const baseUrl = input.baseUrl.trim().replace(/\/$/, "");
  const model = input.model.trim();
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error("API 地址必须是 HTTP(S) URL。");
  if (!model) throw new Error("模型名不能为空。");
  const key = input.apiKey?.trim();
  const next: StoredConfig = {
    enabled: Boolean(input.enabled),
    baseUrl,
    model,
    encryptedApiKey: key ? dpapi("Protect", key) : current.encryptedApiKey,
    apiKeyLast4: key ? key.slice(-4) : current.apiKeyLast4,
  };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  return getDeepSeekConfig();
}

export function deleteDeepSeekConfig() {
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
}

function getApiKey() {
  const stored = readStored();
  if (!stored.encryptedApiKey) throw new Error("尚未配置 DeepSeek API Key。");
  return dpapi("Unprotect", stored.encryptedApiKey);
}

export async function callDeepSeekJson(
  system: string,
  user: string,
  options: { timeoutMs?: number; maxTokens?: number } = {},
) {
  const config = readStored();
  if (!config.enabled) throw new Error("DeepSeek 尚未启用。");
  return callDeepSeekJsonWithConfig(system,user,{baseUrl:config.baseUrl,model:config.model,apiKey:getApiKey()},options);
}

export async function callDeepSeekJsonWithConfig(
  system:string,user:string,config:{baseUrl:string;model:string;apiKey:string},options:{timeoutMs?:number;maxTokens?:number}={}
) {
  const started = Date.now();
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      max_tokens: options.maxTokens ?? 12_000,
      stream: false,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
    cache: "no-store",
  });
  const raw = await response.text();
  if (!response.ok) {
    const labels: Record<number, string> = { 401: "API Key 无效", 402: "账户余额不足", 429: "请求频率受限" };
    throw new Error(labels[response.status] || `DeepSeek API 返回 ${response.status}`);
  }
  let envelope: any;
  try { envelope = JSON.parse(raw); } catch { throw new Error("DeepSeek 返回了无效响应。"); }
  const content = envelope?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 返回内容为空。");
  let data: unknown;
  try { data = JSON.parse(content); } catch { throw new Error("DeepSeek 返回的 JSON 无法解析。"); }
  return {
    data,
    model: String(envelope.model || config.model),
    latencyMs: Date.now() - started,
    usage: envelope.usage || {},
  };
}
