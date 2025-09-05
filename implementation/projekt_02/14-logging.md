# Arbeitspaket 14: Logging & Monitoring Setup

## Ziel  
Implementierung eines strukturierten Logging Systems mit Pino, Error Tracking mit Sentry für Next.js 15, Performance Monitoring mit prom-client und Health Checks für Production-Readiness.

## Problem
- Nur console.log verwendet
- Keine strukturierten Logs
- Fehlende Log Levels
- Keine Log Rotation
- Fehlende Monitoring Integration
- Keine Performance Metrics

## Kontext
- **Logging Library**: Pino (Performance-optimiert)
- **Error Tracking**: Sentry mit Next.js 15 Integration
- **APM**: OpenTelemetry (optional)
- **Metrics**: Prometheus Format mit prom-client
- **Log Storage**: Structured stdout + External Services

## Implementierung

### Schritt 1: Logger Setup
Erstelle `packages/api/src/logger/index.ts`:

```typescript
import pino from 'pino';

// Logger configuration
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

// Create base logger - transport only in development
const pinoConfig: pino.LoggerOptions = {
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
    bindings: (bindings) => {
      return {
        pid: bindings.pid,
        host: bindings.hostname,
        node: process.version,
        app: 'app-starter-kit',
        env: process.env.NODE_ENV || 'development',
      };
    },
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.apiKey',
      '*.secret',
      '*.email',
      '*.creditCard',
    ],
    censor: '[REDACTED]',
  },
};

// Only use pino-pretty in development, not in production
export const baseLogger = isDevelopment
  ? pino(
      pinoConfig,
      pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'SYS:HH:MM:ss.l',
        },
      })
    )
  : pino(pinoConfig);

// Create child loggers for different modules
export const logger = {
  api: baseLogger.child({ module: 'api' }),
  db: baseLogger.child({ module: 'database' }),
  auth: baseLogger.child({ module: 'auth' }),
  workflow: baseLogger.child({ module: 'workflow' }),
  ai: baseLogger.child({ module: 'ai' }),
};

// Helper functions
export function createLogger(module: string) {
  return baseLogger.child({ module });
}

// Request logger middleware
export function requestLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    
    // Attach logger to request
    req.log = baseLogger.child({ requestId });
    
    // Log request
    req.log.info(
      {
        method: req.method,
        url: req.url,
        query: req.query,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
      'Request received'
    );
    
    // Log response
    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 400 ? 'error' : 'info';
      
      req.log[level](
        {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
        },
        'Request completed'
      );
    });
    
    next();
  };
}

// Performance-aware logging with sampling
const performanceConfig = {
  enabled: process.env.NODE_ENV === 'production',
  sampleRate: 0.1, // 10% sampling in production
  slowThreshold: 1000, // Log all operations over 1s
  buffer: {
    enabled: true,
    size: 100,
    flushInterval: 5000,
  },
};

const perfBuffer: any[] = [];
let flushTimer: NodeJS.Timeout;

export function logPerformance(
  operation: string,
  startTime: number,
  metadata?: any
) {
  const duration = Date.now() - startTime;
  
  // Always log slow operations
  if (duration > performanceConfig.slowThreshold) {
    baseLogger.warn(
      { operation, duration, ...metadata },
      `Slow operation: ${operation} took ${duration}ms`
    );
    return;
  }
  
  // Sample fast operations in production
  if (performanceConfig.enabled && Math.random() > performanceConfig.sampleRate) {
    return; // Skip this log (sampling)
  }
  
  const logEntry = {
    operation,
    duration,
    timestamp: Date.now(),
    ...metadata,
  };
  
  // Buffer logs in production
  if (performanceConfig.buffer.enabled && process.env.NODE_ENV === 'production') {
    perfBuffer.push(logEntry);
    
    if (perfBuffer.length >= performanceConfig.buffer.size) {
      flushPerformanceLogs();
    }
    
    // Setup flush timer if not exists
    if (!flushTimer) {
      flushTimer = setInterval(flushPerformanceLogs, performanceConfig.buffer.flushInterval);
    }
  } else {
    // Direct logging in development
    baseLogger.debug(logEntry, `Operation ${operation} took ${duration}ms`);
  }
}

function flushPerformanceLogs() {
  if (perfBuffer.length === 0) return;
  
  // Batch log all buffered entries
  baseLogger.info(
    { 
      type: 'PERFORMANCE_BATCH',
      count: perfBuffer.length,
      entries: perfBuffer 
    },
    `Flushing ${perfBuffer.length} performance logs`
  );
  
  // Clear buffer
  perfBuffer.length = 0;
}

// Audit logging
export function auditLog(
  action: string,
  userId: string,
  metadata?: any
) {
  baseLogger.info(
    {
      type: 'AUDIT',
      action,
      userId,
      timestamp: new Date().toISOString(),
      ...metadata,
    },
    `Audit: ${action} by ${userId}`
  );
}

// Error logging with context
export function logError(
  error: Error,
  context?: any
) {
  baseLogger.error(
    {
      err: error,
      context,
      stack: error.stack,
    },
    error.message
  );
}
```

### Schritt 2: Sentry Integration für Next.js 15

#### 2.1 Client-Side Sentry
Erstelle `apps/web/instrumentation.client.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  
  // Enable default PII handling
  sendDefaultPii: true,
  
  integrations: [
    // Browser Tracing for performance monitoring
    Sentry.browserTracingIntegration(),
    
    // Session Replay
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
    
    // User Feedback Widget
    Sentry.feedbackIntegration({
      colorScheme: 'system',
      showBranding: false,
    }),
  ],
  
  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Session Replay sampling
  replaysSessionSampleRate: 0.1, // 10% of sessions
  replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
  
  // Release tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION,
  
  // Filtering
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
    'Network request failed',
    'Load failed',
    'ChunkLoadError',
  ],
  
  beforeSend(event, hint) {
    // Filter out non-critical errors in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Sentry Event:', event);
      return null;
    }
    
    return event;
  },
});

#### 2.2 Server-Side Sentry
Erstelle `apps/web/sentry.server.config.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  
  // Enable default PII handling
  sendDefaultPii: true,
  
  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Enable profiling for performance monitoring
  profilesSampleRate: 1.0,
  
  // Release tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION,
  
  // Disable in development
  enabled: process.env.NODE_ENV === 'production',
});
```

#### 2.3 Sentry Helper Utils
Erstelle `apps/web/src/lib/monitoring/sentry-utils.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';

export function captureError(
  error: Error,
  context?: any,
  level: Sentry.SeverityLevel = 'error'
) {
  Sentry.withScope((scope) => {
    scope.setLevel(level);
    
    if (context) {
      scope.setContext('additional', context);
    }
    
    Sentry.captureException(error);
  });
}

export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: any
) {
  Sentry.withScope((scope) => {
    scope.setLevel(level);
    
    if (context) {
      scope.setContext('additional', context);
    }
    
    Sentry.captureMessage(message);
  });
}

export function setUser(user: { id: string; email?: string; username?: string }) {
  Sentry.setUser(user);
}

export function addBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
  Sentry.addBreadcrumb(breadcrumb);
}

export function startTransaction(name: string, op: string) {
  return Sentry.startSpan({ name, op }, () => {
    // Transaction logic here
  });
}
```

#### 2.4 Next.js Config für Sentry
Update `next.config.js`:

```javascript
const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  // ... existing config
};

module.exports = withSentryConfig(
  nextConfig,
  {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
  },
  {
    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,
    
    // Hides source maps from generated client bundles
    hideSourceMaps: true,
  }
);
```

### Schritt 3: Metrics Collection mit prom-client
Erstelle `packages/api/src/metrics/index.ts`:

```typescript
import * as client from 'prom-client';

// Create custom registry
export const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ 
  register,
  prefix: 'app_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// Set default labels for all metrics
register.setDefaultLabels({
  app: 'app-starter-kit',
  env: process.env.NODE_ENV || 'development',
});

// HTTP metrics
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register], // Explicitly register with our registry
});

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Database metrics
export const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const dbConnectionsActive = new client.Gauge({
  name: 'db_connections_active',
  help: 'Number of active database connections',
  registers: [register],
});

// Business metrics
export const userRegistrations = new client.Counter({
  name: 'user_registrations_total',
  help: 'Total number of user registrations',
  registers: [register],
});

export const postsCreated = new client.Counter({
  name: 'posts_created_total',
  help: 'Total number of posts created',
  registers: [register],
});

// AI metrics
export const aiRequestsTotal = new client.Counter({
  name: 'ai_requests_total',
  help: 'Total number of AI requests',
  labelNames: ['provider', 'model', 'status'],
  registers: [register],
});

export const aiTokensUsed = new client.Counter({
  name: 'ai_tokens_used_total',
  help: 'Total number of AI tokens used',
  labelNames: ['provider', 'model', 'type'],
  registers: [register],
});

export const aiRequestDuration = new client.Histogram({
  name: 'ai_request_duration_seconds',
  help: 'Duration of AI requests in seconds',
  labelNames: ['provider', 'model'],
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// Middleware for collecting HTTP metrics
export function metricsMiddleware() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.url;
      
      httpRequestDuration.observe(
        {
          method: req.method,
          route,
          status_code: res.statusCode,
        },
        duration
      );
      
      httpRequestsTotal.inc({
        method: req.method,
        route,
        status_code: res.statusCode,
      });
    });
    
    next();
  };
}

// Export metrics as Prometheus format
export async function getMetrics(): Promise<string> {
  return register.metrics();
}
```

### Schritt 4: Health Check System
Erstelle `apps/web/src/app/api/health/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { db } from '@starter-kit/db';
import { logger } from '@starter-kit/api/logger';
import { getMetrics } from '@starter-kit/api/metrics';

interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  responseTime?: number;
}

async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    await db.$queryRaw`SELECT 1`;
    return {
      service: 'database',
      status: 'healthy',
      responseTime: Date.now() - start,
    };
  } catch (error) {
    logger.api.error({ error }, 'Database health check failed');
    return {
      service: 'database',
      status: 'unhealthy',
      message: error.message,
      responseTime: Date.now() - start,
    };
  }
}

async function checkRedis(): Promise<HealthCheckResult> {
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    return {
      service: 'redis',
      status: 'healthy',
      message: 'Not configured',
    };
  }
  
  const start = Date.now();
  
  try {
    const response = await fetch(process.env.UPSTASH_REDIS_REST_URL + '/ping', {
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      },
    });
    
    if (response.ok) {
      return {
        service: 'redis',
        status: 'healthy',
        responseTime: Date.now() - start,
      };
    }
    
    return {
      service: 'redis',
      status: 'degraded',
      message: `Status: ${response.status}`,
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      service: 'redis',
      status: 'unhealthy',
      message: error.message,
      responseTime: Date.now() - start,
    };
  }
}

async function checkAuth(): Promise<HealthCheckResult> {
  // Check Clerk is configured
  if (!process.env.CLERK_SECRET_KEY) {
    return {
      service: 'auth',
      status: 'unhealthy',
      message: 'Clerk not configured',
    };
  }
  
  return {
    service: 'auth',
    status: 'healthy',
  };
}

export async function GET(request: Request) {
  const start = Date.now();
  
  // Run health checks in parallel
  const checks = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkAuth(),
  ]);
  
  // Determine overall status
  const hasUnhealthy = checks.some(c => c.status === 'unhealthy');
  const hasDegraded = checks.some(c => c.status === 'degraded');
  
  const overallStatus = hasUnhealthy
    ? 'unhealthy'
    : hasDegraded
    ? 'degraded'
    : 'healthy';
  
  const statusCode = overallStatus === 'healthy' ? 200 : 503;
  
  const response = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    duration: Date.now() - start,
    checks,
    version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  };
  
  // Log health check result
  if (overallStatus !== 'healthy') {
    logger.api.warn(response, 'Health check failed');
  }
  
  return NextResponse.json(response, { status: statusCode });
}
```

### Schritt 5: Metrics Endpoint
Erstelle `apps/web/src/app/api/metrics/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getMetrics } from '@starter-kit/api/metrics';

export async function GET(request: NextRequest) {
  // Check authorization (basic auth or API key)
  const authHeader = request.headers.get('authorization');
  
  if (process.env.METRICS_AUTH_TOKEN) {
    if (authHeader !== `Bearer ${process.env.METRICS_AUTH_TOKEN}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
  }
  
  try {
    const metrics = await getMetrics();
    
    return new NextResponse(metrics, {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4',
      },
    });
  } catch (error) {
    console.error('Failed to get metrics:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
```

### Schritt 6: Structured Logging in Prisma (v5+)
Update `packages/db/index.ts`:

```typescript
import { PrismaClient } from './generated/prisma';
import { logger } from '@starter-kit/api/logger';
import { dbQueryDuration, dbConnectionsActive } from '@starter-kit/api/metrics';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Track active connections
let connectionCount = 0;

// Create PrismaClient with modern v5+ extensions
const createPrismaClient = () => {
  const prisma = new PrismaClient({
    log: [
      { level: 'query', emit: 'stdout' },
      { level: 'error', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
      { level: 'info', emit: 'stdout' },
    ],
  });

  // Use $extends for logging and metrics (Prisma v5+ pattern)
  return prisma.$extends({
    query: {
      $allOperations({ operation, model, args, query }) {
        const start = Date.now();
        
        // Track connection
        connectionCount++;
        dbConnectionsActive.set(connectionCount);
        
        return query(args).then((result) => {
          const duration = Date.now() - start;
          
          // Log the query
          logger.db.debug({
            operation,
            model,
            duration,
            args: process.env.NODE_ENV === 'development' ? args : undefined,
          }, `${model}.${operation} completed in ${duration}ms`);
          
          // Record metrics
          dbQueryDuration.observe(
            {
              operation: operation.toLowerCase(),
              table: model || 'unknown',
            },
            duration / 1000 // Convert to seconds
          );
          
          return result;
        }).catch((error) => {
          const duration = Date.now() - start;
          
          // Log the error
          logger.db.error({
            operation,
            model,
            duration,
            error: error.message,
            code: error.code,
          }, `${model}.${operation} failed after ${duration}ms`);
          
          throw error;
        }).finally(() => {
          // Update connection count
          connectionCount--;
          dbConnectionsActive.set(connectionCount);
        });
      },
    },
  });
};

// Create the extended client
export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await db.$disconnect();
});
```

### Schritt 7: OpenTelemetry Setup (Optional)
Erstelle `apps/web/src/lib/monitoring/telemetry.ts`:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export function initTelemetry() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    console.log('OpenTelemetry endpoint not configured, skipping');
    return;
  }
  
  // Create resource with service information
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'app-starter-kit',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  });
  
  // Configure trace exporter with sampling
  const traceExporter = new OTLPTraceExporter({
    url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS 
      ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
      : {},
  });
  
  // Configure metrics exporter
  const metricExporter = new OTLPMetricExporter({
    url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS 
      ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
      : {},
  });
  
  // Initialize SDK with proper configuration
  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 60000, // Export every minute
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false, // Disable file system instrumentation
        },
        '@opentelemetry/instrumentation-net': {
          enabled: false, // Disable net instrumentation to reduce noise
        },
      }),
    ],
    // Sampling configuration
    sampler: {
      shouldSample: () => {
        // Sample rate based on environment
        const sampleRate = process.env.NODE_ENV === 'production' ? 0.1 : 1.0;
        return { decision: Math.random() < sampleRate };
      },
    },
  });
  
  sdk.start();
  
  console.log('OpenTelemetry initialized with endpoint:', process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
  
  // Graceful shutdown
  ['SIGTERM', 'SIGINT'].forEach(signal => {
    process.on(signal, () => {
      sdk.shutdown()
        .then(() => console.log('OpenTelemetry terminated'))
        .catch((error) => console.error('Error terminating OpenTelemetry', error))
        .finally(() => process.exit(0));
    });
  });
}
```

### Schritt 8: Log Management Strategy
Erstelle `packages/api/src/logger/config.ts`:

```typescript
import pino from 'pino';

/**
 * Modern Log Management Strategy:
 * 
 * Production:
 * - Logs go to stdout/stderr (structured JSON)
 * - Container orchestrator (K8s/Docker) collects logs
 * - Forward to log aggregation service (Datadog, CloudWatch, etc.)
 * 
 * Development:
 * - Pretty printed logs to console
 * - Optional file output for debugging
 */

interface LogConfig {
  level: string;
  pretty: boolean;
  redactPaths: string[];
}

export function getLogConfig(): LogConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    pretty: !isProduction,
    redactPaths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.apiKey',
      '*.secret',
      '*.email',
      '*.creditCard',
      '*.ssn',
    ],
  };
}

// For production environments with external log management
export function createProductionLogger() {
  const config = getLogConfig();
  
  return pino({
    level: config.level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    redact: {
      paths: config.redactPaths,
      censor: '[REDACTED]',
    },
    // Structured JSON output for log aggregation services
    messageKey: 'message',
    errorKey: 'error',
    base: {
      app: 'app-starter-kit',
      env: process.env.NODE_ENV,
      version: process.env.APP_VERSION,
    },
  });
}

// Example integration with external services
export const LOG_DESTINATIONS = {
  // CloudWatch Logs (AWS)
  cloudwatch: {
    region: process.env.AWS_REGION,
    logGroup: '/aws/application/app-starter-kit',
    logStream: process.env.NODE_ENV,
  },
  
  // Datadog
  datadog: {
    apiKey: process.env.DD_API_KEY,
    service: 'app-starter-kit',
    source: 'nodejs',
  },
  
  // Google Cloud Logging
  gcp: {
    projectId: process.env.GCP_PROJECT_ID,
    logName: 'app-starter-kit',
  },
};
```

## Verifizierung

### Test 1: Logger Output
```typescript
import { logger } from '@starter-kit/api/logger';

logger.api.info({ userId: '123' }, 'User logged in');
logger.api.error(new Error('Test error'), 'Operation failed');
// Should show structured logs
```

### Test 2: Health Check
```bash
curl http://localhost:3004/api/health
# Should return health status
```

### Test 3: Metrics
```bash
curl http://localhost:3004/api/metrics
# Should return Prometheus format metrics
```

### Test 4: Sentry Integration
```typescript
throw new Error('Test Sentry error');
// Should appear in Sentry dashboard
```

## Dependencies Installation

```bash
# Logging
npm install pino pino-pretty

# Sentry (für Next.js 15)
npm install @sentry/nextjs

# Metrics
npm install prom-client

# OpenTelemetry (optional)
npm install @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/sdk-trace-node \
  @opentelemetry/sdk-metrics

# Dev dependencies
npm install -D @types/pino
```

## Environment Variables

```env
# Logging
LOG_LEVEL=info

# Sentry
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
SENTRY_ORG=your_org
SENTRY_PROJECT=your_project
NEXT_PUBLIC_APP_VERSION=1.0.0

# Metrics
METRICS_AUTH_TOKEN=your_metrics_token

# OpenTelemetry (optional)
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-otel-endpoint.com
OTEL_EXPORTER_OTLP_HEADERS={"Authorization": "Bearer token"}

# External Log Services (optional)
AWS_REGION=us-east-1
DD_API_KEY=your_datadog_key
GCP_PROJECT_ID=your_gcp_project
```

## Erfolgskriterien
- [ ] Structured Logging mit Pino
- [ ] Log Levels funktionieren
- [ ] Request Logging implementiert
- [ ] Sentry Integration für Next.js 15 aktiv
- [ ] Metrics Collection mit prom-client
- [ ] Health Checks verfügbar
- [ ] Prisma v5+ logging mit $extends
- [ ] Sensitive Data Redaction
- [ ] Performance Metrics tracked
- [ ] OpenTelemetry Setup (optional)

## Potentielle Probleme

### Problem: Log Volume zu hoch
**Lösung**: 
- Adjust log levels per environment
- Implement sampling in production
- Use structured logging filters

### Problem: Sentry Quota exceeded
**Lösung**: 
- Implement sampling (tracesSampleRate: 0.1)
- Filter non-critical errors
- Use replay sampling rates

### Problem: Memory Leak bei Metrics
**Lösung**: 
- Use bounded histograms
- Implement metric reset on intervals
- Monitor registry size

### Problem: Prisma Extension Performance
**Lösung**:
- Only log in development
- Use async logging
- Batch metrics updates

## Rollback Plan
Falls kritische Probleme auftreten:
1. Disable Sentry in production (enabled: false)
2. Zurück zu console.log für Logging
3. Deaktiviere Metrics endpoint
4. Basic health check ohne DB queries

## Zeitschätzung
- Logger Setup: 20 Minuten
- Sentry Integration Next.js 15: 25 Minuten
- Metrics System: 25 Minuten
- Health Checks: 15 Minuten
- Prisma v5 Integration: 20 Minuten
- Testing & Verification: 20 Minuten
- Total: 125 Minuten