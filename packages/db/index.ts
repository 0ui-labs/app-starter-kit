import { PrismaClient } from "./generated/prisma";

export const db = new PrismaClient();

export * from "./generated/prisma";

