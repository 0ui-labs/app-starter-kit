# Task 3: `api`-Paket zum Leben erwecken

## 🎯 Ziel

Das `@starter-kit/api`-Paket funktionsfähig machen, indem wir eine erste `healthCheck`-Prozedur mit `oRPC` definieren. Dies etabliert das grundlegende Muster für das Hinzufügen aller zukünftigen API-Endpunkte.

## 📝 Kontext

Laut `WARP.md` ist `packages/api` die einzige Schicht, die mit der Datenbank und Authentifizierungsdiensten interagieren darf. Aktuell ist dieses Paket leer. Wir führen eine einfache `healthCheck`-Prozedur ein, die keine Abhängigkeiten hat, um die grundlegende Funktionsweise der API-Schicht zu validieren. Dies stellt sicher, dass das Paket korrekt konfiguriert ist und von `apps/web` konsumiert werden kann, bevor komplexere, datenbankabhängige Prozeduren hinzugefügt werden.

## 🛠️ Implementierung

### 1. `oRPC`-Router erstellen

Erstelle die folgende Datei. Sie initialisiert den `oRPC`-Router und definiert die erste Prozedur.

**Datei:** `packages/api/src/router.ts`

```typescript
import { orpc } from "orpc";
import { z } from "zod";

export const router = orpc.router({
  healthCheck: orpc.procedure.output(z.object({ status: z.string() })).query(() => {
    return { status: "ok" };
  }),
});

export type AppRouter = typeof router;
```

### 2. Router aus dem Paket exportieren

Erstelle die `index.ts`-Datei, um den Router und seinen Typ aus dem Paket zu exportieren.

**Datei:** `packages/api/index.ts`

```typescript
export * from "./src/router";
```

## ✅ Verifizierung

Führe nach dem Anwenden der Änderungen den Build-Befehl im Root-Verzeichnis aus:

```bash
npm run build
```

Der Build sollte erfolgreich sein und keine Fehler bezüglich des `@starter-kit/api`-Pakets aufweisen. Dies bestätigt, dass die `oRPC`-Definitionen korrekt sind und das Paket richtig strukturiert ist, um in der Web-App verwendet zu werden.

