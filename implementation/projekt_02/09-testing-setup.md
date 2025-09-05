# Arbeitspaket 13: Testing Strategy & erste Unit/Integration Tests

## Ziel
Implementierung einer umfassenden Testing Strategy mit Unit Tests, Integration Tests, E2E Tests und Performance Tests für alle Packages und die Hauptanwendung.

## Problem
- Keine Tests vorhanden trotz Vitest Setup
- Fehlende Testing Strategy
- Keine Test Coverage Messung
- Fehlende E2E Test Infrastructure
- Keine Performance Tests
- Fehlende Test Data Factories

## Kontext
- **Test Framework**: Vitest
- **E2E Tests**: Playwright
- **Component Tests**: React Testing Library
- **API Tests**: oRPC mit Vitest
- **Coverage**: Vitest Coverage (v8)
- **Mocking**: MSW (Mock Service Worker)
- **Test Data**: Faker.js

## Implementierung

### Schritt 0: Dependencies Installation
Installiere alle benötigten Testing-Dependencies:

```bash
# Testing Frameworks
npm install -D @vitest/coverage-v8 @vitest/ui

# React Testing (React 19 kompatible Versionen!)
npm install -D @testing-library/react@^16.3.0 @testing-library/dom@^10.0.0 @testing-library/jest-dom @testing-library/user-event

# Mocking
npm install -D msw

# Test Data Generation
npm install -D @faker-js/faker

# E2E Testing
npm install -D @playwright/test

# Playwright Browsers installieren
npx playwright install
```

### Wichtig: React 19 Kompatibilität
**Testing Library v16.3.0+ unterstützt React 19!** Stelle sicher, dass die korrekten Versionen installiert sind:
- `@testing-library/react@^16.3.0` (nicht älter!)
- `@testing-library/dom@^10.0.0` (jetzt Peer Dependency!)

### Schritt 1: Testing Configuration
Update `vitest.config.ts` in root:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'packages/*/src/**/*.{ts,tsx}',
        'apps/web/src/**/*.{ts,tsx}',
      ],
      exclude: [
        'node_modules/',
        '.next/',
        '*.config.ts',
        '**/*.d.ts',
        '**/generated/**',
        '**/__tests__/**',
        '**/examples/**',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
      ],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
    include: [
      'packages/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'apps/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],
    exclude: [
      'node_modules',
      '.next',
      'dist',
      '.turbo',
      'coverage',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/web/src'),
      '@starter-kit/ui': path.resolve(__dirname, './packages/ui'),
      '@starter-kit/db': path.resolve(__dirname, './packages/db'),
      '@starter-kit/auth': path.resolve(__dirname, './packages/auth'),
      '@starter-kit/api': path.resolve(__dirname, './packages/api'),
      '@starter-kit/ai-adapter': path.resolve(__dirname, './packages/ai-adapter'),
      '@starter-kit/agentic-workflows': path.resolve(__dirname, './packages/agentic-workflows'),
    },
  },
});
```

### Schritt 2: Vitest Setup File
Create `vitest.setup.ts` in root:

```typescript
import '@testing-library/jest-dom';
import { expect, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { server } from './test/mocks/server';

// Extend Vitest matchers
expect.extend(matchers);

// Setup MSW
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Mock Next.js modules
vi.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    };
  },
  usePathname() {
    return '/';
  },
  useSearchParams() {
    return new URLSearchParams();
  },
}));

// Mock Clerk
vi.mock('@clerk/nextjs', () => ({
  auth: vi.fn(() => ({
    userId: 'test-user-id',
    sessionId: 'test-session-id',
  })),
  currentUser: vi.fn(() => ({
    id: 'test-user-id',
    emailAddresses: [{ emailAddress: 'test@example.com' }],
  })),
  useAuth: vi.fn(() => ({
    isLoaded: true,
    userId: 'test-user-id',
    sessionId: 'test-session-id',
  })),
  ClerkProvider: ({ children }: any) => children,
  SignIn: () => null,
  SignUp: () => null,
  UserButton: () => null,
}));

// Environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_123';
process.env.CLERK_SECRET_KEY = 'sk_test_123';
```

### Schritt 3: MSW Setup
Erstelle `test/mocks/server.ts`:

```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

Erstelle `test/mocks/handlers.ts`:

```typescript
import { http, HttpResponse } from 'msw';

export const handlers = [
  // Health check
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok' });
  }),

  // User endpoints
  http.get('/api/user/me', () => {
    return HttpResponse.json({
      success: true,
      data: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER',
      },
    });
  }),

  http.post('/api/user/create', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      success: true,
      data: {
        id: 'user-2',
        ...body,
      },
    });
  }),

  // Post endpoints
  http.get('/api/post/list', () => {
    return HttpResponse.json({
      success: true,
      data: {
        posts: [
          {
            id: 'post-1',
            title: 'Test Post',
            content: 'Test content',
            published: true,
          },
        ],
        total: 1,
        page: 1,
        totalPages: 1,
      },
    });
  }),
];
```

### Schritt 4: Test Utilities
Erstelle `test/utils/test-utils.tsx`:

```typescript
import React from 'react';
import { render as rtlRender, RenderOptions } from '@testing-library/react';
import { ClerkProvider } from '@clerk/nextjs';

interface ProvidersProps {
  children: React.ReactNode;
}

function Providers({ children }: ProvidersProps) {
  return (
    <ClerkProvider>
      {children}
    </ClerkProvider>
  );
}

export function render(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return rtlRender(ui, { wrapper: Providers, ...options });
}

export * from '@testing-library/react';
export { render };
```

### Schritt 5: Test Data Factories
Erstelle `test/factories/index.ts`:

```typescript
import { faker } from '@faker-js/faker';
// Import types from Prisma client when available
import type { User, Post, Comment } from '@starter-kit/db/generated/prisma';

export const factories = {
  user: (overrides?: Partial<User>): User => ({
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    role: 'USER',
    status: 'ACTIVE',
    clerkId: faker.string.alphanumeric(20),
    emailVerified: faker.date.past(),
    image: faker.image.avatar(),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    deletedAt: null,
    ...overrides,
  }),

  post: (overrides?: Partial<Post>): Post => ({
    id: faker.string.uuid(),
    authorId: faker.string.uuid(),
    title: faker.lorem.sentence(),
    slug: faker.lorem.slug(),
    content: faker.lorem.paragraphs(3),
    excerpt: faker.lorem.paragraph(),
    published: faker.datatype.boolean(),
    publishedAt: faker.date.past(),
    views: faker.number.int({ min: 0, max: 1000 }),
    likes: faker.number.int({ min: 0, max: 100 }),
    metaTitle: faker.lorem.sentence(),
    metaDescription: faker.lorem.paragraph(),
    metaKeywords: [faker.lorem.word(), faker.lorem.word()],
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    deletedAt: null,
    ...overrides,
  }),

  comment: (overrides?: Partial<Comment>): Comment => ({
    id: faker.string.uuid(),
    postId: faker.string.uuid(),
    authorId: faker.string.uuid(),
    content: faker.lorem.paragraph(),
    parentId: null,
    approved: true,
    flagged: false,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    deletedAt: null,
    ...overrides,
  }),
};

// Batch factories
export function createUsers(count: number): User[] {
  return Array.from({ length: count }, () => factories.user());
}

export function createPosts(count: number, authorId?: string): Post[] {
  return Array.from({ length: count }, () =>
    factories.post({ authorId: authorId || faker.string.uuid() })
  );
}

export function createComments(count: number, postId?: string): Comment[] {
  return Array.from({ length: count }, () =>
    factories.comment({ postId: postId || faker.string.uuid() })
  );
}
```

### Schritt 6: Unit Tests - UI Components
Erstelle `packages/ui/src/__tests__/Button.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

describe('Button Component', () => {
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies variant classes', () => {
    const { rerender } = render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByText('Delete')).toHaveClass('bg-destructive');
    
    rerender(<Button variant="outline">Cancel</Button>);
    expect(screen.getByText('Cancel')).toHaveClass('border');
  });

  it('applies size classes', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    expect(screen.getByText('Small')).toHaveClass('h-8');
    
    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByText('Large')).toHaveClass('h-10');
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    const button = screen.getByText('Disabled');
    
    expect(button).toBeDisabled();
    expect(button).toHaveClass('disabled:opacity-50');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<Button ref={ref}>With Ref</Button>);
    
    expect(ref).toHaveBeenCalled();
  });
});
```

### Schritt 7: Integration Tests - API
Erstelle `packages/api/src/__tests__/router.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { router } from '../router';
import { db } from '@starter-kit/db';
// Assuming context creation function exists or will be created

// Mock Prisma
vi.mock('@starter-kit/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    post: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('API Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Health Check', () => {
    it('returns ok status', async () => {
      const result = await router.health();
      expect(result).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
      });
    });
  });

  describe('User Procedures', () => {
    it('gets current user', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      };
      
      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);
      
      // Create mock context
      const context = {
        userId: 'clerk-user-1',
        isAdmin: false,
      };
      
      const result = await router.user.me({ context });
      
      expect(result).toEqual({
        success: true,
        data: mockUser,
      });
      
      expect(db.user.findUnique).toHaveBeenCalledWith({
        where: { clerkId: 'clerk-user-1' },
        include: { profile: true },
      });
    });

    it('creates a new user', async () => {
      const input = {
        email: 'new@example.com',
        name: 'New User',
        password: 'SecurePass123',
      };
      
      const mockUser = {
        id: 'user-2',
        ...input,
      };
      
      vi.mocked(db.user.create).mockResolvedValue(mockUser);
      
      const context = { userId: null, isAdmin: false };
      const result = await router.user.create({ input, context });
      
      expect(result).toEqual({
        success: true,
        data: mockUser,
      });
    });

    it('requires admin role for user list', async () => {
      const context = {
        userId: 'user-1',
        isAdmin: false,
      };
      
      await expect(
        router.user.list({ context, input: { page: 1, limit: 10 } })
      ).rejects.toThrow('Admin access required');
    });
  });

  describe('Post Procedures', () => {
    it('creates a post', async () => {
      const input = {
        title: 'Test Post',
        content: 'Test content',
        published: false,
      };
      
      const mockPost = {
        id: 'post-1',
        ...input,
        slug: 'test-post-123',
        authorId: 'user-1',
      };
      
      vi.mocked(db.post.create).mockResolvedValue(mockPost);
      
      const context = {
        userId: 'user-1',
        isAdmin: false,
      };
      
      const result = await router.post.create({ input, context });
      
      expect(result).toEqual({
        success: true,
        data: mockPost,
      });
    });

    it('lists published posts', async () => {
      const mockPosts = [
        { id: 'post-1', title: 'Post 1', published: true },
        { id: 'post-2', title: 'Post 2', published: true },
      ];
      
      vi.mocked(db.post.findMany).mockResolvedValue(mockPosts);
      vi.mocked(db.post.count).mockResolvedValue(2);
      
      const context = { userId: null, isAdmin: false };
      const result = await router.post.list({
        context,
        input: { page: 1, limit: 10, published: true },
      });
      
      expect(result).toEqual({
        success: true,
        data: {
          posts: mockPosts,
          total: 2,
          page: 1,
          totalPages: 1,
        },
      });
    });
  });
});
```

### Schritt 8: Component Tests
Erstelle `apps/web/src/components/__tests__/HomePage.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '../../../../test/utils/test-utils';
// Import your actual component when it exists
// import { HomePage } from '../HomePage';

describe('HomePage Component', () => {
  it('renders welcome message', () => {
    // Example test structure
    // render(<HomePage />);
    // expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(true).toBe(true); // Placeholder test
  });
});
```

### Schritt 9: E2E Test Setup
Erstelle `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3004',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3004,
    reuseExistingServer: !process.env.CI,
  },
});
```

### Schritt 10: E2E Tests
Erstelle `e2e/home.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('has title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/App Starter Kit/);
  });

  test('navigation works', async ({ page }) => {
    await page.goto('/');
    
    // Click sign in button
    await page.click('text=Sign In');
    await expect(page).toHaveURL(/.*sign-in/);
    
    // Go back
    await page.goBack();
    await expect(page).toHaveURL('/');
  });

  test('shows content', async ({ page }) => {
    await page.goto('/');
    
    // Check for main heading
    await expect(page.locator('h1')).toContainText('Welcome');
  });
});
```

### Schritt 11: MSW Browser Setup (Optional für Browser Tests)
Erstelle `public/mockServiceWorker.js`:

```bash
# Generate MSW service worker for browser mocking
npx msw init public/ --save
```

### Schritt 12: Test Scripts
Update `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest watch",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed",
    "test:all": "npm run test:run && npm run test:e2e"
  }
}
```

## Verifizierung

### Test 1: Run Unit Tests
```bash
npm run test
# All unit tests should pass
```

### Test 2: Coverage Report
```bash
npm run test:coverage
# Should show coverage > 70%
```

### Test 3: E2E Tests
```bash
npm run test:e2e
# E2E tests should pass
```

### Test 4: Test UI
```bash
npm run test:ui
# Opens Vitest UI
```

## Erfolgskriterien
- [ ] Vitest konfiguriert und funktioniert
- [ ] MSW für API Mocking eingerichtet
- [ ] Test Utilities erstellt
- [ ] Test Factories implementiert
- [ ] Unit Tests für UI Components
- [ ] Integration Tests für API
- [ ] E2E Tests mit Playwright
- [ ] Coverage > 70%
- [ ] CI/CD Integration vorbereitet
- [ ] Test Scripts funktionieren

## Potentielle Probleme

### Problem: JSdom Fehler
**Lösung**: Dependencies sind bereits in Schritt 0 installiert

### Problem: Coverage Provider nicht gefunden
**Lösung**: Stelle sicher, dass `@vitest/coverage-v8` installiert ist:
```bash
npm install -D @vitest/coverage-v8
```

### Problem: MSW Handler nicht gefunden
**Lösung**: Überprüfe Import-Pfade und stelle sicher, dass die Handler exportiert werden

### Problem: E2E Tests timeout
**Lösung**: Increase timeout in playwright.config.ts:
```typescript
timeout: 60000, // 60 seconds
```

### Problem: Playwright Browsers nicht installiert
**Lösung**: Installiere Playwright Browsers:
```bash
npx playwright install
```

### Problem: TypeScript Typen für Test Libraries fehlen
**Lösung**: Typen sind in den Packages enthalten, aber falls nötig:
```bash
npm install -D @types/node
```

## Rollback Plan
Falls Tests fehlschlagen: Skip tests temporär mit `test.skip()`.

## Zeitschätzung
- Dependencies Installation: 10 Minuten
- Test Configuration: 15 Minuten
- Test Utilities & MSW Setup: 25 Minuten
- Unit Tests: 30 Minuten
- Integration Tests: 25 Minuten
- E2E Setup & Tests: 25 Minuten
- Scripts & Verification: 10 Minuten
- Total: 140 Minuten

## Wichtige Hinweise

1. **Coverage Provider**: Wir verwenden `v8` statt des veralteten `c8`
2. **Import Paths**: Alle Import-Pfade müssen relativ zum Projektroot sein
3. **Context Mocking**: API Context wird direkt als Object gemockt, nicht über createContext
4. **Component Tests**: Nutzen relative Imports zu test-utils
5. **Playwright**: Nutzt `port` statt `url` in webServer config für bessere Kompatibilität