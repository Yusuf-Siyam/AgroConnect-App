/** The trace code is the whole share payload; no URL or extra metadata is invented. */
export function batchShareMessage(code: string): string {
  return code.trim();
}
