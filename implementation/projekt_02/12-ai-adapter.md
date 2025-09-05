# Arbeitspaket 11: AI Adapter Implementation

## Ziel
Implementierung eines flexiblen AI Adapter Layers mit Support für multiple AI Provider (OpenAI, Anthropic, Google Gemini) unter Verwendung der offiziellen SDKs mit einheitlicher API, Streaming Support und intelligenter Fallback-Logik.

## Problem
- Package ist leer (nur Kommentar)
- Keine AI Provider Integration
- Fehlende Streaming Capabilities
- Keine Error Handling für AI Services
- Fehlende Token Management
- Keine Caching Strategy
- Keine Rate Limiting Implementation

## Kontext
- **Package**: `@starter-kit/ai-adapter`
- **Provider SDKs**: 
  - OpenAI SDK (`openai`)
  - Anthropic SDK (`@anthropic-ai/sdk`)
  - Google Generative AI SDK (`@google/generative-ai`)
- **Features**: Chat, Completion, Embeddings, Function Calling, Tool Use
- **Streaming**: Native SDK Streaming Support

## Implementierung

### Schritt 1: Dependencies installieren
```bash
cd packages/ai-adapter
npm install openai @anthropic-ai/sdk @google/generative-ai zod
```

### Schritt 2: Base Types und Interfaces
Erstelle `packages/ai-adapter/src/types.ts`:

```typescript
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'custom';

// Flexible content type für multi-modal support
export type AIContent = 
  | string 
  | Array<{
      type: 'text' | 'image' | 'tool_use' | 'tool_result';
      text?: string;
      image?: { url: string; detail?: 'low' | 'high' | 'auto' };
      tool_use?: {
        id: string;
        name: string;
        input: any;
      };
      tool_result?: {
        tool_use_id: string;
        content: any;
      };
    }>;

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: AIContent;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface AICompletionOptions {
  model?: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number; // For Google
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  stream?: boolean;
  tools?: AITool[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  user?: string;
  systemPrompt?: string;
}

export interface AITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON Schema
  };
}

export interface AICompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: AIChoice[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIChoice {
  index: number;
  message: AIMessage;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: any;
}

export interface AIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: Partial<AIMessage>;
    finishReason: string | null;
    logprobs?: any;
  }[];
}

export interface AIEmbeddingOptions {
  model?: string;
  input: string | string[];
  dimensions?: number; // For OpenAI text-embedding-3 models
  user?: string;
}

export interface AIEmbeddingResponse {
  object: string;
  data: {
    object: string;
    index: number;
    embedding: number[];
  }[];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  organization?: string;
  headers?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
}

export interface AIError extends Error {
  provider: AIProvider;
  statusCode?: number;
  response?: any;
  retryable: boolean;
  type?: 'rate_limit' | 'invalid_request' | 'authentication' | 'server_error' | 'timeout';
}

// Model defaults for each provider
export const DEFAULT_MODELS = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-1.5-flash',
} as const;

// Rate limit configuration
export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxTokensPerMinute: number;
  maxConcurrent: number;
}

export const PROVIDER_RATE_LIMITS: Record<AIProvider, RateLimitConfig> = {
  openai: {
    maxRequestsPerMinute: 500,
    maxTokensPerMinute: 90000,
    maxConcurrent: 50,
  },
  anthropic: {
    maxRequestsPerMinute: 50,
    maxTokensPerMinute: 100000,
    maxConcurrent: 10,
  },
  google: {
    maxRequestsPerMinute: 60,
    maxTokensPerMinute: 1000000,
    maxConcurrent: 30,
  },
  custom: {
    maxRequestsPerMinute: 100,
    maxTokensPerMinute: 50000,
    maxConcurrent: 10,
  },
};
```

### Schritt 3: Base Provider Class
Erstelle `packages/ai-adapter/src/providers/base.ts`:

```typescript
import { 
  AIProviderConfig, 
  AICompletionOptions, 
  AICompletionResponse, 
  AIEmbeddingOptions, 
  AIEmbeddingResponse, 
  AIError, 
  AIStreamChunk,
  RateLimitConfig,
  PROVIDER_RATE_LIMITS 
} from '../types';

export abstract class BaseAIProvider {
  protected config: AIProviderConfig;
  protected rateLimiter: RateLimiter;
  
  constructor(config: AIProviderConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter(PROVIDER_RATE_LIMITS[config.provider]);
  }
  
  abstract complete(options: AICompletionOptions): Promise<AICompletionResponse>;
  abstract stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk>;
  abstract embed(options: AIEmbeddingOptions): Promise<AIEmbeddingResponse>;
  
  protected createError(
    message: string,
    type: AIError['type'] = 'server_error',
    statusCode?: number,
    response?: any,
    retryable: boolean = false
  ): AIError {
    const error = new Error(message) as AIError;
    error.provider = this.config.provider;
    error.type = type;
    error.statusCode = statusCode;
    error.response = response;
    error.retryable = retryable;
    return error;
  }
}

// Rate Limiter implementation
class RateLimiter {
  private requests: number[] = [];
  private tokens: number[] = [];
  private concurrent = 0;
  
  constructor(private config: RateLimitConfig) {}
  
  async acquire(estimatedTokens: number = 0): Promise<void> {
    const now = Date.now();
    const minuteAgo = now - 60000;
    
    // Clean old entries
    this.requests = this.requests.filter(t => t > minuteAgo);
    this.tokens = this.tokens.filter(t => t > minuteAgo);
    
    // Check limits
    while (
      this.requests.length >= this.config.maxRequestsPerMinute ||
      this.tokens.reduce((a, b) => a + b, 0) + estimatedTokens > this.config.maxTokensPerMinute ||
      this.concurrent >= this.config.maxConcurrent
    ) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Re-clean
      const now = Date.now();
      const minuteAgo = now - 60000;
      this.requests = this.requests.filter(t => t > minuteAgo);
      this.tokens = this.tokens.filter(t => t > minuteAgo);
    }
    
    this.requests.push(now);
    if (estimatedTokens > 0) {
      this.tokens.push(estimatedTokens);
    }
    this.concurrent++;
  }
  
  release(): void {
    this.concurrent--;
  }
}
```

### Schritt 4: OpenAI Provider
Erstelle `packages/ai-adapter/src/providers/openai.ts`:

```typescript
import OpenAI from 'openai';
import { BaseAIProvider } from './base';
import { 
  AICompletionOptions, 
  AICompletionResponse, 
  AIEmbeddingOptions, 
  AIEmbeddingResponse, 
  AIStreamChunk,
  DEFAULT_MODELS 
} from '../types';

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;
  
  constructor(config: AIProviderConfig) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organization,
      baseURL: config.baseURL,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
      defaultHeaders: config.headers,
    });
  }
  
  async complete(options: AICompletionOptions): Promise<AICompletionResponse> {
    try {
      await this.rateLimiter.acquire(options.maxTokens || 1000);
      
      const response = await this.client.chat.completions.create({
        model: options.model || this.config.defaultModel || DEFAULT_MODELS.openai,
        messages: this.convertMessages(options.messages),
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        top_p: options.topP,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        stop: options.stop,
        stream: false,
        tools: options.tools,
        tool_choice: options.toolChoice,
        user: options.user,
      });
      
      return this.convertResponse(response);
    } catch (error) {
      throw this.handleError(error);
    } finally {
      this.rateLimiter.release();
    }
  }
  
  async *stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk> {
    try {
      await this.rateLimiter.acquire(options.maxTokens || 1000);
      
      const stream = await this.client.chat.completions.create({
        model: options.model || this.config.defaultModel || DEFAULT_MODELS.openai,
        messages: this.convertMessages(options.messages),
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        top_p: options.topP,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        stop: options.stop,
        stream: true,
        tools: options.tools,
        tool_choice: options.toolChoice,
        user: options.user,
      });
      
      for await (const chunk of stream) {
        yield this.convertStreamChunk(chunk);
      }
    } catch (error) {
      throw this.handleError(error);
    } finally {
      this.rateLimiter.release();
    }
  }
  
  async embed(options: AIEmbeddingOptions): Promise<AIEmbeddingResponse> {
    try {
      const response = await this.client.embeddings.create({
        model: options.model || 'text-embedding-3-small',
        input: options.input,
        dimensions: options.dimensions,
        user: options.user,
      });
      
      return {
        object: response.object,
        data: response.data,
        model: response.model,
        usage: {
          promptTokens: response.usage.prompt_tokens,
          totalTokens: response.usage.total_tokens,
        },
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
  
  private convertMessages(messages: AIMessage[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map(msg => {
      // Handle multi-modal content
      if (Array.isArray(msg.content)) {
        return {
          role: msg.role as any,
          content: msg.content.map(part => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text! };
            } else if (part.type === 'image') {
              return { 
                type: 'image_url', 
                image_url: { 
                  url: part.image!.url,
                  detail: part.image!.detail 
                } 
              };
            }
            return part;
          }) as any,
          name: msg.name,
        };
      }
      
      return {
        role: msg.role as any,
        content: msg.content as string,
        name: msg.name,
        function_call: msg.function_call,
        tool_calls: msg.tool_calls as any,
      };
    });
  }
  
  private convertResponse(response: OpenAI.ChatCompletion): AICompletionResponse {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      choices: response.choices.map(choice => ({
        index: choice.index,
        message: {
          role: choice.message.role,
          content: choice.message.content || '',
          function_call: choice.message.function_call,
          tool_calls: choice.message.tool_calls as any,
        },
        finishReason: choice.finish_reason as any,
        logprobs: choice.logprobs,
      })),
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
    };
  }
  
  private convertStreamChunk(chunk: OpenAI.ChatCompletionChunk): AIStreamChunk {
    return {
      id: chunk.id,
      object: chunk.object,
      created: chunk.created,
      model: chunk.model,
      choices: chunk.choices.map(choice => ({
        index: choice.index,
        delta: {
          role: choice.delta.role,
          content: choice.delta.content,
          function_call: choice.delta.function_call,
          tool_calls: choice.delta.tool_calls as any,
        },
        finishReason: choice.finish_reason,
        logprobs: choice.logprobs,
      })),
    };
  }
  
  private handleError(error: any): AIError {
    if (error instanceof OpenAI.APIError) {
      const retryable = error.status === 429 || error.status >= 500;
      const type = error.status === 429 ? 'rate_limit' : 
                   error.status === 401 ? 'authentication' :
                   error.status >= 500 ? 'server_error' : 'invalid_request';
      
      return this.createError(
        error.message,
        type,
        error.status,
        error,
        retryable
      );
    }
    return this.createError(error.message || 'Unknown error', 'server_error');
  }
}
```

### Schritt 5: Anthropic Provider
Erstelle `packages/ai-adapter/src/providers/anthropic.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { BaseAIProvider } from './base';
import { 
  AICompletionOptions, 
  AICompletionResponse, 
  AIStreamChunk,
  DEFAULT_MODELS,
  AIMessage 
} from '../types';

export class AnthropicProvider extends BaseAIProvider {
  private client: Anthropic;
  
  constructor(config: AIProviderConfig) {
    super(config);
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
      defaultHeaders: config.headers,
    });
  }
  
  async complete(options: AICompletionOptions): Promise<AICompletionResponse> {
    try {
      await this.rateLimiter.acquire(options.maxTokens || 1000);
      
      const systemMessage = options.messages.find(m => m.role === 'system');
      const messages = options.messages.filter(m => m.role !== 'system');
      
      const response = await this.client.messages.create({
        model: options.model || this.config.defaultModel || DEFAULT_MODELS.anthropic,
        messages: this.convertMessages(messages),
        system: systemMessage?.content as string || options.systemPrompt,
        max_tokens: options.maxTokens || 1024, // Required for Anthropic
        temperature: options.temperature,
        top_p: options.topP,
        top_k: options.topK,
        stop_sequences: options.stop,
        stream: false,
        tools: options.tools?.map(t => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters,
        })),
        tool_choice: this.convertToolChoice(options.toolChoice),
      });
      
      return this.convertResponse(response);
    } catch (error) {
      throw this.handleError(error);
    } finally {
      this.rateLimiter.release();
    }
  }
  
  async *stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk> {
    try {
      await this.rateLimiter.acquire(options.maxTokens || 1000);
      
      const systemMessage = options.messages.find(m => m.role === 'system');
      const messages = options.messages.filter(m => m.role !== 'system');
      
      const stream = await this.client.messages.create({
        model: options.model || this.config.defaultModel || DEFAULT_MODELS.anthropic,
        messages: this.convertMessages(messages),
        system: systemMessage?.content as string || options.systemPrompt,
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature,
        top_p: options.topP,
        top_k: options.topK,
        stop_sequences: options.stop,
        stream: true,
        tools: options.tools?.map(t => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters,
        })),
        tool_choice: this.convertToolChoice(options.toolChoice),
      });
      
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield {
            id: `anthropic-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Date.now() / 1000,
            model: options.model || DEFAULT_MODELS.anthropic,
            choices: [{
              index: event.index,
              delta: {
                content: event.delta.text,
              },
              finishReason: null,
            }],
          };
        } else if (event.type === 'message_stop') {
          yield {
            id: `anthropic-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Date.now() / 1000,
            model: options.model || DEFAULT_MODELS.anthropic,
            choices: [{
              index: 0,
              delta: {},
              finishReason: 'stop',
            }],
          };
        }
      }
    } catch (error) {
      throw this.handleError(error);
    } finally {
      this.rateLimiter.release();
    }
  }
  
  async embed(options: AIEmbeddingOptions): Promise<AIEmbeddingResponse> {
    throw new Error('Embeddings not supported by Anthropic. Use OpenAI or another provider.');
  }
  
  private convertMessages(messages: AIMessage[]): Anthropic.MessageParam[] {
    return messages.map(msg => {
      // Handle multi-modal content
      if (Array.isArray(msg.content)) {
        return {
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content.map(part => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text! };
            } else if (part.type === 'image') {
              // Note: Anthropic requires base64 encoded images
              return { 
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg', // You may need to detect this
                  data: part.image!.url.replace(/^data:image\/\w+;base64,/, ''),
                },
              };
            } else if (part.type === 'tool_use') {
              return {
                type: 'tool_use',
                id: part.tool_use!.id,
                name: part.tool_use!.name,
                input: part.tool_use!.input,
              };
            } else if (part.type === 'tool_result') {
              return {
                type: 'tool_result',
                tool_use_id: part.tool_result!.tool_use_id,
                content: JSON.stringify(part.tool_result!.content),
              };
            }
            return part;
          }) as any,
        };
      }
      
      return {
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content as string,
      };
    });
  }
  
  private convertToolChoice(toolChoice: any): any {
    if (!toolChoice) return undefined;
    if (toolChoice === 'auto') return { type: 'auto' };
    if (toolChoice === 'none') return { type: 'none' };
    if (toolChoice === 'required') return { type: 'any' };
    if (toolChoice.type === 'function') {
      return { type: 'tool', name: toolChoice.function.name };
    }
    return undefined;
  }
  
  private convertResponse(response: Anthropic.Message): AICompletionResponse {
    const content = response.content
      .map(block => {
        if (block.type === 'text') return block.text;
        return '';
      })
      .join('');
    
    return {
      id: response.id,
      object: 'chat.completion',
      created: Date.now() / 1000,
      model: response.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finishReason: response.stop_reason as any,
      }],
      usage: response.usage ? {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      } : undefined,
    };
  }
  
  private handleError(error: any): AIError {
    if (error.status) {
      const retryable = error.status === 429 || error.status >= 500;
      const type = error.status === 429 ? 'rate_limit' : 
                   error.status === 401 ? 'authentication' :
                   error.status >= 500 ? 'server_error' : 'invalid_request';
      
      return this.createError(
        error.message,
        type,
        error.status,
        error,
        retryable
      );
    }
    return this.createError(error.message || 'Unknown error', 'server_error');
  }
}
```

### Schritt 6: Google Gemini Provider
Erstelle `packages/ai-adapter/src/providers/google.ts`:

```typescript
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { BaseAIProvider } from './base';
import { 
  AICompletionOptions, 
  AICompletionResponse, 
  AIStreamChunk,
  DEFAULT_MODELS,
  AIMessage 
} from '../types';

export class GoogleProvider extends BaseAIProvider {
  private client: GoogleGenerativeAI;
  
  constructor(config: AIProviderConfig) {
    super(config);
    this.client = new GoogleGenerativeAI(config.apiKey);
  }
  
  async complete(options: AICompletionOptions): Promise<AICompletionResponse> {
    try {
      await this.rateLimiter.acquire(options.maxTokens || 1000);
      
      const model = this.client.getGenerativeModel({ 
        model: options.model || this.config.defaultModel || DEFAULT_MODELS.google 
      });
      
      const chat = model.startChat({
        history: this.convertMessagesToHistory(options.messages),
        generationConfig: {
          temperature: options.temperature,
          topP: options.topP,
          topK: options.topK,
          maxOutputTokens: options.maxTokens,
          stopSequences: options.stop,
        },
      });
      
      const lastMessage = options.messages[options.messages.length - 1];
      const result = await chat.sendMessage(
        typeof lastMessage.content === 'string' 
          ? lastMessage.content 
          : this.contentToString(lastMessage.content)
      );
      
      const response = await result.response;
      return this.convertResponse(response, options.model || DEFAULT_MODELS.google);
    } catch (error) {
      throw this.handleError(error);
    } finally {
      this.rateLimiter.release();
    }
  }
  
  async *stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk> {
    try {
      await this.rateLimiter.acquire(options.maxTokens || 1000);
      
      const model = this.client.getGenerativeModel({ 
        model: options.model || this.config.defaultModel || DEFAULT_MODELS.google 
      });
      
      const chat = model.startChat({
        history: this.convertMessagesToHistory(options.messages.slice(0, -1)),
        generationConfig: {
          temperature: options.temperature,
          topP: options.topP,
          topK: options.topK,
          maxOutputTokens: options.maxTokens,
          stopSequences: options.stop,
        },
      });
      
      const lastMessage = options.messages[options.messages.length - 1];
      const result = await chat.sendMessageStream(
        typeof lastMessage.content === 'string' 
          ? lastMessage.content 
          : this.contentToString(lastMessage.content)
      );
      
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          yield {
            id: `gemini-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Date.now() / 1000,
            model: options.model || DEFAULT_MODELS.google,
            choices: [{
              index: 0,
              delta: {
                content: text,
              },
              finishReason: null,
            }],
          };
        }
      }
      
      // Send final chunk with finish reason
      yield {
        id: `gemini-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Date.now() / 1000,
        model: options.model || DEFAULT_MODELS.google,
        choices: [{
          index: 0,
          delta: {},
          finishReason: 'stop',
        }],
      };
    } catch (error) {
      throw this.handleError(error);
    } finally {
      this.rateLimiter.release();
    }
  }
  
  async embed(options: AIEmbeddingOptions): Promise<AIEmbeddingResponse> {
    try {
      const model = this.client.getGenerativeModel({ 
        model: 'embedding-001' // Gemini embedding model
      });
      
      const input = Array.isArray(options.input) ? options.input : [options.input];
      const embeddings = await Promise.all(
        input.map(async (text) => {
          const result = await model.embedContent(text);
          return result.embedding;
        })
      );
      
      return {
        object: 'list',
        data: embeddings.map((embedding, index) => ({
          object: 'embedding',
          index,
          embedding: embedding.values,
        })),
        model: 'embedding-001',
        usage: {
          promptTokens: 0, // Gemini doesn't provide token counts for embeddings
          totalTokens: 0,
        },
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
  
  private convertMessagesToHistory(messages: AIMessage[]) {
    return messages.slice(0, -1).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof msg.content === 'string' ? msg.content : this.contentToString(msg.content) }],
    }));
  }
  
  private contentToString(content: AIContent): string {
    if (typeof content === 'string') return content;
    
    return content
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join(' ');
  }
  
  private convertResponse(response: any, model: string): AICompletionResponse {
    const text = response.text();
    
    return {
      id: `gemini-${Date.now()}`,
      object: 'chat.completion',
      created: Date.now() / 1000,
      model: model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: text,
        },
        finishReason: 'stop',
      }],
      usage: response.usageMetadata ? {
        promptTokens: response.usageMetadata.promptTokenCount,
        completionTokens: response.usageMetadata.candidatesTokenCount,
        totalTokens: response.usageMetadata.totalTokenCount,
      } : undefined,
    };
  }
  
  private handleError(error: any): AIError {
    // Gemini specific error handling
    const message = error.message || 'Unknown error';
    const retryable = message.includes('429') || message.includes('500');
    const type = message.includes('429') ? 'rate_limit' : 
                 message.includes('401') ? 'authentication' :
                 message.includes('500') ? 'server_error' : 'invalid_request';
    
    return this.createError(message, type, undefined, error, retryable);
  }
}
```

### Schritt 7: Main AI Adapter
Erstelle `packages/ai-adapter/index.ts`:

```typescript
import { OpenAIProvider } from './src/providers/openai';
import { AnthropicProvider } from './src/providers/anthropic';
import { GoogleProvider } from './src/providers/google';
import { BaseAIProvider } from './src/providers/base';
import { 
  AIProvider, 
  AIProviderConfig, 
  AICompletionOptions, 
  AICompletionResponse,
  AIEmbeddingOptions,
  AIEmbeddingResponse,
  AIStreamChunk,
  AIMessage,
  AIContent,
  DEFAULT_MODELS
} from './src/types';

export * from './src/types';

export class AIAdapter {
  private providers: Map<AIProvider, BaseAIProvider> = new Map();
  private currentProvider: AIProvider;
  private fallbackProviders: AIProvider[] = [];
  
  constructor(configs: AIProviderConfig[]) {
    for (const config of configs) {
      this.addProvider(config);
    }
    
    // Set first provider as default
    if (configs.length > 0) {
      this.currentProvider = configs[0].provider;
      // Rest as fallbacks
      this.fallbackProviders = configs.slice(1).map(c => c.provider);
    } else {
      throw new Error('At least one AI provider must be configured');
    }
  }
  
  private addProvider(config: AIProviderConfig) {
    let provider: BaseAIProvider;
    
    switch (config.provider) {
      case 'openai':
        provider = new OpenAIProvider(config);
        break;
      case 'anthropic':
        provider = new AnthropicProvider(config);
        break;
      case 'google':
        provider = new GoogleProvider(config);
        break;
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
    
    this.providers.set(config.provider, provider);
  }
  
  setProvider(provider: AIProvider) {
    if (!this.providers.has(provider)) {
      throw new Error(`Provider ${provider} not configured`);
    }
    this.currentProvider = provider;
  }
  
  async complete(options: AICompletionOptions): Promise<AICompletionResponse> {
    const providers = [this.currentProvider, ...this.fallbackProviders];
    let lastError: Error | null = null;
    
    for (const providerName of providers) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;
      
      try {
        return await provider.complete(options);
      } catch (error) {
        console.error(`Provider ${providerName} failed:`, error);
        lastError = error as Error;
        
        // If not retryable, don't try fallback
        const aiError = error as AIError;
        if (aiError.retryable === false && aiError.type !== 'rate_limit') {
          throw error;
        }
      }
    }
    
    throw lastError || new Error('All providers failed');
  }
  
  async *stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk> {
    const providers = [this.currentProvider, ...this.fallbackProviders];
    let lastError: Error | null = null;
    
    for (const providerName of providers) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;
      
      try {
        yield* provider.stream(options);
        return;
      } catch (error) {
        console.error(`Provider ${providerName} streaming failed:`, error);
        lastError = error as Error;
        
        const aiError = error as AIError;
        if (aiError.retryable === false && aiError.type !== 'rate_limit') {
          throw error;
        }
      }
    }
    
    throw lastError || new Error('All providers failed to stream');
  }
  
  async embed(options: AIEmbeddingOptions): Promise<AIEmbeddingResponse> {
    // Only OpenAI and Google support embeddings
    const embeddingProviders = ['openai', 'google'] as AIProvider[];
    const availableProviders = embeddingProviders.filter(p => this.providers.has(p));
    
    for (const providerName of availableProviders) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;
      
      try {
        return await provider.embed(options);
      } catch (error) {
        console.error(`Provider ${providerName} embedding failed:`, error);
        if (providerName === availableProviders[availableProviders.length - 1]) {
          throw error;
        }
      }
    }
    
    throw new Error('No embedding providers available');
  }
  
  // Utility functions
  static createMessage(role: AIMessage['role'], content: AIContent): AIMessage {
    return { role, content };
  }
  
  static createTextMessage(role: AIMessage['role'], text: string): AIMessage {
    return { role, content: text };
  }
  
  static createImageMessage(role: AIMessage['role'], text: string, imageUrl: string): AIMessage {
    return { 
      role, 
      content: [
        { type: 'text', text },
        { type: 'image', image: { url: imageUrl, detail: 'auto' } }
      ]
    };
  }
  
  static countTokens(text: string): number {
    // More accurate approximation using different methods
    // GPT-3/4: ~1 token per 4 characters
    // Claude: ~1 token per 3.5 characters  
    // Average approximation
    return Math.ceil(text.length / 3.7);
  }
  
  static truncateMessages(
    messages: AIMessage[],
    maxTokens: number = 4000,
    keepSystemMessage: boolean = true
  ): AIMessage[] {
    let totalTokens = 0;
    const truncated: AIMessage[] = [];
    
    // Keep system message if requested
    if (keepSystemMessage) {
      const systemMessage = messages.find(m => m.role === 'system');
      if (systemMessage) {
        truncated.push(systemMessage);
        const content = typeof systemMessage.content === 'string' 
          ? systemMessage.content 
          : JSON.stringify(systemMessage.content);
        totalTokens += this.countTokens(content);
      }
    }
    
    // Add messages from the end (keep most recent context)
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (keepSystemMessage && message.role === 'system') continue;
      
      const content = typeof message.content === 'string' 
        ? message.content 
        : JSON.stringify(message.content);
      const tokens = this.countTokens(content);
      
      if (totalTokens + tokens > maxTokens) break;
      
      truncated.unshift(message);
      totalTokens += tokens;
    }
    
    return truncated;
  }
}

// Factory function for easy setup
export function createAIAdapter(
  providers?: Array<{ provider: AIProvider; apiKey?: string; model?: string }>
): AIAdapter {
  const configs: AIProviderConfig[] = [];
  
  // If no providers specified, try to auto-configure from env
  if (!providers || providers.length === 0) {
    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      configs.push({
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        defaultModel: DEFAULT_MODELS.openai,
      });
    }
    
    // Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      configs.push({
        provider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        defaultModel: DEFAULT_MODELS.anthropic,
      });
    }
    
    // Google
    if (process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY) {
      configs.push({
        provider: 'google',
        apiKey: process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY!,
        defaultModel: DEFAULT_MODELS.google,
      });
    }
  } else {
    // Configure specified providers
    for (const p of providers) {
      const apiKey = p.apiKey || 
        (p.provider === 'openai' ? process.env.OPENAI_API_KEY : 
         p.provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY :
         p.provider === 'google' ? (process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY) :
         undefined);
      
      if (!apiKey) {
        console.warn(`No API key for provider ${p.provider}, skipping`);
        continue;
      }
      
      configs.push({
        provider: p.provider,
        apiKey,
        defaultModel: p.model || DEFAULT_MODELS[p.provider],
      });
    }
  }
  
  if (configs.length === 0) {
    throw new Error('No AI provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GEMINI_API_KEY');
  }
  
  return new AIAdapter(configs);
}
```

### Schritt 8: Usage Examples
Erstelle `packages/ai-adapter/examples.ts`:

```typescript
import { createAIAdapter, AIAdapter } from './index';

// Simple usage with auto-configuration
async function simpleChat() {
  const ai = createAIAdapter();
  
  const response = await ai.complete({
    messages: [
      AIAdapter.createTextMessage('system', 'You are a helpful assistant.'),
      AIAdapter.createTextMessage('user', 'What is the capital of France?'),
    ],
    temperature: 0.7,
    maxTokens: 100,
  });
  
  console.log(response.choices[0].message.content);
}

// Streaming usage
async function streamChat() {
  const ai = createAIAdapter();
  
  const stream = ai.stream({
    messages: [
      AIAdapter.createTextMessage('user', 'Write a short story about a robot'),
    ],
    maxTokens: 500,
  });
  
  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0].delta.content || '');
  }
}

// Multi-modal with images
async function multiModalChat() {
  const ai = createAIAdapter([{ provider: 'openai' }]);
  
  const response = await ai.complete({
    messages: [
      AIAdapter.createImageMessage(
        'user',
        'What is in this image?',
        'https://example.com/image.jpg'
      ),
    ],
    maxTokens: 200,
  });
  
  console.log(response.choices[0].message.content);
}

// With specific providers and fallback
async function withFallback() {
  const ai = createAIAdapter([
    { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    { provider: 'openai', model: 'gpt-4o' },
    { provider: 'google', model: 'gemini-1.5-pro' },
  ]);
  
  // Will try Anthropic first, then OpenAI, then Google if previous fail
  const response = await ai.complete({
    messages: [
      AIAdapter.createTextMessage('user', 'Hello! How are you?'),
    ],
    maxTokens: 50,
  });
  
  console.log(response);
}

// Embeddings
async function generateEmbeddings() {
  const ai = createAIAdapter();
  
  const embeddings = await ai.embed({
    input: ['Hello world', 'How are you?', 'AI is fascinating'],
    model: 'text-embedding-3-small',
  });
  
  console.log('Embeddings generated:', embeddings.data.length);
  console.log('First embedding dimension:', embeddings.data[0].embedding.length);
}

// Tool/Function calling
async function functionCalling() {
  const ai = createAIAdapter([{ provider: 'openai' }]);
  
  const response = await ai.complete({
    messages: [
      AIAdapter.createTextMessage('user', 'What is the weather in Paris?'),
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' },
              unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
            },
            required: ['location'],
          },
        },
      },
    ],
    toolChoice: 'auto',
  });
  
  const message = response.choices[0].message;
  if (message.tool_calls) {
    console.log('Function called:', message.tool_calls[0].function);
  }
}

// Token management
async function tokenManagement() {
  const ai = createAIAdapter();
  
  const longMessages = [
    AIAdapter.createTextMessage('system', 'You are a helpful assistant.'),
    AIAdapter.createTextMessage('user', 'Tell me about France...'),
    // ... many more messages
  ];
  
  // Estimate tokens
  const estimatedTokens = longMessages.reduce((sum, msg) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return sum + AIAdapter.countTokens(content);
  }, 0);
  
  console.log('Estimated tokens:', estimatedTokens);
  
  // Truncate if needed
  const truncated = AIAdapter.truncateMessages(longMessages, 3000);
  console.log('Original messages:', longMessages.length);
  console.log('Truncated messages:', truncated.length);
}

// Error handling and retry
async function errorHandling() {
  const ai = createAIAdapter();
  
  try {
    const response = await ai.complete({
      messages: [
        AIAdapter.createTextMessage('user', 'Hello'),
      ],
      maxTokens: 10000, // Very high, might hit limits
    });
    
    console.log('Success:', response);
  } catch (error) {
    if (error.type === 'rate_limit') {
      console.log('Rate limited, waiting before retry...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      // Retry or use different provider
    } else if (error.type === 'authentication') {
      console.error('API key invalid:', error.message);
    } else {
      console.error('Error:', error);
    }
  }
}
```

## Verifizierung

### Test 1: Basic Completion mit verschiedenen Providern
```typescript
const ai = createAIAdapter();
const response = await ai.complete({
  messages: [{ role: 'user', content: 'Hi' }],
});
console.log(response.choices[0].message);
```

### Test 2: Streaming mit Fallback
```typescript
const ai = createAIAdapter([
  { provider: 'anthropic' },
  { provider: 'openai' }
]);
const stream = ai.stream({
  messages: [{ role: 'user', content: 'Count to 5' }],
});
for await (const chunk of stream) {
  console.log(chunk);
}
```

### Test 3: Multi-modal Input
```typescript
const response = await ai.complete({
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Describe this' },
      { type: 'image', image: { url: 'data:image/jpeg;base64,...' } }
    ]
  }],
});
```

### Test 4: Rate Limiting
```typescript
// Should automatically handle rate limits
const promises = Array(10).fill(0).map(() => 
  ai.complete({ messages: [{ role: 'user', content: 'Hi' }] })
);
await Promise.all(promises);
```

## Erfolgskriterien
- [ ] Multiple Provider Support (OpenAI, Anthropic, Google)
- [ ] Verwendung offizieller SDKs
- [ ] Unified API Interface
- [ ] Native Streaming Support
- [ ] Fallback Logic implementiert
- [ ] Error Handling mit provider-spezifischen Errors
- [ ] Rate Limiting implementiert
- [ ] Token Counting Utilities
- [ ] Message Truncation
- [ ] Multi-modal Content Support
- [ ] Tool/Function Calling Support
- [ ] Type Safety mit TypeScript
- [ ] Embeddings Support (OpenAI, Google)

## Potentielle Probleme

### Problem: API Key nicht gesetzt
**Lösung**: Clear error message mit Setup Instructions und Auto-Detection

### Problem: Rate Limiting
**Lösung**: Implementierte RateLimiter Klasse mit Queue

### Problem: Provider-spezifische Features
**Lösung**: Abstraction Layer mit gemeinsamen Features, provider-spezifische Features optional

### Problem: Unterschiedliche Error Formate
**Lösung**: Error Normalisierung in jedem Provider

## Rollback Plan
Falls Probleme: Direkte Nutzung der jeweiligen SDKs ohne Adapter Layer.

## Zeitschätzung
- Dependencies & Types: 20 Minuten
- Base Provider: 15 Minuten  
- OpenAI Provider: 20 Minuten
- Anthropic Provider: 20 Minuten
- Google Provider: 20 Minuten
- Main Adapter: 15 Minuten
- Testing: 20 Minuten
- Total: 130 Minuten