export function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}
