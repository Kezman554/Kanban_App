/**
 * Anthropic API wrapper for the Kanban app
 * Handles API calls with proper error handling for rate limits and network issues
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const DEFAULT_MAX_TOKENS = 4096

// Error types for better handling
export class AnthropicError extends Error {
  constructor(message, type, statusCode = null, retryAfter = null) {
    super(message)
    this.name = 'AnthropicError'
    this.type = type
    this.statusCode = statusCode
    this.retryAfter = retryAfter
  }
}

export const ErrorTypes = {
  NETWORK: 'network',
  RATE_LIMIT: 'rate_limit',
  AUTH: 'auth',
  INVALID_REQUEST: 'invalid_request',
  SERVER: 'server',
  UNKNOWN: 'unknown'
}

// Cached API key
let cachedApiKey = null

/**
 * Get the Anthropic API key from the main process
 * Caches the key after first retrieval
 */
export async function getApiKey() {
  if (cachedApiKey) {
    return cachedApiKey
  }

  try {
    cachedApiKey = await window.electron.getAnthropicApiKey()
    return cachedApiKey
  } catch (error) {
    throw new AnthropicError(
      'Failed to retrieve API key: ' + error.message,
      ErrorTypes.AUTH
    )
  }
}

/**
 * Clear the cached API key (useful if key becomes invalid)
 */
export function clearApiKeyCache() {
  cachedApiKey = null
}

/**
 * Send a message to the Anthropic API
 *
 * @param {Object} options - Request options
 * @param {string} options.system - System prompt
 * @param {Array} options.messages - Array of message objects {role, content}
 * @param {string} [options.model] - Model to use (default: claude-sonnet-4-20250514)
 * @param {number} [options.maxTokens] - Max tokens in response (default: 4096)
 * @param {number} [options.temperature] - Temperature for response (default: undefined)
 * @returns {Promise<Object>} - API response with content and usage
 */
export async function sendMessage({
  system,
  messages,
  model = DEFAULT_MODEL,
  maxTokens = DEFAULT_MAX_TOKENS,
  temperature
}) {
  const apiKey = await getApiKey()

  const requestBody = {
    model,
    max_tokens: maxTokens,
    messages
  }

  if (system) {
    requestBody.system = system
  }

  if (temperature !== undefined) {
    requestBody.temperature = temperature
  }

  let response
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(requestBody)
    })
  } catch (error) {
    // Network error (no response received)
    throw new AnthropicError(
      'Network error: Unable to reach Anthropic API. Please check your internet connection.',
      ErrorTypes.NETWORK
    )
  }

  // Handle non-OK responses
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const errorMessage = errorData.error?.message || 'Unknown error'

    // Rate limit (429)
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after')
      throw new AnthropicError(
        `Rate limit exceeded. ${retryAfter ? `Retry after ${retryAfter} seconds.` : 'Please wait and try again.'}`,
        ErrorTypes.RATE_LIMIT,
        429,
        retryAfter ? parseInt(retryAfter, 10) : null
      )
    }

    // Authentication error (401)
    if (response.status === 401) {
      clearApiKeyCache()
      throw new AnthropicError(
        'Invalid API key. Please check your ANTHROPIC_API_KEY in .env',
        ErrorTypes.AUTH,
        401
      )
    }

    // Invalid request (400)
    if (response.status === 400) {
      throw new AnthropicError(
        `Invalid request: ${errorMessage}`,
        ErrorTypes.INVALID_REQUEST,
        400
      )
    }

    // Server error (5xx)
    if (response.status >= 500) {
      throw new AnthropicError(
        `Anthropic API server error: ${errorMessage}`,
        ErrorTypes.SERVER,
        response.status
      )
    }

    // Other errors
    throw new AnthropicError(
      `API error (${response.status}): ${errorMessage}`,
      ErrorTypes.UNKNOWN,
      response.status
    )
  }

  const data = await response.json()

  return {
    content: data.content,
    text: data.content?.[0]?.text || '',
    usage: data.usage,
    model: data.model,
    stopReason: data.stop_reason
  }
}

/**
 * Send a message with automatic retry for rate limits
 *
 * @param {Object} options - Same as sendMessage
 * @param {number} [maxRetries=3] - Maximum number of retries
 * @param {number} [baseDelay=1000] - Base delay in ms for exponential backoff
 * @returns {Promise<Object>} - API response
 */
export async function sendMessageWithRetry(options, maxRetries = 3, baseDelay = 1000) {
  let lastError

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await sendMessage(options)
    } catch (error) {
      lastError = error

      // Only retry on rate limits or server errors
      if (error.type !== ErrorTypes.RATE_LIMIT && error.type !== ErrorTypes.SERVER) {
        throw error
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        break
      }

      // Calculate delay
      let delay
      if (error.retryAfter) {
        delay = error.retryAfter * 1000
      } else {
        // Exponential backoff: 1s, 2s, 4s, ...
        delay = baseDelay * Math.pow(2, attempt)
      }

      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

export default {
  sendMessage,
  sendMessageWithRetry,
  getApiKey,
  clearApiKeyCache,
  AnthropicError,
  ErrorTypes
}
