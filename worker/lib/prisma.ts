import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
// The schema lives in backend/prisma; run `npm run generate` in backend/ to create this client.
import { PrismaClient } from "../../backend/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add it to worker/.env");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export { prisma };
