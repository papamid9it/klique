import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import Link from "next/link";
import { connection } from "next/server";
import { ANDROID_APP_URL } from "@/lib/constants";
import { cdn } from "@/lib/cdn";
import { dateChip, eventPrice, formatTime, goingShown, goingText } from "@/lib/format";
import { placeLabel } from "@/lib/places";
import type { EventDTO } from "@/lib/types";
import { communitiesForLanding, upcomingForLanding } from "@/server/services/landing.service";
import "../landing.css";

/**
 * getklique.app for visitors (the proxy shows this at "/" to anyone signed out who hasn't gone in yet): what Klique
 * is, the phone and desktop apps, real upcoming events and real communities, and the downloads. "Log in" and "Open
 * Klique" go into the app; the desktop app never sees this page.
 */

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: { absolute: "Klique · Find your klique in Lagos and Abuja" },
  description: "Communities with real chat rooms, the events on this week, and kliques: small groups heading out together. On Android, desktop and the web.",
  alternates: { canonical: "/" },
};

/** go into the app (remembered, so "/" is the app from now on) */
const IN = "/?app=1";

const Icon = {
  play: <path d="M5 3.5v17l14-8.5z" />,
  apple: (
    <>
      <path d="M15.5 3.5c-1 .1-2.2.8-2.8 1.6-.6.7-1.1 1.8-.9 2.8 1.1.1 2.2-.6 2.8-1.4.6-.8 1-1.9.9-3z" />
      <path d="M12 8.5c-1.1 0-2-.6-3-.6-1.9 0-3.8 1.6-3.8 4.6 0 3.4 2.4 8 4.3 8 .9 0 1.4-.6 2.5-.6s1.6.6 2.5.6c1.9 0 3.7-4.1 3.9-4.6-2.4-1-2.4-4.4-.2-5.6-.9-1.2-2.2-1.6-3.2-1.6-1.2 0-2 .8-3 .8z" />
    </>
  ),
  desktop: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.4 3.7 5.2 3.7 8.5s-1.2 6.1-3.7 8.5c-2.5-2.4-3.7-5.2-3.7-8.5S9.5 5.9 12 3.5z" />
    </>
  ),
  chat: <path d="M20.5 12a8 8 0 0 1-11.7 7.1L3.5 20.5l1.4-4.9A8 8 0 1 1 20.5 12z" />,
  poll: <path d="M5.5 20V12M12 20V5M18.5 20v-5" />,
  smile: <path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM8.5 14c.9 1.3 2 2 3.5 2s2.6-.7 3.5-2M9 9.8v.4M15 9.8v.4" />,
  people: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s6.5-5.7 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.3 6.5 11 6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  shield: <path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.6 7 9 4.2-1.4 7-4.8 7-9V6z" />,
  ban: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  pushpin: (
    <>
      <path d="M9 4h6l-1 5.5 3 3.5v1H7v-1l3-3.5L9 4z" />
      <path d="M12 14v6" />
    </>
  ),
};
const Svg = ({ i, size }: { i: keyof typeof Icon; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    {Icon[i]}
  </svg>
);

function DateChip({ e }: { e: EventDTO }) {
  const d = dateChip(e.startsAt, e.timeZone);
  return (
    <div className="date">
      <small>{d.weekday.toUpperCase()}</small>
      {d.day}
    </div>
  );
}

const where = (e: EventDTO) => (e.online ? "Online" : e.neighborhood || e.venue || placeLabel(e));

export default async function Welcome() {
  // read when someone visits (not while the site builds); the lists themselves are kept an hour
  await connection();
  const [events, communities] = await Promise.all([upcomingForLanding(4), communitiesForLanding(5)]);
  const first = events[0] ?? null;

  return (
    <div className={`landing ${display.variable}`}>
      <nav className="lnav" aria-label="Klique">
        <div className="wrap">
          {/* a full load, so "/" is decided again (this page, or the app once you've gone in) */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="logo" href="/">
            klique
          </a>
          <div className="links">
            <a href="#what">Communities</a>
            <a href="#events">Events</a>
            <a href="#kliques">Kliques</a>
            <a href="#download">Download</a>
          </div>
          <div className="navend">
            <a className="login" href="/login">
              Log in
            </a>
            <a className="btn solid" href={IN}>
              Open Klique
            </a>
          </div>
        </div>
      </nav>

      <main className="wrap">
        <section className="hero">
          <div>
            <div className="eyebrow">Lagos · Abuja</div>
            <h1>
              Find your
              <br />
              Klique.
            </h1>
            <p className="lede">Your people, your plans. Communities with real chat rooms, the events on this week, and kliques: small groups heading out together.</p>
            <div className="ctas">
              <a className="btn solid" href={ANDROID_APP_URL} target="_blank" rel="noopener noreferrer">
                <Svg i="play" /> Get it on Google Play
              </a>
              <span className="btn soon" title="Coming soon">
                <Svg i="apple" /> App Store · soon
              </span>
              <a className="btn" href="/download">
                <Svg i="desktop" /> Desktop app
              </a>
              <a className="btn" href={IN}>
                Use it on the web →
              </a>
            </div>
            <div className="chips">
              {["Afrobeats & nightlife", "Football", "Skate & runs", "Book clubs", "Food"].map((c) => (
                <span key={c} className="chip">
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* the desktop app with the phone app over it (an illustration of a community chat, and a real event) */}
          <div className="stage" aria-label="Klique on a computer and a phone">
            <div className="desk" aria-hidden="true">
              <div className="bar">
                <i />
                <i />
                <i />
                <span>Klique · Lagos Skaters</span>
              </div>
              <div className="body">
                <div className="rail">
                  <b className="on">LS</b>
                  <b>RC</b>
                  <b>BK</b>
                  <b>AF</b>
                  <b>+</b>
                </div>
                <div className="rooms">
                  <h4>Lagos Skaters</h4>
                  <div className="sec">INFO</div>
                  <div className="r"># announcements</div>
                  <div className="sec">CHAT</div>
                  <div className="r on"># general</div>
                  <div className="r"># spots-and-routes</div>
                  <div className="sec">BOARD</div>
                  <div className="r">Gear swap</div>
                </div>
                <div className="chat">
                  <div className="msg">
                    <div className="av">AO</div>
                    <div>
                      <b>Amara</b>
                      <small>6:41 PM</small>
                      <p>
                        Sunday sunset session at Lekki? <span className="tagged">@kunle</span> you bringing the cones?
                      </p>
                    </div>
                  </div>
                  <div className="msg">
                    <div className="av">KA</div>
                    <div>
                      <b>Kunle</b>
                      <small>6:43 PM</small>
                      <p>Yes o. Who&apos;s in?</p>
                      <div className="poll">
                        <b>Sunday, what time?</b>
                        <div className="o">
                          <i style={{ width: "68%" }} />
                          <span>5:00 PM</span>
                          <span>68%</span>
                        </div>
                        <div className="o">
                          <i style={{ width: "32%" }} />
                          <span>6:30 PM</span>
                          <span>32%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="composer">Message #general</div>
                </div>
              </div>
            </div>
            <a className="phone" href={first ? `/events/${first.id}` : IN} aria-label={first ? `${first.title}: see the event` : "Open Klique"}>
              <div className="notch">
                <i />
              </div>
              <div className="ph">
                <h5>Coming up</h5>
                <div className="cover">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={first?.coverImage ? cdn(first.coverImage, { w: 480 }) : "/landing/skate.webp"} alt="" />
                  {first && <DateChip e={first} />}
                </div>
                <div className="t">{first?.title ?? "Sunset Skate · Lekki"}</div>
                <div className="s">{first ? `${formatTime(first.startsAt, first.timeZone)} · ${where(first)}` : "5:00 PM · Lekki"}</div>
                <div className="going">
                  <b>Going</b>
                </div>
              </div>
            </a>
          </div>
        </section>

        {/* whatever your thing is */}
        <section className="band" aria-label="What people go out for">
          {[
            ["concert", "Concerts"],
            ["football", "Matchdays"],
            ["skate", "Skate"],
            ["friends", "Picnics"],
            ["books", "Book clubs"],
          ].map(([img, label]) => (
            <figure key={img}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/landing/${img}.webp`} alt="" loading="lazy" />
              <figcaption>{label}</figcaption>
            </figure>
          ))}
        </section>

        <section className="block" id="what">
          <div className="headline">
            <h2>Three ways in. One place.</h2>
            <p>Join a community, find something on this week, or start a klique and go with people who want to go too.</p>
          </div>
          <div className="three">
            <article className="card">
              <div className="eyebrow">Communities</div>
              <h3>Rooms, not one long group chat</h3>
              <p>Chat rooms by topic, a board for longer posts, photos and roles. Public or private, your call.</p>
              <div className="mini">
                <div className="row">
                  <b># general</b>
                  <span>12 new</span>
                </div>
                <div className="row">
                  <b># matchday</b>
                  <span>3 new</span>
                </div>
                <div className="row">
                  <b>Board · Kit swap</b>
                  <span className="pill">Pinned</span>
                </div>
              </div>
            </article>
            <article className="card">
              <div className="eyebrow">Events</div>
              <h3>What&apos;s on, near you</h3>
              <p>Concerts, runs, meetups and parties in Lagos and Abuja, with the ones your friends are going to first.</p>
              <div className="mini">
                {(events.length ? events.slice(0, 3) : []).map((e) => (
                  <a key={e.id} className="row" href={`/events/${e.id}`}>
                    <b>{e.title}</b>
                    <span>{dateChip(e.startsAt, e.timeZone).weekday}</span>
                  </a>
                ))}
                {!events.length && (
                  <div className="row">
                    <b>New events every week</b>
                  </div>
                )}
              </div>
            </article>
            <article className="card" id="kliques">
              <div className="eyebrow">Kliques</div>
              <h3>Don&apos;t go alone</h3>
              <p>Start a small group for an event or a plan. People ask to join, you pick, you meet up.</p>
              <div className="mini">
                <div className="row">
                  <b>Who&apos;s going from Ikeja?</b>
                </div>
                <div className="row">
                  <b>4 of 6 spots</b>
                  <span>Ask to join</span>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="block">
          <div className="headline">
            <h2>From your phone to the place.</h2>
            <p>How a Friday night out comes together on Klique.</p>
          </div>
          <ol className="steps">
            <li>
              <span>1</span>
              <h3>Join a community</h3>
              <p>A skate crew, a run club, an Afrobeats crowd. Public ones are open; private ones ask a question or two.</p>
            </li>
            <li>
              <span>2</span>
              <h3>Find what&apos;s on</h3>
              <p>Events from your communities and your city, with the ones your friends are going to first.</p>
            </li>
            <li>
              <span>3</span>
              <h3>Go with a klique</h3>
              <p>Start one or join one: a few people, a meeting point, a group chat, and you&apos;re not walking in alone.</p>
            </li>
          </ol>
        </section>

        <section className="block">
          <div className="split rev">
            <div className="photo tall">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/friends.webp" alt="" loading="lazy" />
              <div className="kcard">
                <div className="eyebrow">Klique</div>
                <b>{first ? `Who's going to ${first.title}?` : "Dinner before the show, from Lekki?"}</b>
                <div className="s">4 of 6 spots · ask to join</div>
                <div className="going">
                  <b>Ask to join</b>
                </div>
              </div>
            </div>
            <div>
              <div className="eyebrow">Kliques</div>
              <h2 className="big">Never walk in alone.</h2>
              <p className="lead">A klique is a few people going to the same thing. You set the plan and the spots, people ask to join, and you choose who comes. When it&apos;s over, it clears itself away.</p>
              <ul className="list">
                <li>
                  <Svg i="people" />
                  <div>
                    <b>You pick who comes</b>
                    <span>Ask to join by default, with women-only or men-only spots if you want.</span>
                  </div>
                </li>
                <li>
                  <Svg i="pin" />
                  <div>
                    <b>The meeting point stays private</b>
                    <span>Only people in the klique see where you&apos;re meeting.</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="block">
          <div className="split">
            <div>
              <div className="eyebrow">Chat</div>
              <h2 className="big">Talk like you&apos;re already there.</h2>
              <ul className="list">
                <li>
                  <Svg i="chat" />
                  <div>
                    <b>Messages and group chats</b>
                    <span>With photos, a group photo and description, and pinned messages.</span>
                  </div>
                </li>
                <li>
                  <Svg i="poll" />
                  <div>
                    <b>Polls and @tags</b>
                    <span>Decide the time, tag who needs to see it.</span>
                  </div>
                </li>
                <li>
                  <Svg i="smile" />
                  <div>
                    <b>Stickers</b>
                    <span>Search GIPHY right in the chat, or save the ones friends send.</span>
                  </div>
                </li>
              </ul>
            </div>
            <div className="dm" aria-hidden="true">
              <div className="head">
                <div className="av">SC</div>
                <div>
                  <b>Sunday crew</b>
                  <small>Group · 6 members</small>
                </div>
              </div>
              <div className="pin">
                <Svg i="pushpin" />
                <span>
                  <b>Sade:</b> Meet at gate 2, 4:45
                </span>
              </div>
              <div className="bub">Who&apos;s driving from Surulere?</div>
              <div className="bub me">Me. 2 seats left</div>
              <div className="sticker">LOL</div>
              <div className="bub">
                <span className="tagged">@tobi</span> you&apos;re in my car
              </div>
            </div>
          </div>
        </section>

        {/* real upcoming events */}
        {events.length > 0 && (
          <section className="block" id="events">
            <div className="headline">
              <h2>Coming up</h2>
              <p>Real events on Klique right now. Tap one to see it.</p>
            </div>
            <div className="week">
              {events.slice(0, 3).map((e) => (
                <a key={e.id} className="ev" href={`/events/${e.id}`}>
                  <div className="cover">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.coverImage ? cdn(e.coverImage, { w: 640 }) : "/landing/crowd.webp"} alt="" loading="lazy" />
                    <DateChip e={e} />
                  </div>
                  <div className="t">{e.title}</div>
                  <div className="s">
                    {formatTime(e.startsAt, e.timeZone)} · {where(e)}
                  </div>
                  <div className="price">
                    {eventPrice(e.priceNaira, e.currency)}
                    {goingShown(e.goingCount) ? ` · ${goingText(e.goingCount)}` : ""}
                  </div>
                </a>
              ))}
              <Link className="ev more" href="/events">
                <div className="cover">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/landing/crowd.webp" alt="" loading="lazy" />
                  <div className="shade" />
                  <b>See all events →</b>
                </div>
              </Link>
            </div>
          </section>
        )}

        {/* real communities */}
        <section className="block">
          <div className="headline">
            <h2>A community for your thing.</h2>
            <p>Music, sport, books, food, faith, tech, fitness. Find one, or start your own in a minute.</p>
          </div>
          <div className="interests">
            {communities.map((c, i) => (
              <a key={c.slug} href={`/communities/${c.slug}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.cover ? cdn(c.cover, { w: 640 }) : `/landing/${["concert2", "football", "skate", "books", "friends"][i % 5]}.webp`} alt="" loading="lazy" />
                <b>{c.name}</b>
                <small>{[c.line, c.members >= 10 ? `${c.members.toLocaleString("en-NG")} members` : ""].filter(Boolean).join(" · ") || "Community"}</small>
              </a>
            ))}
            <Link href="/communities/new" className="start">
              <b>Start a community</b>
              <small>Free · rooms, roles, events</small>
            </Link>
          </div>
        </section>

        <section className="block">
          <div className="headline">
            <h2>Safe by design.</h2>
            <p>Meeting new people should feel good. Here&apos;s how Klique keeps it that way.</p>
          </div>
          <div className="trust">
            <div>
              <Svg i="lock" />
              <b>Your number stays private</b>
              <p>No phone numbers shared. Chat on Klique, not in a WhatsApp group full of strangers.</p>
            </div>
            <div>
              <Svg i="shield" />
              <b>Auto-filters and admins</b>
              <p>Spam and scam links stopped before anyone sees them. Communities choose their own moderators.</p>
            </div>
            <div>
              <Svg i="ban" />
              <b>Block and report</b>
              <p>One tap blocks someone everywhere. Reports go to the Klique team.</p>
            </div>
            <div>
              <Svg i="check" />
              <b>Verified communities</b>
              <p>A gold check means the community is who it says it is.</p>
            </div>
          </div>
        </section>

        <section className="block" id="download">
          <div className="dl">
            <div>
              <div className="eyebrow" style={{ color: "inherit", opacity: 0.7 }}>
                Download
              </div>
              <h2 style={{ marginTop: 8 }}>On your phone. On your computer.</h2>
              <p>One account everywhere. Your chats, communities and plans follow you.</p>
            </div>
            <div className="platforms">
              <a className="plat" href={ANDROID_APP_URL} target="_blank" rel="noopener noreferrer">
                <Svg i="play" />
                <div>
                  <b>Android</b>
                  <small>Google Play</small>
                </div>
              </a>
              <div className="plat" aria-label="iPhone: coming soon">
                <Svg i="apple" />
                <div>
                  <b>iPhone</b>
                  <small>App Store · coming soon</small>
                </div>
              </div>
              <a className="plat" href="/download">
                <Svg i="desktop" />
                <div>
                  <b>Windows</b>
                  <small>Desktop app</small>
                </div>
              </a>
              <a className="plat" href="/download">
                <Svg i="desktop" />
                <div>
                  <b>Linux</b>
                  <small>.deb · .rpm · AppImage</small>
                </div>
              </a>
              <a className="plat wide" href={IN}>
                <Svg i="globe" />
                <div>
                  <b>Use it in your browser</b>
                  <small>No download: open Klique →</small>
                </div>
              </a>
            </div>
          </div>
        </section>

        <section className="final">
          <div className="photo wide">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/concert.webp" alt="" loading="lazy" />
            <div className="shade" />
            <div className="finaltext">
              <h2>Find your Klique.</h2>
              <p>Free to join. Lagos and Abuja, with more cities coming.</p>
              <div className="ctas">
                <a className="btn solid" href={IN}>
                  Open Klique
                </a>
                <a className="btn" href="/signup">
                  Create an account
                </a>
              </div>
            </div>
          </div>
        </section>

        <footer>
          <span className="logo">klique</span>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/child-safety">Child safety</a>
          <a href="/download">Download</a>
          <span>© Klique</span>
        </footer>
      </main>
    </div>
  );
}
