import { LlmError } from "@deepseek-ai/dsh-llm"
import { openaiMessages, openaiTools } from "../messages.js"
import { openaiChatStream, readJson, httpError } from "../wire.js"
import { asUsageSnapshot } from "../usage.js"

export const id = "copilot"

export const COPILOT_CLIENT_ID = "Iv1.b507a08c87ecfe98"
export const COPILOT_DEVICE_CODE_URL = "https://github.com/login/device/code"
export const COPILOT_DEVICE_TOKEN_URL = "https://github.com/login/oauth/access_token"
export const COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token"
export const COPILOT_API_URL = "https://api.githubcopilot.com/chat/completions"
export const COPILOT_USER_URL = "https://api.github.com/user"

export const COPILOT_MODELS = [
  {
    id: "claude-3.7-sonnet",
    name: "Claude 3.7 Sonnet (Copilot)",
    contextWindow: 200000,
    maxTokens: 64000,
    inputModalities: ["text", "image"],
    reasoning: { efforts: [{ id: "low", name: "Low" }, { id: "medium", name: "Medium" }, { id: "high", name: "High" }] }
  },
  {
    id: "claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet (Copilot)",
    contextWindow: 200000,
    maxTokens: 64000,
    inputModalities: ["text", "image"]
  },
  {
    id: "gpt-4o",
    name: "GPT-4o (Copilot)",
    contextWindow: 128000,
    maxTokens: 16384,
    inputModalities: ["text", "image"]
  },
  {
    id: "o3-mini",
    name: "o3-mini (Copilot)",
    contextWindow: 200000,
    maxTokens: 65536,
    inputModalities: ["text"],
    reasoning: { efforts: [{ id: "low", name: "Low" }, { id: "medium", name: "Medium" }, { id: "high", name: "High" }] }
  }
]

export function providerInfo() {
  return { id, name: "GitHub Copilot" }
}

export function defaults() {
  return {
    apiBase: COPILOT_API_URL,
    models: COPILOT_MODELS.map((m) => m.id)
  }
}

export function authorizeUrl() {
  return "https://github.com/login/device"
}

export async function listModels() {
  return COPILOT_MODELS
}

export function getTelemetryHeaders(sessionId) {
  const sid = sessionId || "copilot-session-" + Math.random().toString(36).slice(2, 12)
  return {
    "vscode-sessionid": sid,
    "vscode-machineid": "dsh-sub-machine-" + sid.slice(0, 8),
    "editor-version": "vscode/1.98.0",
    "editor-plugin-version": "copilot-chat/0.24.0",
    "Openai-Organization": "github-copilot",
    "Copilot-Integration-Id": "vscode-chat"
  }
}

export async function requestDeviceCode(fetchImpl) {
  const impl = fetchImpl || fetch
  const res = await impl(COPILOT_DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      scope: "read:user"
    })
  })
  if (!res.ok) throw httpError(res.status, await res.text())
  return readJson(res)
}

export async function pollDeviceToken(deviceCode, fetchImpl) {
  const impl = fetchImpl || fetch
  const res = await impl(COPILOT_DEVICE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    })
  })
  if (!res.ok) throw httpError(res.status, await res.text())
  return readJson(res)
}

export async function exchangeCopilotToken(githubToken, fetchImpl) {
  const impl = fetchImpl || fetch
  const res = await impl(COPILOT_TOKEN_URL, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/json",
      "User-Agent": "GitHubCopilotChat/0.24.0"
    }
  })
  if (!res.ok) throw httpError(res.status, await res.text())
  return readJson(res)
}

export async function usage(blob, config, fetchImpl) {
  try {
    const impl = fetchImpl || fetch
    const githubToken = blob && (blob.refreshToken || blob.githubToken || blob.accessToken)
    if (!githubToken) return null
    const res = await impl(COPILOT_USER_URL, {
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "User-Agent": "GitHubCopilotChat/0.24.0"
      }
    })
    if (!res.ok) return null
    const user = await readJson(res)
    const snap = asUsageSnapshot(10)
    if (snap) snap.plan = user && user.plan ? user.plan.name : "Copilot"
    return snap
  } catch {
    return null
  }
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  let copilotToken = blob && blob.accessToken
  const githubToken = blob && (blob.refreshToken || blob.githubToken)

  if ((!copilotToken || (blob.expiresAt && blob.expiresAt < Date.now() + 60000)) && githubToken) {
    const exchange = await exchangeCopilotToken(githubToken, impl)
    if (exchange && exchange.token) {
      copilotToken = exchange.token
      blob.accessToken = exchange.token
      if (exchange.expires_at) blob.expiresAt = exchange.expires_at * 1000
    }
  }

  if (!copilotToken) throw new LlmError("GitHub Copilot not authenticated", "AUTH")

  const body = {
    model: options.model || "claude-3.7-sonnet",
    messages: openaiMessages(options),
    stream: true,
    ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {})
  }

  const tools = openaiTools(options)
  if (tools && tools.length) body.tools = tools

  const telemetry = getTelemetryHeaders(options.sessionId)
  const url = (config && config.apiBase) || COPILOT_API_URL

  const res = await impl(url, {
    method: "POST",
    headers: {
      ...telemetry,
      ...headers,
      "Authorization": `Bearer ${copilotToken}`,
      "Content-Type": "application/json",
      "User-Agent": "GitHubCopilotChat/0.24.0"
    },
    body: JSON.stringify(body),
    signal
  })

  if (!res.ok) throw httpError(res.status, await res.text())
  yield* openaiChatStream(res.body)
}
