# Arbeitspaket 12: Agentic Workflows Implementation

## Ziel
Implementierung eines leichtgewichtigen, event-driven Workflow-Systems mit LlamaIndex für AI Agents, Tool Calling und Multi-Step Workflows für komplexe automatisierte Aufgaben.

## Problem
- Package ist leer (nur Kommentar)
- Keine Workflow Engine
- Fehlende Agent Abstraktion
- Keine Tool Integration
- Fehlende State Persistence
- Keine Event Handling

## Kontext
- **Package**: `@starter-kit/agentic-workflows`
- **Dependencies**: `@llamaindex/workflow`, `@llamaindex/workflow-core`, AI Adapter
- **Use Cases**: Content Generation, Data Processing, Automation
- **Pattern**: Event-driven mit LlamaIndex Workflow Library

## Implementierung

### Schritt 1: Dependencies installieren
```bash
npm install @llamaindex/workflow @llamaindex/workflow-core @llamaindex/openai
```

### Schritt 2: Core Workflow Types
Erstelle `packages/agentic-workflows/src/types.ts`:

```typescript
// Simple types for our workflow system using LlamaIndex patterns
export interface WorkflowConfig {
  maxRetries?: number;
  timeout?: number;
  temperature?: number;
}

export interface WorkflowError {
  code: string;
  message: string;
  retryable?: boolean;
  details?: any;
}

export interface WorkflowResult<T = any> {
  success: boolean;
  data?: T;
  error?: WorkflowError;
  metadata?: Record<string, any>;
}

// Agent types
export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  model?: string;
  systemPrompt?: string;
}

// Tool types
export interface ToolConfig {
  id: string;
  name: string;
  description?: string;
  execute: (input: any) => Promise<any>;
}
```

### Schritt 3: Base Workflow mit LlamaIndex
Erstelle `packages/agentic-workflows/src/base-workflow.ts`:

```typescript
import { createWorkflow, workflowEvent } from "@llamaindex/workflow";
import { createStatefulMiddleware } from "@llamaindex/workflow-core";
import { WorkflowConfig, WorkflowResult, WorkflowError } from "./types";

// Define common workflow events
export const startEvent = workflowEvent<{ input: any; config?: WorkflowConfig }>();
export const processEvent = workflowEvent<{ data: any; step: string }>();
export const errorEvent = workflowEvent<{ error: WorkflowError; step?: string }>();
export const completeEvent = workflowEvent<{ result: any; metadata?: Record<string, any> }>();

// Create base workflow factory
export function createBaseWorkflow(initialState: any = {}) {
  const { withState, getContext } = createStatefulMiddleware(() => ({
    retries: 0,
    maxRetries: 3,
    ...initialState
  }));
  
  const workflow = withState(createWorkflow());
  
  // Add basic error handling
  workflow.handle([errorEvent], async (context, event) => {
    const state = context.state;
    state.retries++;
    
    if (state.retries < state.maxRetries && event.data.error.retryable) {
      // Retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, state.retries) * 1000));
      return startEvent.with({ input: context.state.lastInput, config: context.state.config });
    }
    
    return completeEvent.with({ 
      result: { 
        success: false, 
        error: event.data.error 
      } 
    });
  });
  
  return { workflow, getContext };
}
```

### Schritt 4: AI Adapter Bridge für LlamaIndex
Erstelle `packages/agentic-workflows/src/llm-bridge.ts`:

```typescript
import { BaseLLM, type LLMMetadata, type ChatMessage } from "@llamaindex/core";
import { AIAdapter } from "@starter-kit/ai-adapter";

/**
 * Bridge zwischen unserem AI Adapter und LlamaIndex
 * Vermeidet doppelte Provider-Implementierungen
 */
export class AIAdapterLLM extends BaseLLM {
  private adapter: AIAdapter;
  
  metadata: LLMMetadata = {
    model: "custom",
    temperature: 0.7,
    topP: 1,
    maxTokens: undefined,
    contextWindow: 128000,
    tokenizer: undefined,
  };
  
  constructor(provider: 'openai' | 'anthropic' | 'google') {
    super();
    this.adapter = new AIAdapter({ provider });
  }

  async chat(params: any): Promise<any> {
    if (params.stream) {
      return this.streamChat(params);
    }
    
    const response = await this.adapter.complete({
      messages: params.messages,
      stream: false,
      temperature: params.temperature,
    });
    
    return {
      message: {
        content: response.content,
        role: 'assistant',
      },
      raw: response.raw,
    };
  }

  private async *streamChat(params: any) {
    const stream = await this.adapter.complete({
      messages: params.messages,
      stream: true,
      temperature: params.temperature,
    });
    
    for await (const chunk of stream) {
      yield {
        delta: chunk.delta,
        raw: chunk.raw,
      };
    }
  }
}
```

### Schritt 5: Content Generator Workflow mit AI Adapter
Erstelle `packages/agentic-workflows/src/workflows/content-generator.ts`:

```typescript
import { createWorkflow, workflowEvent } from "@llamaindex/workflow";
import { createStatefulMiddleware } from "@llamaindex/workflow-core";
import { AIAdapterLLM } from "../llm-bridge"; // Nutzt unseren Adapter!

// Define workflow events
const generateContentEvent = workflowEvent<{
  topic: string;
  style?: string;
  length?: string;
}>();

const reviewContentEvent = workflowEvent<{
  content: string;
  metadata: any;
}>();

const finalContentEvent = workflowEvent<{
  content: string;
  metadata: any;
  approved: boolean;
}>();

export function createContentWorkflow() {
  const { withState } = createStatefulMiddleware(() => ({
    iterations: 0,
    maxIterations: 3,
  }));
  
  const workflow = withState(createWorkflow());
  const llm = openai({ model: "gpt-4o-mini" });
  
  // Handle content generation
  workflow.handle([generateContentEvent], async (context, event) => {
    const { topic, style = "informative", length = "medium" } = event.data;
    
    const prompt = `Write a ${length} ${style} article about: ${topic}. 
    Make it engaging and well-structured.`;
    
    const response = await llm.complete({ prompt });
    
    return reviewContentEvent.with({
      content: response.text,
      metadata: {
        topic,
        style,
        length,
        generatedAt: new Date(),
      },
    });
  });
  
  // Handle content review
  workflow.handle([reviewContentEvent], async (context, event) => {
    const state = context.state;
    
    // Simple auto-review with AI
    const reviewPrompt = `Review this content and rate it (1-10): 
    ${event.data.content}
    
    If the score is below 7, respond with "NEEDS_IMPROVEMENT" and suggestions.`;
    
    const review = await llm.complete({ prompt: reviewPrompt });
    
    if (review.text.includes("NEEDS_IMPROVEMENT") && state.iterations < state.maxIterations) {
      state.iterations++;
      
      // Generate improved content
      const improvePrompt = `Improve this content based on feedback: 
      ${event.data.content}
      
      Feedback: ${review.text}`;
      
      const improved = await llm.complete({ prompt: improvePrompt });
      
      return reviewContentEvent.with({
        content: improved.text,
        metadata: event.data.metadata,
      });
    }
    
    return finalContentEvent.with({
      content: event.data.content,
      metadata: event.data.metadata,
      approved: true,
    });
  });
  
  return { workflow, generateContentEvent, finalContentEvent };
```

### Schritt 5: Tool Integration mit Workflows
Erstelle `packages/agentic-workflows/src/workflows/tool-workflow.ts`:

```typescript
import { createWorkflow, workflowEvent } from "@llamaindex/workflow";
import { createStatefulMiddleware } from "@llamaindex/workflow-core";
import { ToolConfig } from "../types";

// Define tool execution events
const executeToolEvent = workflowEvent<{
  toolName: string;
  input: any;
}>();

const toolResultEvent = workflowEvent<{
  result: any;
  error?: any;
}>();

export function createToolWorkflow(tools: Map<string, ToolConfig>) {
  const { withState } = createStatefulMiddleware(() => ({
    executionHistory: [],
  }));
  
  const workflow = withState(createWorkflow());
  
  // Handle tool execution
  workflow.handle([executeToolEvent], async (context, event) => {
    const { toolName, input } = event.data;
    const tool = tools.get(toolName);
    
    if (!tool) {
      return toolResultEvent.with({
        result: null,
        error: `Tool ${toolName} not found`,
      });
    }
    
    try {
      const result = await tool.execute(input);
      
      // Store in history
      context.state.executionHistory.push({
        tool: toolName,
        input,
        result,
        timestamp: new Date(),
      });
      
      return toolResultEvent.with({ result });
    } catch (error) {
      return toolResultEvent.with({
        result: null,
        error: error.message,
      });
    }
  });
  
  return { workflow, executeToolEvent, toolResultEvent };
}

// Example tools
export const defaultTools = new Map<string, ToolConfig>([
  ["database", {
    id: "database",
    name: "Database Operations",
    description: "Perform database operations",
    execute: async (input: any) => {
      // Simplified database operations
      const { operation, data } = input;
      return { operation, success: true, data };
    },
  }],
  ["http", {
    id: "http",
    name: "HTTP Client",
    description: "Make HTTP requests",
    execute: async (input: any) => {
      const { url, method = "GET", body } = input;
      const response = await fetch(url, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: { "Content-Type": "application/json" },
      });
      return response.json();
    },
  }],
]);
```

### Schritt 6: Main Workflow Orchestrator
Erstelle `packages/agentic-workflows/src/index.ts`:

```typescript
export { createBaseWorkflow, startEvent, processEvent, errorEvent, completeEvent } from './base-workflow';
export { createContentWorkflow } from './workflows/content-generator';
export { createToolWorkflow, defaultTools } from './workflows/tool-workflow';
export * from './types';

// Example: Complex multi-step workflow
import { createWorkflow, workflowEvent } from "@llamaindex/workflow";
import { createStatefulMiddleware } from "@llamaindex/workflow-core";
import { openai } from "@llamaindex/openai";

// Define events for a blog post workflow
const createPostEvent = workflowEvent<{ topic: string; keywords: string[] }>();
const researchEvent = workflowEvent<{ topic: string; sources: string[] }>();
const writeEvent = workflowEvent<{ research: string; outline: string }>();
const reviewEvent = workflowEvent<{ draft: string }>();
const publishEvent = workflowEvent<{ finalPost: string; metadata: any }>();

export function createBlogWorkflow() {
  const { withState } = createStatefulMiddleware(() => ({
    postData: {},
    status: 'draft'
  }));
  
  const workflow = withState(createWorkflow());
  const llm = openai({ model: "gpt-4o-mini" });
  
  // Research phase
  workflow.handle([createPostEvent], async (context, event) => {
    const { topic, keywords } = event.data;
    context.state.postData = { topic, keywords };
    
    // Simulate research (in real app, would call search APIs)
    const sources = keywords.map(k => `https://example.com/${k}`);
    
    return researchEvent.with({ topic, sources });
  });
  
  // Writing phase
  workflow.handle([researchEvent], async (context, event) => {
    const { topic, sources } = event.data;
    
    const outlinePrompt = `Create an outline for a blog post about ${topic}.
    Research sources: ${sources.join(', ')}`;
    
    const outline = await llm.complete({ prompt: outlinePrompt });
    
    return writeEvent.with({ 
      research: sources.join('\n'), 
      outline: outline.text 
    });
  });
  
  // Draft creation
  workflow.handle([writeEvent], async (context, event) => {
    const { research, outline } = event.data;
    
    const draftPrompt = `Write a blog post based on this outline:
    ${outline}
    
    Include insights from: ${research}`;
    
    const draft = await llm.complete({ prompt: draftPrompt });
    
    return reviewEvent.with({ draft: draft.text });
  });
  
  // Review and finalize
  workflow.handle([reviewEvent], async (context, event) => {
    const { draft } = event.data;
    
    const reviewPrompt = `Review and improve this blog post:
    ${draft}
    
    Make it more engaging and SEO-friendly.`;
    
    const finalPost = await llm.complete({ prompt: reviewPrompt });
    
    context.state.status = 'published';
    
    return publishEvent.with({
      finalPost: finalPost.text,
      metadata: {
        ...context.state.postData,
        publishedAt: new Date(),
        status: 'published'
      }
    });
  });
  
  return { workflow, createPostEvent, publishEvent };
```

## Verifizierung

### Test 1: Simple Content Generation
```typescript
import { createContentWorkflow } from '@starter-kit/agentic-workflows';

const { workflow, generateContentEvent, finalContentEvent } = createContentWorkflow();
const { stream, sendEvent } = workflow.createContext();

// Start workflow
sendEvent(generateContentEvent.with({
  topic: "AI in 2024",
  style: "informative",
  length: "medium"
}));

// Process events
for await (const event of stream) {
  if (finalContentEvent.include(event)) {
    console.log("Generated content:", event.data);
    break;
  }
}
```

### Test 2: Tool Execution
```typescript
import { createToolWorkflow, defaultTools } from '@starter-kit/agentic-workflows';

const { workflow, executeToolEvent, toolResultEvent } = createToolWorkflow(defaultTools);
const { stream, sendEvent } = workflow.createContext();

sendEvent(executeToolEvent.with({
  toolName: "http",
  input: { url: "https://api.example.com/data", method: "GET" }
}));

const events = await stream.until(toolResultEvent).toArray();
console.log("Tool result:", events[events.length - 1].data);
```

### Test 3: Complex Blog Workflow
```typescript
import { createBlogWorkflow } from '@starter-kit/agentic-workflows';

const { workflow, createPostEvent, publishEvent } = createBlogWorkflow();
const { stream, sendEvent } = workflow.createContext();

sendEvent(createPostEvent.with({
  topic: "Machine Learning Best Practices",
  keywords: ["ML", "AI", "best-practices", "2024"]
}));

for await (const event of stream) {
  console.log("Workflow step:", event);
  
  if (publishEvent.include(event)) {
    console.log("Blog post published:", event.data.metadata);
    break;
  }
}
```

## Erfolgskriterien
- [ ] LlamaIndex Workflow Package installiert
- [ ] Event-driven Pattern mit `workflowEvent` implementiert
- [ ] State Management mit `createStatefulMiddleware`
- [ ] Content Generation Workflow funktioniert
- [ ] Tool Integration implementiert
- [ ] Error Handling mit Retry Logic
- [ ] Complex Blog Workflow als Beispiel
- [ ] Stream-basierte Event Verarbeitung
- [ ] Tests für alle Workflows

## Potentielle Probleme

### Problem: Async Event Streams
**Lösung**: Nutze LlamaIndex Stream Utilities (`until`, `toArray`)

### Problem: State zwischen Events
**Lösung**: Verwende `createStatefulMiddleware` für shared state

### Problem: Error Recovery
**Lösung**: Implementiere error event handler mit retry logic

## Rollback Plan
Bei Problemen: Nutze nur simple single-step workflows ohne state.

## Zeitschätzung
- Dependencies & Types: 10 Minuten
- Base Workflow: 15 Minuten
- Content Workflow: 15 Minuten
- Tool Integration: 15 Minuten
- Blog Workflow Example: 10 Minuten
- Testing: 15 Minuten
- Total: 80 Minuten (50 Minuten weniger als ursprünglich!)