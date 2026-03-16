import SparkMD5 from 'spark-md5'

export function gravatarUrl(email: string, size = 48): string {
  const hash = SparkMD5.hash(email.toLowerCase().trim())
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`
}
