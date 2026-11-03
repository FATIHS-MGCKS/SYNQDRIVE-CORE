import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../ui/utils';
import { Button } from '../ui/button';
import { type DialogSurface, surfaceClassName } from './surface';

/* ════════════════════════════════════════════════════════════════════
   AppDialog / FormDialog / ConfirmDialog — token-based overlays for
   the whole product. Backdrop: overlay-scrim (L4). Content: L1 solid/elevated.
   ════════════════════════════════════════════════════════════════════ */

/** Default z-[80]. Use aboveRegistrationShell for nested dialogs inside z-[100] full-screen shells. */
export type AppDialogStackLayer = 'default' | 'aboveRegistrationShell';

const APP_DIALOG_STACK_Z: Record<AppDialogStackLayer, string> = {
  default: 'z-[80]',
  aboveRegistrationShell: 'z-[110]',
};

export interface AppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Width on >= sm. Defaults to comfortable form width. */
  maxWidthClassName?: string;
  className?: string;
  /** Hide the built-in close button (e.g. when footer has Cancel). */
  hideClose?: boolean;
  /** Dialog panel surface — solid (L0) or elevated (L1 interactive). No glass/liquid. */
  surface?: DialogSurface;
  /** Stacking order for overlay + content. Default unchanged for product-wide dialogs. */
  stackLayer?: AppDialogStackLayer;
}

export function AppDialog({
  open,
  onOpenChange,
  children,
  maxWidthClassName = 'sm:max-w-lg',
  className,
  hideClose = false,
  surface = 'elevated',
  stackLayer = 'default',
}: AppDialogProps) {
  const stackZ = APP_DIALOG_STACK_Z[stackLayer];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-testid={stackLayer === 'aboveRegistrationShell' ? 'app-dialog-overlay-elevated' : undefined}
          className={cn(
            'overlay-scrim fixed inset-0',
            stackZ,
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'motion-reduce:animate-none motion-reduce:transition-none',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            surfaceClassName(surface),
            'sq-dialog-panel',
            'fixed top-[50%] left-[50%] flex max-h-[min(90vh,100dvh)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden p-0 text-foreground outline-none',
            stackZ,
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'motion-reduce:animate-none motion-reduce:transition-none duration-200',
            maxWidthClassName,
            className,
          )}
        >
          {children}
          {!hideClose && (
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-3.5 right-3.5 z-10 size-8"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  maxWidthClassName?: string;
  hideClose?: boolean;
  bodyClassName?: string;
  surface?: DialogSurface;
  stackLayer?: AppDialogStackLayer;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  maxWidthClassName = 'sm:max-w-lg',
  hideClose = false,
  bodyClassName,
  surface,
  stackLayer = 'default',
}: FormDialogProps) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      maxWidthClassName={maxWidthClassName}
      hideClose={hideClose}
      surface={surface}
      stackLayer={stackLayer}
    >
      <div className="flex shrink-0 flex-col gap-1 border-b border-border/70 px-5 py-4 pr-12">
        <DialogPrimitive.Title className="text-base font-semibold text-foreground">
          {title}
        </DialogPrimitive.Title>
        {description && (
          <DialogPrimitive.Description className="text-xs text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
        )}
      </div>

      <div className={cn('flex-1 overflow-y-auto px-5 py-4', bodyClassName)}>{children}</div>

      {footer && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/70 px-5 py-3.5">
          {footer}
        </div>
      )}
    </AppDialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  tone?: 'critical' | 'default';
  children?: ReactNode;
  surface?: DialogSurface;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  loading = false,
  tone = 'default',
  children,
  surface,
}: ConfirmDialogProps) {
  const isCritical = tone === 'critical';

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} maxWidthClassName="sm:max-w-md" hideClose surface={surface}>
      <div className="p-5">
        <div className="mb-4 flex items-start gap-3">
          {isCritical && (
            <div className="sq-tone-critical flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <AlertTriangle className="h-5 w-5 text-[color:var(--status-critical)]" />
            </div>
          )}
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="mt-1 text-xs text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
        </div>

        {children}

        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            variant="neutral"
            size="sm"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            disabled={loading}
            onClick={() => void onConfirm()}
            variant={isCritical ? 'destructive' : 'default'}
            size="sm"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}
