export function toast(message: string) {
  if (typeof window === "undefined") return;
  const msg = String(message || "").trim();
  if (!msg) return;
  try {
    window.sessionStorage.setItem("bv:toast", msg);
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent("bv:toast", { detail: { message: msg } }));
  } catch {
    // ignore
  }
}



