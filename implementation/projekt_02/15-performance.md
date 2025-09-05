# Arbeitspaket 15: Performance Optimierungen & Caching

## Ziel
Implementierung umfassender Performance Optimierungen mit Caching-Strategien, Bundle-Size-Optimierung, Database Query Optimization, CDN Integration und Edge Computing für optimale User Experience.

## Problem
- Keine Caching Strategy
- Unkomprimierte Assets
- Fehlende Database Indexes
- Keine Query Optimization
- Fehlende CDN Integration
- Keine Edge Caching

## Kontext
- **Framework**: Next.js 15 mit Turbopack (Development) / Webpack (Production)
- **Caching**: Redis (Upstash), React Query, Next.js Cache
- **CDN**: Vercel Edge Network / Cloudflare
- **Database**: PostgreSQL mit Neon
- **Bundle Analysis**: @next/bundle-analyzer
- **Hinweis**: Turbopack wird primär für Development genutzt, Production Builds nutzen noch Webpack

## Implementierung

### Schritt 1: Redis Caching Layer
Erstelle `packages/api/src/cache/index.ts`:

```typescript
import { Redis } from '@upstash/redis';
import { logger } from '../logger';
import superjson from 'superjson';

// Initialize Redis client
const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
  revalidate?: boolean; // Force revalidation
}

export class CacheManager {
  private prefix: string;
  
  constructor(prefix: string = 'cache') {
    this.prefix = prefix;
  }
  
  private getKey(key: string): string {
    return `${this.prefix}:${key}`;
  }
  
  async get<T>(key: string): Promise<T | null> {
    if (!redis) return null;
    
    try {
      const start = Date.now();
      const cached = await redis.get(this.getKey(key));
      
      if (cached) {
        logger.api.debug({
          key,
          duration: Date.now() - start,
        }, 'Cache hit');
        
        // Deserialize with superjson for Date/Map/Set support
        return superjson.parse(cached as string) as T;
      }
      
      logger.api.debug({ key }, 'Cache miss');
      return null;
    } catch (error) {
      logger.api.error({ error, key }, 'Cache get error');
      return null;
    }
  }
  
  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    if (!redis) return;
    
    try {
      const serialized = superjson.stringify(value);
      const cacheKey = this.getKey(key);
      
      if (options.ttl) {
        await redis.setex(cacheKey, options.ttl, serialized);
      } else {
        await redis.set(cacheKey, serialized);
      }
      
      // Handle tags for invalidation
      if (options.tags) {
        for (const tag of options.tags) {
          await redis.sadd(`tag:${tag}`, cacheKey);
        }
      }
      
      logger.api.debug({ key, ttl: options.ttl }, 'Cache set');
    } catch (error) {
      logger.api.error({ error, key }, 'Cache set error');
    }
  }
  
  async delete(key: string): Promise<void> {
    if (!redis) return;
    
    try {
      await redis.del(this.getKey(key));
      logger.api.debug({ key }, 'Cache deleted');
    } catch (error) {
      logger.api.error({ error, key }, 'Cache delete error');
    }
  }
  
  async invalidateTag(tag: string): Promise<void> {
    if (!redis) return;
    
    try {
      const tagKey = `tag:${tag}`;
      const keys = await redis.smembers(tagKey);
      
      if (keys.length > 0) {
        await redis.del(...keys);
        await redis.del(tagKey);
        logger.api.info({ tag, count: keys.length }, 'Tag invalidated');
      }
    } catch (error) {
      logger.api.error({ error, tag }, 'Tag invalidation error');
    }
  }
  
  async flush(): Promise<void> {
    if (!redis) return;
    
    try {
      await redis.flushdb();
      logger.api.info('Cache flushed');
    } catch (error) {
      logger.api.error({ error }, 'Cache flush error');
    }
  }
}

// Create cache instances
export const cache = {
  api: new CacheManager('api'),
  user: new CacheManager('user'),
  post: new CacheManager('post'),
  query: new CacheManager('query'),
};

// Cache wrapper for async functions
export function cacheable<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: {
    key: (...args: Parameters<T>) => string;
    ttl?: number;
    tags?: string[];
  }
): T {
  return (async (...args: Parameters<T>) => {
    const cacheKey = options.key(...args);
    
    // Check cache
    const cached = await cache.api.get(cacheKey);
    if (cached !== null) {
      return cached;
    }
    
    // Execute function
    const result = await fn(...args);
    
    // Cache result
    await cache.api.set(cacheKey, result, {
      ttl: options.ttl,
      tags: options.tags,
    });
    
    return result;
  }) as T;
}
```

### Schritt 2: React Query Setup
Erstelle `apps/web/src/lib/query-client.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query';
import { cache } from 'react';

export const getQueryClient = cache(() => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime in v4, now gcTime in v5)
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
      retry: (failureCount, error: any) => {
        if (error?.status === 404) return false;
        if (error?.status === 401) return false;
        return failureCount < 3;
      },
    },
    mutations: {
      retry: false,
    },
  },
}));

// Prefetch helper
export async function prefetchQuery(key: any[], fn: () => Promise<any>) {
  const queryClient = getQueryClient();
  
  await queryClient.prefetchQuery({
    queryKey: key,
    queryFn: fn,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  return queryClient;
}
```

### Schritt 3: Database Query Optimization
Update `packages/db/prisma/schema.prisma` with indexes:

```prisma
model User {
  // ... existing fields ...
  
  @@index([email, status])
  @@index([clerkId])
  @@index([status, createdAt(sort: Desc)])
  @@index([role, status])
}

model Post {
  // ... existing fields ...
  
  @@index([authorId, published])
  @@index([slug])
  @@index([published, publishedAt(sort: Desc)])
  @@index([published, createdAt(sort: Desc)])
  @@index([authorId, createdAt(sort: Desc)])
  @@fulltext([title, content])
}

model Comment {
  // ... existing fields ...
  
  @@index([postId, approved])
  @@index([authorId, createdAt(sort: Desc)])
  @@index([parentId])
  @@index([approved, createdAt(sort: Desc)])
}
```

### Schritt 4: Query Optimization Utilities
Erstelle `packages/db/src/optimizations.ts`:

```typescript
import { Prisma } from '../generated/prisma';
import { db } from '../index';

// Batch loader for N+1 query prevention
export class DataLoader<T> {
  private batch: Map<string, Promise<T>> = new Map();
  private loader: (keys: string[]) => Promise<Map<string, T>>;
  
  constructor(loader: (keys: string[]) => Promise<Map<string, T>>) {
    this.loader = loader;
  }
  
  async load(key: string): Promise<T | null> {
    if (!this.batch.has(key)) {
      this.batch.set(key, this.scheduleBatch(key));
    }
    
    return this.batch.get(key)!;
  }
  
  private async scheduleBatch(key: string): Promise<T | null> {
    await new Promise(resolve => setImmediate(resolve));
    
    const keys = Array.from(this.batch.keys());
    const results = await this.loader(keys);
    
    this.batch.clear();
    
    return results.get(key) || null;
  }
}

// Cursor-based pagination
export interface CursorPaginationParams {
  cursor?: string;
  take?: number;
  orderBy?: any;
}

export function cursorPaginate<T>(
  model: any,
  params: CursorPaginationParams
) {
  const { cursor, take = 10, orderBy = { createdAt: 'desc' } } = params;
  
  const args: any = {
    take: take + 1, // Take one extra to check if there's more
    orderBy,
  };
  
  if (cursor) {
    args.cursor = { id: cursor };
    args.skip = 1; // Skip the cursor item
  }
  
  return {
    args,
    transform: (results: T[]) => {
      const hasMore = results.length > take;
      const items = hasMore ? results.slice(0, -1) : results;
      const nextCursor = hasMore ? items[items.length - 1].id : null;
      
      return {
        items,
        nextCursor,
        hasMore,
      };
    },
  };
}

// Optimized count queries
export async function getEstimatedCount(table: string): Promise<number> {
  const result = await db.$queryRaw<[{ estimate: bigint }]>`
    SELECT reltuples AS estimate
    FROM pg_class
    WHERE relname = ${table};
  `;
  
  return Number(result[0]?.estimate || 0);
}

// Query with automatic includes
export function withIncludes<T extends Record<string, any>>(
  query: T,
  includes: string[]
): T {
  const include: Record<string, boolean | object> = {};
  
  for (const path of includes) {
    const parts = path.split('.');
    let current = include;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      if (i === parts.length - 1) {
        current[part] = true;
      } else {
        current[part] = current[part] || { include: {} };
        current = (current[part] as any).include;
      }
    }
  }
  
  return { ...query, include };
}

// Bulk operations
export async function bulkCreate<T>(
  model: any,
  data: T[],
  chunkSize: number = 100
): Promise<void> {
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    await model.createMany({ data: chunk });
  }
}

// Soft delete with cascade
export async function softDeleteCascade(
  model: any,
  where: any,
  relations: string[]
): Promise<void> {
  const now = new Date();
  
  await db.$transaction(async (tx) => {
    // Update main record
    await tx[model].update({
      where,
      data: { deletedAt: now },
    });
    
    // Update relations
    for (const relation of relations) {
      await tx[relation].updateMany({
        where: { [model + 'Id']: where.id },
        data: { deletedAt: now },
      });
    }
  });
}
```

### Schritt 5: Next.js Performance Config
Update `next.config.js`:

```javascript
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode
  reactStrictMode: true,
  
  // Optimize images
  images: {
    domains: ['images.clerk.dev', 'img.clerk.com'],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  // Output standalone for Docker
  output: 'standalone',
  
  // Compress responses
  compress: true,
  
  // Power optimizations
  poweredByHeader: false,
  
  // Generate ETags
  generateEtags: true,
  
  // Optimize fonts
  optimizeFonts: true,
  
  // Turbopack configuration (for development)
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  
  // Experimental features
  experimental: {
    // Optimize package imports (only add packages not already optimized by default)
    optimizePackageImports: [
      // date-fns and @heroicons/react are already optimized by default
      // Only add packages that aren't in the default list
    ],
    
    // Partial Prerendering (experimental in Next.js 15)
    ppr: true,
    
    // Server Actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  
  // Webpack optimizations (only used when not using Turbopack)
  webpack: (config, { isServer }) => {
    // Only apply webpack optimizations if not using Turbopack
    // These optimizations are for production builds or when Turbopack is disabled
    
    if (!isServer) {
      // Basic optimizations that don't conflict with Turbopack
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            framework: {
              chunks: 'all',
              name: 'framework',
              test: /(?<!node_modules.*)[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-subscription)[\\/]/,
              priority: 40,
              enforce: true,
            },
            commons: {
              name: 'commons',
              minChunks: 2,
              priority: 20,
            },
          },
        },
      };
    }
    
    return config;
  },
  
  // Headers for caching
  async headers() {
    return [
      {
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:all*(js|css)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate',
          },
        ],
      },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
```

### Schritt 6: Component Optimization
Erstelle `apps/web/src/components/optimized/LazyImage.tsx`:

```typescript
'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@starter-kit/ui';

interface LazyImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
}

export function LazyImage({
  src,
  alt,
  width,
  height,
  priority = false,
  className,
  placeholder = 'blur',
  blurDataURL,
}: LazyImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  
  return (
    <div className={cn('relative overflow-hidden', className)}>
      {isLoading && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}
      
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        placeholder={placeholder}
        blurDataURL={blurDataURL}
        className={cn(
          'duration-700 ease-in-out',
          isLoading ? 'scale-110 blur-2xl grayscale' : 'scale-100 blur-0 grayscale-0'
        )}
        onLoad={() => setIsLoading(false)}
      />
    </div>
  );
}
```

### Schritt 7: API Response Caching
Erstelle `apps/web/src/app/api/cached-wrapper.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { cache } from '@starter-kit/api/cache';

interface CachedHandlerOptions {
  revalidate?: number;
  tags?: string[];
  key?: string;
}

export function cachedHandler(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: CachedHandlerOptions = {}
) {
  return async (req: NextRequest) => {
    const cacheKey = options.key || req.url;
    
    // Check if we should bypass cache
    const shouldBypass = 
      req.headers.get('cache-control') === 'no-cache' ||
      req.headers.get('x-no-cache') === '1';
    
    if (shouldBypass) {
      return handler(req);
    }
    
    // Try to get from cache
    const cached = await cache.api.get(cacheKey);
    
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'x-cache': 'HIT',
        },
      });
    }
    
    // Execute handler
    const response = await handler(req);
    const data = await response.json();
    
    // Cache the response
    await cache.api.set(cacheKey, data, {
      ttl: options.revalidate || 60,
      tags: options.tags,
    });
    
    return NextResponse.json(data, {
      headers: {
        'x-cache': 'MISS',
      },
    });
  };
}

// Use Next.js unstable_cache for data caching
// Note: The third parameter (keyParts) is optional but recommended for cache key uniqueness
export const getCachedData = unstable_cache(
  async (key: string) => {
    // Your data fetching logic
    return fetch(`/api/${key}`).then(r => r.json());
  },
  ['api-cache'], // keyParts: additional cache key identifiers
  {
    revalidate: 60, // seconds
    tags: ['api'],  // tags for cache invalidation
  }
);
```

### Schritt 8: Edge Caching with Middleware
Update `apps/web/src/middleware.ts` to add caching headers:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // Add cache headers for static API responses
  if (request.nextUrl.pathname.startsWith('/api/public')) {
    response.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate');
    response.headers.set('CDN-Cache-Control', 'max-age=60');
  }
  
  // Add cache headers for images
  if (request.nextUrl.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/)) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  
  // Add cache key for Vercel Edge Cache
  if (request.nextUrl.pathname.startsWith('/api')) {
    const cacheKey = request.nextUrl.pathname + request.nextUrl.search;
    response.headers.set('x-cache-key', cacheKey);
  }
  
  return response;
}
```

### Schritt 9: Performance Monitoring
Erstelle `apps/web/src/lib/performance.ts`:

```typescript
export function measurePerformance(name: string) {
  if (typeof window === 'undefined') return;
  
  const startMark = `${name}-start`;
  const endMark = `${name}-end`;
  const measureName = name;
  
  performance.mark(startMark);
  
  return () => {
    performance.mark(endMark);
    performance.measure(measureName, startMark, endMark);
    
    const measure = performance.getEntriesByName(measureName)[0];
    console.log(`${name}: ${measure.duration.toFixed(2)}ms`);
    
    // Send to analytics
    if (window.gtag) {
      window.gtag('event', 'timing_complete', {
        name,
        value: Math.round(measure.duration),
      });
    }
    
    // Clean up
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
    performance.clearMeasures(measureName);
  };
}

// Web Vitals reporting
export function reportWebVitals(metric: any) {
  if (window.gtag) {
    window.gtag('event', metric.name, {
      value: Math.round(metric.value),
      event_label: metric.id,
      non_interaction: true,
    });
  }
  
  console.log(metric);
}
```

## Verifizierung

### Test 1: Cache Hit Rate
```typescript
// Make same request twice
const response1 = await fetch('/api/posts');
console.log(response1.headers.get('x-cache')); // MISS

const response2 = await fetch('/api/posts');
console.log(response2.headers.get('x-cache')); // HIT
```

### Test 2: Bundle Size Analysis
```bash
ANALYZE=true npm run build
# Opens bundle analyzer
```

### Test 3: Lighthouse Score
```bash
npm run build
npm start
# Run Lighthouse audit
# Should score > 90 on all metrics
```

### Test 4: Database Query Performance
```sql
EXPLAIN ANALYZE SELECT * FROM posts WHERE published = true ORDER BY created_at DESC LIMIT 10;
-- Should use index
```

## Erfolgskriterien
- [ ] Redis Caching Layer implementiert
- [ ] React Query integriert
- [ ] Database Indexes optimiert
- [ ] Query Optimization Utilities
- [ ] Bundle Size < 200kb (First Load JS)
- [ ] Lighthouse Score > 90
- [ ] Edge Caching konfiguriert
- [ ] Image Optimization aktiv
- [ ] Code Splitting funktioniert
- [ ] Performance Monitoring aktiv

## Potentielle Probleme

### Problem: Cache Invalidation
**Lösung**: Implement tag-based invalidation

### Problem: Memory Leaks in Cache
**Lösung**: Implement TTL and max size limits

### Problem: Slow Database Queries
**Lösung**: Add missing indexes and use query optimization

## Rollback Plan
Bei Performance-Problemen: Disable caching temporarily.

## Zeitschätzung
- Cache Layer: 25 Minuten
- Query Optimization: 20 Minuten
- Next.js Config: 15 Minuten
- Component Optimization: 15 Minuten
- Edge Caching: 15 Minuten
- Testing: 20 Minuten
- Total: 110 Minuten