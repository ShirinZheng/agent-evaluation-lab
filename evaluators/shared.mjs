export function score(name, value, comment, details = undefined) {
  const result = { name, value: Number(Math.max(0, Math.min(1, value)).toFixed(6)), comment };
  if (details !== undefined) result.details = details;
  return result;
}

export function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 1;
}

export function weightedMean(rows, weights) {
  let total = 0;
  let denominator = 0;
  for (const row of rows) {
    const weight = weights[row.name] ?? 1;
    total += row.value * weight;
    denominator += weight;
  }
  return denominator ? total / denominator : 1;
}

export function textOf(value) {
  return JSON.stringify(value).toLowerCase();
}

export function groupRecall(text, groups = []) {
  const hits = groups.map((group) => ({
    id: group.id,
    hit: (group.terms || []).some((term) => text.includes(String(term).toLowerCase()))
  }));
  return { hits, value: hits.length ? hits.filter((item) => item.hit).length / hits.length : 1 };
}

export const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };
