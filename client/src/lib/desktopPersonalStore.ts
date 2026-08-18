type StoreValue = unknown;

type DesktopStore = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: StoreValue): Promise<void>;
  save(): Promise<void>;
};

const FAVORITES_STORE_FILE = "favorites.json";
const SETTINGS_STORE_FILE = "settings.json";
const FAVORITES_KEY = "sui-read-bookmarks";
const stores = new Map<string, Promise<DesktopStore>>();
let writeQueue = Promise.resolve();

function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

function fileForKey(key: string): string {
  return key === FAVORITES_KEY ? FAVORITES_STORE_FILE : SETTINGS_STORE_FILE;
}

async function getStore(key: string): Promise<DesktopStore | null> {
  if (!isDesktopRuntime()) return null;
  const file = fileForKey(key);
  if (!stores.has(file)) {
    stores.set(file, import("@tauri-apps/plugin-store").then(async ({ load }) => (await load(file, { autoSave: false })) as unknown as DesktopStore));
  }
  try {
    return await stores.get(file)!;
  } catch (error) {
    console.info("[Personal Store] Unable to open AppData store; continuing with browser storage.", error);
    return null;
  }
}

export async function readDesktopPersonalValue<T>(key: string): Promise<T | undefined> {
  const store = await getStore(key);
  if (!store) return undefined;
  try {
    return await store.get<T>(key);
  } catch (error) {
    console.info("[Personal Store] Unable to read AppData value; continuing with browser storage.", error);
    return undefined;
  }
}

export function persistDesktopPersonalValue(key: string, value: StoreValue): void {
  if (!isDesktopRuntime()) return;
  writeQueue = writeQueue
    .then(async () => {
      const store = await getStore(key);
      if (!store) return;
      await store.set(key, value);
      await store.save();
    })
    .catch((error) => console.info("[Personal Store] Unable to save AppData value; continuing with browser storage.", error));
}
