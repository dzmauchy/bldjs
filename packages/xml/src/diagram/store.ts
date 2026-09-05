export interface StoredDiagram {
  id: string;
  name: string;
  xml: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramRepository {
  list(): Promise<StoredDiagram[]>;
  get(id: string): Promise<StoredDiagram | undefined>;
  save(record: StoredDiagram): Promise<void>;
  remove(id: string): Promise<void>;
}

function byUpdatedAtDesc(left: StoredDiagram, right: StoredDiagram): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

export class MemoryDiagramRepository implements DiagramRepository {
  readonly #items = new Map<string, StoredDiagram>();

  async list(): Promise<StoredDiagram[]> {
    return [...this.#items.values()].toSorted(byUpdatedAtDesc);
  }

  async get(id: string): Promise<StoredDiagram | undefined> {
    return this.#items.get(id);
  }

  async save(record: StoredDiagram): Promise<void> {
    this.#items.set(record.id, { ...record });
  }

  async remove(id: string): Promise<void> {
    this.#items.delete(id);
  }
}

const DB_NAME = "bld";
const DB_VERSION = 1;
const STORE = "diagrams";

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB request failed"));
  });
}

export class IndexedDbDiagramRepository implements DiagramRepository {
  #db?: Promise<IDBDatabase>;

  constructor(
    private readonly dbName = DB_NAME,
    private readonly factory: IDBFactory | undefined = globalThis.indexedDB,
  ) {}

  #open(): Promise<IDBDatabase> {
    if (!this.factory) {
      return Promise.reject(new Error("IndexedDB is not available"));
    }
    this.#db ??= new Promise((resolve, reject) => {
      const request = this.factory!.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
    });
    return this.#db;
  }

  async #store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.#open();
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  async list(): Promise<StoredDiagram[]> {
    const store = await this.#store("readonly");
    const records = (await idbRequest(store.getAll())) as StoredDiagram[];
    return records.toSorted(byUpdatedAtDesc);
  }

  async get(id: string): Promise<StoredDiagram | undefined> {
    const store = await this.#store("readonly");
    return (await idbRequest(store.get(id))) as StoredDiagram | undefined;
  }

  async save(record: StoredDiagram): Promise<void> {
    const store = await this.#store("readwrite");
    await idbRequest(store.put(record));
  }

  async remove(id: string): Promise<void> {
    const store = await this.#store("readwrite");
    await idbRequest(store.delete(id));
  }
}

export function defaultDiagramRepository(): DiagramRepository {
  if (typeof indexedDB === "undefined") {
    return new MemoryDiagramRepository();
  }
  return new IndexedDbDiagramRepository();
}
