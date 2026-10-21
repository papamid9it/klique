"use client";

import { useEffect, type ReactNode } from "react";
import { CategoryService } from "@/app/services/CategoryService";
import { setCategories } from "@/lib/constants";
import { AuthProvider } from "./AuthProvider";
import { PlaceProvider } from "./PlaceProvider";
import { RealtimeProvider } from "./RealtimeProvider";
import { ProfileCardProvider } from "./ProfileCardProvider";
import { ThemeProvider } from "./ThemeProvider";
import { ToastProvider } from "./ToastProvider";

/** The admin's category list: the built-in defaults show until it arrives (they're the usual answer anyway). */
function useLoadCategories() {
  useEffect(() => {
    CategoryService.list().then((r) => setCategories(r.data), () => {});
  }, []);
}

export function Providers({ children }: { children: ReactNode }) {
  useLoadCategories();
  return (
    <ToastProvider>
      <AuthProvider>
        <RealtimeProvider>
          <ThemeProvider>
            <PlaceProvider>
              <ProfileCardProvider>{children}</ProfileCardProvider>
            </PlaceProvider>
          </ThemeProvider>
        </RealtimeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
