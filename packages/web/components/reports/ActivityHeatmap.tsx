'use client'

interface ActivityCell {
  hour: number // 0-23
  day: number  // 0=Mon, 6=Sun
  score: number // 0-100
}

interface Props {
  data: ActivityCell[]
  className?: string
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function scoreToColor(score: number): string {
  if (score === 0) return 'bg-white/5'
  if (score < 25) return 'bg-indigo-500/20'
  if (score < 50) return 'bg-indigo-500/40'
  if (score < 75) return 'bg-indigo-500/65'
  return 'bg-indigo-500'
}

export function ActivityHeatmap({ data, className }: Props) {
  const grid = new Map<string, number>()
  for (const cell of data) {
    grid.set(`${cell.day}-${cell.hour}`, cell.score)
  }

  return (
    <div className={className}>
      <div className="flex gap-1">
        {/* Day labels */}
        <div className="flex flex-col gap-1 pt-5">
          {DAYS.map((day) => (
            <div key={day} className="h-5 flex items-center justify-end pr-2">
              <span className="text-[10px] text-muted-foreground">{day}</span>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-1 mb-1">
            {HOURS.filter((h) => h % 3 === 0).map((h) => (
              <div key={h} className="text-[10px] text-muted-foreground" style={{ minWidth: 20 }}>
                {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
              </div>
            ))}
          </div>
          {DAYS.map((_, dayIdx) => (
            <div key={dayIdx} className="flex gap-1 mb-1">
              {HOURS.map((hour) => {
                const score = grid.get(`${dayIdx}-${hour}`) ?? 0
                return (
                  <div
                    key={hour}
                    title={`${DAYS[dayIdx]} ${hour}:00 — Activity: ${score}%`}
                    className={`h-5 w-5 rounded-sm cursor-default transition-opacity hover:opacity-80 ${scoreToColor(score)}`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-[10px] text-muted-foreground">Less</span>
        {[0, 20, 45, 65, 85].map((s) => (
          <div key={s} className={`h-3 w-3 rounded-sm ${scoreToColor(s)}`} />
        ))}
        <span className="text-[10px] text-muted-foreground">More</span>
      </div>
    </div>
  )
}
