import { BURST_SPEC, type GiftBurstTier } from "@/lib/gifts";

/**
 * The celebration when you send a gift: the gift pops up big from its button (with a soft golden light and rays),
 * sparkles fly out and fade, then it shrinks back into the button. Plain DOM nodes animated with the Web Animations
 * API (transform and opacity only), fixed over the page with no pointer events, all removed when it ends. Loaded only
 * on someone's first send, so it costs nothing until then. Reduced motion (device or Klique's setting): a simple fade.
 */
export function playGiftBurst(from: DOMRect, gift: { emoji: string; artUrl: string | null }, tier: GiftBurstTier) {
  if (typeof document === "undefined") return;
  const spec = BURST_SPEC[tier];
  const html = document.documentElement;
  const still = html.dataset.motion === "off" || (html.dataset.motion !== "on" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  // where it pops to: above the button, kept on screen
  const lift = Math.min(110, Math.max(40, y - 90));
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:0;height:0;pointer-events:none;z-index:2147483000;`;
  document.body.appendChild(root);
  const done = () => root.remove();
  const item = (css: string) => {
    const el = document.createElement("div");
    el.style.cssText = `position:absolute;left:0;top:0;will-change:transform,opacity;${css}`;
    root.appendChild(el);
    return el;
  };
  const art = item("width:32px;height:32px;margin:-16px 0 0 -16px;display:flex;align-items:center;justify-content:center;font-size:26px;line-height:1;");
  if (gift.artUrl) {
    const img = document.createElement("img");
    img.src = gift.artUrl;
    img.alt = "";
    img.style.cssText = "width:100%;height:100%;object-fit:contain;";
    art.appendChild(img);
  } else art.textContent = gift.emoji;

  if (still) {
    art.animate([{ opacity: 0, transform: `translateY(-${lift}px) scale(1.6)` }, { opacity: 1, offset: 0.3 }, { opacity: 0, transform: `translateY(-${lift}px) scale(1.6)` }], { duration: 900, easing: "ease-out" }).finished.then(done, done);
    return;
  }

  const ms = spec.ms;
  const up = `translateY(-${lift}px)`;
  // the soft light and rays behind it
  const light = item(`width:${60 * spec.scale}px;height:${60 * spec.scale}px;margin:-${30 * spec.scale}px 0 0 -${30 * spec.scale}px;border-radius:50%;background:radial-gradient(circle,rgba(255,206,84,.55) 0%,rgba(255,206,84,.18) 45%,transparent 70%);`);
  light.animate([{ opacity: 0, transform: `${up} scale(.3)` }, { opacity: 1, transform: `${up} scale(1)`, offset: 0.3 }, { opacity: 0, transform: `${up} scale(1.15)` }], { duration: ms, easing: "ease-out" });
  const rays = item(`width:${70 * spec.scale}px;height:${70 * spec.scale}px;margin:-${35 * spec.scale}px 0 0 -${35 * spec.scale}px;border-radius:50%;background:repeating-conic-gradient(rgba(255,214,102,.28) 0deg 8deg,transparent 8deg 30deg);mask:radial-gradient(circle,#000 30%,transparent 68%);-webkit-mask:radial-gradient(circle,#000 30%,transparent 68%);`);
  rays.animate([{ opacity: 0, transform: `${up} scale(.4) rotate(0deg)` }, { opacity: 0.9, offset: 0.3 }, { opacity: 0, transform: `${up} scale(1.1) rotate(40deg)` }], { duration: ms, easing: "ease-out" });

  // sparkles: little four-point stars and dots flying out from it
  for (let i = 0; i < spec.particles; i++) {
    const a = (i / spec.particles) * Math.PI * 2 + Math.random() * 0.5;
    const d = (50 + Math.random() * 45) * (spec.scale / 2.4);
    const size = 6 + Math.random() * 8;
    const star = i % 3 !== 2;
    const p = item(
      star
        ? `width:${size}px;height:${size}px;margin:-${size / 2}px 0 0 -${size / 2}px;background:#ffd166;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);`
        : `width:${size * 0.6}px;height:${size * 0.6}px;margin:-${size * 0.3}px 0 0 -${size * 0.3}px;border-radius:50%;background:#fff3c4;`,
    );
    const dx = Math.cos(a) * d;
    const dy = Math.sin(a) * d - lift;
    p.animate([{ opacity: 0, transform: `${up} scale(.2)` }, { opacity: 1, transform: `translate(${dx * 0.6}px,${dy * 0.6 - lift * 0.4}px) scale(1)`, offset: 0.35 }, { opacity: 0, transform: `translate(${dx}px,${dy}px) scale(.4) rotate(90deg)` }], { duration: ms * (0.75 + Math.random() * 0.2), delay: 80 + Math.random() * 120, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both" });
  }

  // the gift: pops up big with a little bounce, holds, then shrinks back into the button
  const s = spec.scale;
  art
    .animate(
      [
        { opacity: 0, transform: "translateY(0) scale(.6)" },
        { opacity: 1, transform: `${up} scale(${s * 1.12})`, offset: 0.22 },
        { transform: `${up} scale(${s * 0.94})`, offset: 0.32 },
        { transform: `${up} scale(${s})`, offset: 0.4 },
        { opacity: 1, transform: `${up} scale(${s})`, offset: 0.72 },
        { opacity: 0.2, transform: "translateY(0) scale(.6)" },
      ],
      { duration: ms, easing: "ease-in-out", fill: "both" },
    )
    .finished.then(done, done);
}
