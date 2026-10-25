export function storeInitials(name) {
  const words = String(name || '').match(/[\p{L}\p{N}]+/gu) || []
  if (!words.length) return 'ST'
  return [words[0], ...(words.length > 1 ? [words.at(-1)] : [])]
    .map((word) => Array.from(word)[0]).join('').toLocaleUpperCase()
}

export function normalizeStoreLogo(value = '') {
  const logo = String(value).trim()
  if (!logo) return ''
  let url
  try { url = new URL(logo) } catch { throw new Error('Enter a valid HTTPS logo image URL, or leave it blank for store initials.') }
  if (logo.length > 500 || /\s/.test(logo) || url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error('Enter a valid HTTPS logo image URL (up to 500 characters), or leave it blank for store initials.')
  }
  return logo
}
