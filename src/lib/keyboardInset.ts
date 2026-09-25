/**
 * iOS keyboard handling (25 Sep 2026, replaces the 24 Sep --kb-h approach).
 *
 * Capacitor Keyboard now runs with `resize: "native"`: iOS shrinks the web view itself
 * when the keyboard opens, so `100dvh`, `position: fixed` and bottom sheets all follow
 * the visible area on their own. Nothing is subtracted twice and nothing can get stuck
 * when the keyboard closes. `--kb-h` stays at 0 on native (kept for the web app, where
 * Mobile Safari reports the keyboard through visualViewport).
 *
 * Also: the "Done" accessory bar is shown, Return closes the keyboard on single-line
 * fields, and tapping anywhere that isn't a field closes it too — the three ways
 * people expect to get the keyboard out of the way.
 */
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

const setKb = (px: number) => document.documentElement.style.setProperty("--kb-h", `${Math.max(0, Math.round(px))}px`);

const isField = (el: Element | null) =>
  !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el as HTMLElement).isContentEditable);

const revealFocused = () => {
  const el = document.activeElement as HTMLElement | null;
  if (!isField(el)) return;
  el!.scrollIntoView({ block: "center", behavior: "smooth" });
};

const blurActive = () => {
  const el = document.activeElement as HTMLElement | null;
  if (isField(el)) el!.blur();
  if (Capacitor.isNativePlatform()) Keyboard.hide().catch(() => {});
};

export function installKeyboardInset() {
  setKb(0);
  if (Capacitor.isNativePlatform()) {
    Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {});
    Keyboard.addListener("keyboardDidShow", () => setTimeout(revealFocused, 60)).catch(() => {});
  } else if (window.visualViewport) {
    // Mobile Safari (web app): the visual viewport shrinks when the keyboard opens.
    const vv = window.visualViewport;
    const onResize = () => setKb(window.innerHeight - vv.height - vv.offsetTop);
    vv.addEventListener("resize", onResize);
  }
  // Moving between fields while the keyboard is already open.
  document.addEventListener("focusin", () => setTimeout(revealFocused, 60));
  // Return on a single-line field = done.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.defaultPrevented) return;
    const el = document.activeElement as HTMLElement | null;
    if (el && el.tagName === "INPUT" && !(el as HTMLInputElement).form) { e.preventDefault(); blurActive(); }
  });
  // Tap outside any field = done (buttons and links still work: they get the tap first).
  document.addEventListener("pointerdown", (e) => {
    const t = e.target as Element | null;
    if (!isField(document.activeElement)) return;
    if (t && (isField(t) || t.closest("input, textarea, select, [contenteditable=true], label"))) return;
    blurActive();
  }, { capture: true });
}
