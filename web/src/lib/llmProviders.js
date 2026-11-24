/**
 * @file llmProviders.js
 * @brief 주요 LLM 회사의 API 연결 - 키 확인, 모델 목록, 문제지 풀이 요청
 *
 * - 요청은 사용자가 넣은 본인 키로 브라우저에서 각 회사 API로 바로 감 (이 서비스의 서버를 거치지 않음)
 * - 모델 이름은 자주 바뀌므로 키로 목록을 불러와 고름
 */

const trimText = (text, max = 200) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** @brief API 오류를 한국어 안내로 (키가 섞여 나오지 않게 지움) */
export function providerError(label, status, raw, key = '') {
  // 자르기 전에 키를 지워야 잘린 키 조각이 남지 않음
  let detail = String(raw ?? '')
  if (key) detail = detail.split(key).join('(키)')
  detail = trimText(detail)
  const tail = detail ? ` (${detail})` : ''
  if (status === 401 || status === 403 || (status === 400 && /api.?key/i.test(detail))) return `${label} API 키가 올바르지 않거나 권한이 없습니다${tail}`
  if (status === 402) return `${label} 계정의 잔액이 부족합니다${tail}`
  if (status === 404) return `${label}에서 이 모델을 찾을 수 없습니다${tail}`
  if (status === 413) return `${label}: 문제지가 너무 커서 보낼 수 없습니다${tail}`
  if (status === 429) return `${label} 사용 한도를 넘었거나 잔액이 부족합니다. 잠시 뒤 다시 시도하세요${tail}`
  if (status >= 500) return `${label} 서버에 문제가 있습니다(${status}). 잠시 뒤 다시 시도하세요${tail}`
  return `${label} 요청이 거절됐습니다(${status})${tail}`
}

async function request(provider, key, url, { signal, body } = {}) {
  let response
  try {
    response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { ...provider.headers(key), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error(`${provider.label}에 연결하지 못했습니다. 인터넷 연결이나 학교 방화벽을 확인하세요.`, { cause: error })
  }
  const text = await response.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = null }
  if (!response.ok) {
    const raw = data?.error?.message ?? (typeof data?.error === 'string' ? data.error : text)
    throw Object.assign(new Error(providerError(provider.label, response.status, raw, key)), { status: response.status })
  }
  if (data === null) throw new Error(`${provider.label}의 응답을 읽지 못했습니다.`)
  return data
}

const bearer = key => ({ authorization: `Bearer ${key}` })
const dataUrl = image => `data:${image.mime};base64,${image.data}`
const newestFirst = list => [...(list ?? [])].sort((a, b) => (b.created ?? 0) - (a.created ?? 0)).map(item => item.id)
/** 글을 주고받는 모델이 아닌 것 (그림 생성·음성 등) */
const NOT_CHAT = /embed|whisper|tts|audio|realtime|image|dall-e|moderation|transcri|sora|video|imagine|live|davinci|babbage|instruct|search|codex|robotics|computer-use|veo|aqa/i

/** @brief OpenAI 호환 채팅 요청·응답 (xAI, OpenRouter) */
const chatBody = ({ model, system, text, images }) => ({
  model,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: [...images.map(image => ({ type: 'image_url', image_url: { url: dataUrl(image) } })), { type: 'text', text }] }
  ]
})
const readChat = data => {
  const choice = data.choices?.[0]
  const content = choice?.message?.content
  return {
    text: Array.isArray(content) ? content.map(part => part.text ?? '').join('') : content ?? '',
    refused: Boolean(choice?.message?.refusal),
    truncated: choice?.finish_reason === 'length',
    usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
    modelId: data.model
  }
}

export const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    short: 'Claude',
    placeholder: 'sk-ant-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    headers: key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }),
    modelsUrl: 'https://api.anthropic.com/v1/models?limit=100',
    models: data => (data.data ?? []).map(item => item.id)
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    short: 'OpenAI',
    placeholder: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
    headers: bearer,
    modelsUrl: 'https://api.openai.com/v1/models',
    models: data => newestFirst(data.data).filter(id => /^(gpt|chatgpt|o\d)/i.test(id) && !NOT_CHAT.test(id)),
    solveUrl: () => 'https://api.openai.com/v1/responses',
    // store:false - 문제지를 OpenAI 대화 기록에 남기지 않음
    body: ({ model, system, text, images, schema }) => ({
      model,
      store: false,
      instructions: system,
      input: [{ role: 'user', content: [...images.map(image => ({ type: 'input_image', detail: 'high', image_url: dataUrl(image) })), { type: 'input_text', text }] }],
      text: { format: { type: 'json_schema', name: 'answers', strict: true, schema } }
    }),
    read: data => {
      const parts = (data.output ?? []).flatMap(item => item.content ?? [])
      return {
        text: parts.filter(part => part.type === 'output_text').map(part => part.text).join(''),
        refused: parts.some(part => part.type === 'refusal'),
        truncated: data.status === 'incomplete',
        usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
        modelId: data.model
      }
    }
  },
  {
    id: 'gemini',
    label: 'Google (Gemini)',
    short: 'Gemini',
    placeholder: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
    headers: key => ({ 'x-goog-api-key': key }),
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
    models: data => (data.models ?? [])
      .filter(item => item.supportedGenerationMethods?.includes('generateContent'))
      .map(item => item.name.replace(/^models\//, ''))
      .filter(id => /^gemini/i.test(id) && !NOT_CHAT.test(id))
      .reverse(),
    solveUrl: model => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    body: ({ system, text, images }) => ({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [...images.map(image => ({ inlineData: { mimeType: image.mime, data: image.data } })), { text }] }],
      generationConfig: { responseMimeType: 'application/json' }
    }),
    read: data => {
      const candidate = data.candidates?.[0]
      return {
        text: (candidate?.content?.parts ?? []).filter(part => !part.thought).map(part => part.text ?? '').join(''),
        refused: Boolean(data.promptFeedback?.blockReason) || /SAFETY|RECITATION|PROHIBITED|BLOCKLIST/.test(candidate?.finishReason ?? ''),
        truncated: candidate?.finishReason === 'MAX_TOKENS',
        usage: { inputTokens: data.usageMetadata?.promptTokenCount ?? 0, outputTokens: (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0) },
        modelId: data.modelVersion
      }
    }
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    short: 'Grok',
    placeholder: 'xai-…',
    keyUrl: 'https://console.x.ai',
    headers: bearer,
    modelsUrl: 'https://api.x.ai/v1/models',
    models: data => newestFirst(data.data).filter(id => !NOT_CHAT.test(id)),
    solveUrl: () => 'https://api.x.ai/v1/chat/completions',
    body: chatBody,
    read: readChat
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (DeepSeek·Llama·Mistral 등)',
    short: 'OpenRouter',
    placeholder: 'sk-or-…',
    keyUrl: 'https://openrouter.ai/keys',
    headers: bearer,
    // 모델 목록은 키 없이도 열리므로 키는 따로 확인
    checkUrl: 'https://openrouter.ai/api/v1/key',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    // 문제지를 그림으로 보내므로 그림을 읽는 모델만
    models: data => newestFirst((data.data ?? []).filter(item => item.architecture?.input_modalities?.includes('image'))),
    solveUrl: () => 'https://openrouter.ai/api/v1/chat/completions',
    body: chatBody,
    read: readChat
  }
]

export const providerOf = id => PROVIDERS.find(provider => provider.id === id)

/** @brief 키로 모델 목록을 불러옴 (키가 틀리면 오류) */
export async function listModels(id, key, signal) {
  const provider = providerOf(id)
  if (provider.checkUrl) await request(provider, key, provider.checkUrl, { signal })
  return [...new Set(provider.models(await request(provider, key, provider.modelsUrl, { signal })))]
}

/** @brief 문제지 그림과 안내를 보내 답을 받음 */
export async function askProvider(id, key, { model, system, text, images, schema, signal }) {
  const provider = providerOf(id)
  if (!provider?.solveUrl) throw new Error('이 회사의 모델로는 풀 수 없습니다.')
  const result = provider.read(await request(provider, key, provider.solveUrl(model), { signal, body: provider.body({ model, system, text, images, schema }) }))
  if (!result.text.trim()) {
    throw new Error(result.refused ? `${provider.label}가 응답을 거절했습니다.` : `${provider.label}가 빈 답을 보냈습니다.${result.truncated ? ' (출력 한도 초과)' : ''}`)
  }
  return result
}
