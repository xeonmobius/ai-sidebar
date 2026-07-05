export function truncate(text, maxChars) {
  const t = String(text ?? '');
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n\n[truncated]`;
}
