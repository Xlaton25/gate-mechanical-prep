import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/ui";
import { useAuth } from "@/lib/auth";
import { checkIsAdmin } from "@/lib/admin.functions";

export function AdminGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const userId = auth.user?.id;
  const q = useQuery({ queryKey: ["is-admin", userId], queryFn: () => checkIsAdmin(), enabled: !!userId, staleTime: 60_000 });

  useEffect(() => {
    if (auth.status === "signed_out") navigate({ to: "/admin-login", replace: true });
  }, [auth.status, navigate]);

  if (auth.status !== "signed_in" || q.isPending) return <p role="status" className="py-10 text-sm text-muted-foreground">Checking access…</p>;
  if (q.data?.isAdmin) return <>{children}</>;
  return (
    <EmptyState icon={ShieldAlert} title="Admins only">
      {q.isError || q.data?.error ? "Couldn't check your access. Try again later." : "This account doesn't have admin access."}
      <div className="mt-4"><Button asChild variant="outline"><Link to="/">Back to home</Link></Button></div>
    </EmptyState>
  );
}
