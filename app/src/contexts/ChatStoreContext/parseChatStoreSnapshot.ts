import { citationSchema } from "@groundx/shared";
import { z } from "zod";

import type { EntityKey, EntityKind } from "@/contexts/EntitySessionStoreContext";
import type { FFrame } from "@/types/onboarding";

/**
 * 2026-05-31-session-auth-subshapes — the ChatStore localStorage rehydration
 * path is a trust boundary. The serialized snapshot read back from
 * `localStorage` is UNTRUSTED input: a corrupt or attacker-shaped blob that
 * happens to `JSON.parse` must NOT be cast through as a `SerializedSnapshot`.
 *
 * `parseChatStoreSnapshot(unknown)` validates the parsed value against a Zod
 * schema mirroring the serialized shape (`serialize` in `ChatStoreContext.tsx`)
 * and returns the typed snapshot, or `null` on any mismatch — the same posture
 * as the row-mapper / `parseCanvasIntent` validation at the other read
 * boundaries. The serialized type is single-sourced HERE (Zod `z.infer<>`); the
 * provider's `serialize`/`deserialize` import it.
 *
 * Bump `STORAGE_VERSION` when the serialized shape changes; the validator
 * rejects any other version (rehydration then falls back to legacy migration /
 * a fresh store), it does NOT migrate older shapes.
 */
export const STORAGE_VERSION = 1;

const FFRAME_VALUES = ["f1", "f2", "f3", "f3a", "f4", "f4a", "f5", "f6", "f7"] as const;
const fFrameSchema: z.ZodType<FFrame> = z.enum(FFRAME_VALUES);

const ENTITY_KIND_VALUES = ["sample"] as const;
const entityKindSchema: z.ZodType<EntityKind> = z.enum(ENTITY_KIND_VALUES);

const serializedEntitySessionSchema = z
  .object({
    kind: entityKindSchema,
    id: z.string(),
    lastFrame: fFrameSchema,
    completedFrames: z.array(fFrameSchema),
    createdAt: z.number(),
    lastVisitedAt: z.number(),
  })
  .strict();
export type SerializedEntitySession = z.infer<typeof serializedEntitySessionSchema>;

// `ChatMessage` — only the fields `serialize` persists. `role` mirrors the
// `ChatMessage["role"]` union; `citations` reuses the shared `citationSchema`
// so the validated type is the same `Citation[]` the in-memory `ChatMessage`
// carries (one source — a corrupt citation in the blob is rejected here too).
const serializedMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["user", "assistant", "tool", "system"]),
    content: z.string(),
    timestamp: z.number(),
    compressedIntoSummaryId: z.string().nullish(),
    citations: z.array(citationSchema).optional(),
  })
  .strict();

// Entity tuples: `[EntityKey, SerializedEntitySession]`. The key is a branded
// string at the type level; on the wire it's a plain string, re-branded on read.
const serializedEntityTupleSchema = z.tuple([
  z.string(),
  serializedEntitySessionSchema,
]);

const serializedSessionSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
    messages: z.array(serializedMessageSchema),
    entities: z.array(serializedEntityTupleSchema),
    activeEntityKey: z.string().nullable(),
    isOnboardingSession: z.boolean(),
    signupOpen: z.boolean(),
    scopeKey: z.string().optional(),
  })
  .strict();

const serializedSnapshotSchema = z
  .object({
    version: z.literal(STORAGE_VERSION),
    ownerKey: z.string(),
    activeSessionId: z.string().nullable(),
    sessions: z.array(serializedSessionSchema),
  })
  .strict();

/**
 * The serialized snapshot shape — single source for `serialize`/`deserialize`.
 * The entity tuple key + `activeEntityKey` are branded `EntityKey` at the type
 * level; the Zod schema validates them as plain strings (the brand is a
 * compile-time nominal tag, not a runtime distinction) and they are re-branded
 * on read in `deserialize`.
 */
export type SerializedSnapshot = Omit<z.infer<typeof serializedSnapshotSchema>, "sessions"> & {
  sessions: SerializedSession[];
};
export type SerializedSession = Omit<
  z.infer<typeof serializedSessionSchema>,
  "entities" | "activeEntityKey"
> & {
  entities: Array<[EntityKey, SerializedEntitySession]>;
  activeEntityKey: EntityKey | null;
};

/**
 * Validate an untrusted, already-`JSON.parse`d localStorage value. Returns the
 * typed snapshot on success, or `null` on any structural / version mismatch.
 * Never throws past the boundary.
 */
export function parseChatStoreSnapshot(input: unknown): SerializedSnapshot | null {
  const result = serializedSnapshotSchema.safeParse(input);
  if (!result.success) return null;
  // The Zod-inferred entity-key/activeEntityKey are plain strings; re-brand to
  // `EntityKey` for the consumer (`deserialize`). The cast is sound — these
  // values were minted by `makeEntityKey`/the entity store on the write side.
  return result.data as unknown as SerializedSnapshot;
}
