import type { KeyboardEvent, ReactNode } from 'react';
import { useCallback, useRef } from 'react';
import {
  CHROME_TAB_BAR_SCROLL_CLASS,
  chromeTabBarClass,
  chromeTabTriggerClass,
} from '../../components/patterns/chrome-tab-bar';
import { cn } from '../../components/ui/utils';

export interface MasterPageTab<T extends string = string> {
  id: T;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface MasterPageTabsProps<T extends string> {
  tabs: MasterPageTab<T>[];
  activeId: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  level?: 'primary' | 'secondary';
  testIdPrefix?: string;
  className?: string;
}

function panelIdFor<T extends string>(testIdPrefix: string | undefined, tabId: T): string | undefined {
  return testIdPrefix ? `${testIdPrefix}-panel-${tabId}` : undefined;
}

function tabControlIdFor<T extends string>(testIdPrefix: string | undefined, tabId: T): string | undefined {
  return testIdPrefix ? `${testIdPrefix}-tab-control-${tabId}` : undefined;
}

export function MasterPageTabs<T extends string>({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  level = 'primary',
  testIdPrefix,
  className,
}: MasterPageTabsProps<T>) {
  const tabButtonRefs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});

  const focusTab = useCallback((id: T) => {
    tabButtonRefs.current[id]?.focus();
  }, []);

  const onTabListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const enabled = tabs.filter((tab) => !tab.disabled);
      if (enabled.length === 0) return;

      const currentIndex = enabled.findIndex((tab) => tab.id === activeId);
      const activeIndex = currentIndex >= 0 ? currentIndex : 0;

      let nextIndex: number | null = null;
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          nextIndex = (activeIndex + 1) % enabled.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          nextIndex = (activeIndex - 1 + enabled.length) % enabled.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = enabled.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      const next = enabled[nextIndex];
      if (!next) return;
      onChange(next.id);
      focusTab(next.id);
    },
    [activeId, focusTab, onChange, tabs],
  );

  return (
    <div
      className={cn(chromeTabBarClass('p-1'), className)}
      role="tablist"
      aria-label={ariaLabel}
      data-level={level}
      data-testid={testIdPrefix ? `${testIdPrefix}-tabbar` : undefined}
      onKeyDown={onTabListKeyDown}
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {tabs.map((tab) => {
          const isActive = activeId === tab.id;
          const panelId = panelIdFor(testIdPrefix, tab.id);
          const controlId = tabControlIdFor(testIdPrefix, tab.id);
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabButtonRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={controlId}
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              disabled={tab.disabled}
              data-testid={testIdPrefix ? `${testIdPrefix}-tab-${tab.id}` : undefined}
              onClick={() => onChange(tab.id)}
              className={chromeTabTriggerClass(isActive, 'max-sm:px-3 inline-flex items-center gap-1.5')}
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
              {tab.badge}
            </button>
          );
        })}
      </div>
    </div>
  );
}
