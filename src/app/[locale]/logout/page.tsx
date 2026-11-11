"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";
import { useParams } from "next/navigation";

export default function LogoutPage() {
  const { locale } = useParams<{ locale: string }>();
  useEffect(() => {
    void signOut({ callbackUrl: `/${locale}` });
  }, [locale]);
  return <p className="p-8">Déconnexion…</p>;
}
