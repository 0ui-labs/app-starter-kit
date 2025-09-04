import { os } from "@orpc/server";
import { z } from "zod";

// Health check procedure
export const healthCheck = os
  .output(z.object({ status: z.string() }))
  .handler(async () => {
    return { status: "ok" };
  });

// App router with all procedures
export const appRouter = {
  healthCheck,
};

export type AppRouter = typeof appRouter;

