# Arbeitspaket 08: Datenbank Schema Design & Migrations

## Ziel
Implementierung eines robusten Datenbank-Schemas mit Prisma für User Management, Content Management und Audit Logging mit PostgreSQL/Neon als Production Database.

## Problem
- Leeres Prisma Schema
- Keine Datenbank-Modelle definiert
- Fehlende Migration Strategy
- Keine Seed Data
- Keine Audit/Logging Tables
- Fehlende Indexes und Constraints

## Kontext
- **ORM**: Prisma 5.21.0 (Latest Stable)
- **Database**: PostgreSQL (Neon in Production)
- **Package**: `@starter-kit/db`
- **Schema Location**: `packages/db/prisma/schema.prisma`
- **Migrations**: `packages/db/prisma/migrations/`

## Implementierung

### Schritt 1: Vollständiges Prisma Schema
Update `packages/db/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Enums
enum UserRole {
  USER
  ADMIN
  MODERATOR
}

enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
  DELETED
}

enum AuditAction {
  CREATE
  UPDATE
  DELETE
  LOGIN
  LOGOUT
  PERMISSION_CHANGE
}

// User Management
model User {
  id              String      @id @default(uuid())
  email           String      @unique
  name            String?
  role            UserRole    @default(USER)
  status          UserStatus  @default(ACTIVE)
  emailVerified   DateTime?
  image           String?
  
  // Clerk Integration
  clerkId         String?     @unique
  
  // Profile
  profile         Profile?
  
  // Relations
  posts           Post[]
  comments        Comment[]
  sessions        Session[]
  auditLogs       AuditLog[]
  
  // Timestamps
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  deletedAt       DateTime?
  
  // Indexes
  @@index([email])
  @@index([clerkId])
  @@index([status])
  @@index([createdAt])
  @@map("users")
}

model Profile {
  id              String      @id @default(uuid())
  userId          String      @unique
  user            User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Profile Data
  bio             String?
  website         String?
  location        String?
  company         String?
  
  // Social Links
  twitter         String?
  github          String?
  linkedin        String?
  
  // Settings
  settings        Json        @default("{}")
  preferences     Json        @default("{}")
  
  // Timestamps
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  
  @@map("profiles")
}

// Session Management
model Session {
  id              String      @id @default(uuid())
  userId          String
  user            User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  token           String      @unique
  userAgent       String?
  ip              String?
  
  expiresAt       DateTime
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  
  @@index([userId])
  @@index([token])
  @@index([expiresAt])
  @@map("sessions")
}

// Content Management
model Post {
  id              String      @id @default(uuid())
  authorId        String
  author          User        @relation(fields: [authorId], references: [id], onDelete: Cascade)
  
  title           String
  slug            String      @unique
  content         String
  excerpt         String?
  
  published       Boolean     @default(false)
  publishedAt     DateTime?
  
  // SEO
  metaTitle       String?
  metaDescription String?
  metaKeywords    String[]
  
  // Relations
  tags            Tag[]
  comments        Comment[]
  
  // Stats
  views           Int         @default(0)
  likes           Int         @default(0)
  
  // Timestamps
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  deletedAt       DateTime?
  
  @@index([authorId])
  @@index([slug])
  @@index([published])
  @@index([publishedAt])
  @@index([createdAt])
  @@map("posts")
}

model Comment {
  id              String      @id @default(uuid())
  postId          String
  post            Post        @relation(fields: [postId], references: [id], onDelete: Cascade)
  authorId        String
  author          User        @relation(fields: [authorId], references: [id], onDelete: Cascade)
  
  content         String
  
  // Nested comments
  parentId        String?
  parent          Comment?    @relation("CommentReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies         Comment[]   @relation("CommentReplies")
  
  // Moderation
  approved        Boolean     @default(true)
  flagged         Boolean     @default(false)
  
  // Timestamps
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  deletedAt       DateTime?
  
  @@index([postId])
  @@index([authorId])
  @@index([parentId])
  @@index([approved])
  @@map("comments")
}

model Tag {
  id              String      @id @default(uuid())
  name            String      @unique
  slug            String      @unique
  description     String?
  
  posts           Post[]
  
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  
  @@index([slug])
  @@map("tags")
}

// Audit & Logging
model AuditLog {
  id              String      @id @default(uuid())
  userId          String?
  user            User?       @relation(fields: [userId], references: [id], onDelete: SetNull)
  
  action          AuditAction
  entity          String      // Table name
  entityId        String?     // Record ID
  
  oldValues       Json?
  newValues       Json?
  
  ip              String?
  userAgent       String?
  
  createdAt       DateTime    @default(now())
  
  @@index([userId])
  @@index([entity])
  @@index([entityId])
  @@index([action])
  @@index([createdAt])
  @@map("audit_logs")
}

// API Keys Management
model ApiKey {
  id              String      @id @default(uuid())
  name            String
  key             String      @unique
  
  // Permissions
  scopes          String[]    @default([])
  
  // Rate Limiting
  rateLimit       Int         @default(1000) // requests per hour
  
  // Usage
  lastUsedAt      DateTime?
  usageCount      Int         @default(0)
  
  // Validity
  expiresAt       DateTime?
  revokedAt       DateTime?
  
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  
  @@index([key])
  @@index([expiresAt])
  @@map("api_keys")
}

// Webhook Events
model WebhookEvent {
  id              String      @id @default(uuid())
  
  event           String
  payload         Json
  
  // Delivery
  url             String
  headers         Json?
  
  // Status
  delivered       Boolean     @default(false)
  attempts        Int         @default(0)
  lastAttemptAt   DateTime?
  deliveredAt     DateTime?
  
  // Error tracking
  lastError       String?
  
  createdAt       DateTime    @default(now())
  
  @@index([event])
  @@index([delivered])
  @@index([createdAt])
  @@map("webhook_events")
}
```

### Schritt 2: Database Client Extensions für Soft Delete
Erstelle `packages/db/src/client.ts`:

```typescript
import { PrismaClient } from '../generated/prisma';

// Create extended client with soft delete functionality
export const createPrismaClient = () => {
  const prisma = new PrismaClient().$extends({
    query: {
      // Soft delete for User model
      user: {
        async delete({ args, query }) {
          return query({
            ...args,
            data: { deletedAt: new Date() }
          });
        },
        async deleteMany({ args, query }) {
          return query({
            ...args,
            data: { deletedAt: new Date() }
          });
        },
        async findMany({ args, query }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findUnique({ args, query }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        }
      },
      // Soft delete for Post model
      post: {
        async delete({ args, query }) {
          return query({
            ...args,
            data: { deletedAt: new Date() }
          });
        },
        async deleteMany({ args, query }) {
          return query({
            ...args,
            data: { deletedAt: new Date() }
          });
        },
        async findMany({ args, query }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findUnique({ args, query }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        }
      },
      // Soft delete for Comment model
      comment: {
        async delete({ args, query }) {
          return query({
            ...args,
            data: { deletedAt: new Date() }
          });
        },
        async deleteMany({ args, query }) {
          return query({
            ...args,
            data: { deletedAt: new Date() }
          });
        },
        async findMany({ args, query }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findUnique({ args, query }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        }
      }
    }
  });

  return prisma;
};

export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;
```

### Schritt 3: Seed Data
Erstelle `packages/db/prisma/seed.ts`:

```typescript
import { PrismaClient, UserRole, UserStatus } from '../generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');
  
  // Create admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin User',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: new Date(),
      profile: {
        create: {
          bio: 'System Administrator',
          settings: {
            theme: 'dark',
            notifications: true,
          },
        },
      },
    },
  });
  
  console.log('✅ Admin user created:', adminUser.email);
  
  // Create test users
  const testUsers = await Promise.all(
    Array.from({ length: 5 }).map(async (_, i) => {
      return prisma.user.create({
        data: {
          email: `user${i + 1}@example.com`,
          name: `Test User ${i + 1}`,
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          profile: {
            create: {
              bio: `I am test user ${i + 1}`,
            },
          },
        },
      });
    })
  );
  
  console.log(`✅ ${testUsers.length} test users created`);
  
  // Create tags
  const tags = await Promise.all(
    ['Technology', 'Design', 'Business', 'Marketing', 'Development'].map(
      (name) =>
        prisma.tag.create({
          data: {
            name,
            slug: name.toLowerCase(),
            description: `Articles about ${name}`,
          },
        })
    )
  );
  
  console.log(`✅ ${tags.length} tags created`);
  
  // Create sample posts
  const posts = await Promise.all(
    testUsers.slice(0, 3).map(async (user, i) => {
      return prisma.post.create({
        data: {
          authorId: user.id,
          title: `Sample Post ${i + 1}`,
          slug: `sample-post-${i + 1}`,
          content: `This is the content of sample post ${i + 1}. It contains some interesting information.`,
          excerpt: `Excerpt for post ${i + 1}`,
          published: true,
          publishedAt: new Date(),
          tags: {
            connect: tags.slice(0, 2).map((tag) => ({ id: tag.id })),
          },
        },
      });
    })
  );
  
  console.log(`✅ ${posts.length} posts created`);
  
  // Create comments
  for (const post of posts) {
    const comment = await prisma.comment.create({
      data: {
        postId: post.id,
        authorId: testUsers[4].id,
        content: 'Great post! Thanks for sharing.',
        approved: true,
      },
    });
    
    // Create reply
    await prisma.comment.create({
      data: {
        postId: post.id,
        authorId: post.authorId,
        content: 'Thank you for your feedback!',
        parentId: comment.id,
        approved: true,
      },
    });
  }
  
  console.log('✅ Comments created');
  
  // Create API key
  const apiKey = await prisma.apiKey.create({
    data: {
      name: 'Default API Key',
      key: 'sk_test_' + Math.random().toString(36).substring(2, 15),
      scopes: ['read', 'write'],
      rateLimit: 1000,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    },
  });
  
  console.log('✅ API Key created:', apiKey.key);
  
  console.log('🎉 Seeding completed successfully');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### Schritt 4: Database Utilities
Erstelle `packages/db/src/utils.ts`:

```typescript
import { Prisma } from '../generated/prisma';

// Pagination helper
export interface PaginationParams {
  page?: number;
  limit?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
}

export function getPaginationParams(params: PaginationParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 10));
  const skip = (page - 1) * limit;
  
  return {
    skip,
    take: limit,
    orderBy: params.orderBy
      ? { [params.orderBy]: params.order || 'desc' }
      : { createdAt: 'desc' },
  };
}

// Audit log helper
import { AuditAction } from '../generated/prisma';

export async function createAuditLog(
  prisma: any,
  data: {
    userId?: string;
    action: AuditAction;
    entity: string;
    entityId?: string;
    oldValues?: any;
    newValues?: any;
    ip?: string;
    userAgent?: string;
  }
) {
  return prisma.auditLog.create({
    data: {
      userId: data.userId,
      action: data.action,
      entity: data.entity,
      entityId: data.entityId,
      oldValues: data.oldValues || null,
      newValues: data.newValues || null,
      ip: data.ip,
      userAgent: data.userAgent,
    },
  });
}
```

### Schritt 5: Export Configuration
Erstelle `packages/db/src/index.ts`:

```typescript
// Re-export Prisma Client and types
export * from '../generated/prisma';

// Export extended client
export { createPrismaClient } from './client';
export type { ExtendedPrismaClient } from './client';

// Export utilities
export * from './utils';
```

### Schritt 6: Update package.json
Update `packages/db/package.json`:

```json
{
  "name": "@starter-kit/db",
  "scripts": {
    "generate": "prisma generate",
    "migrate": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "migrate:reset": "prisma migrate reset",
    "seed": "tsx --transpile-only prisma/seed.ts",
    "studio": "prisma studio --browser none --port 5555",
    "format": "prisma format",
    "validate": "prisma validate"
  },
  "prisma": {
    "seed": "tsx --transpile-only prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.21.0"
  },
  "devDependencies": {
    "prisma": "^5.21.0",
    "@types/bcryptjs": "^2.4.6",
    "bcryptjs": "^2.4.3",
    "tsx": "^4.7.0",
    "dotenv": "^16.3.1"
  }
}
```

### Schritt 7: Initial Migration
Führe die initialen Migrations-Befehle direkt aus:

```bash
# Im packages/db Verzeichnis ausführen:

# 1. Prisma Client generieren
npm run generate

# 2. Initiale Migration erstellen
npx prisma migrate dev --name initial_schema

# 3. Seed Data einfügen
npm run seed
```

## Verifizierung

### Test 1: Schema Validation
```bash
cd packages/db
npm run validate
# Sollte ohne Errors durchlaufen
```

### Test 2: Migration
```bash
npm run migrate
# Sollte Migration erstellen und anwenden
```

### Test 3: Seed Data
```bash
npm run seed
# Sollte Test-Daten erstellen
```

### Test 4: Prisma Studio
```bash
npm run studio
# Sollte Prisma Studio öffnen mit allen Tables
```

### Test 5: Type Generation und Extended Client
```typescript
import { User, Post, Prisma } from '@starter-kit/db';
import { createPrismaClient } from '@starter-kit/db';

const prisma = createPrismaClient();
// Extended Client mit Soft Delete sollte funktionieren
```

## Erfolgskriterien
- [ ] Vollständiges Schema mit allen Models
- [ ] Relationen korrekt definiert mit Cascade Rules
- [ ] Indexes für Performance optimiert
- [ ] Soft Delete via Client Extensions implementiert
- [ ] Seed Data mit tsx funktioniert
- [ ] Migrations laufen durch
- [ ] Types werden generiert
- [ ] Extended Prisma Client exportiert
- [ ] Audit Logging vorbereitet
- [ ] Pagination Utilities vorhanden
- [ ] Prisma Studio auf Port 5555 funktioniert

## Potentielle Probleme

### Problem: DATABASE_URL nicht gesetzt
**Lösung**: 
```env
DATABASE_URL="postgresql://user:password@localhost:5432/starter_kit"
```

### Problem: Migration Conflicts
**Lösung**:
```bash
npm run migrate:reset
# Vorsicht: Löscht alle Daten!
```

### Problem: Type Generation Fehler
**Lösung**:
```bash
rm -rf generated/
npm run generate
```

## Rollback Plan
```bash
# Rollback zur letzten Migration
npx prisma migrate resolve --rolled-back

# Oder kompletter Reset
npm run migrate:reset
```

## Zeitschätzung
- Schema Design: 30 Minuten
- Client Extensions Setup: 20 Minuten
- Seed Data: 20 Minuten
- Utilities: 15 Minuten
- Testing: 15 Minuten
- Total: 100 Minuten