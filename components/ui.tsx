import * as React from "react";
import Link from "next/link";

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
