import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { deleteUserByEmail } from "./lib/delete-user-graph";

function dbHost(): string {
  const url = process.env.DATABASE_URL ?? "";
  const match = url.match(/@([^/]+)/);
  return match?.[1] ?? "unknown";
}

function client(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}

async function main() {
  const email = process.argv[2];
  const confirm = process.argv.includes("--confirm");
  if (!email) {
    console.error("Usage: npx tsx scripts/delete-user.ts <email> --confirm");
    process.exit(1);
  }
  if (!confirm) {
    console.error("Pass --confirm to delete this user and all athlete data.");
    process.exit(1);
  }

  console.log(`Database host: ${dbHost()}`);
  const db = client();

  try {
    const user = await deleteUserByEmail(db, email);
    if (!user) {
      console.error(`No user found: ${email}`);
      process.exit(1);
    }
    console.log(`Deleted user ${email} (id ${user.id}).`);
    if (user.athlete) {
      console.log(`Athlete ${user.athlete.id} and related data removed.`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
