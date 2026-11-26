import type { ButtonHTMLAttributes } from "react";
import { cx } from "@/components/ui/cx";

/** Twitch's and YouTube's own colours and marks, for the buttons that connect to them. */
export const TWITCH = "#9146FF";
export const YOUTUBE = "#FF0000";

export function TwitchLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  );
}

export function YouTubeLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12z" />
    </svg>
  );
}

/** A Twitch or YouTube button: the brand's colour with its mark, the same shape as the site's buttons. */
export function BrandButton({ brand, size = "md", className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { brand: "twitch" | "youtube"; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...rest}
      style={{ background: brand === "twitch" ? TWITCH : YOUTUBE }}
      className={cx("inline-flex items-center justify-center gap-2 rounded-control font-semibold text-white transition hover:brightness-110 disabled:opacity-50", size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-[14px]", className)}
    >
      {brand === "twitch" ? <TwitchLogo size={size === "sm" ? 15 : 17} /> : <YouTubeLogo size={size === "sm" ? 17 : 19} />}
      {children}
    </button>
  );
}
