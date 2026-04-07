'use client'

import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Plain text or rich content (e.g. lists). */
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Use danger for destructive actions (delete, suspend, etc.). */
  variant?: 'default' | 'danger'
  /** Called when the user confirms; dialog closes after this returns (sync or async). */
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description != null && description !== '' ? (
            typeof description === 'string' ? (
              <DialogDescription>{description}</DialogDescription>
            ) : (
              <div className="text-sm text-muted-foreground [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-4 [&_p+p]:mt-2">
                {description}
              </div>
            )
          ) : null}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="default"
            className={cn(
              variant === 'danger' &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/40'
            )}
            onClick={() => {
              void (async () => {
                try {
                  await Promise.resolve(onConfirm())
                } finally {
                  onOpenChange(false)
                }
              })()
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
