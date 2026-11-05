/**
 * Turns an update from GitHub into the words a channel shows. Returns null for anything we don't post, so a repo that
 * sends every event doesn't fill the channel.
 */

const MAX_CONTENT = 2000;
const MAX_COMMITS = 5;

interface Person { login?: string }
interface Numbered { number?: number; title?: string; html_url?: string; draft?: boolean; merged?: boolean; pull_request?: unknown }
export interface GithubPayload {
  action?: string;
  zen?: string;
  ref?: string;
  deleted?: boolean;
  compare?: string;
  commits?: { message?: string }[];
  sender?: Person;
  repository?: { full_name?: string; html_url?: string };
  organization?: Person;
  pull_request?: Numbered;
  issue?: Numbered;
  comment?: { body?: string; html_url?: string };
  review?: { state?: string; html_url?: string };
  release?: { name?: string | null; tag_name?: string; html_url?: string };
  forkee?: { full_name?: string; html_url?: string };
}

/**
 * Words from GitHub, on one line. Anyone can write an issue title on a public repo, so an @ is split with an invisible
 * character: it reads the same, but can't ping someone here.
 */
function clean(text: unknown, max = 200): string {
  if (typeof text !== "string") return "";
  const line = text.replace(/\s+/g, " ").trim().replace(/@/g, "@​");
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

const lines = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join("\n").slice(0, MAX_CONTENT);

export function githubMessage(event: string, p: GithubPayload): string | null {
  const who = clean(p.sender?.login, 60) || "Someone";
  const repo = clean(p.repository?.full_name, 120) || clean(p.organization?.login, 60) || "the repo";

  switch (event) {
    case "ping":
      return `GitHub is connected to ${repo}. Updates will show up here.`;

    case "push": {
      // a new tag is announced by its release, and a deleted branch isn't news
      if (p.deleted || !p.ref?.startsWith("refs/heads/") || !p.commits?.length) return null;
      const n = p.commits.length;
      const shown = p.commits.slice(0, MAX_COMMITS).map((c) => `• ${clean(c.message?.split("\n")[0], 100)}`);
      return lines(`${who} pushed ${n} ${n === 1 ? "commit" : "commits"} to ${clean(p.ref.slice("refs/heads/".length), 80)} in ${repo}`, ...shown, n > MAX_COMMITS && `…and ${n - MAX_COMMITS} more`, p.compare);
    }

    case "pull_request": {
      const pr = p.pull_request;
      if (!pr) return null;
      const did = p.action === "opened" ? (pr.draft ? "opened a draft pull request" : "opened a pull request") : p.action === "ready_for_review" ? "marked ready for review a pull request" : p.action === "reopened" ? "reopened a pull request" : p.action === "closed" ? (pr.merged ? "merged a pull request" : "closed a pull request") : null;
      return did && lines(`${who} ${did} in ${repo}`, `#${pr.number}: ${clean(pr.title)}`, pr.html_url);
    }

    case "pull_request_review": {
      const pr = p.pull_request;
      const did = p.review?.state === "approved" ? "approved" : p.review?.state === "changes_requested" ? "asked for changes on" : null;
      return p.action === "submitted" && pr && did ? lines(`${who} ${did} a pull request in ${repo}`, `#${pr.number}: ${clean(pr.title)}`, p.review?.html_url ?? pr.html_url) : null;
    }

    case "issues": {
      const issue = p.issue;
      const did = p.action === "opened" ? "opened an issue" : p.action === "closed" ? "closed an issue" : p.action === "reopened" ? "reopened an issue" : null;
      return issue && did ? lines(`${who} ${did} in ${repo}`, `#${issue.number}: ${clean(issue.title)}`, issue.html_url) : null;
    }

    case "issue_comment": {
      const issue = p.issue;
      if (p.action !== "created" || !issue || !p.comment) return null;
      return lines(`${who} commented on ${issue.pull_request ? "a pull request" : "an issue"} in ${repo}`, `#${issue.number}: ${clean(issue.title)}`, clean(p.comment.body, 300), p.comment.html_url);
    }

    case "release": {
      const r = p.release;
      return p.action === "published" && r ? lines(`${who} released ${clean(r.name, 100) || clean(r.tag_name, 100) || "a new version"} of ${repo}`, r.html_url) : null;
    }

    case "star":
      return p.action === "created" ? lines(`${who} starred ${repo}`, p.repository?.html_url) : null;

    case "fork":
      return lines(`${who} forked ${repo}`, p.forkee?.html_url);

    default:
      return null;
  }
}
