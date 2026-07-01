import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

function dbHost(): string {
  const url = process.env.DATABASE_URL ?? "";
  const match = url.match(/@([^/]+)/);
  return match?.[1] ?? "unknown";
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  console.log(`Database host: ${dbHost()}\n`);

  const db = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });

  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        createdAt: true,
        passwordHash: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    if (users.length === 0) {
      console.log("No users in this database.");
      return;
    }

    for (const u of users) {
      console.log(
        `${u.email}\tcreated ${u.createdAt.toISOString()}\thasPassword=${!!u.passwordHash}`
      );
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
