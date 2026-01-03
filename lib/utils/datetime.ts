/**
 * Consistent date/time formatting utilities
 */

type FormatStyle = "short" | "medium" | "long" | "relative";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Format a date for display
 */
export function formatDate(date: Date | string | number, style: FormatStyle = "medium"): string {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return "—";

  const now = new Date();

  if (style === "relative") {
    return formatRelative(d, now);
  }

  const isThisYear = d.getFullYear() === now.getFullYear();
  const isToday = isSameDay(d, now);
  const isYesterday = isSameDay(d, new Date(now.getTime() - DAY));

  if (style === "short") {
    if (isToday) return "Today";
    if (isYesterday) return "Yesterday";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(isThisYear ? {} : { year: "2-digit" })
    });
  }

  if (style === "medium") {
    if (isToday) return `Today at ${formatTime(d)}`;
    if (isYesterday) return `Yesterday at ${formatTime(d)}`;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(isThisYear ? {} : { year: "numeric" })
    }) + ` at ${formatTime(d)}`;
  }

  // long
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }) + ` at ${formatTime(d)}`;
}

/**
 * Format time only (e.g., "3:45 PM")
 */
export function formatTime(date: Date | string | number): string {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
}

/**
 * Format duration in minutes (e.g., "45 min", "1h 30m")
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diff = date.getTime() - now.getTime();
  const absDiff = Math.abs(diff);
  const isPast = diff < 0;

  if (absDiff < MINUTE) {
    return "just now";
  }
  if (absDiff < HOUR) {
    const mins = Math.floor(absDiff / MINUTE);
    return isPast ? `${mins}m ago` : `in ${mins}m`;
  }
  if (absDiff < DAY) {
    const hours = Math.floor(absDiff / HOUR);
    return isPast ? `${hours}h ago` : `in ${hours}h`;
  }
  if (absDiff < WEEK) {
    const days = Math.floor(absDiff / DAY);
    return isPast ? `${days}d ago` : `in ${days}d`;
  }

  // Fall back to short date
  return formatDate(date, "short");
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Format a date range (e.g., "Jan 5 - Jan 12")
 */
export function formatDateRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${end.getDate()}`;
  }

  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

