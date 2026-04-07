import { cn } from '@/lib/utils'

const PALETTES = [
  'bg-primary/15 text-primary',
  'bg-muted text-muted-foreground',
  'bg-primary/20 text-primary',
  'bg-muted text-foreground/80',
  'bg-primary/10 text-primary',
  'bg-muted text-muted-foreground',
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export interface InitialsAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

function InitialsAvatar({ name, size = 'md', className, ...props }: InitialsAvatarProps) {
  const palette = PALETTES[hashString(name) % PALETTES.length]
  const sz =
    size === 'sm'
      ? 'h-8 w-8 text-[10px]'
      : size === 'lg'
        ? 'h-12 w-12 text-sm'
        : size === 'xl'
          ? 'h-14 w-14 text-base'
          : 'h-9 w-9 text-xs'

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-border/60',
        palette,
        sz,
        className
      )}
      aria-hidden
      {...props}
    >
      {initialsFromName(name)}
    </div>
  )
}

export { InitialsAvatar, initialsFromName }
