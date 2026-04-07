'use client'

import type { ReactNode } from 'react'

type ReportPageHeaderProps = {
  title: string
  description: string
  children?: ReactNode
}

/** Consistent title block for report sub-pages. */
export function ReportPageHeader({ title, description, children }: ReportPageHeaderProps) {
  return (
    <div className="border-b border-border/60 pb-5">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  )
}
