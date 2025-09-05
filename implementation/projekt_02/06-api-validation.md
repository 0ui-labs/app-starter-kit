# Arbeitspaket 05: API Input Validation mit Zod

## Ziel
Implementierung einer robusten API Input/Output Validation mit Zod für type-safe API Procedures in oRPC.

## Problem
- Keine Input Validation in API Routes
- Keine Type Safety für API Requests/Responses
- Fehlende Error Handling für invalide Inputs
- SQL Injection Gefahr ohne Validation

## Kontext
- **API Framework**: oRPC
- **Validation Library**: Zod
- **Package**: `@starter-kit/api`
- **File**: `packages/api/src/router.ts`
- **oRPC Version**: Latest (mit nativer Zod-Unterstützung)

## Implementierung

### Schritt 1: Base Schemas definieren
Erstelle `packages/api/src/schemas/base.ts`:

```typescript
import { z } from 'zod';

// Common schemas
export const idSchema = z.string().uuid();
export const emailSchema = z.string().email().toLowerCase();
export const dateSchema = z.string().datetime();
export const paginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
});

// Error response schema
export const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.any().optional(),
});

// Success response wrapper
export function successSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
  });
}
```

### Schritt 2: User Schemas
Erstelle `packages/api/src/schemas/user.ts`:

```typescript
import { z } from 'zod';
import { emailSchema, idSchema } from './base';

// User entity
export const userSchema = z.object({
  id: idSchema,
  email: emailSchema,
  name: z.string().min(1).max(100),
  role: z.enum(['user', 'admin']).default('user'),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Create user input
export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(100)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain number'),
});

// Update user input
export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: emailSchema.optional(),
});

// User filters
export const userFiltersSchema = z.object({
  email: emailSchema.optional(),
  role: z.enum(['user', 'admin']).optional(),
  search: z.string().optional(),
});
```

### Schritt 3: Router mit Validation
Update `packages/api/src/router.ts`:

```typescript
import { os, ORPCError, onError, ValidationError } from '@orpc/server';
import { z } from 'zod';
import { db } from '@starter-kit/db';
import { requireAuth, requireRole } from '@starter-kit/auth';
import {
  userSchema,
  createUserSchema,
  updateUserSchema,
  userFiltersSchema,
} from './schemas/user';
import { paginationSchema, successSchema, idSchema } from './schemas/base';

// Error handling middleware
const baseWithErrorHandling = os.use(onError((error) => {
  if (
    error instanceof ORPCError
    && error.code === 'BAD_REQUEST'
    && error.cause instanceof ValidationError
  ) {
    // Handle Zod validation errors
    const zodError = new z.ZodError(error.cause.issues as z.ZodIssue[]);
    
    throw new ORPCError('INPUT_VALIDATION_FAILED', {
      status: 422,
      message: 'Validation failed',
      data: zodError.flatten(),
      cause: error.cause,
    });
  }
  
  // Re-throw other errors
  throw error;
}));

// Base procedure with auth
const protectedProcedure = baseWithErrorHandling
  .use(async ({ context, next }) => {
    const userId = await requireAuth().catch(() => null);
    if (!userId) {
      throw new ORPCError('UNAUTHORIZED', {
        status: 401,
        message: 'Authentication required'
      });
    }
    return next({ context: { ...context, userId, db } });
  });

// Admin procedure
const adminProcedure = protectedProcedure
  .use(async ({ context, next }) => {
    const isAdmin = await requireRole('admin').catch(() => false);
    if (!isAdmin) {
      throw new ORPCError('FORBIDDEN', {
        status: 403,
        message: 'Admin role required'
      });
    }
    return next();
  });

export const router = baseWithErrorHandling.router({
  // Health check (public)
  health: os
    .output(successSchema(z.object({ status: z.literal('ok') })))
    .handler(() => ({ success: true, data: { status: 'ok' } })),

  // User endpoints
  user: baseWithErrorHandling.router({
    // Get current user
    me: protectedProcedure
      .output(successSchema(userSchema))
      .handler(async ({ context }) => {
        const user = await context.db.user.findUnique({
          where: { id: context.userId },
        });
        
        if (!user) {
          throw new ORPCError('NOT_FOUND', {
            status: 404,
            message: 'User not found'
          });
        }
        
        return { success: true, data: user };
      }),

    // Create user
    create: baseWithErrorHandling
      .input(createUserSchema)
      .output(successSchema(userSchema))
      .handler(async ({ input, context }) => {
        // Hash password (use bcrypt in production)
        const hashedPassword = input.password; // TODO: Hash this
        
        const user = await context.db.user.create({
          data: {
            email: input.email,
            name: input.name,
            password: hashedPassword,
          },
        });
        
        return { success: true, data: user };
      }),

    // Update user
    update: protectedProcedure
      .input(updateUserSchema)
      .output(successSchema(userSchema))
      .handler(async ({ input, context }) => {
        const user = await context.db.user.update({
          where: { id: context.userId },
          data: input,
        });
        
        return { success: true, data: user };
      }),

    // List users (admin only)
    list: adminProcedure
      .input(z.object({
        ...paginationSchema.shape,
        ...userFiltersSchema.shape,
      }))
      .output(successSchema(z.object({
        users: z.array(userSchema),
        total: z.number(),
        page: z.number(),
        totalPages: z.number(),
      })))
      .handler(async ({ input, context }) => {
        const { page, limit, ...filters } = input;
        const offset = (page - 1) * limit;
        
        const where = {
          ...(filters.email && { email: filters.email }),
          ...(filters.role && { role: filters.role }),
          ...(filters.search && {
            OR: [
              { name: { contains: filters.search } },
              { email: { contains: filters.search } },
            ],
          }),
        };
        
        const [users, total] = await Promise.all([
          context.db.user.findMany({
            where,
            skip: offset,
            take: limit,
            orderBy: { createdAt: 'desc' },
          }),
          context.db.user.count({ where }),
        ]);
        
        return {
          success: true,
          data: {
            users,
            total,
            page,
            totalPages: Math.ceil(total / limit),
          },
        };
      }),

    // Delete user (admin only)
    delete: adminProcedure
      .input(z.object({ id: idSchema }))
      .output(successSchema(z.object({ deleted: z.boolean() })))
      .handler(async ({ input, context }) => {
        await context.db.user.delete({
          where: { id: input.id },
        });
        
        return { success: true, data: { deleted: true } };
      }),
  }),
});

export type AppRouter = typeof router;
```

### Schritt 4: Error Handler
Erstelle `packages/api/src/error-handler.ts`:

```typescript
import { ORPCError } from '@orpc/server';
import { z } from 'zod';

export function handleAPIError(error: unknown): ORPCError {
  // Already an ORPCError
  if (error instanceof ORPCError) {
    return error;
  }
  
  // Zod validation error
  if (error instanceof z.ZodError) {
    return new ORPCError('BAD_REQUEST', {
      status: 400,
      message: 'Validation failed',
      data: error.flatten(),
    });
  }
  
  // Prisma errors
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaError = error as any;
    
    if (prismaError.code === 'P2002') {
      return new ORPCError('CONFLICT', {
        status: 409,
        message: 'Resource already exists',
        data: { field: prismaError.meta?.target },
      });
    }
    
    if (prismaError.code === 'P2025') {
      return new ORPCError('NOT_FOUND', {
        status: 404,
        message: 'Resource not found',
      });
    }
  }
  
  // Default error
  if (error instanceof Error) {
    return new ORPCError('INTERNAL_SERVER_ERROR', {
      status: 500,
      message: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message,
    });
  }
  
  return new ORPCError('INTERNAL_SERVER_ERROR', {
    status: 500,
    message: 'An unknown error occurred',
  });
}
```

### Schritt 5: Client Usage Example mit Type Utilities
Erstelle `apps/web/src/lib/api-client.ts`:

```typescript
import { createORPCClient } from '@orpc/client';
import type { AppRouter } from '@starter-kit/api';
import type { InferRouterInputs, InferRouterOutputs } from '@orpc/server';

// Type utilities for better inference
export type RouterInputs = InferRouterInputs<AppRouter>;
export type RouterOutputs = InferRouterOutputs<AppRouter>;

// Specific types
export type CreateUserInput = RouterInputs['user']['create'];
export type CreateUserOutput = RouterOutputs['user']['create'];

export const api = createORPCClient<AppRouter>({
  baseURL: '/api',
  headers: () => ({
    'Content-Type': 'application/json',
  }),
});

// Usage with full type safety
export async function createUser(data: CreateUserInput) {
  try {
    const result = await api.user.create(data);
    // result is fully typed as CreateUserOutput
    return result.data;
  } catch (error) {
    // Handle validation errors
    if (error instanceof Error && 'data' in error) {
      console.error('Validation failed:', error.data);
    }
    throw error;
  }
}
```

## Verifizierung

### Test 1: Valid Input
```typescript
const result = await api.user.create({
  email: 'test@example.com',
  name: 'Test User',
  password: 'SecurePass123',
});
// Should succeed
```

### Test 2: Invalid Email
```typescript
const result = await api.user.create({
  email: 'invalid-email',
  name: 'Test',
  password: 'Pass123',
});
// Should fail with validation error
```

### Test 3: SQL Injection Attempt
```typescript
const result = await api.user.list({
  search: "'; DROP TABLE users; --",
});
// Should be safely escaped by Prisma
```

## Dual API Strategy für externe Konsumenten

Da oRPC keine OpenAPI Generation unterstützt, implementieren wir zusätzlich REST Endpoints:

### REST Bridge zu oRPC
```typescript
// app/api/v1/[...path]/route.ts
import { userRouter } from '@starter-kit/api';

export async function GET(req: NextRequest, { params }) {
  const [resource, id] = params.path;
  
  // Bridge REST zu oRPC
  if (resource === 'users' && id) {
    const result = await userRouter.getById({ input: { id } });
    return NextResponse.json(result);
  }
  // ... weitere Mappings
}
```

### OpenAPI aus Zod Schemas
```typescript
// tools/generate-openapi.ts
import { zodToJsonSchema } from 'zod-to-json-schema';
import { UserSchema } from '@starter-kit/api';

const openApiSpec = {
  paths: {
    '/api/v1/users/{id}': {
      get: {
        responses: {
          200: { 
            content: {
              'application/json': {
                schema: zodToJsonSchema(UserSchema)
              }
            }
          }
        }
      }
    }
  }
};
```

## Erfolgskriterien
- [ ] Alle API Endpoints haben Input Validation
- [ ] Zod Schemas sind wiederverwendbar
- [ ] Type Safety end-to-end
- [ ] Validation Errors sind aussagekräftig
- [ ] SQL Injection ist nicht möglich
- [ ] Pagination funktioniert
- [ ] Error Handling ist konsistent
- [ ] REST API Wrapper verfügbar für externe Clients
- [ ] OpenAPI Spec kann generiert werden

## Potentielle Probleme

### Problem: Zod Version Conflicts
**Lösung**: Stelle sicher dass alle Packages gleiche Zod Version nutzen

### Problem: Type Inference Fehler
**Lösung**: Explizite Type Exports mit `InferRouterInputs` und `InferRouterOutputs` nutzen

### Problem: Middleware Duplikation
**Lösung**: Middleware nur auf Router-Ebene ODER Procedure-Ebene anwenden, nicht auf beiden

## Zeitschätzung
- Schemas: 20 Minuten
- Router Update: 30 Minuten
- Error Handling: 15 Minuten
- Testing: 15 Minuten
- Total: 80 Minuten