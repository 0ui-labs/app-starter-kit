# Arbeitspaket 01: PrismaClient Singleton Pattern

## Ziel
Implementierung eines Singleton Patterns für PrismaClient um Connection Pool Exhaustion zu verhindern und Performance zu optimieren.

## Problem
Aktuell wird bei jedem Import von `@starter-kit/db` eine neue PrismaClient Instanz erstellt, was zu:
- Connection Pool Exhaustion führen kann
- Memory Leaks in Development (Hot Reload)
- Schlechter Performance in Production

## Kontext
- **Datei**: `packages/db/index.ts`
- **Aktueller Code**: `export const db = new PrismaClient();`
- **Package**: `@starter-kit/db`
- **Dependencies**: Prisma 6.1.0
- **Basiert auf**: [Offizielle Prisma Next.js Best Practices](https://www.prisma.io/docs/orm/more/help-and-troubleshooting/nextjs-help)

## Implementierung

### Schritt 1: Singleton Pattern implementieren
Ersetze den Inhalt von `packages/db/index.ts` mit:

```typescript
import { PrismaClient } from '@prisma/client';

// Turbopack-kompatibles Singleton Pattern für PrismaClient
// Nutzt globalThis mit speziellem Key für Turbopack Compatibility
declare global {
  // Turbopack nutzt module caching anders - braucht eindeutigen namespace
  var __prisma_client__: PrismaClient | undefined;
  var __prisma_client_dev_initialized__: boolean | undefined;
}

// Funktion zur Erstellung des Clients mit Turbopack-Detection
function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn'] 
      : ['error'],
  });

  // Turbopack HMR Detection
  if (process.env.NODE_ENV === 'development') {
    // Registriere cleanup bei HMR
    if (typeof window === 'undefined' && !globalThis.__prisma_client_dev_initialized__) {
      globalThis.__prisma_client_dev_initialized__ = true;
      
      // Cleanup handler für Turbopack HMR
      process.on('beforeExit', async () => {
        await client.$disconnect();
      });
    }
  }

  return client;
}

// Export Singleton mit Turbopack-safe Pattern
export const db = globalThis.__prisma_client__ ?? createPrismaClient();

// Store in global nur in Development
if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma_client__ = db;
}

// Re-export Prisma Client types für Type Safety
export * from '@prisma/client';
```

### Alternative: Mit Custom Generated Client Path
Falls du einen custom output path für den generierten Prisma Client verwendest:

```typescript
import { PrismaClient } from './generated/prisma';

const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

export * from './generated/prisma';
```

## Verifizierung

### Test 1: Singleton Verifizierung
Erstelle `packages/db/singleton.test.ts`:

```typescript
import { db as db1 } from './index';
import { db as db2 } from './index';

test('PrismaClient should be singleton', () => {
  expect(db1).toBe(db2);
});
```

### Test 2: Basic Query Test
```bash
# In Terminal ausführen (Prisma verbindet automatisch bei erster Query)
cd packages/db
npx tsx -e "import { db } from './index'; db.$queryRaw\`SELECT 1\`.then(() => console.log('✅ Database connection works'));"
```

### Test 3: Development Hot Reload Test
1. Starte den Development Server: `npm run dev`
2. Ändere eine Datei und speichere
3. Prüfe in den Logs, dass keine neuen PrismaClient Instanzen erstellt werden
4. Prüfe Memory Usage in den Dev Tools

## Erfolgskriterien
- [ ] Nur eine PrismaClient Instanz existiert global
- [ ] Hot Reload in Development funktioniert ohne Memory Leaks
- [ ] Logging ist environment-abhängig konfiguriert
- [ ] Database Queries funktionieren korrekt
- [ ] Types werden korrekt exportiert

## Wichtige Hinweise
- **Keine explizite Connection nötig**: Prisma verbindet automatisch bei der ersten Query (lazy connection)
- **Kein manuelles Disconnect**: Next.js/Serverless Umgebungen handhaben das automatisch
- **Turbopack-Kompatibilität**: Diese Implementation ist speziell für Turbopack optimiert
  - Nutzt eindeutige Global Keys (`__prisma_client__`)
  - HMR Cleanup Handler verhindert Memory Leaks
  - Funktioniert mit Next.js 15 Development Server (Turbopack)

## Potentielle Probleme
- **DATABASE_URL nicht gesetzt**: Stelle sicher dass `.env` vorhanden ist
- **TypeScript Errors bei global**: Nutze `unknown` cast für global object
- **Import Paths**: 
  - Standard: `from '@prisma/client'`
  - Custom output: `from './generated/prisma'`

## Rollback Plan
Falls Probleme auftreten, zurück zu:
```typescript
import { PrismaClient } from '@prisma/client';
export const db = new PrismaClient();
```

## Zeitschätzung
- Implementation: 10 Minuten
- Testing: 5 Minuten
- Total: 15 Minuten