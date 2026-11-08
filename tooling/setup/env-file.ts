const LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

export type SecretGenerators = Record<string, () => string>;

export function parseEnvKeys(text: string): Map<string, string> {
  const keys = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = LINE.exec(line);
    if (match?.[1] !== undefined) keys.set(match[1], (match[2] ?? "").trim());
  }
  return keys;
}

function needsSecret(value: string | undefined): boolean {
  return value === undefined || value === "" || value.startsWith("change-me");
}

/**
 * Builds the local `.env` from `.env.example`. Existing values always win; keys that are new
 * in the example are appended, and secrets that are empty or still hold a `change-me`
 * placeholder get a freshly generated value.
 */
export function buildEnvFile(input: {
  example: string;
  current: string | undefined;
  generators: SecretGenerators;
}): { content: string; added: string[]; generated: string[] } {
  const { example, generators } = input;
  const exampleKeys = parseEnvKeys(example);
  const currentKeys = parseEnvKeys(input.current ?? "");
  const added: string[] = [];
  const generated: string[] = [];

  const secretFor = (key: string, value: string | undefined): string | undefined => {
    const generate = generators[key];
    if (!generate || !needsSecret(value)) return undefined;
    generated.push(key);
    return generate();
  };

  if (input.current === undefined) {
    const lines = example.split("\n").map((line) => {
      const match = LINE.exec(line);
      if (match?.[1] === undefined) return line;
      added.push(match[1]);
      const secret = secretFor(match[1], (match[2] ?? "").trim());
      return secret === undefined ? line : `${match[1]}=${secret}`;
    });
    return { content: lines.join("\n"), added, generated };
  }

  const lines = input.current.split("\n").map((line) => {
    const match = LINE.exec(line);
    if (match?.[1] === undefined) return line;
    const secret = secretFor(match[1], (match[2] ?? "").trim());
    return secret === undefined ? line : `${match[1]}=${secret}`;
  });

  const missing: string[] = [];
  for (const [key, value] of exampleKeys) {
    if (currentKeys.has(key)) continue;
    added.push(key);
    missing.push(`${key}=${secretFor(key, value) ?? value}`);
  }

  let content = lines.join("\n");
  if (missing.length > 0) {
    if (!content.endsWith("\n")) content += "\n";
    content += `${missing.join("\n")}\n`;
  }
  return { content, added, generated };
}

/** Sets `key=value` in a `.env` text, replacing the line if it exists or appending it. */
export function setEnvValue(text: string, key: string, value: string): string {
  let found = false;
  const lines = text.split("\n").map((line) => {
    const match = LINE.exec(line);
    if (match?.[1] !== key) return line;
    found = true;
    return `${key}=${value}`;
  });
  if (found) return lines.join("\n");
  const body = text.endsWith("\n") || text === "" ? text : `${text}\n`;
  return `${body}${key}=${value}\n`;
}
