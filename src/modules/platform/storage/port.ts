import { createHash } from "node:crypto";

/**
 * Object storage port. Audio bytes — recitation, talqīn, studio takes, a child's
 * recording — never live in the database and never in the repository. They are
 * content-addressed: the key IS the hash, so an identical take uploaded twice
 * occupies one object and provenance rows point at it.
 */
export type ObjectKind = "recitation" | "talqin" | "studio_take" | "learner_recording" | "model" | "offline_pack" | "export";

export type PutObject = {
  readonly kind: ObjectKind;
  readonly bytes: Uint8Array;
  readonly contentType: string;
  /** Retention for anything that belongs to a child; enforced by a purge job. */
  readonly purgeAfter?: Date;
};

export type StoredObject = {
  readonly key: string;
  readonly sha256: string;
  readonly size: number;
  readonly contentType: string;
};

export interface ObjectStore {
  put(object: PutObject): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array | null>;
  head(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** A time-limited URL. The CDN serves ranges; the app never proxies audio. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

/** MIME allow-list. An upload outside it is refused before it is ever stored. */
export const ALLOWED_MIME: Readonly<Record<ObjectKind, readonly string[]>> = {
  recitation: ["audio/mpeg", "audio/mp4", "audio/ogg"],
  talqin: ["audio/mpeg", "audio/mp4", "audio/ogg"],
  studio_take: ["audio/wav", "audio/mpeg"],
  learner_recording: ["audio/webm", "audio/mp4", "audio/ogg"],
  model: ["application/octet-stream"],
  offline_pack: ["application/zip"],
  export: ["application/json", "application/zip"],
};

export function contentKey(kind: ObjectKind, bytes: Uint8Array, extension: string): string {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  // Sharded so no directory listing ever grows unbounded.
  return `${kind}/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.${extension}`;
}

export function assertAllowedMime(kind: ObjectKind, contentType: string): void {
  if (!ALLOWED_MIME[kind].includes(contentType)) {
    throw new Error(`content type ${contentType} is not allowed for ${kind}`);
  }
}

export const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "application/zip": "zip",
  "application/json": "json",
  "application/octet-stream": "bin",
};
