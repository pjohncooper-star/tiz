import { PrismaNeon } from "@prisma/adapter-neon";

import { $Enums, Prisma, PrismaClient } from "@prisma/client";

import { neonConfig } from "@neondatabase/serverless";

import ws from "ws";



neonConfig.webSocketConstructor = ws;



const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSeasonPlanFieldFingerprint?: string;
};

function seasonPlanFieldFingerprint(): string {
  const fields =
    Prisma.dmmf.datamodel.models.find((m) => m.name === "SeasonPlan")?.fields ?? [];
  return fields.map((f) => f.name).sort().join(",");
}



function createPrismaClient() {

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {

    throw new Error("DATABASE_URL is not set");

  }

  const adapter = new PrismaNeon({ connectionString });

  return new PrismaClient({ adapter });

}



type PrismaWithPlanning = PrismaClient & {

  anchorWorkout?: { findMany: unknown };

  weeklyScheduleTemplate?: { findMany: unknown };

  seasonPlan?: { findMany: unknown };

};



function hasDelegate(

  client: PrismaClient,

  key: keyof PrismaWithPlanning

): boolean {

  const delegate = (client as PrismaWithPlanning)[key];

  return typeof delegate === "object" && delegate !== null && "findMany" in delegate;

}



function isStalePrismaClient(client: PrismaClient): boolean {

  if (!hasDelegate(client, "anchorWorkout")) return true;

  if (!hasDelegate(client, "weeklyScheduleTemplate")) return true;

  if (!hasDelegate(client, "seasonPlan")) return true;

  return (
    !("PoolSize" in $Enums) ||
    !("STRENGTH" in $Enums.Discipline) ||
    !("TEMPLATE" in $Enums.PlannedSessionSource) ||
    !("RACE" in $Enums.PlannedSessionSource) ||
    globalForPrisma.prismaSeasonPlanFieldFingerprint !== seasonPlanFieldFingerprint()
  );

}



function getPrismaClient(): PrismaClient {

  const existing = globalForPrisma.prisma;

  if (existing && !isStalePrismaClient(existing)) {

    return existing;

  }

  const client = createPrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaSeasonPlanFieldFingerprint = seasonPlanFieldFingerprint();
  }

  return client;

}



/** Lazy proxy so Next dev HMR cannot keep a stale client after schema changes. */

export const db: PrismaClient = new Proxy({} as PrismaClient, {

  get(_target, prop, receiver) {

    const client = getPrismaClient();

    const value = Reflect.get(client, prop, receiver);

    return typeof value === "function" ? value.bind(client) : value;

  },

});

