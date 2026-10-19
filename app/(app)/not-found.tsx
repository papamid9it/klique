import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";

export default function NotFound() {
  return (
    <EmptyState icon="search" title="We couldn't find that" action={<Button href="/" variant="primary">Back to Discover</Button>}>
      The page may have moved, or it might be private.
    </EmptyState>
  );
}
