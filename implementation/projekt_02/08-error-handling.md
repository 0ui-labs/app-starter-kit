# Arbeitspaket 06: Global Error Handling Strategy

## Ziel
Implementierung einer umfassenden Error Handling Strategy mit Error Boundaries, konsistentem Logging, User Feedback und strukturierter Fehlerbehandlung über die gesamte Anwendung unter Verwendung der nativen oRPC Error Features.

## Problem
- Keine Error Boundaries für React Components
- Inkonsistente Error Messages zwischen Frontend und Backend
- Fehlendes zentralisiertes Logging System
- Keine standardisierten User Feedback Komponenten
- Unstrukturierte Error Responses in API
- Fehlende Error Recovery Mechanismen

## Kontext
- **Framework**: Next.js 15 App Router
- **Frontend**: React 19 mit Error Boundaries
- **Backend**: oRPC mit nativen Error Handling Features
- **UI Components**: shadcn/ui für Toast Notifications
- **Logging**: Console (Vorbereitung für winston/pino)
- **Error Tracking**: Vorbereitung für Sentry Integration
- **Sprache**: Deutsche Fehlermeldungen für User

## Implementierung

### Schritt 1: oRPC Error Setup mit Type-Safe Errors
Erstelle `packages/api/src/errors/index.ts`:

```typescript
import { os, ORPCError } from '@orpc/server';
import * as z from 'zod';

// Define base error types that will be shared across all procedures
export const baseErrors = {
  // Validation Errors (400)
  VALIDATION_ERROR: {
    message: 'Validierung fehlgeschlagen',
    data: z.object({
      field: z.string().optional(),
      value: z.any().optional(),
      constraints: z.array(z.string()).optional(),
    }),
  },
  INVALID_INPUT: {
    message: 'Ungültige Eingabe',
    data: z.object({
      field: z.string().optional(),
    }),
  },
  
  // Authentication Errors (401)
  UNAUTHORIZED: {
    message: 'Nicht autorisiert',
  },
  TOKEN_EXPIRED: {
    message: 'Token ist abgelaufen',
  },
  
  // Authorization Errors (403)
  FORBIDDEN: {
    message: 'Zugriff verweigert',
  },
  INSUFFICIENT_PERMISSIONS: {
    message: 'Unzureichende Berechtigungen',
  },
  
  // Not Found Errors (404)
  NOT_FOUND: {
    message: 'Ressource nicht gefunden',
  },
  
  // Conflict Errors (409)
  DUPLICATE_RESOURCE: {
    message: 'Ressource existiert bereits',
    data: z.object({
      field: z.string().optional(),
    }),
  },
  
  // Rate Limiting (429)
  RATE_LIMIT_EXCEEDED: {
    message: 'Zu viele Anfragen',
    data: z.object({
      retryAfter: z.number(),
    }),
  },
  
  // Server Errors (500)
  INTERNAL_ERROR: {
    message: 'Ein interner Fehler ist aufgetreten',
  },
  DATABASE_ERROR: {
    message: 'Datenbankfehler',
    data: z.object({
      code: z.string().optional(),
    }),
  },
  EXTERNAL_SERVICE_ERROR: {
    message: 'Externer Service nicht verfügbar',
  },
  
  // Timeout Errors (504)
  TIMEOUT: {
    message: 'Zeitüberschreitung',
  },
};

// Create base router with common errors
export const baseRouter = os.errors(baseErrors);

// Error logger utility
export function logError(error: unknown, context?: any) {
  const errorLog = {
    timestamp: new Date(),
    error: error instanceof ORPCError ? {
      code: error.code,
      message: error.message,
      data: error.data,
    } : String(error),
    context,
    stack: error instanceof Error ? error.stack : undefined,
  };
  
  if (error instanceof ORPCError) {
    const status = error.status || 500;
    if (status >= 500) {
      console.error('🔴 Server Error:', errorLog);
    } else if (status >= 400) {
      console.warn('🟡 Client Error:', errorLog);
    }
  } else {
    console.error('🔴 Unexpected Error:', errorLog);
  }
  
  // Here: Send to monitoring service (Sentry, etc.)
  // if (process.env.SENTRY_DSN) {
  //   Sentry.captureException(error, { extra: errorLog });
  // }
}
```

### Schritt 2: Prisma Error Handler für oRPC
Erstelle `packages/api/src/errors/prisma-handler.ts`:

```typescript
import { Prisma } from '@starter-kit/db';
import { ORPCError } from '@orpc/server';

export function handlePrismaError(error: unknown): never {
  // Prisma Errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        throw new ORPCError('DUPLICATE_RESOURCE', {
          message: 'Ein Eintrag mit diesen Daten existiert bereits',
          data: { field: error.meta?.target as string }
        });
      case 'P2025':
        throw new ORPCError('NOT_FOUND', {
          message: 'Die angeforderte Ressource wurde nicht gefunden'
        });
      case 'P2003':
        throw new ORPCError('VALIDATION_ERROR', {
          message: 'Referenzierte Daten existieren nicht',
          data: { field: error.meta?.field_name as string }
        });
      default:
        throw new ORPCError('DATABASE_ERROR', {
          message: 'Datenbankfehler aufgetreten',
          data: { code: error.code }
        });
    }
  }
  
  if (error instanceof Prisma.PrismaClientValidationError) {
    throw new ORPCError('VALIDATION_ERROR', {
      message: 'Ungültige Datenbankabfrage'
    });
  }
  
  if (error instanceof Prisma.PrismaClientInitializationError) {
    throw new ORPCError('DATABASE_ERROR', {
      message: 'Datenbankverbindung fehlgeschlagen'
    });
  }
  
  // Re-throw if already an ORPCError
  if (error instanceof ORPCError) {
    throw error;
  }
  
  // Generic Error
  throw new ORPCError('INTERNAL_ERROR', {
    message: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten'
  });
}
```

### Schritt 3: Update oRPC Router with Error Handling
Update `packages/api/src/router.ts`:

```typescript
import { baseRouter, logError } from './errors';
import { handlePrismaError } from './errors/prisma-handler';
import { db } from '@starter-kit/db';
import * as z from 'zod';

// Middleware for error logging
const errorLogger = baseRouter.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    logError(error, { procedure: 'unknown' });
    throw error;
  }
});

// Example procedure with error handling
export const appRouter = errorLogger
  .procedure('user.create')
  .input(z.object({
    email: z.string().email(),
    name: z.string(),
  }))
  .errors({
    USER_ALREADY_EXISTS: {
      message: 'Benutzer existiert bereits',
      data: z.object({ email: z.string() }),
    },
  })
  .handler(async ({ input, errors }) => {
    try {
      const user = await db.user.create({
        data: input,
      });
      return user;
    } catch (error) {
      // Check for specific business logic errors
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw errors.USER_ALREADY_EXISTS({
          data: { email: input.email }
        });
      }
      // Handle other Prisma errors
      handlePrismaError(error);
    }
  });
```

### Schritt 4: Global Error Boundary
Erstelle `apps/web/app/global-error.tsx` (im root app directory):

```typescript
'use client';

import { useEffect } from 'react';
import { Button } from '@starter-kit/ui';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Log error to monitoring service
    console.error('Global error caught:', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
    
    // Send to error tracking service
    // if (typeof window !== 'undefined' && window.Sentry) {
    //   window.Sentry.captureException(error);
    // }
  }, [error]);

  return (
    <html lang="de">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
            <div className="text-center">
              {/* Error Icon */}
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              
              {/* Error Content */}
              <h1 className="mt-4 text-2xl font-bold text-gray-900">
                Ein Fehler ist aufgetreten
              </h1>
              <p className="mt-2 text-gray-600">
                Entschuldigung, etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.
              </p>
              
              {/* Error Details (Development only) */}
              {process.env.NODE_ENV === 'development' && (
                <div className="mt-4 text-left bg-gray-100 rounded p-4">
                  <p className="text-xs font-mono text-gray-700 break-all">
                    {error.message}
                  </p>
                  {error.digest && (
                    <p className="mt-2 text-xs text-gray-500">
                      Error ID: {error.digest}
                    </p>
                  )}
                </div>
              )}
              
              {/* Actions */}
              <div className="mt-6 space-y-2">
                <Button onClick={reset} className="w-full">
                  Erneut versuchen
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.location.href = '/'}
                  className="w-full"
                >
                  Zur Startseite
                </Button>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
```

### Schritt 5: Component Error Boundary
Erstelle `apps/web/src/components/error-boundary.tsx`:

```typescript
'use client';

import React from 'react';
import { Button } from '@starter-kit/ui';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
    
    // Use captureOwnerStack only in development (React 19)
    if (process.env.NODE_ENV === 'development' && 'captureOwnerStack' in React) {
      const ownerStack = (React as any).captureOwnerStack?.();
      if (ownerStack) {
        console.log('Owner stack:', ownerStack);
      }
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }

      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Fehler in dieser Komponente
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{this.state.error.message}</p>
              </div>
              <div className="mt-4">
                <Button size="sm" onClick={this.reset}>
                  Komponente neu laden
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### Schritt 6: shadcn/ui Toast Integration
Installiere shadcn/ui Toast Component:

```bash
npx shadcn@latest add toast
```

Erstelle `apps/web/src/hooks/use-error-toast.ts`:

```typescript
'use client';

import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { isDefinedError } from '@orpc/client';

interface ErrorWithCode {
  code?: string;
  message: string;
  data?: any;
}

export function useErrorToast() {
  const { toast } = useToast();

  const showError = (error: unknown) => {
    let title = 'Fehler';
    let description = 'Ein unerwarteter Fehler ist aufgetreten';
    
    if (isDefinedError(error)) {
      // Handle oRPC defined errors
      const errorObj = error as ErrorWithCode;
      
      switch (errorObj.code) {
        case 'VALIDATION_ERROR':
          title = 'Validierungsfehler';
          description = errorObj.message;
          break;
        case 'UNAUTHORIZED':
          title = 'Nicht autorisiert';
          description = 'Bitte melden Sie sich an';
          break;
        case 'RATE_LIMIT_EXCEEDED':
          title = 'Zu viele Anfragen';
          description = `Bitte warten Sie ${errorObj.data?.retryAfter || 60} Sekunden`;
          break;
        case 'NOT_FOUND':
          title = 'Nicht gefunden';
          description = errorObj.message;
          break;
        default:
          description = errorObj.message;
      }
    } else if (error instanceof Error) {
      description = error.message;
    }

    toast({
      variant: 'destructive',
      title,
      description,
    });
  };

  const showSuccess = (message: string) => {
    toast({
      title: 'Erfolg',
      description: message,
    });
  };

  const showInfo = (message: string) => {
    toast({
      title: 'Information',
      description: message,
    });
  };

  return {
    showError,
    showSuccess,
    showInfo,
  };
}
```

### Schritt 7: Client-Side Error Handling with oRPC
Erstelle `apps/web/src/lib/api-client.ts`:

```typescript
import { createClient, createSafeClient } from '@orpc/client';
import type { appRouter } from '@starter-kit/api';

// Standard client
export const client = createClient<typeof appRouter>({
  baseURL: '/api',
  // Add auth headers if needed
  headers: () => ({
    // 'Authorization': `Bearer ${getToken()}`,
  }),
});

// Safe client that automatically wraps responses in [error, data] tuple
export const safeClient = createSafeClient(client);

// Usage example with error handling
export async function createUser(email: string, name: string) {
  const [error, data, isDefined] = await safeClient.user.create({
    email,
    name,
  });
  
  if (isDefined) {
    // Handle known error
    if (error.code === 'USER_ALREADY_EXISTS') {
      return { error: `Benutzer mit E-Mail ${error.data.email} existiert bereits` };
    }
    return { error: error.message };
  } else if (error) {
    // Handle unknown error
    return { error: 'Ein unerwarteter Fehler ist aufgetreten' };
  }
  
  // Success
  return { data };
}
```

### Schritt 8: Error Page für App Router
Erstelle `apps/web/app/error.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { Button } from '@starter-kit/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center">
      <h2 className="text-xl font-semibold">Etwas ist schiefgelaufen!</h2>
      <p className="mt-2 text-gray-600">
        {error.message || 'Ein unerwarteter Fehler ist aufgetreten'}
      </p>
      <Button
        className="mt-4"
        onClick={() => reset()}
      >
        Erneut versuchen
      </Button>
    </div>
  );
}
```

## Verifizierung

### Test 1: Component Error Boundary
```typescript
// Component that throws
function TestComponent() {
  throw new Error('Test component error');
  return <div>Never renders</div>;
}

// Should show error UI without crashing app
<ErrorBoundary>
  <TestComponent />
</ErrorBoundary>
```

### Test 2: oRPC Error Handling
```typescript
// In API procedure
throw errors.VALIDATION_ERROR({
  message: 'Test validation error',
  data: { field: 'email' }
});
// Should return structured error response
```

### Test 3: Toast Notifications
```typescript
const { showError } = useErrorToast();
showError(new Error('Operation failed'));
// Should show toast notification
```

### Test 4: Global Error
```typescript
// In any component
throw new Error('Global error test');
// Should show global error page
```

### Test 5: Prisma Error Handling
```typescript
// Trigger unique constraint violation
await db.user.create({
  data: { email: 'existing@email.com' }
});
// Should throw USER_ALREADY_EXISTS error with friendly message
```

### Test 6: Safe Client Usage
```typescript
const [error, data] = await safeClient.user.create({ 
  email: 'test@test.com',
  name: 'Test' 
});

if (error) {
  // Type-safe error handling
  console.log(error.code, error.message);
}
```

## Erfolgskriterien
- [ ] oRPC Error Types mit type-safe errors definiert
- [ ] Prisma Error Handler für alle Prisma Errors
- [ ] Global Error Boundary im root app directory
- [ ] Component Error Boundary mit React 19 Features
- [ ] shadcn/ui Toast Integration
- [ ] Safe Client für type-safe error handling
- [ ] Error Logging strukturiert
- [ ] User-friendly deutsche Fehlermeldungen
- [ ] Development vs Production Error Details
- [ ] Error Tracking Vorbereitung (Sentry)

## Potentielle Probleme

### Problem: Type-Safe Errors nicht inferiert
**Lösung**: Stelle sicher, dass `.errors()` vor `.handler()` in oRPC chain kommt

### Problem: Toast Notifications nicht sichtbar
**Lösung**: Toaster Component in root layout einbinden

### Problem: Global Error wird nicht gefangen
**Lösung**: global-error.tsx muss direkt in app/ directory sein, nicht in Unterordnern

### Problem: Hydration Errors mit Error Boundaries
**Lösung**: 'use client' directive verwenden und SSR-safe checks einbauen

## Rollback Plan
Falls kritische Probleme:
1. Entferne global-error.tsx
2. Entferne ErrorBoundary wrapper
3. Nutze standard try-catch ohne oRPC errors
4. Fallback auf console.error logging

## Zeitschätzung
- oRPC Error Setup: 20 Minuten
- Prisma Error Handler: 15 Minuten
- Error Boundaries: 20 Minuten
- Toast Integration: 20 Minuten
- Client Integration: 15 Minuten
- Testing: 20 Minuten
- Total: 110 Minuten