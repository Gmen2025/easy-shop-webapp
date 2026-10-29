export function mergeNotificationPages(current, incoming) {
  const items = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) items.set(item.id, item)
  return [...items.values()].sort((a, b) => b.id.localeCompare(a.id))
}
