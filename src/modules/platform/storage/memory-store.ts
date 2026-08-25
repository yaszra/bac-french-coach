import {
  assertAllowedMime,
  contentKey,
  EXTENSION_BY_MIME,
  type ObjectStore,
  type PutObject,
  type StoredObject,
} from "./port";
import { createHash } from "node:crypto";

/**
 * The development and test implementation. Same contract as the S3-compatible
 * store, so nothing above this layer knows which one it is talking to.
 */
export class MemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, { bytes: Uint8Array; meta: StoredObject; purgeAfter?: Date }>();

  async put(object: PutObject): Promise<StoredObject> {
    assertAllowedMime(object.kind, object.contentType);
    const extension = EXTENSION_BY_MIME[object.contentType] ?? "bin";
    const key = contentKey(object.kind, object.bytes, extension);
    const meta: StoredObject = {
      key,
      sha256: createHash("sha256").update(object.bytes).digest("hex"),
      size: object.bytes.byteLength,
      contentType: object.contentType,
    };
    const entry: { bytes: Uint8Array; meta: StoredObject; purgeAfter?: Date } = { bytes: object.bytes, meta };
    if (object.purgeAfter) entry.purgeAfter = object.purgeAfter;
    this.objects.set(key, entry);
    return meta;
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key)?.bytes ?? null;
  }

  async head(key: string): Promise<StoredObject | null> {
    return this.objects.get(key)?.meta ?? null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return `memory://${key}?expires=${expiresInSeconds}`;
  }

  /** Retention sweep, mirroring the production purge job. */
  purgeExpired(now: Date): number {
    let purged = 0;
    for (const [key, entry] of this.objects) {
      if (entry.purgeAfter && entry.purgeAfter <= now) {
        this.objects.delete(key);
        purged++;
      }
    }
    return purged;
  }
}
