'use client'

/**
 * Trust strip: duplicated row + CSS marquee (see globals.css `.trusted-by-marquee-track`).
 * Kept as a client island so the marketing page can stay a client component boundary if needed later.
 */
export function TrustedByMarquee({ names }: { names: readonly string[] }) {
  return (
    <>
      <p className="sr-only motion-reduce:hidden">Including teams at {names.join(', ')}.</p>
      <div className="mt-6 hidden flex-wrap items-center justify-center gap-x-6 gap-y-4 motion-reduce:flex sm:gap-x-10 sm:gap-y-5">
        {names.map((name) => (
          <span
            key={name}
            className="font-display text-lg font-semibold text-foreground/65 transition-all duration-300 hover:scale-110 hover:text-foreground/90"
          >
            {name}
          </span>
        ))}
      </div>
      <div className="relative mt-6 overflow-hidden motion-reduce:hidden" aria-hidden>
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-background to-transparent sm:w-20" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-background to-transparent sm:w-20" />
        <div className="trusted-by-marquee-track flex w-max flex-nowrap">
          {[...names, ...names].map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="font-display shrink-0 px-6 text-lg font-semibold text-foreground/65 sm:px-8"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
