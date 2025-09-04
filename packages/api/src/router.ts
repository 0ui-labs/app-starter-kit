import { os } from "@orpc/server";
import { z } from "zod";

export const router = os.router({
  healthCheck: os
    .output(z.object({ status: z.string() }))
    .handler(async () => {
      return { status: "ok" };
    }),
});

export type AppRouter = typeof router;

