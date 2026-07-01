import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

function dbHost(): string {
  const url = process.env.DATABASE_URL ?? "";
  const match = url.match(/@([^/]+)/);
  return match?.[1] ?? "unknown";
}

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email || !password) {
    console.error("Usage: npx tsx scripts/reset-password.ts <email> <new-password>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  console.log(`Database host: ${dbHost()}`);

  const db = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });

  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`No user found with email: ${email}`);
      console.error("This DATABASE_URL may not be the same one Vercel uses.");
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    const verify = await bcrypt.compare(password, passwordHash);
    console.log(`Password updated for ${email} (id ${user.id}).`);
    console.log(`Local verify: ${verify ? "OK" : "FAILED"}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
