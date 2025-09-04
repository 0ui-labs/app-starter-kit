
# Implementierungsplan: Vom kaputten zum robusten Starter-Kit

## Phase 1: Fundament stabilisieren

- [x] **1. `db`-Paket initialisieren:** Ein `User`-Modell hinzufügen und den Prisma-Client exportieren. ✅ (2025-09-04)
- [x] **2. `ui`-Paket mit einer Komponente füllen:** Eine `Button.tsx` erstellen und exportieren. ✅ (2025-09-04)
- [x] **3. `api`-Paket zum Leben erwecken:** Eine `healthCheck`-Prozedur definieren. ✅ (2025-09-04)
- [x] **4. Restliche Pakete stubben:** Leere `index.ts`-Dateien in `auth`, `ai-adapter`, und `agentic-workflows` erstellen. ✅ (2025-09-04)

## Phase 2: Architekturfehler beheben

- [x] **5. Abhängigkeitsfehler in `apps/web` korrigieren:** `@prisma/client` entfernen. ✅ (2025-09-04)
- [x] **6. UI-Komponente in der Web-App integrieren:** Den `Button` auf der Startseite verwenden. ✅ (2025-09-04)

## Phase 3: Testinfrastruktur aufbauen

- [x] **7. Test-Framework installieren und konfigurieren:** `vitest` und `jsdom` hinzufügen. ✅ (2025-09-04)
- [x] **8. Ersten UI-Test schreiben:** Die `Button`-Komponente testen. ✅ (2025-09-04)
- [x] **9. Test-Skript hinzufügen und finale Überprüfung:** `npm test` einrichten und alle Checks ausführen. ✅ (2025-09-04)

