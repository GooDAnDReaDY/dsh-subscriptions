// iFlytek Spark — OpenAI-compatible chat vendor, described as data (#629).
import { createChatVendor } from './chat-vendor.js'

const MODELS = [
  {
    id: 'spark-max',
    name: 'iFlytek Spark Max',
    contextWindow: 32768,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'spark-lite',
    name: 'iFlytek Spark Lite',
    contextWindow: 8192,
    maxTokens: 4096,
    inputModalities: ['text'],
  },
]

const vendor = createChatVendor({
  id: 'spark',
  name: 'iFlytek Spark',
  apiBase: 'https://spark-api-open.xf-yun.com/v1',
  authorizeUrl: 'https://xinghuo.xfyun.cn/',
  models: MODELS,
  missingAuth: 'iFlytek Spark requires API key',
})

export const {
  providerInfo,
  defaults,
  authorizeUrl,
  listModels,
  usage,
  streamOnce,
} = vendor
