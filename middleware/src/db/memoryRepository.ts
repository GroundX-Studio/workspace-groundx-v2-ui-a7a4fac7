import type { AppRepository, AppUserMetadata, SessionRecord } from "../types.js";

export class MemoryAppRepository implements AppRepository {
  sessions = new Map<string, SessionRecord>();
  metadata = new Map<string, AppUserMetadata>();

  async createSchema(): Promise<void> {}

  async createSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    return this.sessions.get(id) ?? null;
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async upsertMetadata(metadata: AppUserMetadata): Promise<void> {
    this.metadata.set(metadata.groundxUsername, metadata);
  }

  async getMetadata(groundxUsername: string): Promise<AppUserMetadata | null> {
    return this.metadata.get(groundxUsername) ?? null;
  }
}
