import * as keytar from 'keytar'

const SERVICE = 'io.tracksync.app'
const ACCESS_KEY = 'access_token'
const REFRESH_KEY = 'refresh_token'

export async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  await keytar.setPassword(SERVICE, ACCESS_KEY, accessToken)
  await keytar.setPassword(SERVICE, REFRESH_KEY, refreshToken)
}

export async function loadTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const accessToken = await keytar.getPassword(SERVICE, ACCESS_KEY)
  const refreshToken = await keytar.getPassword(SERVICE, REFRESH_KEY)
  if (!accessToken || !refreshToken) return null
  return { accessToken, refreshToken }
}

export async function clearTokens(): Promise<void> {
  await keytar.deletePassword(SERVICE, ACCESS_KEY)
  await keytar.deletePassword(SERVICE, REFRESH_KEY)
}
