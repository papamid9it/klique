import type { SVGProps } from "react";

const PATHS = {
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  users: <><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 5.2a3.3 3.3 0 0 1 0 6.1M18 14.8c2 .7 3.2 2.3 3.5 5.2" /></>,
  bookmark: <path d="M6.5 3.5h11v17l-5.5-4-5.5 4z" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20.5 20.5-4.7-4.7" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  userplus: <><circle cx="9.5" cy="8.5" r="3.5" /><path d="M2.8 20c.6-3.6 3.2-5.5 6.7-5.5 1.4 0 2.6.3 3.6.9" /><path d="M18 14v6M15 17h6" /></>,
  smile: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14c.9 1.3 2 2 3.5 2s2.6-.7 3.5-2" /><path d="M9 9.8v.4M15 9.8v.4" /></>,
  sticker: <><path d="M20.5 12.5V7A3.5 3.5 0 0 0 17 3.5H7A3.5 3.5 0 0 0 3.5 7v10A3.5 3.5 0 0 0 7 20.5h5.5z" /><path d="M20.5 12.5h-4a4 4 0 0 0-4 4v4" /><path d="M8.5 9.3v.4M14 9.3v.4M8.5 13.5c1 .8 2.2.9 3.2.5" /></>,
  message: <path d="M20.5 12a8 8 0 0 1-11.7 7.1L3.5 20.5l1.4-4.9A8 8 0 1 1 20.5 12z" />,
  send: <path d="M21.5 2.5 10.5 13.5M21.5 2.5l-7 19-4-8.5-8.5-4z" />,
  sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  share: <><path d="M4.5 12.5v6a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-6" /><path d="m16 7-4-4-4 4M12 3v12" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.4 3.7 5.2 3.7 8.5s-1.2 6.1-3.7 8.5c-2.5-2.4-3.7-5.2-3.7-8.5S9.5 5.9 12 3.5z" /></>,
  pin: <><path d="M12 21s6.5-5.7 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.3 6.5 11 6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  "arrow-up-right": <path d="M7 17 17 7M8.5 7H17v8.5" />,
  "arrow-left": <path d="M19 12H5M11 6l-6 6 6 6" />,
  download: <><path d="M12 4v11M7 10.5l5 5 5-5" /><path d="M4.5 19.5h15" /></>,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  "zoom-in": <><circle cx="11" cy="11" r="6.5" /><path d="m20.5 20.5-4.7-4.7M11 8v6M8 11h6" /></>,
  move: <><path d="M12 3v18M3 12h18" /><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></>,
  flag: <path d="M5.5 21V4M5.5 4.5h11l-2 3.8 2 3.7h-11" />,
  ban: <><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></>,
  logout: <><path d="M15 16.5 19.5 12 15 7.5M19.5 12H9" /><path d="M11.5 20.5h-6A1.5 1.5 0 0 1 4 19V5a1.5 1.5 0 0 1 1.5-1.5h6" /></>,
  "chevron-down": <path d="m6 9.5 6 6 6-6" />,
  "chevron-right": <path d="m9.5 6 6 6-6 6" />,
  "chevron-left": <path d="m14.5 6-6 6 6 6" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.2 1.8" /></>,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  pause: <path d="M8 5.5v13M16 5.5v13" />,
  volume: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>,
  volumeoff: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></>,
  timer: <><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4l2.5 1.5M9.5 3h5M12 3v3M18.5 6.5l1.5-1.5" /></>,
  more: <><circle cx="5.5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="18.5" cy="12" r="1.2" fill="currentColor" /></>,
  heart: <path d="M12 20.5s-8-4.9-8-10.7A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.8c0 5.8-8 10.7-8 10.7z" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  user: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20.5c.7-4 3.7-6 7.5-6s6.8 2 7.5 6" /></>,
  edit: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  trash: <><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7" /></>,
  link: <><path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1" /><path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1" /></>,
  copy: <><rect x="8.5" y="8.5" width="12" height="12" rx="2.5" /><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" /></>,
  shield: <path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.6 7 9 4.2-1.4 7-4.8 7-9V6z" />,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17.5 5-4.5 4 3.5 3-2.5 4 3.5" /></>,
  ticket: <path d="M4 8.5V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v2a2.5 2.5 0 0 0 0 5v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5v-2a2.5 2.5 0 0 0 0-5z" />,
  bell: <><path d="M6 17.5V11a6 6 0 0 1 12 0v6.5l1.5 1.5h-15z" /><path d="M10 21.5h4" /></>,
  folder: <path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4.2l2 2.3H19A1.5 1.5 0 0 1 20.5 9.3V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z" />,
  hash: <path d="M9.5 4 7.5 20M16.5 4l-2 16M4.5 9h16M3.5 15h16" />,
  megaphone: <><path d="M4 10v4a1 1 0 0 0 1 1h2.5l8 4V5l-8 4H5a1 1 0 0 0-1 1z" /><path d="M19 9.5a3.5 3.5 0 0 1 0 5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.2M12 7.8v.1" /></>,
  arrowdown: <path d="M12 5v14M6 13l6 6 6-6" />,
  topics: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M7.5 9h9M7.5 12.5h9M7.5 16h5" /></>,
  reply: <path d="M9.5 6 4 11.5 9.5 17M4 11.5h9.5a6.5 6.5 0 0 1 6.5 6.5" />,
  video: <><rect x="3" y="6" width="13.5" height="12" rx="2.5" /><path d="m16.5 10.5 4.5-2.5v8l-4.5-2.5" /></>,
  mic: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></>,
  micoff: <><path d="M4 4l16 16M9 9v2.5a3 3 0 0 0 4.6 2.5M15 10.5V6.5a3 3 0 0 0-5.6-1.5M5.5 11.5a6.5 6.5 0 0 0 10 5.5M12 18v3" /></>,
  phoneoff: <path d="M4 15.5c4.5-4.5 11.5-4.5 16 0l-2 2.5-3-1.5v-2.5a10 10 0 0 0-6 0v2.5L6 18l-2-2.5z" />,
  pushpin: <><path d="M9 4h6l-1 5.5 3 3.5v1H7v-1l3-3.5L9 4z" /><path d="M12 14v6" /></>,
  asterisk: <path d="M12 3.5v17M4.6 7.8l14.8 8.4M4.6 16.2 19.4 7.8" />,
  coin: <><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
