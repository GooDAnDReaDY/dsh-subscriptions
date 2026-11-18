// Alibaba Qwen (DashScope) — OpenAI-compatible chat vendor, described as data (#629).
import { createChatVendor } from './chat-vendor.js'

const MODELS = [
  {
    id: 'qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B',
    contextWindow: 131072,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'qwen-max-latest',
    name: 'Qwen Max',
    contextWindow: 32768,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'qwen-plus-latest',
    name: 'Qwen Plus',
    contextWindow: 131072,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
]

const vendor = createChatVendor({
  id: 'qwen',
  name: 'Alibaba Qwen',
  apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  authorizeUrl: 'https://bailian.console.aliyun.com/',
  models: MODELS,
  missingAuth: 'Qwen API Key or Token is required',
  tools: true,
  generationParams: true,
})

export const {
  providerInfo,
  defaults,
  authorizeUrl,
  listModels,
  usage,
  streamOnce,
} = vendor
