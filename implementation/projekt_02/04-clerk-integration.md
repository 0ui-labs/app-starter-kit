# Arbeitspaket 04: Vollständige Clerk Authentication Integration

## Ziel
Implementierung einer vollständigen Clerk Authentication mit Protected Routes, User Management und Session Handling.

## Problem
- Clerk Dependencies sind installiert aber nicht konfiguriert
- Keine Authentication Middleware
- Keine Protected Routes
- Kein User Context für die Anwendung

## Kontext
- **Auth Provider**: Clerk (SaaS Authentication Service)
- **Framework**: Next.js 15 App Router  
- **Package**: `@starter-kit/auth`
- **Dependencies**: @clerk/nextjs bereits installiert

## Implementierung

### Schritt 1: Update Root Layout mit ClerkProvider
Update `apps/web/src/app/layout.tsx`:

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'App Starter Kit',
  description: 'Production-ready Next.js application',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#3b82f6', // blue-500
          colorBackground: '#ffffff',
          colorText: '#000000',
          colorInputBackground: '#ffffff',
          colorInputText: '#000000',
        },
        elements: {
          formButtonPrimary: 'bg-blue-500 hover:bg-blue-600 text-white',
          card: 'shadow-lg',
          headerTitle: 'text-2xl font-bold',
          headerSubtitle: 'text-gray-600',
        },
      }}
    >
      <html lang="de" suppressHydrationWarning>
        <body className={inter.className}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
```

### Schritt 2: Middleware für Protected Routes
Erstelle `apps/web/src/middleware.ts`:

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Define public routes
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/api/health',
]);

// Define admin routes
const isAdminRoute = createRouteMatcher([
  '/admin(.*)',
  '/api/admin(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  // Redirect logged in users away from auth pages
  const { userId } = await auth();
  
  if (userId && (req.nextUrl.pathname.startsWith('/sign-in') || req.nextUrl.pathname.startsWith('/sign-up'))) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  
  // Protect non-public routes
  if (!isPublicRoute(req)) {
    await auth.protect();
    
    // Check admin access for admin routes
    if (isAdminRoute(req)) {
      const { has } = await auth();
      const hasAdminRole = await has({ role: 'admin' });
      
      if (!hasAdminRole) {
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
    }
  }
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

### Schritt 3: Auth Package Implementation
Update `packages/auth/index.ts`:

```typescript
import { auth, currentUser } from '@clerk/nextjs/server';

// Re-export Clerk server utilities
export { auth, currentUser };

// Type definitions
export interface AuthUser {
  id: string;
  email: string | undefined;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  imageUrl: string;
  createdAt: Date;
}

// Get current user with additional data
export async function getCurrentUser(): Promise<AuthUser | null> {
  const user = await currentUser();
  
  if (!user) {
    return null;
  }
  
  return {
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
    imageUrl: user.imageUrl,
    createdAt: new Date(user.createdAt),
  };
}

// Check if user has specific role
export async function hasRole(role: string): Promise<boolean> {
  const { has } = await auth();
  return has({ role });
}

// Check if user has specific permission
export async function hasPermission(permission: string): Promise<boolean> {
  const { has } = await auth();
  return has({ permission });
}

// Require authentication (throws if not authenticated)
export async function requireAuth(): Promise<string> {
  const { userId } = await auth();
  
  if (!userId) {
    throw new Error('Unauthorized: Authentication required');
  }
  
  return userId;
}

// Require specific role (throws if not authorized)
export async function requireRole(role: string): Promise<string> {
  const userId = await requireAuth();
  const authorized = await hasRole(role);
  
  if (!authorized) {
    throw new Error(`Unauthorized: Missing role '${role}'`);
  }
  
  return userId;
}

// Require specific permission (throws if not authorized)
export async function requirePermission(permission: string): Promise<string> {
  const userId = await requireAuth();
  const { has } = await auth();
  const authorized = await has({ permission });
  
  if (!authorized) {
    throw new Error(`Unauthorized: Missing permission '${permission}'`);
  }
  
  return userId;
}
```

### Schritt 4: Auth Components
Erstelle `apps/web/src/components/auth/user-button.tsx`:

```typescript
'use client';

import { UserButton as ClerkUserButton } from '@clerk/nextjs';

export function UserButton() {
  return (
    <ClerkUserButton
      appearance={{
        elements: {
          avatarBox: 'h-10 w-10',
          userButtonTrigger: 'focus:shadow-md',
          userButtonPopoverCard: 'shadow-lg',
        },
      }}
      afterSignOutUrl="/"
    />
  );
}
```

Erstelle `apps/web/src/components/auth/sign-in-button.tsx`:

```typescript
'use client';

import { SignInButton as ClerkSignInButton } from '@clerk/nextjs';
import { Button } from '@starter-kit/ui';

interface SignInButtonProps {
  mode?: 'redirect' | 'modal';
  children?: React.ReactNode;
}

export function SignInButton({ mode = 'modal', children }: SignInButtonProps) {
  return (
    <ClerkSignInButton mode={mode}>
      {children || <Button>Anmelden</Button>}
    </ClerkSignInButton>
  );
}
```

Erstelle `apps/web/src/components/auth/sign-out-button.tsx`:

```typescript
'use client';

import { SignOutButton as ClerkSignOutButton } from '@clerk/nextjs';
import { Button } from '@starter-kit/ui';

interface SignOutButtonProps {
  children?: React.ReactNode;
}

export function SignOutButton({ children }: SignOutButtonProps) {
  return (
    <ClerkSignOutButton>
      {children || <Button variant="outline">Abmelden</Button>}
    </ClerkSignOutButton>
  );
}
```

### Schritt 5: Auth Pages
Erstelle `apps/web/src/app/sign-in/[[...sign-in]]/page.tsx`:

```typescript
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <SignIn 
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'shadow-2xl',
          },
        }}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        afterSignInUrl="/dashboard"
      />
    </div>
  );
}
```

Erstelle `apps/web/src/app/sign-up/[[...sign-up]]/page.tsx`:

```typescript
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <SignUp 
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'shadow-2xl',
          },
        }}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        afterSignUpUrl="/dashboard"
      />
    </div>
  );
}
```

### Schritt 6: Protected Dashboard
Erstelle `apps/web/src/app/dashboard/page.tsx`:

```typescript
import { getCurrentUser } from '@starter-kit/auth';
import { UserButton } from '@/components/auth/user-button';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  
  // This shouldn't happen due to middleware, but just in case
  if (!user) {
    redirect('/sign-in');
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <UserButton />
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Willkommen, {user.fullName}!
          </h2>
          <div className="space-y-2 text-gray-600">
            <p>Email: {user.email}</p>
            <p>User ID: {user.id}</p>
            <p>Mitglied seit: {user.createdAt.toLocaleDateString('de-DE')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Schritt 7: Unauthorized Page
Erstelle `apps/web/src/app/unauthorized/page.tsx`:

```typescript
import Link from 'next/link';
import { Button } from '@starter-kit/ui';

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">403</h1>
        <p className="text-xl text-gray-600 mb-8">
          Sie haben keine Berechtigung für diese Seite.
        </p>
        <Link href="/dashboard">
          <Button>Zurück zum Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
```

### Schritt 8: Update Homepage mit Auth Status
Update `apps/web/src/app/page.tsx`:

```typescript
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { Button } from '@starter-kit/ui';
import { SignInButton } from '@/components/auth/sign-in-button';
import { UserButton } from '@/components/auth/user-button';

export default async function HomePage() {
  const { userId } = await auth();
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="container mx-auto px-4 py-8">
        <nav className="flex justify-between items-center mb-16">
          <h1 className="text-2xl font-bold">App Starter Kit</h1>
          <div className="flex gap-4 items-center">
            {userId ? (
              <>
                <Link href="/dashboard">
                  <Button variant="outline">Dashboard</Button>
                </Link>
                <UserButton />
              </>
            ) : (
              <>
                <SignInButton mode="redirect" />
                <Link href="/sign-up">
                  <Button variant="outline">Registrieren</Button>
                </Link>
              </>
            )}
          </div>
        </nav>
        
        <div className="max-w-3xl mx-auto text-center py-20">
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            Willkommen zum App Starter Kit
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Eine produktionsreife Next.js Application mit Clerk Authentication
          </p>
          {!userId && (
            <SignInButton mode="redirect">
              <Button size="lg">Jetzt starten</Button>
            </SignInButton>
          )}
        </div>
      </div>
    </div>
  );
}
```

## Verifizierung

### Test 1: Public Route Access
```bash
# Ohne Anmeldung erreichbar
curl http://localhost:3004/
# Status 200
```

### Test 2: Protected Route Redirect
```bash
# Ohne Anmeldung -> Redirect zu Sign In
curl -I http://localhost:3004/dashboard
# Status 307 mit Location Header
```

### Test 3: Sign Up Flow
1. Navigate zu `/sign-up`
2. Registriere neuen User
3. Automatischer Redirect zu `/dashboard`
4. User Info wird angezeigt

### Test 4: Sign Out Flow  
1. Click auf UserButton im Dashboard
2. Sign Out wählen
3. Redirect zur Homepage
4. Dashboard nicht mehr erreichbar

### Test 5: Admin Route Protection
1. Versuche `/admin` ohne Admin-Rolle aufzurufen
2. Redirect zu `/unauthorized`

## Erfolgskriterien
- [ ] ClerkProvider ist in layout.tsx konfiguriert
- [ ] Middleware schützt Routes korrekt
- [ ] Sign In/Up Pages funktionieren
- [ ] Dashboard zeigt User Informationen
- [ ] UserButton funktioniert mit Logout
- [ ] Auth Package exportiert Utilities
- [ ] Role-based Access Control funktioniert
- [ ] Unauthorized Page wird angezeigt

## Potentielle Probleme

### Problem: Clerk Keys nicht gesetzt
**Lösung**: Prüfe `.env.local`:
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

### Problem: Middleware Infinite Redirect
**Lösung**: 
- Stelle sicher dass Sign-In/Up Routes im `isPublicRoute` Matcher sind
- Prüfe ob der `matcher` in `config` korrekt ist

### Problem: TypeScript Errors bei auth()
**Lösung**: 
```typescript
// Korrekte Verwendung in Server Components
const { userId, has } = await auth();

// In Middleware
await auth.protect(); // Nicht auth().protect()
```

### Problem: Hydration Mismatch
**Lösung**: 
- Nutze 'use client' directive für Client Components
- Server Components nicht in Client Components wrappen

## Environment Variables Setup
```bash
# .env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

## Rollback Plan
1. Entferne `middleware.ts`
2. Entferne ClerkProvider aus `layout.tsx`
3. Lösche Auth Pages (`/sign-in`, `/sign-up`, `/dashboard`, `/unauthorized`)
4. App funktioniert wieder ohne Auth

## Zeitschätzung
- Clerk Provider Setup: 10 Minuten
- Middleware Implementation: 15 Minuten
- Auth Package: 15 Minuten
- Components: 15 Minuten
- Pages: 20 Minuten
- Testing: 15 Minuten
- **Total: 90 Minuten**

## Nächste Schritte
Nach erfolgreicher Implementation:
1. User Profile Page hinzufügen
2. Organization Support aktivieren
3. Webhook Handler für User Events
4. Session Management optimieren
5. Multi-Factor Authentication aktivieren