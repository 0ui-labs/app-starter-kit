# Arbeitspaket 03: Environment Variable Validation

## Ziel
Implementierung einer robusten Environment Variable Validation mit T3 Env und Zod für Type Safety und Runtime Protection mit Best Practices für Next.js 15.

## Problem
- Keine Validierung von Environment Variables
- Fehlende Umgebungsvariablen führen zu kryptischen Runtime Errors
- Keine Type Safety für process.env
- Client/Server Environment Variables nicht sauber getrennt

## Kontext
- **Framework**: Next.js 15 mit App Router
- **Validation Library**: @t3-oss/env-nextjs + Zod
- **Betroffene Files**: 
  - Neue Datei `apps/web/src/env.ts`
  - Update `next.config.mjs`
- **Environment Files**: `.env`, `.env.local`, `.env.example`

## Implementierung

### Schritt 1: Installation der Dependencies
```bash
npm install @t3-oss/env-nextjs zod jiti
```

### Schritt 2: Zentrale Environment Configuration
Erstelle `apps/web/src/env.ts`:

```typescript
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side Environment Variables
   * These are only available on the server and will never be exposed to the client
   */
  server: {
    // Database
    DATABASE_URL: z
      .string()
      .url()
      .describe("PostgreSQL connection string from Neon or local DB"),
    
    // Clerk Authentication (Server)
    CLERK_SECRET_KEY: z
      .string()
      .min(1)
      .describe("Clerk secret key for server-side authentication"),
    CLERK_WEBHOOK_SECRET: z
      .string()
      .optional()
      .describe("Webhook secret for Clerk events"),
    
    // OpenAI (Optional)
    OPENAI_API_KEY: z
      .string()
      .optional()
      .describe("OpenAI API key for AI features"),
    
    // App Configuration
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().default(3004),
    
    // Monitoring (Optional)
    SENTRY_DSN: z
      .string()
      .url()
      .optional()
      .describe("Sentry DSN for error tracking"),
    SENTRY_AUTH_TOKEN: z
      .string()
      .optional()
      .describe("Sentry auth token for source maps"),
    
    // Rate Limiting (Optional)
    UPSTASH_REDIS_REST_URL: z
      .string()
      .url()
      .optional()
      .describe("Upstash Redis URL for rate limiting"),
    UPSTASH_REDIS_REST_TOKEN: z
      .string()
      .optional()
      .describe("Upstash Redis token"),
  },

  /**
   * Client-side Environment Variables
   * These will be exposed to the browser - must be prefixed with NEXT_PUBLIC_
   */
  client: {
    // Clerk Authentication (Client)
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
      .string()
      .min(1)
      .describe("Clerk publishable key for client-side"),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z
      .string()
      .default("/sign-in"),
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: z
      .string()
      .default("/sign-up"),
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z
      .string()
      .default("/dashboard"),
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: z
      .string()
      .default("/dashboard"),
    
    // App URL
    NEXT_PUBLIC_APP_URL: z
      .string()
      .url()
      .optional()
      .default("http://localhost:3004")
      .describe("Public app URL for meta tags and redirects"),
    
    // Feature Flags (Optional)
    NEXT_PUBLIC_ENABLE_ANALYTICS: z
      .string()
      .transform(s => s === "true")
      .default("false")
      .optional(),
  },

  /**
   * Runtime Environment
   * For Next.js >= 13.4.4, only client variables need to be destructured
   */
  experimental__runtimeEnv: {
    // Client variables must be explicitly listed
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_ENABLE_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS,
  },

  /**
   * Runtime validation for Docker deployments
   */
  runtimeEnv: process.env.VALIDATE_ENV_AT_RUNTIME === 'true' 
    ? process.env 
    : undefined,
    
  /**
   * Skip validation in specific environments (Docker builds, etc.)
   */
  skipValidation: 
    !!process.env.SKIP_ENV_VALIDATION || 
    process.env.DOCKER_BUILD === 'true',
  
  /**
   * Empty string handling - treat empty strings as undefined
   */
  emptyStringAsUndefined: true,
  
  /**
   * Validation error handling for different environments
   */
  onValidationError: (error: unknown) => {
    if (process.env.NODE_ENV === 'production') {
      // Log but don't crash in production (optional)
      console.error('Environment validation failed:', error);
      if (process.env.STRICT_ENV === 'true') {
        throw error;
      }
    } else {
      throw error;
    }
  },
});
```

### Schritt 3: Build-Time Validation Setup
Erstelle oder update `next.config.mjs`:

```javascript
import { fileURLToPath } from "node:url";
import createJiti from "jiti";

// Setup jiti for TypeScript support
const jiti = createJiti(fileURLToPath(import.meta.url));

// Validate environment variables at build time
// This will throw an error if required variables are missing
if (process.env.SKIP_ENV_VALIDATION !== 'true') {
  await jiti.import("./src/env.ts");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // For standalone deployment (Docker, etc.)
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  
  // Required for T3 Env in standalone mode
  transpilePackages: process.env.BUILD_STANDALONE === 'true' 
    ? ["@t3-oss/env-nextjs", "@t3-oss/env-core"] 
    : undefined,
    
  // Other config...
};

export default nextConfig;
```

### Schritt 4: Update .env.example
Update `apps/web/.env.example`:

```env
# ============================================
# Required Environment Variables
# ============================================

# Database (PostgreSQL)
# Get your free database from https://neon.tech
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# Clerk Authentication
# Get your keys from https://clerk.com
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."

# ============================================
# Optional Environment Variables
# ============================================

# Clerk URLs (defaults provided)
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/dashboard"
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL="/dashboard"

# Clerk Webhook Secret (for production)
CLERK_WEBHOOK_SECRET="whsec_..."

# OpenAI API (for AI features)
OPENAI_API_KEY="sk-..."

# Public App URL
NEXT_PUBLIC_APP_URL="http://localhost:3004"

# Application Port
PORT=3004

# Feature Flags
NEXT_PUBLIC_ENABLE_ANALYTICS="false"

# Monitoring (Sentry)
SENTRY_DSN="https://..."
SENTRY_AUTH_TOKEN="..."

# Rate Limiting (Upstash Redis)
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."

# Build Options
# SKIP_ENV_VALIDATION=true  # Skip env validation during build
# BUILD_STANDALONE=true     # Build for Docker/standalone deployment
```

### Schritt 5: Usage Examples

#### Server Component Usage
```typescript
// app/dashboard/page.tsx
import { env } from "~/env";

export default async function DashboardPage() {
  // Type-safe access to server variables
  const data = await fetch(env.DATABASE_URL);
  
  // Optional variables are properly typed
  if (env.OPENAI_API_KEY) {
    // AI features available
  }
  
  return <div>Dashboard</div>;
}
```

#### Client Component Usage
```typescript
// app/components/analytics.tsx
'use client';

import { env } from "~/env";

export function Analytics() {
  // Type-safe access to client variables
  if (env.NEXT_PUBLIC_ENABLE_ANALYTICS) {
    // Initialize analytics
  }
  
  return null;
}
```

#### API Route Usage
```typescript
// app/api/chat/route.ts
import { env } from "~/env";

export async function POST(request: Request) {
  if (!env.OPENAI_API_KEY) {
    return Response.json(
      { error: "AI features not configured" },
      { status: 501 }
    );
  }
  
  // Use the API key...
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    // ...
  });
  
  return Response.json({ success: true });
}
```

#### Middleware Usage
```typescript
// middleware.ts
import { env } from "~/env";
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware({
  publicRoutes: ["/", env.NEXT_PUBLIC_CLERK_SIGN_IN_URL],
  // ...
});
```

## Verifizierung

### Test 1: Missing Required Variables
```bash
# Test mit fehlender DATABASE_URL
cd apps/web
mv .env .env.backup
echo "CLERK_SECRET_KEY=test" > .env
npm run dev
# Expected: Clear error message about missing DATABASE_URL
mv .env.backup .env
```

### Test 2: Invalid URL Format
```bash
# Test mit ungültiger URL
cd apps/web
DATABASE_URL="not-a-valid-url" npm run dev
# Expected: Validation error with clear message
```

### Test 3: Type Safety Verification
```typescript
// Create test file: apps/web/src/test-env-types.ts
import { env } from "~/env";

// These should show TypeScript errors:
// @ts-expect-error - DATABASE_URL is string, not number
const wrongType: number = env.DATABASE_URL;

// @ts-expect-error - Non-existent property
const notExist = env.NON_EXISTENT_VAR;

// These should work:
const dbUrl: string = env.DATABASE_URL;
const optionalApi: string | undefined = env.OPENAI_API_KEY;
```

### Test 4: Client/Server Separation
```typescript
// Test file: apps/web/src/app/test-client.tsx
'use client';
import { env } from "~/env";

export function TestClient() {
  // This should work
  console.log(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  
  // This should fail at runtime
  // console.log(env.DATABASE_URL); // ❌ Server-only variable
  
  return <div>Test</div>;
}
```

### Test 5: Build-Time Validation
```bash
# Test build without env vars
cd apps/web
mv .env .env.backup
npm run build
# Expected: Build fails with clear env validation errors

# Test build with skip flag
SKIP_ENV_VALIDATION=true npm run build
# Expected: Build succeeds (but app won't run properly)

mv .env.backup .env
```

### Test 6: Edge Runtime Compatibility
```typescript
// app/api/edge/route.ts
import { env } from "~/env";

export const runtime = 'edge';

export async function GET() {
  // Should work in edge runtime
  return Response.json({
    hasOpenAI: !!env.OPENAI_API_KEY,
    appUrl: env.NEXT_PUBLIC_APP_URL,
  });
}
```

## Erfolgskriterien
- ✅ Environment Variables werden beim Start validiert
- ✅ Fehlende Required Vars führen zu klarem Error mit Details
- ✅ Type Safety für alle Env Vars (IntelliSense & Autocomplete)
- ✅ Client/Server Env Vars sind sauber getrennt
- ✅ Klare Error Messages mit Links zur Dokumentation
- ✅ .env.example ist vollständig und gut dokumentiert
- ✅ Build-Time Validation verhindert Deployment-Fehler
- ✅ Edge Runtime Support out-of-the-box
- ✅ Standalone/Docker Deployment Support

## Potentielle Probleme & Lösungen

### Problem: CI/CD Pipeline bricht ab
**Lösung**: Nutze `SKIP_ENV_VALIDATION=true` in CI/CD für Build-Step, validiere in separatem Step:
```yaml
# .github/workflows/ci.yml
- name: Build
  run: SKIP_ENV_VALIDATION=true npm run build
  
- name: Validate Env
  run: npm run env:validate  # Custom script
```

### Problem: Docker Build schlägt fehl
**Lösung**: Multi-stage Docker build mit flexibler Validation:
```dockerfile
# Build stage - ohne Environment Variables
FROM node:20-alpine AS builder
ARG DOCKER_BUILD=true
ARG SKIP_ENV_VALIDATION=true
ENV DOCKER_BUILD=$DOCKER_BUILD
ENV SKIP_ENV_VALIDATION=$SKIP_ENV_VALIDATION
RUN npm run build

# Runtime stage - mit Validation
FROM node:20-alpine AS runner
ENV VALIDATE_ENV_AT_RUNTIME=true
ENV STRICT_ENV=false  # Optional: true für strikte Validation
COPY --from=builder /app/.next ./.next
CMD ["npm", "start"]

# Runtime stage
FROM node:20-alpine
# Copy build and validate at runtime
```

### Problem: Vercel Deployment Issues
**Lösung**: Environment Variables in Vercel Dashboard setzen und Build Command anpassen:
```json
{
  "buildCommand": "npm run build",
  "framework": "nextjs",
  "environmentVariables": {
    "NODE_ENV": "production"
  }
}
```

## Rollback Plan
Falls Probleme auftreten:
1. Entferne `src/env.ts`
2. Entferne Import aus `next.config.mjs`
3. Deinstalliere Packages: `npm uninstall @t3-oss/env-nextjs jiti`
4. App läuft weiter ohne Validation (wie vorher)

## Migration von bestehenden Apps
```bash
# Schritt-für-Schritt Migration
1. npm install @t3-oss/env-nextjs zod jiti
2. Erstelle env.ts mit nur den aktuell genutzten Variables
3. Teste lokal mit npm run dev
4. Füge nach und nach weitere Variables hinzu
5. Update CI/CD und Deployment
```

## Zeitschätzung
- Installation & Setup: 10 Minuten
- Implementation env.ts: 15 Minuten
- Build-Time Validation: 10 Minuten
- Testing & Verification: 15 Minuten
- Documentation Update: 5 Minuten
- **Total: 55 Minuten**

## Vorteile der T3 Env Lösung
- 🎯 **Production-Ready**: Bewährt in tausenden Projekten
- 🔒 **Type-Safe**: Vollständige TypeScript Integration
- 🚀 **Performance**: Zero-Runtime-Overhead in Production
- 🛡️ **Secure**: Verhindert versehentliches Leaken von Secrets
- 📦 **Lightweight**: Minimale Dependencies
- 🔧 **Maintainable**: Einfache Updates und Erweiterungen
- 🌐 **Edge-Ready**: Funktioniert in allen Next.js Runtimes