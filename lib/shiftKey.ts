"use client";

/**
 * Is Shift held right now? (Discord-style: Shift+click on Delete skips "are you sure?".) Menus hand their
 * actions no event, so this follows the keyboard instead.
 */
let held = false;
if (typeof window !== "undefined") {
  const set = (e: KeyboardEvent | PointerEvent) => (held = e.shiftKey);
  window.addEventListener("keydown", set, true);
  window.addEventListener("keyup", set, true);
  window.addEventListener("pointerdown", set, true);
  window.addEventListener("blur", () => (held = false));
}
export const shiftHeld = () => held;
