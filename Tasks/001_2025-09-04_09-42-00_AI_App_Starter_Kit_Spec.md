# Technische Spezifikation: AI App Starter Kit

**ID:** 001
**Timestamp:** 2025-09-04_09-42-00
**Titel:** AI App Starter Kit
**Status:** Definiert

## 1. Projektziel

Das Ziel ist die Erstellung eines modernen, hochperformanten und robusten App-Starter-Kits. Die Architektur soll als **modularer Monolith** konzipiert sein, optimiert für die Entwicklung mit KI-Coding-Agenten (z.B. Gemini, Claude). Jede Funktionalität muss maximal gekapselt sein, um den "Blast Radius" von Code-Änderungen zu minimieren und es einem KI-Agenten zu ermöglichen, an isolierten Features zu arbeiten, ohne die gesamte Codebase verstehen zu müssen.

## 2. Kernprinzipien

- **LLM-Freundliche Architektur:** Klare, isolierte Module (Packages) mit expliziten Schnittstellen.
- **Minimierter "Blast Radius":** Änderungen in einem Modul dürfen keine unerwarteten Seiteneffekte in anderen Modulen haben.
- **Strikte Typsicherheit:** End-to-End-Typsicherheit ist nicht verhandelbar.
- **Modularität vor DRY:** Leichte Code-Duplikation wird in Kauf genommen, wenn sie die Entkopplung verbessert.

## 3. High-Level Architektur: Monorepo

Das Projekt wird als Monorepo unter Verwendung von **Turborepo** aufgebaut.

### Verzeichnisstruktur

```
/
├── apps/
│   └── web/
├── packages/
│   ├── ui/
│   ├── db/
│   ├── auth/
│   ├── api/
│   ├── ai-adapter/
│   └── agentic-workflows/
├── .env.example          # **NEU** Beispiel für Umgebungsvariablen
├── WARP.md               # **NEU** Anweisungen für KI-Agenten
├── README.md             # **NEU** Setup-Anleitung für menschliche Entwickler
├── package.json
├── tsconfig.json
└── turborepo.json
```

## 4. Detaillierter Technologie-Stack
(Dieser Abschnitt bleibt unverändert)

| Bereich | Technologie | Konfiguration & Begründung |
| :--- | :--- | :--- |
| **Monorepo** | **Turborepo** | Zur Orchestrierung von Tasks, Caching und Abhängigkeiten zwischen den Paketen. |
| **Framework**| **Next.js (App Router)** | Als Host für die Web-App und die oRPC API-Routen. Bietet optimale Performance durch Server Components. |
| **UI** | **React & Tailwind CSS**| Für die Erstellung des User Interfaces. |
| **Komponenten**| **Shadcn/UI** | Komponenten werden direkt in das `packages/ui` Paket als Quellcode integriert, um maximale Anpassbarkeit (auch durch LLMs) zu gewährleisten. |
| **API** | **oRPC** | Stellt typsichere API-Prozeduren bereit und generiert automatisch eine OpenAPI-Spezifikation für Sprachunabhängigkeit. Die Routen werden in der Next.js App gehostet. |
| **Datenbank** | **PostgreSQL (Neon)** | Als Standard-Datenbank. |
| **ORM** | **Prisma** | Als ORM für End-to-End-Typsicherheit von der Datenbank bis zum Frontend. Das Schema (`schema.prisma`) wird in `packages/db` liegen. |
| **Authentifizierung**| **Clerk** | Für Benutzerverwaltung, Login (Social Logins, Magic Link) und Session-Management. Bietet eine tiefe Next.js-Integration. |
| **AI-Integration**| **Vercel AI SDK & LangChain.js** | Vercel AI SDK für UI-Streaming. LangChain.js für die Implementierung komplexer, agentischer Workflows im `packages/agentic-workflows`.|

## 5. Initiale Implementierungs-Aufgaben
(Dieser Abschnitt bleibt unverändert)

---

## 6. **(NEU)** Onboarding & Setup

### 6.1. Ziel: "One-Click" Setup

Ein Entwickler (oder ein KI-Agent) soll das Repository klonen und mit einem einzigen Befehl startklar machen können.

### 6.2. `.env.example`

Eine `.env.example`-Datei muss im Root-Verzeichnis erstellt werden. Sie listet alle benötigten Umgebungsvariablen auf und enthält Platzhalter und Kommentare, die deren Zweck erklären.

**Beispielinhalt:**
```
# Clerk API Keys (erhältlich unter https://dashboard.clerk.com)
# Siehe README.md für eine detaillierte Anleitung.
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Datenbank Verbindungs-String (z.B. von Neon oder lokaler Docker-Instanz)
# Siehe README.md für Details.
DATABASE_URL="postgresql://..."

# OpenAI API Key (optional, für AI-Funktionen)
OPENAI_API_KEY="sk-..."
```

### 6.3. `README.md` (Anleitung für Menschen)

Die `README.md` wird die zentrale Anlaufstelle für menschliche Entwickler. Sie muss enthalten:
- Eine klare Schritt-für-Schritt-Anleitung, wie man die benötigten API-Schlüssel (insbesondere von Clerk und Neon) erhält.
- Den Befehl, um das Projekt zu starten (`npm run setup` oder ähnlich).
- Eine kurze Erklärung der Projektstruktur.

### 6.4. Setup-Skript

In der root `package.json` wird ein `setup`-Skript definiert, das folgende Aktionen ausführt:
1.  `npm install` (oder `pnpm install`) im Root.
2.  Prüft, ob `.env` existiert. Wenn nicht, wird `.env.example` nach `.env` kopiert und eine Warnung ausgegeben, dass die Datei befüllt werden muss.
3.  `prisma generate` im `db`-Paket, um den Prisma-Client zu erstellen.

---

## 7. **(NEU)** Agent-Anweisungen (Inhalt für WARP.md)

Die `WARP.md`-Datei wird als permanenter System-Prompt für KI-Agenten dienen.

### 7.1. Allgemeine Befehle

- **build:** `npm run build`
- **dev:** `npm run dev`
- **lint:** `npm run lint`
- **test:** `npm run test`

### 7.2. Entwicklungs-Workflows (Regeln für den Agenten)

Dieser Abschnitt ist der wichtigste und muss explizite Regeln enthalten.

**Regel 1: Hinzufügen eines neuen Features (z.B. "Blog")**
1.  **Isolation:** Erstelle immer ein neues, gekapseltes Paket unter `packages/blog`.
2.  **Schnittstellen:** Definiere die API-Logik im `api`-Paket. Erstelle `blog.ts` und definiere dort deine oRPC-Prozeduren.
3.  **UI:** Erstelle wiederverwendbare UI-Komponenten im `ui`-Paket (oder in einem neuen `packages/blog-ui`, falls sie sehr spezifisch sind).
4.  **Integration:** Nutze die API und die UI-Komponenten in der `apps/web`-Anwendung, um die finale Seite zusammenzubauen.
5.  **Verbot:** Du darfst **niemals** direkt auf die `db` oder `auth` Pakete aus einem Feature-Paket wie `blog` zugreifen. Der Zugriff darf nur über die im `api`-Paket definierten Prozeduren erfolgen.

**Regel 2: Ändern einer Datenbank-Tabelle**
1.  **Schema First:** Modifiziere ausschließlich die `schema.prisma`-Datei im `packages/db`-Paket.
2.  **Migration:** Führe den Befehl `npx prisma migrate dev --name <dein-migrations-name>` aus, um eine neue Migration zu erstellen.
3.  **Client generieren:** Führe `npx prisma generate` aus.
4.  **API anpassen:** Passe die API-Prozeduren in `packages/api` an, die von der Schema-Änderung betroffen sind. Der TypeScript-Compiler wird dir hier Fehler anzeigen.

**Regel 3: Arbeiten mit der UI**
- Alle neuen, wiederverwendbaren Komponenten müssen im `packages/ui` Paket erstellt und von dort exportiert werden.
- Shadcn/UI-Komponenten werden mit dem CLI-Befehl direkt in das `packages/ui` Paket installiert.

