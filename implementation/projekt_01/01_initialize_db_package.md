# Task 1: `db`-Paket initialisieren

## 🎯 Ziel

Das `db`-Paket lauffähig machen, indem wir ein Beispiel-Datenbankmodell definieren und den Prisma-Client für andere Pakete zugänglich machen.

## 📝 Kontext

Gemäß der `WARP.md` ist das `packages/db`-Verzeichnis für das Prisma-Schema und den Client zuständig. Aktuell ist das Schema leer und das Paket exportiert nichts, was zu Build-Fehlern im Monorepo führt. Diese Aufgabe behebt das Problem, indem sie ein `User`-Modell als Beispiel hinzufügt und eine `index.ts` erstellt, die eine Instanz des Prisma-Clients exportiert.

## 🛠️ Implementierung

### 1. Prisma-Schema erweitern

Füge das `User`-Modell zur folgenden Datei hinzu.

**Datei:** `packages/db/prisma/schema.prisma`

```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

// Looking for ways to speed up your queries, or scale easily with your serverless or edge functions?
// Try Prisma Accelerate: https://pris.ly/cli/accelerate-init

generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    String @id @default(cuid())
  email String @unique
  name  String?
}
```

### 2. Prisma-Client exportieren

Erstelle die folgende Datei, um den Prisma-Client aus dem Paket zu exportieren.

**Datei:** `packages/db/index.ts`

```typescript
import { PrismaClient } from "./generated/prisma";

export const db = new PrismaClient();

export * from "./generated/prisma";
```

## ✅ Verifizierung

Nachdem die Änderungen angewendet wurden, führe den folgenden Befehl im Root-Verzeichnis des Projekts aus, um den Prisma-Client neu zu generieren:

```bash
npx prisma generate --schema=./packages/db/prisma/schema.prisma
```

Der Befehl sollte erfolgreich durchlaufen und die neuen Typen im `packages/db/generated/prisma`-Ordner erstellen. Dies bestätigt, dass das Schema valide ist und das Paket korrekt konfiguriert ist.

