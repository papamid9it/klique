import { connection } from "next/server";
import { Suspense } from "react";

const Connection = async () => {
  await connection();
  return null;
};

/**
 * Renders nothing. Placed on pages whose title and share preview depend on the URL (an event or community id):
 * it tells Next.js that part of the route is resolved per request, while the page itself still prerenders
 * and paints instantly.
 */
export function DynamicMarker() {
  return (
    <Suspense>
      <Connection />
    </Suspense>
  );
}
