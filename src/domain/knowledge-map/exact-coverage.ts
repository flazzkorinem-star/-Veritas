export function analyzeExactCoverage(
  expectedIds: readonly string[],
  actualIds: readonly string[],
) {
  const counts = new Map<string, number>();
  for (const id of actualIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const expected = new Set(expectedIds);
  return {
    missing: expectedIds.filter((id) => !counts.has(id)),
    duplicate: [...counts].filter(([, count]) => count > 1).map(([id]) => id),
    unknown: [...counts.keys()].filter((id) => !expected.has(id)),
  };
}
