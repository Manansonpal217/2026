export type LogLevel = 'INFO' | 'WARN' | 'ERROR'

function ts(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function write(level: LogLevel, message: string): void {
  const line = `[${ts()}] ${level.padEnd(5)} ${message}`
  if (level === 'ERROR') {
    console.error(line)
  } else {
    console.log(line)
  }
}

export const log = {
  info: (message: string) => write('INFO', message),
  warn: (message: string) => write('WARN', message),
  error: (message: string) => write('ERROR', message),
}
