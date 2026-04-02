'use client'

import NextImage from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EyeOff, Trash2, X, ZoomIn } from 'lucide-react'
import { getCachedBlob, putCachedBlob } from '@/lib/screenshotThumbCache'

export interface ScreenshotItem {
  id: string
  session_id?: string
  taken_at: string
  activity_score: number
  is_blurred: boolean
  signed_url: string
  thumb_signed_url?: string | null
  file_size_bytes?: number
}

interface Props {
  screenshots: ScreenshotItem[]
  /** When set, thumb bytes are read/written in IndexedDB; only missing ids hit the bucket. */
  cacheScope?: string
  showBlur?: boolean
  /** Manager/admin/super_admin: show blur + delete actions on hover */
  canManage?: boolean
  onBlur?: (id: string) => void | Promise<void>
  onDelete?: (id: string) => void | Promise<void>
  className?: string
}

function gridSrc(ss: ScreenshotItem): string {
  return ss.thumb_signed_url ?? ss.signed_url
}

function ActivityScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : score >= 40
        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
        : 'bg-red-500/20 text-red-400 border-red-500/30'

  return (
    <span
      title="Activity score for this capture window (not upload progress)"
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${color}`}
    >
      {score}%
    </span>
  )
}

function prefetchImages(urls: string[]): Promise<void> {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new window.Image()
          img.onload = () => resolve()
          img.onerror = () => resolve()
          img.src = url
        })
    )
  ).then(() => undefined)
}

export function ScreenshotGallery({
  screenshots,
  cacheScope,
  showBlur = true,
  canManage = false,
  onBlur,
  onDelete,
  className,
}: Props) {
  const [lightbox, setLightbox] = useState<{
    url: string
    score: number
    is_blurred: boolean
  } | null>(null)
  const [resolvedThumbs, setResolvedThumbs] = useState<Record<string, string>>({})
  const [gridReady, setGridReady] = useState(false)
  const thumbBlobUrlsRef = useRef<Set<string>>(new Set())
  const lightboxBlobRef = useRef<string | null>(null)

  const idsKey = useMemo(
    () =>
      screenshots.length === 0
        ? ''
        : [...screenshots]
            .map((s) => s.id)
            .sort()
            .join(','),
    [screenshots]
  )

  const closeLightbox = () => {
    if (lightboxBlobRef.current) {
      URL.revokeObjectURL(lightboxBlobRef.current)
      lightboxBlobRef.current = null
    }
    setLightbox(null)
  }

  useEffect(() => {
    const list = screenshots

    if (list.length === 0) {
      for (const u of thumbBlobUrlsRef.current) URL.revokeObjectURL(u)
      thumbBlobUrlsRef.current.clear()
      setResolvedThumbs({})
      setGridReady(true)
      return
    }

    if (!cacheScope) {
      let cancelled = false
      setGridReady(false)
      const urls = list.map((s) => gridSrc(s))
      void (async () => {
        await prefetchImages(urls)
        if (cancelled) return
        const m: Record<string, string> = {}
        for (const s of list) m[s.id] = gridSrc(s)
        setResolvedThumbs(m)
        setGridReady(true)
      })()
      return () => {
        cancelled = true
      }
    }

    let cancelled = false
    setGridReady(false)
    for (const u of thumbBlobUrlsRef.current) URL.revokeObjectURL(u)
    thumbBlobUrlsRef.current.clear()

    void (async () => {
      const next: Record<string, string> = {}
      const fetchOne = async (ss: ScreenshotItem) => {
        let blob = await getCachedBlob('thumb', cacheScope, ss.id)
        if (!blob) {
          const url = gridSrc(ss)
          try {
            const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
            if (!res.ok) return
            blob = await res.blob()
            const ct = res.headers.get('content-type') || 'image/webp'
            await putCachedBlob('thumb', cacheScope, ss.id, blob, ct)
          } catch {
            return
          }
        }
        if (!blob || cancelled) return
        const objUrl = URL.createObjectURL(blob)
        thumbBlobUrlsRef.current.add(objUrl)
        next[ss.id] = objUrl
      }

      await Promise.all(list.map((ss) => fetchOne(ss)))

      if (!cancelled) {
        setResolvedThumbs(next)
        setGridReady(true)
      } else {
        for (const u of Object.values(next)) {
          URL.revokeObjectURL(u)
          thumbBlobUrlsRef.current.delete(u)
        }
      }
    })()

    return () => {
      cancelled = true
      const blobUrls = [...thumbBlobUrlsRef.current]
      thumbBlobUrlsRef.current = new Set()
      for (const u of blobUrls) URL.revokeObjectURL(u)
    }
  }, [cacheScope, idsKey]) // eslint-disable-line react-hooks/exhaustive-deps -- idsKey tracks ids; screenshots churns URLs

  const openLightbox = async (ss: ScreenshotItem) => {
    if (!cacheScope) {
      setLightbox({
        url: ss.signed_url,
        score: ss.activity_score,
        is_blurred: ss.is_blurred,
      })
      return
    }
    let blob = await getCachedBlob('full', cacheScope, ss.id)
    if (!blob) {
      try {
        const res = await fetch(ss.signed_url, { mode: 'cors', credentials: 'omit' })
        if (res.ok) {
          blob = await res.blob()
          const ct = res.headers.get('content-type') || 'image/webp'
          await putCachedBlob('full', cacheScope, ss.id, blob, ct)
        }
      } catch {
        /* fall through */
      }
    }
    if (lightboxBlobRef.current) {
      URL.revokeObjectURL(lightboxBlobRef.current)
      lightboxBlobRef.current = null
    }
    if (blob) {
      const u = URL.createObjectURL(blob)
      lightboxBlobRef.current = u
      setLightbox({
        url: u,
        score: ss.activity_score,
        is_blurred: ss.is_blurred,
      })
    } else {
      setLightbox({
        url: ss.signed_url,
        score: ss.activity_score,
        is_blurred: ss.is_blurred,
      })
    }
  }

  return (
    <>
      {!gridReady && screenshots.length > 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading screenshots…</div>
      ) : (
        <div
          className={`grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 lg:gap-4 ${className ?? ''}`}
        >
          {screenshots.length === 0 ? (
            <div className="col-span-full py-6 text-center text-sm text-muted-foreground">
              Screenshots not available
            </div>
          ) : (
            screenshots.map((ss) => (
              <div
                key={ss.id}
                className="group relative cursor-pointer overflow-hidden rounded-lg border border-border bg-muted"
                onClick={() => void openLightbox(ss)}
              >
                <div className="relative aspect-video bg-black/10">
                  <NextImage
                    src={resolvedThumbs[ss.id] ?? gridSrc(ss)}
                    alt=""
                    fill
                    className={`object-cover transition-transform duration-200 group-hover:scale-105 ${
                      ss.is_blurred && showBlur ? 'blur-sm' : ''
                    }`}
                    unoptimized
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  />
                  {ss.is_blurred && showBlur && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <span className="rounded border border-primary-foreground/35 px-2 py-1 text-[10px] text-primary-foreground/90">
                        Blurred
                      </span>
                    </div>
                  )}
                  {canManage && (onBlur || onDelete) ? (
                    <div
                      className="absolute right-1 top-1 z-[2] flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                      role="presentation"
                    >
                      {onBlur && !ss.is_blurred ? (
                        <button
                          type="button"
                          title="Blur this screenshot"
                          className="rounded-md bg-black/70 p-1.5 text-primary-foreground hover:bg-black/85"
                          onClick={(e) => {
                            e.stopPropagation()
                            void onBlur(ss.id)
                          }}
                        >
                          <EyeOff className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      ) : null}
                      {onDelete ? (
                        <button
                          type="button"
                          title="Delete screenshot"
                          className="rounded-md bg-black/70 p-1.5 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (
                              typeof window !== 'undefined' &&
                              window.confirm(
                                'Delete this screenshot permanently? It will be removed from storage.'
                              )
                            ) {
                              void onDelete(ss.id)
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                    <ZoomIn className="h-6 w-6 text-primary-foreground drop-shadow-lg" />
                  </div>
                </div>
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(ss.taken_at).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>
                  <ActivityScoreBadge score={Math.round(ss.activity_score)} />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {lightbox ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          <div className="relative mx-4 w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <NextImage
              src={lightbox.url}
              alt=""
              width={1920}
              height={1080}
              className={`mx-auto block max-h-[80vh] h-auto w-auto max-w-full rounded-lg object-contain shadow-2xl ${
                lightbox.is_blurred && showBlur ? 'blur-sm' : ''
              }`}
              unoptimized
            />
            <div className="absolute right-3 top-3 flex items-center gap-2">
              <ActivityScoreBadge score={Math.round(lightbox.score)} />
              <button
                type="button"
                onClick={closeLightbox}
                className="rounded-full bg-black/60 p-1.5 text-primary-foreground hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
