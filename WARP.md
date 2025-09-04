# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Common Commands

- **dev:** `npm run dev` (Starts the development server)
- **build:** `npm run build` (Builds all apps and packages)
- **lint:** `npm run lint` (Lints all apps and packages)
- **test:** `npm run test` (Runs all tests)

## Architecture Overview

This is a modular monolith built with Turborepo. All logic is separated into distinct packages under the `packages/` directory. The main web application in `apps/web` consumes these packages.

- `packages/api`: Contains all oRPC API definitions. **This is the ONLY way features should interact with the database or auth services.**
- `packages/db`: Contains the Prisma schema and client.
- `packages/ui`: Contains shared React components.
- `packages/auth`: Contains Clerk configuration.
- `packages/ai-adapter`: Contains the AI provider abstraction layer.
- `packages/agentic-workflows`: Contains LangChain/Vercel AI SDK integrations.

## Development Workflows (CRITICAL RULES)

### Rule 1: How to Add a New Feature (e.g., "Blog")

1.  **ISOLATE:** Start by creating a new, encapsulated package for your feature (e.g., `packages/blog`).
2.  **DEFINE API SURFACE:** Go to the `packages/api` directory. Create a new file (e.g., `blog.ts`) and define all necessary oRPC procedures there. These procedures are your contract for interacting with the database.
3.  **CREATE UI:** Create all new, reusable UI components inside the `packages/ui` package. They should be generic and not contain business logic.
4.  **INTEGRATE:** In the `apps/web` application, create the new pages (e.g., `/blog`, `/blog/[slug]`). Use the procedures defined in `packages/api` to fetch data and use the components from `packages/ui` to display it.
5.  **FORBIDDEN ACTION:** You MUST NOT directly import or use the `db` or `auth` packages from within your new feature package (`packages/blog`). All data and auth access MUST go through the `packages/api` procedures. This is critical to prevent unintended side effects.

### Rule 2: How to Change the Database Schema

1.  **SCHEMA FIRST:** NEVER change the database directly. Only modify the `schema.prisma` file located in the `packages/db` directory.
2.  **MIGRATE:** After saving your schema changes, run the following command to create a new migration file. Replace `<your-migration-name>` with a descriptive name (e.g., `add-post-title`).
    ```bash
    npx prisma migrate dev --name <your-migration-name>
    ```
3.  **GENERATE CLIENT:** The migration command should automatically generate the new Prisma client. If not, run `npx prisma generate`.
4.  **ADAPT API:** TypeScript will now show errors in the `packages/api` package where procedures are affected by your schema change. Adapt these procedures to match the new schema.

### Rule 3: How to Work with UI Components

- **CREATE:** All new, reusable components MUST be created inside the `packages/ui` directory.
- **USE:** Import components in `apps/web` using the `@/ui` alias (e.g., `import { Button } from '@/ui'`).
- **ADD SHADCN/UI:** To add a new component from Shadcn/UI, use its CLI and make sure to install it into the `packages/ui` directory.

