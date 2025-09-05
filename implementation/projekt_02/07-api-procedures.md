# Arbeitspaket 09: API Procedures & Business Logic

## Ziel
Implementierung vollständiger oRPC API Procedures mit Business Logic, Authentication, Authorization und Rate Limiting für alle Core Features der Anwendung.

## Problem
- Nur minimaler healthCheck Endpoint vorhanden
- Keine Business Logic implementiert
- Fehlende CRUD Operations
- Keine Rate Limiting
- Keine Caching Strategy
- Fehlende API Dokumentation

## Kontext
- **Framework**: oRPC (Type-safe RPC)
- **Package**: `@starter-kit/api`
- **Database**: Prisma mit PostgreSQL
- **Auth**: Clerk Integration
- **Validation**: Zod Schemas

## Implementierung

### Schritt 1: API Context
Erstelle `packages/api/src/context.ts`:

```typescript
import { db } from '@starter-kit/db';
import { auth, currentUser } from '@clerk/nextjs/server';

export async function createContext(req?: Request) {
  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  
  return {
    db,
    userId,
    user,
    isAdmin: user?.publicMetadata?.role === 'admin',
    ip: req?.headers?.get('x-forwarded-for') || undefined,
    userAgent: req?.headers?.get('user-agent') || undefined,
    req,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

### Schritt 2: Error Handling
Erstelle `packages/api/src/errors/app-error.ts`:

```typescript
import { ORPCError } from '@orpc/server';

export enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class AppError extends ORPCError {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true,
    public details?: any
  ) {
    super(code, message, details);
  }
}
```

### Schritt 3: Base Procedures mit Middleware
Erstelle `packages/api/src/procedures/base.ts`:

```typescript
import { os } from '@orpc/server';
import { createContext, type Context } from '../context';
import { AppError, ErrorCode } from '../errors/app-error';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// Initialize Redis and Rate Limiter
const redis = process.env.UPSTASH_REDIS_REST_URL 
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

const rateLimiter = redis 
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '10 s'),
      analytics: true,
    })
  : null;

// Base procedure with context
export const publicProcedure = os.context(createContext);

// Authenticated procedure
export const authedProcedure = publicProcedure
  .use(async ({ context, next }) => {
    if (!context.userId) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        'Authentication required',
        401
      );
    }
    return next();
  });

// Admin procedure
export const adminProcedure = authedProcedure
  .use(async ({ context, next }) => {
    if (!context.isAdmin) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Admin access required',
        403
      );
    }
    return next();
  });

// Rate limiting middleware factory
export function withRateLimit(identifier: (context: Context) => string, limit: number = 10) {
  return async ({ context, next }: { context: Context, next: () => any }) => {
    if (!rateLimiter) {
      return next(); // Skip if rate limiting not configured
    }
    
    const id = identifier(context);
    const { success, limit: maxLimit, reset, remaining } = 
      await rateLimiter.limit(id);
    
    if (!success) {
      throw new AppError(
        ErrorCode.RATE_LIMIT_EXCEEDED,
        `Rate limit exceeded. Try again in ${reset - Date.now()}ms`,
        429,
        true,
        { limit: maxLimit, reset, remaining }
      );
    }
    
    return next();
  };
}
```

### Schritt 4: User Procedures
Erstelle `packages/api/src/procedures/user.ts`:

```typescript
import { z } from 'zod';
import { authedProcedure, adminProcedure, withRateLimit } from './base';
import { AppError, ErrorCode } from '../errors/app-error';

// Schemas
const userSchema = z.object({
  id: z.string().uuid(),
  clerkId: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  role: z.enum(['USER', 'ADMIN', 'MODERATOR']),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED']),
  profile: z.object({
    bio: z.string().nullable(),
    website: z.string().nullable(),
    location: z.string().nullable(),
  }).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const successSchema = <T extends z.ZodType>(dataSchema: T) => 
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

export const userProcedures = {
  // Get current user
  me: authedProcedure
    .output(successSchema(userSchema))
    .handler(async ({ context }) => {
      const user = await context.db.user.findUnique({
        where: { clerkId: context.userId! },
        include: { profile: true },
      });
      
      if (!user) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'User not found',
          404
        );
      }
      
      return { success: true, data: user };
    }),

  // Update current user
  updateMe: authedProcedure
    .use(withRateLimit(ctx => `update:${ctx.userId}`, 5))
    .input(z.object({
      name: z.string().min(1).max(100).optional(),
      bio: z.string().max(500).optional(),
      website: z.string().url().optional(),
      location: z.string().max(100).optional(),
    }))
    .output(successSchema(userSchema))
    .handler(async ({ input, context }) => {
      const user = await context.db.user.update({
        where: { clerkId: context.userId! },
        data: {
          name: input.name,
          profile: {
            upsert: {
              create: {
                bio: input.bio,
                website: input.website,
                location: input.location,
              },
              update: {
                bio: input.bio,
                website: input.website,
                location: input.location,
              },
            },
          },
        },
        include: { profile: true },
      });
      
      return { success: true, data: user };
    }),

  // List users (admin only)
  list: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(10),
      search: z.string().optional(),
      role: z.enum(['USER', 'ADMIN', 'MODERATOR']).optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED']).optional(),
      orderBy: z.enum(['createdAt', 'name', 'email']).default('createdAt'),
      order: z.enum(['asc', 'desc']).default('desc'),
    }))
    .output(successSchema(z.object({
      users: z.array(userSchema),
      total: z.number(),
      page: z.number(),
      totalPages: z.number(),
    })))
    .handler(async ({ input, context }) => {
      const { page, limit, search, role, status, orderBy, order } = input;
      const skip = (page - 1) * limit;
      
      const where = {
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }),
        ...(role && { role }),
        ...(status && { status }),
        deletedAt: null,
      };
      
      const [users, total] = await Promise.all([
        context.db.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [orderBy]: order },
          include: { profile: true },
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

  // Get user by ID (admin only)
  getById: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .output(successSchema(userSchema.extend({
      _count: z.object({
        posts: z.number(),
        comments: z.number(),
      }).optional(),
    })))
    .handler(async ({ input, context }) => {
      const user = await context.db.user.findUnique({
        where: { id: input.id },
        include: { 
          profile: true,
          _count: {
            select: {
              posts: true,
              comments: true,
            },
          },
        },
      });
      
      if (!user) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'User not found',
          404
        );
      }
      
      return { success: true, data: user };
    }),

  // Update user status (admin only)
  updateStatus: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED']),
      reason: z.string().optional(),
    }))
    .output(successSchema(userSchema))
    .handler(async ({ input, context }) => {
      const oldUser = await context.db.user.findUnique({
        where: { id: input.id },
      });
      
      if (!oldUser) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'User not found',
          404
        );
      }
      
      const user = await context.db.user.update({
        where: { id: input.id },
        data: {
          status: input.status,
          ...(input.status === 'DELETED' && { deletedAt: new Date() }),
        },
        include: { profile: true },
      });
      
      return { success: true, data: user };
    }),

  // Delete user (admin only - soft delete)  
  delete: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .output(successSchema(z.object({ deleted: z.boolean() })))
    .handler(async ({ input, context }) => {
      await context.db.user.update({
        where: { id: input.id },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
        },
      });
      
      return { success: true, data: { deleted: true } };
    }),
};
```

### Schritt 5: Post Procedures
Erstelle `packages/api/src/procedures/post.ts`:

```typescript
import { z } from 'zod';
import { publicProcedure, authedProcedure, adminProcedure, withRateLimit } from './base';
import { AppError, ErrorCode } from '../errors/app-error';

const postSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  content: z.string(),
  excerpt: z.string().nullable(),
  published: z.boolean(),
  publishedAt: z.date().nullable(),
  authorId: z.string(),
  views: z.number().default(0),
  tags: z.array(z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
  })).default([]),
  _count: z.object({
    comments: z.number(),
  }).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const successSchema = <T extends z.ZodType>(dataSchema: T) => 
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

export const postProcedures = {
  // Create post
  create: authedProcedure
    .use(withRateLimit(ctx => `post:${ctx.userId}`, 5))
    .input(z.object({
      title: z.string().min(1).max(200),
      content: z.string().min(10),
      excerpt: z.string().max(500).optional(),
      tags: z.array(z.string()).optional(),
      published: z.boolean().default(false),
    }))
    .output(successSchema(postSchema))
    .handler(async ({ input, context }) => {
      // Generate slug
      const slug = input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') +
        '-' + Date.now();
      
      const post = await context.db.post.create({
        data: {
          title: input.title,
          slug,
          content: input.content,
          excerpt: input.excerpt || null,
          published: input.published,
          publishedAt: input.published ? new Date() : null,
          authorId: context.userId!,
          tags: input.tags ? {
            connectOrCreate: input.tags.map(tag => ({
              where: { slug: tag },
              create: {
                name: tag.charAt(0).toUpperCase() + tag.slice(1),
                slug: tag,
              },
            })),
          } : undefined,
        },
        include: {
          tags: true,
          _count: {
            select: { comments: true },
          },
        },
      });
      
      // Audit log
      await createAuditLog(context.db, {
        userId: context.userId!,
        action: 'CREATE',
        entity: 'posts',
        entityId: post.id,
        newValues: input,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      
      return { success: true, data: post };
    }),

  // Get post by slug
  getBySlug: publicProcedure
    .input(z.object({
      slug: z.string(),
    }))
    .output(successSchema(postSchema.extend({
      author: z.object({
        id: z.string(),
        name: z.string().nullable(),
        image: z.string().nullable(),
      }),
    })))
    .handler(async ({ input, context }) => {
      const post = await context.db.post.findFirst({
        where: {
          slug: input.slug,
          OR: [
            { published: true },
            { authorId: context.userId || undefined },
          ],
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          tags: true,
          _count: {
            select: { comments: true },
          },
        },
      });
      
      if (!post) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'Post not found',
          404
        );
      }
      
      // Increment views
      if (post.published) {
        await context.db.post.update({
          where: { id: post.id },
          data: { views: { increment: 1 } },
        });
      }
      
      return { success: true, data: post };
    }),

  // List posts
  list: publicProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(50).default(10),
      published: z.boolean().optional(),
      authorId: z.string().optional(),
      tag: z.string().optional(),
      search: z.string().optional(),
      orderBy: z.enum(['createdAt', 'views', 'likes']).default('createdAt'),
      order: z.enum(['asc', 'desc']).default('desc'),
    }))
    .output(successSchema(z.object({
      posts: z.array(postSchema),
      total: z.number(),
      page: z.number(),
      totalPages: z.number(),
    })))
    .handler(async ({ input, context }) => {
      const { page, limit, published, authorId, tag, search, orderBy, order } = input;
      const skip = (page - 1) * limit;
      
      const where = {
        ...(published !== undefined && { published }),
        ...(authorId && { authorId }),
        ...(tag && {
          tags: {
            some: { slug: tag },
          },
        }),
        ...(search && {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { content: { contains: search, mode: 'insensitive' } },
          ],
        }),
        deletedAt: null,
      };
      
      // Only show unpublished posts to author
      if (!context.userId) {
        where.published = true;
      } else if (!context.isAdmin && authorId !== context.userId) {
        where.OR = [
          { published: true },
          { authorId: context.userId },
        ];
      }
      
      const [posts, total] = await Promise.all([
        context.db.post.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [orderBy]: order },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
            tags: true,
            _count: {
              select: { comments: true },
            },
          },
        }),
        context.db.post.count({ where }),
      ]);
      
      return {
        success: true,
        data: {
          posts,
          total,
          page,
          totalPages: Math.ceil(total / limit),
        },
      };
    }),

  // Update post
  update: authedProcedure
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(200).optional(),
      content: z.string().min(10).optional(),
      excerpt: z.string().max(500).optional(),
      tags: z.array(z.string()).optional(),
      published: z.boolean().optional(),
    }))
    .output(successSchema(postSchema))
    .handler(async ({ input, context }) => {
      const { id, ...data } = input;
      
      // Check ownership
      const existingPost = await context.db.post.findUnique({
        where: { id },
      });
      
      if (!existingPost) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'Post not found',
          404
        );
      }
      
      if (existingPost.authorId !== context.userId && !context.isAdmin) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          'You can only edit your own posts',
          403
        );
      }
      
      const post = await context.db.post.update({
        where: { id },
        data: {
          ...data,
          ...(data.published && !existingPost.published && {
            publishedAt: new Date(),
          }),
          ...(data.tags && {
            tags: {
              set: [],
              connectOrCreate: data.tags.map(tag => ({
                where: { slug: tag },
                create: {
                  name: tag.charAt(0).toUpperCase() + tag.slice(1),
                  slug: tag,
                },
              })),
            },
          }),
        },
        include: {
          tags: true,
          _count: {
            select: { comments: true },
          },
        },
      });
      
      
      return { success: true, data: post };
    }),

  // Delete post
  delete: authedProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .output(successSchema(z.object({ deleted: z.boolean() })))
    .handler(async ({ input, context }) => {
      // Check ownership
      const post = await context.db.post.findUnique({
        where: { id: input.id },
      });
      
      if (!post) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'Post not found',
          404
        );
      }
      
      if (post.authorId !== context.userId && !context.isAdmin) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          'You can only delete your own posts',
          403
        );
      }
      
      // Soft delete
      await context.db.post.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
      
      return { success: true, data: { deleted: true } };
    }),
};
```

### Schritt 6: Main Router Assembly
Update `packages/api/src/router.ts`:

```typescript
import { os } from '@orpc/server';
import { z } from 'zod';
import { publicProcedure } from './procedures/base';
import { userProcedures } from './procedures/user';
import { postProcedures } from './procedures/post';

// Health check procedure
const healthProcedure = publicProcedure
  .output(z.object({ 
    status: z.literal('ok'), 
    timestamp: z.string() 
  }))
  .handler(() => ({
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
  }));

// Main router - simple object structure
export const router = {
  health: healthProcedure,
  user: userProcedures,
  post: postProcedures,
};

export type AppRouter = typeof router;
```

### Schritt 7: Client SDK
Erstelle `packages/api/src/client.ts`:

```typescript
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { RouterClient } from '@orpc/server';
import type { AppRouter } from './router';

export function createAPIClient(
  baseURL: string = '/api/rpc',
  headers?: HeadersInit
) {
  const link = new RPCLink({
    url: baseURL,
    headers: () => ({
      'Content-Type': 'application/json',
      ...headers,
    }),
  });
  
  return createORPCClient<AppRouter>(link);
}

// Type exports for client usage
export type { AppRouter, RouterClient };
export type APIClient = RouterClient<AppRouter>;
```

### Schritt 8: API Route Handler
Erstelle `app/api/rpc/route.ts`:

```typescript
import { RPCHandler } from '@orpc/server/fetch';
import { router } from '@starter-kit/api';
import { createContext } from '@starter-kit/api/context';

const handler = new RPCHandler(router);

export async function POST(req: Request) {
  return handler.handle(req, {
    context: await createContext(req),
  });
}

export async function GET(req: Request) {
  return handler.handle(req, {
    context: await createContext(req),
  });
}
```

### Schritt 9: API Documentation
Erstelle `packages/api/README.md`:

```markdown
# @starter-kit/api

Type-safe API layer using oRPC with built-in authentication, validation, and rate limiting.

## Usage

### Server

```typescript
import { RPCHandler } from '@orpc/server/fetch';
import { router } from '@starter-kit/api';
import { createContext } from '@starter-kit/api/context';

const handler = new RPCHandler(router);

// In your API route
export async function POST(req: Request) {
  return handler.handle(req, {
    context: await createContext(req),
  });
}
```

### Client

```typescript
import { createAPIClient } from '@starter-kit/api/client';

const api = createAPIClient('/api/rpc');

// Type-safe API calls
const { data: user } = await api.user.me();
const { data: posts } = await api.post.list({ page: 1, limit: 10 });
```

## Available Procedures

### User
- `user.me()` - Get current user
- `user.updateMe({ name, bio })` - Update profile
- `user.list({ page, search })` - List users (admin)
- `user.getById({ id })` - Get user by ID (admin)
- `user.updateStatus({ id, status })` - Update user status (admin)
- `user.delete({ id })` - Delete user (admin)

### Post
- `post.create({ title, content })` - Create post
- `post.getBySlug({ slug })` - Get post by slug
- `post.list({ page, tag, search })` - List posts
- `post.update({ id, title })` - Update post
- `post.delete({ id })` - Delete post

## Error Handling

All procedures return standardized error responses:

```typescript
{
  error: {
    id: string,
    code: ErrorCode,
    message: string,
    details?: any
  }
}
```

## Rate Limiting

Rate limiting is automatically applied to mutation endpoints.
Configure via environment variables:

```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```
```

## Verifizierung

### Test 1: API Health Check
```bash
curl -X POST http://localhost:3004/api/rpc \
  -H "Content-Type: application/json" \
  -d '{"path": "health"}'
# Should return { status: 'ok', timestamp: '...' }
```

### Test 2: Type Safety
```typescript
const api = createAPIClient('/api/rpc');
const result = await api.user.me();
// result should be fully typed with { success: true, data: User }
```

### Test 3: Authentication
```typescript
// Without auth
try {
  await api.user.me();
} catch (error) {
  // Should throw UNAUTHORIZED error
}

// With auth (after sign in with Clerk)
const { data: user } = await api.user.me();
// Should return user data
```

### Test 4: Rate Limiting
```typescript
// Make rapid requests (with Upstash Redis configured)
for (let i = 0; i < 15; i++) {
  try {
    await api.post.create({ 
      title: `Test ${i}`,
      content: 'Test content here'
    });
  } catch (error) {
    console.log('Rate limited after request', i);
  }
}
// Should get rate limit error after configured limit
```

### Test 5: Admin Access
```typescript
// As regular user
try {
  await api.user.list();
} catch (error) {
  // Should throw FORBIDDEN error
}

// As admin (user with admin role in Clerk metadata)
const { data } = await api.user.list();
// Should return user list
```

## Erfolgskriterien
- [ ] Context und Middleware implementiert
- [ ] User Procedures vollständig
- [ ] Post Procedures vollständig
- [ ] Authentication funktioniert
- [ ] Authorization (Admin) funktioniert
- [ ] Rate Limiting aktiv
- [ ] Error Handling konsistent
- [ ] Audit Logging implementiert
- [ ] Type Safety end-to-end
- [ ] Client SDK verfügbar

## Potentielle Probleme

### Problem: oRPC Import Fehler
**Lösung**: Installiere oRPC Pakete
```bash
cd packages/api
npm install @orpc/server @orpc/client
```

### Problem: Context Creation Fehler
**Lösung**: Stelle sicher dass Clerk konfiguriert ist und die Environment Variables gesetzt sind

### Problem: Rate Limiting nicht aktiv
**Lösung**: Upstash Redis konfigurieren (optional - funktioniert auch ohne)
```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

### Problem: Type Inference Fehler
**Lösung**: TypeScript Build überprüfen
```bash
cd packages/api
npx tsc --noEmit
```

### Problem: RPC Route nicht erreichbar
**Lösung**: Stelle sicher dass die Route unter `/app/api/rpc/route.ts` erstellt wurde

## Rollback Plan
Bei Problemen: Zurück zu minimal router mit nur health check.

## Zeitschätzung
- Context & Middleware: 20 Minuten
- User Procedures: 30 Minuten
- Post Procedures: 30 Minuten
- Router Assembly: 10 Minuten
- Client SDK: 10 Minuten
- Testing: 20 Minuten
- Total: 120 Minuten