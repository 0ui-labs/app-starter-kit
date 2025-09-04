# Task 5: Abhängigkeitsfehler in `apps/web` korrigieren

## 🎯 Ziel

Die Architektur des Projekts in Einklang mit den Regeln aus `WARP.md` bringen, indem die direkte Abhängigkeit des `web`-Pakets vom `@prisma/client` entfernt wird.

## 📝 Kontext

Die `WARP.md` schreibt vor, dass **ausschließlich** das `packages/api`-Paket auf die Datenbank zugreifen darf. Die aktuelle `package.json` der `web`-App enthält jedoch eine direkte Abhängigkeit zum Prisma-Client. Dies ist ein kritischer Architekturfehler, der es Entwicklern (oder KI-Agenten) ermöglichen würde, Datenbankabfragen direkt aus dem Frontend-Code zu schreiben, was zu Sicherheitslücken und Inkonsistenzen führen kann.

Diese Aufgabe behebt das Problem, indem der fehlerhafte Eintrag aus der `package.json` entfernt wird. Alle zukünftigen Datenbankinteraktionen müssen stattdessen über die Prozeduren im `api`-Paket erfolgen.

## 🛠️ Implementierung

### 1. Fehlerhafte Abhängigkeit entfernen

Bearbeite die `package.json` der Web-App und entferne die Zeile mit `@prisma/client`.

**Datei:** `apps/web/package.json`

**Zu suchendender und zu entfernender Block:**
```json
    "@clerk/nextjs": "^6.31.8",
    "@prisma/client": "^5.15.0",
    "next": "15.5.2",
```

**Ersetzen durch:**
```json
    "@clerk/nextjs": "^6.31.8",
    "next": "15.5.2",
```

## ✅ Verifizierung

Führe nach der Änderung die folgenden Befehle im Root-Verzeichnis aus:

1.  **Installation der Abhängigkeiten:**
    ```bash
    npm install
    ```
2.  **Projekt bauen:**
    ```bash
    npm run build
    ```

Beide Befehle müssen erfolgreich und ohne Fehler durchlaufen. Dies bestätigt, dass die Web-Anwendung keine direkte Abhängigkeit mehr zum Prisma-Client hat, aber immer noch korrekt gebaut werden kann.

