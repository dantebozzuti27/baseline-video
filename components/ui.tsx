import * as React from "react";

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="card">{children}</div>;
}

export function Button({
  children,
  variant,
  type,
  disabled,
  onClick
}: {
  children: React.ReactNode;
  variant?: "default" | "primary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const cls =
    variant === "primary"
      ? "btn btnPrimary"
      : variant === "danger"
        ? "btn btnDanger"
        : "btn";
  return (
    <button className={cls} type={type ?? "button"} disabled={disabled} onClick={onClick}>
      {children}
    </button>
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


