# AI App Starter Kit

This is a modern, high-performance, and robust app starter kit, optimized for development with AI coding agents. It's built as a modular monolith using a Turborepo, designed for maximum encapsulation and a minimal "blast radius" for changes.

## Core Principles

- **LLM-Friendly Architecture:** Clear, isolated modules (packages) with explicit interfaces.
- **Strict Typesafety:** End-to-end typesafety is non-negotiable.
- **Modularity over DRY:** Prioritizing module decoupling, even if it means some code duplication.

## Getting Started

### 1. Environment Setup

This project requires API keys and environment variables to run. Keys for services like Clerk and your database are essential.

- Copy the example environment file:
  ```bash
  cp .env.example .env
  ```
- **Fill in the variables:** Open the newly created `.env` file and add your actual keys. You can get them from the respective services:
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` & `CLERK_SECRET_KEY`: [Clerk Dashboard](https://dashboard.clerk.com)
  - `DATABASE_URL`: Your PostgreSQL connection string (e.g., from [Neon](https://neon.tech)).
  - `OPENAI_API_KEY`: (Optional) From [OpenAI](https://platform.openai.com/api-keys).

### 2. Install Dependencies

This command will install all necessary dependencies for all workspaces.

```bash
npm install
```

### 3. Setup the Project

This command prepares the database and other necessary components.

```bash
npm run setup
```

### 4. Run the Development Server

You can now start the development server.

```bash
npm run dev
```

## Project Structure

The repository is a monorepo managed by Turborepo, with the following structure:

- `apps/web`: The main Next.js application, containing the frontend and API routes.
- `packages/*`: A collection of shared, isolated modules:
  - `ui`: Shared React components (built with Shadcn/UI).
  - `db`: Prisma schema, client, and migrations.
  - `auth`: Configuration and helpers for Clerk.
  - `api`: oRPC API definitions and procedures.
  - `ai-adapter`: Abstraction layer for AI providers (OpenAI, Anthropic, etc.).
  - `agentic-workflows`: Framework integration for LangChain.js, etc.
