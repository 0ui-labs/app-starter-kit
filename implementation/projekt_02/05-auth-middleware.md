# Arbeitspaket 10: Authentication Middleware & Protected Routes

## Ziel
Implementierung einer vollständigen Authentication Middleware mit Protected Routes, Session Management, Permissions System und Security Headers für Next.js App Router.

## Problem  
- Keine systematische Route Protection
- Fehlende Permission Checks
- Keine Session Management
- Fehlende Security Headers
- Keine CSRF Protection
- Fehlende Auth Guards für API Routes

## Kontext
- **Framework**: Next.js 15 App Router
- **Auth Provider**: Clerk
- **Middleware**: Next.js Edge Runtime
- **Package**: `@starter-kit/auth`
- **Security**: OWASP Best Practices

## Vorbereitung: Clerk Dashboard Konfiguration

### Session Token Setup
1. Gehe zu [Clerk Dashboard > Sessions](https://dashboard.clerk.com/last-active?path=sessions)
2. Unter **Customize session token** > **Claims**, füge folgendes JSON hinzu:
```json
{
  "metadata": "{{user.public_metadata}}"
}
```
3. Speichere die Änderungen

### User Metadata Setup
1. Gehe zu [Clerk Dashboard > Users](https://dashboard.clerk.com/last-active?path=users)
2. Wähle deinen User Account
3. Unter **User metadata** > **Public**, füge hinzu:
```json
{
  "role": "admin",
  "permissions": []
}
```

## Implementierung

### Schritt 1: TypeScript Global Definitions
Erstelle `types/globals.d.ts`:

```typescript
export {}

// Create types for roles and permissions
export type Roles = 'user' | 'moderator' | 'admin';
export type Permission = string;

declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      role?: Roles;
      permissions?: Permission[];
    }
  }
}
```

### Schritt 2: Enhanced Middleware Configuration
Update `apps/web/src/middleware.ts`:

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

// Route Matchers
const publicRoutes = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/pricing',
  '/features',
  '/blog(.*)',
  '/api/webhooks(.*)',
  '/api/health',
]);

const authRoutes = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
]);

const apiRoutes = createRouteMatcher([
  '/api(.*)',
]);

const adminRoutes = createRouteMatcher([
  '/admin(.*)',
  '/api/admin(.*)',
]);

const moderatorRoutes = createRouteMatcher([
  '/moderate(.*)',
  '/api/moderate(.*)',
]);

// Security Headers
const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

// Content Security Policy - angepasst für Clerk
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com;
  style-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev;
  img-src 'self' blob: data: https: https://*.clerk.accounts.dev https://*.clerk.com;
  font-src 'self' data: https://*.clerk.accounts.dev;
  connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com wss://*.clerk.accounts.dev;
  frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self' https://*.clerk.accounts.dev;
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\\n/g, ' ').trim();

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const { userId, sessionClaims } = await auth();
  const response = NextResponse.next();

  // Add security headers
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  // Add CSP header for production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Content-Security-Policy', cspHeader);
  }

  // Handle auth routes (sign-in/sign-up)
  if (authRoutes(req)) {
    if (userId) {
      const afterSignInUrl = '/dashboard';
      return NextResponse.redirect(new URL(afterSignInUrl, req.url));
    }
    return response;
  }

  // Handle public routes
  if (publicRoutes(req)) {
    return response;
  }

  // Require authentication for all other routes
  if (!userId) {
    // Store the attempted URL for redirect after sign-in
    const signInUrl = new URL('/sign-in', req.url);
    signInUrl.searchParams.set('redirect_url', req.url);
    return NextResponse.redirect(signInUrl);
  }

  // Check admin routes
  if (adminRoutes(req)) {
    const isAdmin = sessionClaims?.metadata?.role === 'admin';
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/unauthorized', req.url));
    }
  }

  // Check moderator routes
  if (moderatorRoutes(req)) {
    const isModerator = sessionClaims?.metadata?.role === 'moderator' || 
                       sessionClaims?.metadata?.role === 'admin';
    if (!isModerator) {
      return NextResponse.redirect(new URL('/unauthorized', req.url));
    }
  }

  // Rate limiting for API routes
  if (apiRoutes(req)) {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    response.headers.set('X-RateLimit-IP', ip);
    
    // Add API version header
    response.headers.set('X-API-Version', '1.0.0');
  }

  // Session refresh hint
  const sessionAge = sessionClaims?.iat ? Date.now() / 1000 - sessionClaims.iat : 0;
  if (sessionAge > 3600) { // 1 hour
    response.headers.set('X-Session-Refresh', 'true');
  }

  return response;
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
```

### Schritt 3: Auth Package Enhancement
Update `packages/auth/index.ts`:

```typescript
import { auth, currentUser, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { Roles, Permission } from '@/types/globals';

// Types
export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
  role: Roles;
  permissions: Permission[];
  metadata?: Record<string, any>;
}

export interface Session {
  user: AuthUser;
  expires: Date;
  isActive: boolean;
}

// Cached user fetching
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const user = await currentUser();
  
  if (!user) {
    return null;
  }
  
  const role = (user.publicMetadata?.role as Roles) || 'user';
  const permissions = (user.publicMetadata?.permissions as Permission[]) || [];
  
  return {
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress || '',
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
    image: user.imageUrl,
    role,
    permissions,
    metadata: user.publicMetadata,
  };
});

// Get session
export const getSession = cache(async (): Promise<Session | null> => {
  const { sessionId, sessionClaims } = await auth();
  const user = await getAuthUser();
  
  if (!sessionId || !user) {
    return null;
  }
  
  return {
    user,
    expires: new Date(sessionClaims?.exp ? sessionClaims.exp * 1000 : Date.now()),
    isActive: true,
  };
});

// Auth guards
export async function requireAuth(redirectTo?: string) {
  const user = await getAuthUser();
  
  if (!user) {
    redirect(redirectTo || '/sign-in');
  }
  
  return user;
}

export async function requireRole(
  role: 'admin' | 'moderator',
  redirectTo?: string
) {
  const user = await requireAuth(redirectTo);
  
  if (role === 'admin' && user.role !== 'admin') {
    redirect('/unauthorized');
  }
  
  if (role === 'moderator' && !['admin', 'moderator'].includes(user.role)) {
    redirect('/unauthorized');
  }
  
  return user;
}

export async function requirePermission(
  permission: string,
  redirectTo?: string
) {
  const user = await requireAuth(redirectTo);
  
  if (!user.permissions.includes(permission) && user.role !== 'admin') {
    redirect('/unauthorized');
  }
  
  return user;
}

// Check functions (don't redirect)
export async function hasRole(role: 'admin' | 'moderator'): Promise<boolean> {
  const user = await getAuthUser();
  
  if (!user) return false;
  
  if (role === 'admin') return user.role === 'admin';
  if (role === 'moderator') return ['admin', 'moderator'].includes(user.role);
  
  return false;
}

export async function hasPermission(permission: string): Promise<boolean> {
  const user = await getAuthUser();
  
  if (!user) return false;
  
  return user.permissions.includes(permission) || user.role === 'admin';
}

export async function hasAnyPermission(permissions: string[]): Promise<boolean> {
  const user = await getAuthUser();
  
  if (!user) return false;
  if (user.role === 'admin') return true;
  
  return permissions.some(p => user.permissions.includes(p));
}

export async function hasAllPermissions(permissions: string[]): Promise<boolean> {
  const user = await getAuthUser();
  
  if (!user) return false;
  if (user.role === 'admin') return true;
  
  return permissions.every(p => user.permissions.includes(p));
}

// Permission constants
export const PERMISSIONS = {
  // User management
  USER_VIEW: 'user:view',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  
  // Post management
  POST_VIEW: 'post:view',
  POST_CREATE: 'post:create',
  POST_UPDATE: 'post:update',
  POST_DELETE: 'post:delete',
  POST_PUBLISH: 'post:publish',
  
  // Comment management
  COMMENT_VIEW: 'comment:view',
  COMMENT_CREATE: 'comment:create',
  COMMENT_UPDATE: 'comment:update',
  COMMENT_DELETE: 'comment:delete',
  COMMENT_MODERATE: 'comment:moderate',
  
  // Admin
  ADMIN_ACCESS: 'admin:access',
  ADMIN_SETTINGS: 'admin:settings',
  ADMIN_ANALYTICS: 'admin:analytics',
} as const;

// Re-export Clerk functions
export { auth, currentUser, clerkClient };

// Re-export types
export type { Roles, Permission };
```

### Schritt 4: Protected Page Wrapper
Erstelle `apps/web/src/components/auth/protected-page.tsx`:

```typescript
import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { 
  requireAuth, 
  requireRole, 
  requirePermission,
  hasAllPermissions,
  hasAnyPermission,
  type AuthUser 
} from '@starter-kit/auth';

interface ProtectedPageProps {
  children: ReactNode | ((user: AuthUser) => ReactNode);
  role?: 'admin' | 'moderator';
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  fallback?: ReactNode;
  redirectTo?: string;
}

export async function ProtectedPage({
  children,
  role,
  permission,
  permissions,
  requireAll = false,
  fallback,
  redirectTo,
}: ProtectedPageProps) {
  let user: AuthUser;
  
  try {
    if (role) {
      user = await requireRole(role, redirectTo);
    } else if (permission) {
      user = await requirePermission(permission, redirectTo);
    } else if (permissions && permissions.length > 0) {
      user = await requireAuth(redirectTo);
      
      const hasPerms = requireAll
        ? await hasAllPermissions(permissions)
        : await hasAnyPermission(permissions);
      
      if (!hasPerms) {
        if (fallback) return <>{fallback}</>;
        redirect('/unauthorized');
      }
    } else {
      user = await requireAuth(redirectTo);
    }
    
    return <>{typeof children === 'function' ? children(user) : children}</>;
  } catch (error) {
    if (fallback) return <>{fallback}</>;
    throw error;
  }
}
```

### Schritt 5: API Route Protection
Erstelle `apps/web/src/lib/api-auth.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { 
  getAuthUser, 
  hasRole, 
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  type AuthUser 
} from '@starter-kit/auth';

interface APIAuthOptions {
  requireAuth?: boolean;
  role?: 'admin' | 'moderator';
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
}

export async function withAPIAuth(
  handler: (req: NextRequest, user?: AuthUser) => Promise<NextResponse>,
  options: APIAuthOptions = {}
) {
  return async (req: NextRequest) => {
    try {
      const user = await getAuthUser();
      
      // Check authentication
      if (options.requireAuth !== false && !user) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      
      // Check role
      if (options.role && user) {
        const hasRequiredRole = await hasRole(options.role);
        if (!hasRequiredRole) {
          return NextResponse.json(
            { error: 'Insufficient permissions' },
            { status: 403 }
          );
        }
      }
      
      // Check single permission
      if (options.permission && user) {
        const hasRequiredPermission = await hasPermission(options.permission);
        if (!hasRequiredPermission) {
          return NextResponse.json(
            { error: 'Missing required permission' },
            { status: 403 }
          );
        }
      }
      
      // Check multiple permissions
      if (options.permissions && options.permissions.length > 0 && user) {
        const hasPerms = options.requireAll
          ? await hasAllPermissions(options.permissions)
          : await hasAnyPermission(options.permissions);
        
        if (!hasPerms) {
          return NextResponse.json(
            { error: 'Missing required permissions' },
            { status: 403 }
          );
        }
      }
      
      return handler(req, user || undefined);
    } catch (error) {
      console.error('API Auth Error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

// CSRF Protection for mutations
export function withCSRFProtection(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) {
      const origin = req.headers.get('origin');
      const host = req.headers.get('host');
      
      if (process.env.NODE_ENV === 'production') {
        if (!origin || !host || new URL(origin).host !== host) {
          return NextResponse.json(
            { error: 'CSRF validation failed' },
            { status: 403 }
          );
        }
      }
    }
    
    return handler(req);
  };
}
```

### Schritt 6: Usage Examples
Erstelle `apps/web/src/app/examples/auth-examples.tsx`:

```typescript
// Protected Page Example
import { ProtectedPage } from '@/components/auth/protected-page';
import { PERMISSIONS } from '@starter-kit/auth';

export default async function AdminDashboard() {
  return (
    <ProtectedPage role="admin">
      {(user) => (
        <div>
          <h1>Admin Dashboard</h1>
          <p>Welcome, {user.name}!</p>
          <p>Role: {user.role}</p>
        </div>
      )}
    </ProtectedPage>
  );
}

// Protected API Route Example
import { NextRequest, NextResponse } from 'next/server';
import { withAPIAuth, withCSRFProtection } from '@/lib/api-auth';
import { PERMISSIONS } from '@starter-kit/auth';

export const POST = withCSRFProtection(
  withAPIAuth(
    async (req: NextRequest, user) => {
      // user is guaranteed to be authenticated and have admin role
      const data = await req.json();
      
      // Your API logic here
      console.log('Admin user:', user);
      
      return NextResponse.json({ success: true });
    },
    { role: 'admin' }
  )
);

// Conditional Rendering Example
import { hasRole, hasPermission } from '@starter-kit/auth';

export default async function ConditionalComponent() {
  const isAdmin = await hasRole('admin');
  const canEdit = await hasPermission(PERMISSIONS.POST_UPDATE);
  
  return (
    <div>
      {isAdmin && <AdminPanel />}
      {canEdit && <EditButton />}
    </div>
  );
}

// Client Component with Auth Check
'use client';
import { useAuth } from '@clerk/nextjs';

export function ClientAuthComponent() {
  const { isLoaded, userId, sessionId } = useAuth();
  
  if (!isLoaded) return <div>Loading...</div>;
  if (!userId) return <div>Please sign in</div>;
  
  return <div>Authenticated: {userId}</div>;
}
```

### Schritt 7: Unauthorized Page
Erstelle `apps/web/src/app/unauthorized/page.tsx`:

```typescript
import Link from 'next/link';
import { Button } from '@starter-kit/ui';
import { getAuthUser } from '@starter-kit/auth';

export default async function UnauthorizedPage() {
  const user = await getAuthUser();
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100">
            <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            Zugriff verweigert
          </h1>
          
          <p className="mt-2 text-gray-600">
            Sie haben keine Berechtigung, auf diese Seite zuzugreifen.
          </p>
          
          {user && (
            <p className="mt-4 text-sm text-gray-500">
              Angemeldet als: {user.email}
              <br />
              Rolle: {user.role}
            </p>
          )}
          
          <div className="mt-6 space-y-2">
            <Link href="/dashboard" className="block">
              <Button className="w-full">
                Zum Dashboard
              </Button>
            </Link>
            <Link href="/" className="block">
              <Button variant="outline" className="w-full">
                Zur Startseite
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Schritt 8: Admin Role Management (Optional)
Erstelle `apps/web/src/app/admin/_actions.ts`:

```typescript
'use server';

import { clerkClient } from '@clerk/nextjs/server';
import { hasRole } from '@starter-kit/auth';

export async function setUserRole(userId: string, role: string) {
  // Check that the current user is an admin
  const isAdmin = await hasRole('admin');
  if (!isAdmin) {
    throw new Error('Unauthorized');
  }

  const client = await clerkClient();
  
  try {
    const res = await client.users.updateUserMetadata(userId, {
      publicMetadata: { role },
    });
    return { success: true, metadata: res.publicMetadata };
  } catch (err) {
    console.error('Failed to set role:', err);
    throw new Error('Failed to update user role');
  }
}

export async function setUserPermissions(userId: string, permissions: string[]) {
  const isAdmin = await hasRole('admin');
  if (!isAdmin) {
    throw new Error('Unauthorized');
  }

  const client = await clerkClient();
  
  try {
    const res = await client.users.updateUserMetadata(userId, {
      publicMetadata: { permissions },
    });
    return { success: true, metadata: res.publicMetadata };
  } catch (err) {
    console.error('Failed to set permissions:', err);
    throw new Error('Failed to update user permissions');
  }
}
```

## Verifizierung

### Test 1: Route Protection
```bash
# Ohne Auth
curl http://localhost:3004/dashboard
# Should redirect to /sign-in

# Mit Auth
# Should show dashboard
```

### Test 2: Role-based Access
```typescript
// Als User
await requireRole('admin'); // Should redirect to /unauthorized

// Als Admin
await requireRole('admin'); // Should return user
```

### Test 3: Permission Checks
```typescript
const canEdit = await hasPermission(PERMISSIONS.POST_UPDATE);
// Should return true/false based on user permissions
```

### Test 4: API Protection
```bash
# Without auth
curl -X POST http://localhost:3004/api/admin/users
# Should return 401

# With auth but wrong role
curl -X POST http://localhost:3004/api/admin/users -H "Authorization: Bearer USER_TOKEN"
# Should return 403
```

### Test 5: Security Headers
```bash
curl -I http://localhost:3004
# Should show security headers (X-Frame-Options, CSP, etc.)
```

## Erfolgskriterien
- [ ] Clerk Dashboard konfiguriert (Session Token & User Metadata)
- [ ] TypeScript Definitions erstellt
- [ ] Middleware schützt alle Routes
- [ ] Role-based Access Control funktioniert
- [ ] Permission System implementiert
- [ ] Security Headers gesetzt
- [ ] CSRF Protection aktiv
- [ ] API Routes geschützt
- [ ] Unauthorized Page vorhanden
- [ ] Session Management funktioniert
- [ ] Auth Guards verwendbar
- [ ] Client/Server Components unterstützt

## Potentielle Probleme

### Problem: Infinite Redirect Loop
**Lösung**: Check middleware matcher config und publicRoutes

### Problem: Session Claims nicht verfügbar
**Lösung**: 
1. Stelle sicher dass Session Token im Clerk Dashboard konfiguriert ist
2. User Metadata muss im Clerk Dashboard gesetzt sein
3. Cache leeren und neu anmelden

### Problem: TypeScript Errors
**Lösung**: Stelle sicher dass `types/globals.d.ts` korrekt erstellt und in `tsconfig.json` inkludiert ist

### Problem: CSP blockiert Clerk
**Lösung**: CSP-Header anpassen um alle Clerk-Domains zu erlauben

## Rollback Plan
Bei Problemen: 
1. Entferne middleware.ts 
2. Nutze basic Clerk auth ohne custom roles
3. Verwende Clerk Organizations für erweiterte Permissions

## Zeitschätzung
- Clerk Dashboard Config: 10 Minuten
- TypeScript Setup: 5 Minuten  
- Middleware Setup: 25 Minuten
- Auth Package: 20 Minuten
- Protected Components: 15 Minuten
- API Protection: 15 Minuten
- Testing: 20 Minuten
- Total: 110 Minuten