export function validateFinancialHealthSettings(data) {
  if (typeof data?.enabled !== 'boolean') {
    throw new Error('Financial Health availability could not be verified. Please retry.')
  }
  return data
}
