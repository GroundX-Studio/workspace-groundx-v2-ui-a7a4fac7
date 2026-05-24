import type { FFrame } from "@/types/onboarding";

/**
 * Kinds of "entities" that can live in the registry. Each kind is a
 * REAL persistent thing the user can navigate to and resume — a
 * sample, a customer project, an uploaded document, a schema, a
 * report. Singleton UI surfaces (the F1 picker, the BYO sign-up
 * trigger) are NOT entities — they're URL routes with no per-instance
 * state. Putting them in the entity model meant carrying empty
 * lastFrame / completedFrames / gate fields that nobody read.
 *
 * The registry is kind-agnostic — adding a new kind doesn't require
 * changes to the registry itself, only to the discriminated union
 * below and any UI that knows how to render that kind.
 */
export type EntityKind = "sample"; // future: | "project" | "document" | "schema" | "report"

/**
 * Stable identifier for an entity. Encodes both kind and id so the
 * registry's Map can be keyed by a single string. Format: `${kind}:${id}`.
 *
 * Examples:
 *   - sample:utility
 *   - sample:loan
 *   - project:abc-123    (future)
 */
export type EntityKey = string & { __brand: "EntityKey" };

export const makeEntityKey = (kind: EntityKind, id: string): EntityKey =>
  `${kind}:${id}` as EntityKey;

/**
 * Per-entity session state. This is what's preserved across visits.
 * Adding new fields here is a normal evolution; adding new kinds is
 * a `EntityKind` union extension + a switch in the consumer that
 * knows what to render for the new kind.
 *
 * Note: the gate lifecycle is NOT here — it's session-level state
 * (in OnboardingSessionContext). Gate represents the user's
 * auth-pending state, which is global to the session: once
 * committed, signed in everywhere; once dismissed, dismissed
 * everywhere. Putting it per-entity would let sample A be "gate
 * dismissed" while sample B was "gate idle" — incoherent.
 */
export interface EntitySession {
  kind: EntityKind;
  id: string;
  /** Last frame the user was on within this entity's journey. */
  lastFrame: FFrame;
  /** Frames the user has completed inside this entity. */
  completedFrames: ReadonlySet<FFrame>;
  /** Unix-ms when this entity was first created in this session. */
  createdAt: number;
  /** Unix-ms when the user last touched this entity. Used by LRU. */
  lastVisitedAt: number;
}

export interface EntityRegistryState {
  /** All entities the user has touched in this session. */
  entities: ReadonlyMap<EntityKey, EntitySession>;
  /** Currently-active entity, or `null` when the user is on the F1 picker. */
  activeKey: EntityKey | null;
}

export interface EntityRegistryApi {
  state: EntityRegistryState;
  /**
   * Activate an existing entity, or `null` to return to the F1 picker.
   * If a previously-touched entity is activated, its lastVisitedAt is
   * bumped.
   */
  activate: (key: EntityKey | null) => void;
  /**
   * Create the entity if it doesn't exist yet, set it active, and
   * return its key. If the entity already exists, just activates it
   * (preserving its state).
   */
  upsertAndActivate: (kind: EntityKind, id: string, defaults: Partial<EntitySession>) => EntityKey;
  /**
   * Mutate the currently-active entity. No-op if no entity is active
   * — the caller is responsible for activating first.
   */
  updateActive: (updater: (session: EntitySession) => EntitySession) => void;
}
