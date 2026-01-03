"use client";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, number> = {
  sm: 16,
  md: 24,
  lg: 36
};

type Props = {
  size?: Size;
  className?: string;
};

export function Spinner({ size = "md", className }: Props) {
  const px = SIZES[size];
  return (
    <svg
      className={`bvSpinner ${className ?? ""}`}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="31.4 31.4"
      />
    </svg>
  );
}

export function SpinnerOverlay({ message }: { message?: string }) {
  return (
    <div className="bvSpinnerOverlay">
      <Spinner size="lg" />
      {message && <div className="bvSpinnerMessage">{message}</div>}
    </div>
  );
}

