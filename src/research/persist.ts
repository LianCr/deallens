/**
 * Optional MongoDB persistence for research sessions and immutable
 * price observations. No-op when MONGODB_URI is unset — priceContext
 * GraphQL path stays stateless.
 */

import type { EvidenceBundle, ResearchSession } from "./types";

export interface StoredResearch {
  session: ResearchSession;
  bundle: EvidenceBundle;
  savedAt: string;
}

type MongoClientType = import("mongodb").MongoClient;

let clientPromise: Promise<MongoClientType> | null = null;

export function mongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI?.trim());
}

async function getDb() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const { MongoClient } = await import("mongodb");
      const client = new MongoClient(uri);
      await client.connect();
      return client;
    })();
  }
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB?.trim() || "deallens";
  return client.db(dbName);
}

export async function saveResearchBundle(
  bundle: EvidenceBundle,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const doc: StoredResearch = {
    session: bundle.session,
    bundle,
    savedAt: new Date().toISOString(),
  };
  await db.collection("research_sessions").updateOne(
    { "session.id": bundle.session.id },
    { $set: doc },
    { upsert: true },
  );
  if (bundle.comparables.observations.length > 0) {
    await db.collection("price_observations").insertMany(
      bundle.comparables.observations.map((o) => ({
        ...o,
        sessionId: bundle.session.id,
        vehicle: {
          make: bundle.target.make,
          model: bundle.target.model,
          year: bundle.target.year,
        },
        savedAt: doc.savedAt,
      })),
      { ordered: false },
    ).catch(() => {
      /* duplicate key races are fine for demo */
    });
  }
  return true;
}

export async function loadResearchSession(
  id: string,
): Promise<StoredResearch | null> {
  const db = await getDb();
  if (!db) return null;
  const doc = await db.collection("research_sessions").findOne({
    "session.id": id,
  });
  if (!doc) return null;
  return {
    session: doc.session as ResearchSession,
    bundle: doc.bundle as EvidenceBundle,
    savedAt: doc.savedAt as string,
  };
}
