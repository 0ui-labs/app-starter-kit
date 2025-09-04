# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Install dependencies**: `npm install`
**Setup project**: `npm run setup` (creates .env from example and runs Prisma migrations)
**Development server**: `npm run dev` (runs on port 3004)
**Build**: `npm run build`
**Lint**: `npm run lint`
**Tests**: `npm run test`

## Environment Variables

Required environment variables (copy `.env.example` to `.env`):
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk authentication public key
- `CLERK_SECRET_KEY`: Clerk authentication secret key
- `DATABASE_URL`: PostgreSQL connection string (e.g., from Neon)
- `OPENAI_API_KEY`: Optional, for AI features

## Architecture

This is a Turborepo monorepo with modular architecture designed for AI-assisted development. Each package is isolated with explicit interfaces.

### Workspace Structure

**Apps:**
- `apps/web`: Next.js 15 application with App Router, uses Turbopack for development

**Packages:**
- `@starter-kit/ui`: Shared React components (shadcn/ui based) - ✅ Functional with Button component
- `@starter-kit/db`: Prisma schema and generated client (PostgreSQL)
- `@starter-kit/auth`: Clerk authentication configuration
- `@starter-kit/api`: oRPC API definitions and procedures
- `@starter-kit/ai-adapter`: AI provider abstraction layer
- `@starter-kit/agentic-workflows`: Framework for AI agent integrations

### Technology Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript with strict type safety
- **API**: oRPC for type-safe API procedures
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Clerk
- **Styling**: Tailwind CSS v4
- **Testing**: Vitest with React Testing Library
- **Package Management**: npm workspaces with Turborepo

### Key Patterns

**Modular Monolith**: Packages are isolated modules with clear boundaries. Each package exports from its `index.ts` file.

**Database**: Prisma client is generated in `packages/db/generated/prisma/`. Run migrations with `npx prisma migrate dev`.

**API Router**: oRPC router defined in `packages/api/src/router.ts`, provides type-safe procedures with Zod validation.

**Type Safety**: End-to-end type safety from database through API to frontend. All packages use TypeScript.

### Development Workflow

1. Changes to Prisma schema require running migrations: `npx prisma migrate dev`
2. Turborepo handles build dependencies automatically
3. Each package has its own `lint` script, orchestrated by root `npm run lint`
4. Tests use Vitest with jsdom environment

## Completed Implementation Tasks

### ✅ Task 2: UI Package Setup (04.09.2025)
Successfully implemented the `@starter-kit/ui` package with:
- **Button.tsx Component**: Fully typed React component with forwardRef support
  - TypeScript interface extending HTMLButtonElement attributes
  - Tailwind CSS styling with hover and disabled states
  - Proper display name for React DevTools
- **index.ts Export**: Main entry point with "use client" directive for Next.js
- **Verification**: Build and lint checks pass without errors
- **Usage**: Components can be imported via `import { Button } from "@starter-kit/ui"`