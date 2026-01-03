import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="card">{children}</div>;
}

type ButtonVariant = "default" | "primary" | "danger";

function getButtonClass(variant?: ButtonVariant) {
  return variant === "primary" ? "btn btnPrimary" : variant === "danger" ? "btn btnDanger" : "btn";
}

export function Button({
  children,
  variant,
  type,
  disabled,
  onClick
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const cls = getButtonClass(variant);
  return (
    <button className={cls} type={type ?? "button"} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
}) {
  const cls = getButtonClass(variant);
  return (
    <Link className={cls} href={href}>
      {children}
    </Link>
  );
}

export function Input({
  label,
  name,
  type,
  value,
  onChange,
  placeholder
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="label">{label}</div>
      <input
        className="input"
        name={name}
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="on"
      />
    </div>
  );
}

export function Select({
  label,
  name,
  value,
  onChange,
  options
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="label">{label}</div>
      <select className="select" name={name} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Modal({
  open,
  title,
  children,
  footer,
  onClose
}: {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
}) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="bvModalBackdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bvModal" role="dialog" aria-modal="true" tabIndex={-1} ref={panelRef}>
        <div className="bvModalHeader">
          <div className="bvModalTitle">{title ?? ""}</div>
          <button className="bvModalClose" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        <div className="bvModalBody">{children}</div>
        {footer ? <div className="bvModalFooter">{footer}</div> : null}
      </div>
    </div>
  );
}
