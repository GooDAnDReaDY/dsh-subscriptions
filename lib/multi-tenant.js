export function filterAccountsForUser(accounts, userContext) {
  const list = Array.isArray(accounts) ? accounts : []
  if (!userContext || userContext.isAdmin) {
    return list // Admin sees all
  }

  const username = userContext.username || userContext.userId || userContext.sub
  if (!username) return []

  return list.filter((acc) => {
    if (!acc.allowedUsers || !Array.isArray(acc.allowedUsers)) {
      return true // Public in pool
    }
    return acc.allowedUsers.includes(username)
  })
}
