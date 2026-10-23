interface ObjectUrlRuntime {
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
}

interface ObjectUrlEntry {
  url: string;
  key?: string;
  refs: number;
  owners: Map<string, number>;
}

interface AcquireObjectUrlOptions {
  key?: string;
  ownerId?: string;
}

class ObjectUrlManager {
  private readonly createObjectUrl: (blob: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;
  private readonly entries = new Map<string, ObjectUrlEntry>();
  private readonly urlsByKey = new Map<string, string>();
  private readonly urlsByOwner = new Map<string, Set<string>>();

  constructor(runtime?: ObjectUrlRuntime) {
    this.createObjectUrl = runtime?.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
    this.revokeObjectUrl = runtime?.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
  }

  acquire(blob: Blob, options: AcquireObjectUrlOptions = {}): string {
    if (options.ownerId && !options.key) {
      this.releaseOwner(options.ownerId);
    }

    const existingUrl = options.key ? this.urlsByKey.get(options.key) : undefined;
    const existingEntry = existingUrl ? this.entries.get(existingUrl) : undefined;

    if (existingEntry) {
      existingEntry.refs += 1;
      this.attachOwner(existingEntry, options.ownerId);
      return existingEntry.url;
    }

    const url = this.createObjectUrl(blob);
    const entry: ObjectUrlEntry = {
      url,
      key: options.key,
      refs: 1,
      owners: new Map(),
    };

    this.entries.set(url, entry);
    if (options.key) {
      this.urlsByKey.set(options.key, url);
    }
    this.attachOwner(entry, options.ownerId);

    return url;
  }

  release(url: string | null | undefined): void {
    if (!url?.startsWith('blob:')) {
      return;
    }

    const entry = this.entries.get(url);
    if (!entry) {
      this.revokeObjectUrl(url);
      return;
    }

    entry.refs -= 1;
    if (entry.refs > 0) {
      return;
    }

    this.entries.delete(url);
    if (entry.key) {
      this.urlsByKey.delete(entry.key);
    }

    entry.owners.forEach((_, ownerId) => this.detachOwnerUrl(ownerId, url));
    this.revokeObjectUrl(url);
  }

  /** Release acquisitions recorded for this owner, independent of the current
   * message/variant tree. Fallback upload URLs are deduplicated and must not
   * release references held by another owner.
   */
  releaseOwner(ownerId: string, unownedUrls: Iterable<string> = []): void {
    const ownerUrls = new Set(this.urlsByOwner.get(ownerId));
    this.urlsByOwner.delete(ownerId);

    ownerUrls.forEach((url) => {
      const entry = this.entries.get(url);
      if (!entry) return;
      const ownerRefs = entry.owners.get(ownerId) ?? 0;
      entry.owners.delete(ownerId);
      for (let refIndex = 0; refIndex < ownerRefs; refIndex += 1) {
        this.release(url);
      }
    });

    for (const url of new Set(unownedUrls)) {
      if (!ownerUrls.has(url) && !this.entries.get(url)?.owners.size) {
        this.release(url);
      }
    }
  }

  has(url: string): boolean {
    return this.entries.has(url);
  }

  private attachOwner(entry: ObjectUrlEntry, ownerId?: string): void {
    if (!ownerId) {
      return;
    }

    entry.owners.set(ownerId, (entry.owners.get(ownerId) ?? 0) + 1);

    const ownerUrls = this.urlsByOwner.get(ownerId) ?? new Set<string>();
    ownerUrls.add(entry.url);
    this.urlsByOwner.set(ownerId, ownerUrls);
  }

  private detachOwnerUrl(ownerId: string, url: string): void {
    const ownerUrls = this.urlsByOwner.get(ownerId);
    if (!ownerUrls) {
      return;
    }

    ownerUrls.delete(url);
    if (ownerUrls.size === 0) {
      this.urlsByOwner.delete(ownerId);
    }
  }
}

const objectUrlManager = new ObjectUrlManager();

export const createManagedObjectUrl = (blob: Blob, options?: AcquireObjectUrlOptions): string =>
  objectUrlManager.acquire(blob, options);

export const releaseManagedObjectUrl = (url: string | null | undefined): void => objectUrlManager.release(url);

export const releaseManagedObjectUrlsByOwner = (ownerId: string, unownedUrls?: Iterable<string>): void =>
  objectUrlManager.releaseOwner(ownerId, unownedUrls);
