import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../../components/ui/sheet';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';

export type SignalDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  className?: string;
  /** Radix Dialog close focus — use to restore ledger row focus. */
  onCloseAutoFocus?: (event: Event) => void;
};

export function SignalDetailSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  className,
  onCloseAutoFocus,
}: SignalDetailSheetProps) {
  const { t } = useLanguage();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton
        onCloseAutoFocus={onCloseAutoFocus}
        {...(!description ? { 'aria-describedby': undefined } : {})}
        className={cn(
          'flex w-full flex-col gap-0 p-0 sm:max-w-none',
          'max-sm:inset-0 max-sm:h-[100dvh] max-sm:w-full max-sm:border-0',
          'sm:inset-y-0 sm:right-0 sm:h-full sm:w-[min(640px,38vw)] sm:min-w-[480px] sm:border-l',
          'motion-reduce:animate-none motion-reduce:transition-none',
          className,
        )}
      >
        <SheetHeader className="sticky top-0 z-10 shrink-0 gap-2 border-b border-border/60 bg-popover/95 p-4 backdrop-blur-sm">
          <div className="flex items-start gap-2 pr-10">
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={!hasPrevious}
                onClick={onPrevious}
                aria-label={t('master.intelligence.vsi.ledger.sheet.previous' as never)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={!hasNext}
                onClick={onNext}
                aria-label={t('master.intelligence.vsi.ledger.sheet.next' as never)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-balance font-mono text-sm">{title}</SheetTitle>
              {description ? (
                <SheetDescription className="text-xs">{description}</SheetDescription>
              ) : null}
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-border/60 p-4">{footer}</div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
