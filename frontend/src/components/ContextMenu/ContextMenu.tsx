import { useEffect, useRef, useState, useCallback } from 'react';

export interface ContextMenuItem {
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  separator?: boolean;
  disabled?: boolean;
  shortcut?: string;
  children?: ContextMenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

function SubMenuFlyout({ items, x, y, onClose }: { items: ContextMenuItem[]; x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) el.style.left = `${Math.max(0, window.innerWidth - rect.width - 4)}px`;
    if (rect.bottom > window.innerHeight) el.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`;
  }, [x, y]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-app-surface border border-app-border rounded-lg shadow-xl py-1 min-w-[180px] animate-fade-in"
      style={{ left: x, top: y }}
    >
      {items.map((item, j) =>
        item.separator ? (
          <div key={j} className="h-px bg-app-border my-1" />
        ) : (
          <button
            key={j}
            onClick={() => {
              if (!item.disabled) {
                item.onClick?.();
                onClose();
              }
            }}
            disabled={item.disabled}
            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
              item.disabled
                ? 'text-zinc-600 cursor-not-allowed'
                : 'text-zinc-300 hover:bg-accent-blue/15 hover:text-white'
            }`}
          >
            {item.icon && <span className="w-4 h-4 flex items-center justify-center shrink-0">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && <span className="text-zinc-500 text-[0.83em] ml-4">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  );
}

function MenuItem({ item, onClose, onSubmenuOpen }: { item: ContextMenuItem; onClose: () => void; onSubmenuOpen: (items: ContextMenuItem[], x: number, y: number) => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);

  if (item.children) {
    return (
      <button
        ref={btnRef}
        onMouseEnter={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onSubmenuOpen(item.children!, rect.right + 2, rect.top);
        }}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors text-zinc-300 hover:bg-accent-blue/15 hover:text-white"
      >
        {item.icon && <span className="w-4 h-4 flex items-center justify-center shrink-0">{item.icon}</span>}
        <span className="flex-1">{item.label}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500 shrink-0">
          <path d="M2 1l4 3-4 3" />
        </svg>
      </button>
    );
  }

  return (
    <button
      ref={btnRef}
      onClick={() => {
        if (!item.disabled) {
          item.onClick?.();
          onClose();
        }
      }}
      disabled={item.disabled}
      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
        item.disabled
          ? 'text-zinc-600 cursor-not-allowed'
          : 'text-zinc-300 hover:bg-accent-blue/15 hover:text-white'
      }`}
    >
      {item.icon && <span className="w-4 h-4 flex items-center justify-center shrink-0">{item.icon}</span>}
      <span className="flex-1">{item.label}</span>
      {item.shortcut && <span className="text-zinc-500 text-[0.83em] ml-4">{item.shortcut}</span>}
    </button>
  );
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<{ items: ContextMenuItem[]; x: number; y: number } | null>(null);
  const submenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmenuOpen = useCallback((items: ContextMenuItem[], sx: number, sy: number) => {
    if (submenuTimer.current) clearTimeout(submenuTimer.current);
    setSubmenu({ items, x: sx, y: sy });
  }, []);

  const handleSubmenuClose = useCallback(() => {
    submenuTimer.current = setTimeout(() => setSubmenu(null), 100);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) && !(submenu && document.querySelector('.submenu-flyout')?.contains(target))) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose, submenu]);

  useEffect(() => {
    if (!menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) el.style.left = `${Math.max(0, vw - rect.width - 4)}px`;
    if (rect.bottom > vh) el.style.top = `${Math.max(0, vh - rect.height - 4)}px`;
  }, [x, y]);

  return (
    <>
      <div
        ref={menuRef}
        className="fixed z-50 bg-app-surface border border-app-border rounded-lg shadow-xl py-1 min-w-[180px] animate-fade-in"
        style={{ left: x, top: y }}
        onMouseLeave={() => {
          submenuTimer.current = setTimeout(() => setSubmenu(null), 150);
        }}
      >
        {items.map((item, i) =>
          item.separator ? (
            <div key={i} className="h-px bg-app-border my-1" />
          ) : (
            <MenuItem
              key={i}
              item={item}
              onClose={onClose}
              onSubmenuOpen={handleSubmenuOpen}
            />
          )
        )}
      </div>
      {submenu && (
        <div
          className="submenu-flyout"
          onMouseEnter={() => {
            if (submenuTimer.current) clearTimeout(submenuTimer.current);
          }}
          onMouseLeave={handleSubmenuClose}
        >
          <SubMenuFlyout items={submenu.items} x={submenu.x} y={submenu.y} onClose={onClose} />
        </div>
      )}
    </>
  );
}
