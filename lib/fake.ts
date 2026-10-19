/** Stand-in pictures for events that have no cover yet (until hosts upload their own). Local files, so they work offline. */
const PHOTOS = ["/mock/img-1.jpg", "/mock/img-2.jpg", "/mock/img-3.jpg", "/mock/img-4.jpg", "/mock/img-5.jpg", "/mock/img-6.jpg"];

export function eventPhoto(id: string, cover?: string | null): string {
  if (cover) return cover;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return PHOTOS[Math.abs(h) % PHOTOS.length];
}
