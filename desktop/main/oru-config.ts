import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  parseShortcutBindings,
  type ShortcutBindings,
} from "@minke/harness-overlay/shortcut-contract.ts";
import {
  DEFAULT_TERMINAL_SETTINGS,
  parseTerminalSettings,
  type TerminalSettings,
} from "@minke/harness-overlay/terminal-settings-contract.ts";

/** Current schema version of Oru's standalone desktop configuration. */
export const ORU_CONFIG_VERSION = 1;

export function oruConfigFilePath(userDataPath: string): string {
  return join(userDataPath, "desktop", "oru.config.json");
}

export interface OruConfigDocument {
  version: typeof ORU_CONFIG_VERSION;
  shortcuts: ShortcutBindings;
  terminal: TerminalSettings;
}

export interface OruConfigSection<T> {
  read(): Promise<T>;
  write(value: unknown): Promise<void>;
}

const CONFIG_KEYS = new Set(["version", "shortcuts", "terminal"]);

function defaultDocument(): OruConfigDocument {
  return {
    version: ORU_CONFIG_VERSION,
    shortcuts: {},
    terminal: { ...DEFAULT_TERMINAL_SETTINGS },
  };
}

export function parseOruConfigDocument(value: unknown): OruConfigDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Oru config document must be an object");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.some((key) => !CONFIG_KEYS.has(key)) ||
    !Object.hasOwn(record, "version") ||
    !Object.hasOwn(record, "shortcuts") ||
    !Object.hasOwn(record, "terminal") ||
    record.version !== ORU_CONFIG_VERSION
  ) {
    throw new TypeError("unsupported Oru config document");
  }
  return {
    version: ORU_CONFIG_VERSION,
    shortcuts: parseShortcutBindings(record.shortcuts),
    terminal: parseTerminalSettings(record.terminal),
  };
}

/** Serializes independent settings updates into one validated document. */
export class OruConfigStore {
  readonly path: string;
  readonly shortcuts: OruConfigSection<ShortcutBindings>;
  readonly terminal: OruConfigSection<TerminalSettings>;

  #document: OruConfigDocument | undefined;
  #loaded = false;
  #tail: Promise<void> = Promise.resolve();
  #writeSequence = 0;

  constructor(userDataPath: string) {
    this.path = oruConfigFilePath(userDataPath);
    this.shortcuts = Object.freeze({
      read: () => this.#readShortcuts(),
      write: (value: unknown) => this.#writeShortcuts(value),
    });
    this.terminal = Object.freeze({
      read: () => this.#readTerminal(),
      write: (value: unknown) => this.#writeTerminal(value),
    });
  }

  #runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(operation, operation);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async #load(): Promise<OruConfigDocument> {
    if (this.#loaded) return this.#document as OruConfigDocument;
    let document: OruConfigDocument;
    try {
      document = parseOruConfigDocument(
        JSON.parse(await readFile(this.path, "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      document = defaultDocument();
    }
    this.#document = document;
    this.#loaded = true;
    return document;
  }

  #readShortcuts(): Promise<ShortcutBindings> {
    return this.#runExclusive(async () => ({
      ...(await this.#load()).shortcuts,
    }));
  }

  #readTerminal(): Promise<TerminalSettings> {
    return this.#runExclusive(async () => ({
      ...(await this.#load()).terminal,
    }));
  }

  #writeShortcuts(value: unknown): Promise<void> {
    return this.#runExclusive(async () => {
      const next = {
        ...(await this.#load()),
        shortcuts: parseShortcutBindings(value),
      };
      await this.#persist(next);
      this.#document = next;
    });
  }

  #writeTerminal(value: unknown): Promise<void> {
    return this.#runExclusive(async () => {
      const next = {
        ...(await this.#load()),
        terminal: parseTerminalSettings(value),
      };
      await this.#persist(next);
      this.#document = next;
    });
  }

  async #persist(document: OruConfigDocument): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.path}.${String(process.pid)}.${String(
      ++this.#writeSequence,
    )}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, this.path);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
}
