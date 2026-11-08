/** Release tags are plain semver with a v: v1.4.2. Anything else (v1.4.2-beta, e2e-…) is ignored. */
export interface Version {
  major: number;
  minor: number;
  patch: number;
}

export type Bump = "patch" | "minor" | "major";

const pattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseVersion(tag: string): Version | undefined {
  const match = pattern.exec(tag.trim());
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compare(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

const format = (version: Version) => `v${version.major}.${version.minor}.${version.patch}`;

export function latestVersion(tags: string[]): Version {
  return tags
    .map(parseVersion)
    .filter((version) => version !== undefined)
    .reduce((latest, version) => (compare(version, latest) > 0 ? version : latest), {
      major: 0,
      minor: 0,
      patch: 0,
    });
}

/** The tag of the next release: a bump of the latest one, or an exact version above it. */
export function nextVersion(tags: string[], bumpOrVersion: string): string {
  const latest = latestVersion(tags);
  const { major, minor, patch } = latest;
  switch (bumpOrVersion) {
    case "patch":
      return format({ major, minor, patch: patch + 1 });
    case "minor":
      return format({ major, minor: minor + 1, patch: 0 });
    case "major":
      return format({ major: major + 1, minor: 0, patch: 0 });
  }
  const exact = parseVersion(bumpOrVersion);
  if (!exact) {
    throw new Error(`Use patch, minor, major or a version like 1.2.3 (got "${bumpOrVersion}")`);
  }
  if (compare(exact, latest) <= 0) {
    throw new Error(`${format(exact)} is not greater than the latest version, ${format(latest)}`);
  }
  return format(exact);
}
