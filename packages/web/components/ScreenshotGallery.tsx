'use client'

import { useState } from 'react'
import { X, ZoomIn } from 'lucide-react'

interface Screenshot {
  id: string
  taken_at: string
  activity_score: number
  is_blurred: boolean
  signed_url: string
  file_size_bytes: number
}

interface Props {
  screenshots: Screenshot[]
  showBlur?: boolean
  className?: string
}

function ActivityScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : score >= 40
        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
        : 'bg-red-500/20 text-red-400 border-red-500/30'

  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${color}`}>
      {score}%
    </span>
  )
}

export function ScreenshotGallery({ screenshots, showBlur = false, className }: Props) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxScore, setLightboxScore] = useState(0)

  return (
    <>
      <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 ${className ?? ''}`}>
        {screenshots.length === 0 ? (
          <div className="col-span-full flex items-center justify-center py-16 text-muted-foreground text-sm">
            No screenshots found
          </div>
        ) : (
          screenshots.map((ss) => (
            <div
              key={ss.id}
              className="group relative rounded-lg overflow-hidden bg-surface/50 border border-border/50 cursor-pointer"
              onClick={() => {
                setLightboxUrl(ss.signed_url)
                setLightboxScore(ss.activity_score)
              }}
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-black/20">
                <img
                  src={ss.signed_url}
                  alt={`Screenshot at ${new Date(ss.taken_at).toLocaleTimeString()}`}
                  className={`w-full h-full object-cover transition-all duration-200 group-hover:scale-105 ${
                    ss.is_blurred && showBlur ? 'blur-sm' : ''
                  }`}
                  loading="lazy"
                />
                {/* Blur overlay */}
                {ss.is_blurred && showBlur && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="text-[10px] text-white/70 border border-white/30 rounded px-2 py-1">
                      Blurred
                    </span>
                  </div>
                )}
                {/* Zoom icon on hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                  <ZoomIn className="h-6 w-6 text-white drop-shadow-lg" />
                </div>
              </div>

              {/* Meta row */}
              <div className="px-2 py-1.5 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {new Date(ss.taken_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <ActivityScoreBadge score={Math.round(ss.activity_score)} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxUrl}
              alt="Screenshot"
              className="rounded-lg shadow-2xl max-w-full max-h-[80vh] object-contain mx-auto block"
            />
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <ActivityScoreBadge score={Math.round(lightboxScore)} />
              <button
                onClick={() => setLightboxUrl(null)}
                className="p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
