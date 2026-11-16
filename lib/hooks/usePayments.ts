"use client";

import ApiClient from "@/app/ApiCore";
import { useApi } from "@/lib/hooks/useApi";
import type { Envelope, PaymentsPublicDTO } from "@/lib/types";

const api = new ApiClient();

/** Can people pay on the website right now, and give to communities? (Admin → System.) Null while loading. */
export function usePayments(): PaymentsPublicDTO | null {
  const { data } = useApi(() => api.get<Envelope<PaymentsPublicDTO>>("/api/app/payments", undefined, { ttl: 60 }), [], { key: "payments-public" });
  return data ?? null;
}
