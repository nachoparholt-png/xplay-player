/**
 * iOS keyboard handling for pop-ups (24 Sep 2026).
 *
 * With Capacitor Keyboard `resize: "body"` the web view keeps its full height, so a
 * centred `position: fixed` dialog ends up half behind the keyboard and its lower
 * fields / buttons can't be reached. We publish the keyboard height as the CSS
 * variable `--kb-h`; `DialogContent` uses it to sit (and shrink) above the keyboard.
 * The focused field is also scrolled into view inside its dialog.
 */
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

const setKb = (px: number) => document.documentElement.style.setProperty("--kb-h", `${Math.max(0, Math.round(px))}px`);

const revealFocused = () => {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
};

export function installKeyboardInset() {
  setKb(0);
  if (Capacitor.isNativePlatform()) {
    Keyboard.addListener("keyboardWillShow", (info) => { setKb(info.keyboardHeight); setTimeout(revealFocused, 60); }).catch(() => {});
    Keyboard.addListener("keyboardWillHide", () => setKb(0)).catch(() => {});
  } else if (window.visualViewport) {
    // Mobile Safari (web app): the visual viewport shrinks when the keyboard opens.
    const vv = window.visualViewport;
    const onResize = () => setKb(window.innerHeight - vv.height - vv.offsetTop);
    vv.addEventListener("resize", onResize);
  }
  // Moving between fields while the keyboard is already open.
  document.addEventListener("focusin", () => setTimeout(revealFocused, 60));
}
