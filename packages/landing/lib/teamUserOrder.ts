/** Put the logged-in user first; preserve relative order of everyone else. */
export function orderTeamUsersWithSelfFirst<T extends { id: string }>(
  users: T[],
  selfId: string | undefined
): T[] {
  if (!selfId || users.length <= 1) return users
  const self = users.find((u) => u.id === selfId)
  if (!self) return users
  return [self, ...users.filter((u) => u.id !== selfId)]
}
