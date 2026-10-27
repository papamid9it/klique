import { DynamicMarker } from "@/components/layout/DynamicMarker";
import { ProfileRedirect } from "./ProfileRedirect";

/**
 * There's no profile page any more: a profile is the pop-up card. Old and shared /people/<handle> links keep
 * their preview (layout.tsx) and land on Home with that person's card open.
 */
export default function ProfilePage() {
  return (
    <>
      <ProfileRedirect />
      <DynamicMarker />
    </>
  );
}
