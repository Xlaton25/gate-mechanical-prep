import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/app/ui";
import { listAdminUsers, toggleAdminRole } from "@/lib/admin.functions";

const ERR: Record<string, string> = { cannot_revoke_self: "You can't remove your own admin access." };

export function AdminRoleManager() {
  const qc = useQueryClient();
  const list = useServerFn(listAdminUsers);
  const toggle = useServerFn(toggleAdminRole);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => list() });
  const m = useMutation({
    mutationFn: (v: { targetUserId: string; grant: boolean }) => toggle({ data: v }),
    onSuccess: (r) => { setMsg(r.ok ? null : ERR[r.error ?? ""] ?? "Couldn't update access."); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: () => setMsg("Couldn't update access."),
  });
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (users.data?.users ?? []).filter((u) => !s || (u.email ?? "").toLowerCase().includes(s))
      .sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin));
  }, [users.data, q]);

  return (
    <Panel title="Admin access" className="mb-6">
      <p className="mb-3 text-sm text-muted-foreground">Give or remove admin access. Admins keep all student features.</p>
      <Input type="search" placeholder="Search by email" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3 h-11 rounded-xl" aria-label="Search accounts" />
      {msg && <p role="alert" className="mb-3 text-sm text-destructive">{msg}</p>}
      {users.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading accounts…</p>
        : users.isError ? <p role="alert" className="text-sm text-destructive">Couldn't load accounts.</p>
        : rows.length === 0 ? <p className="text-sm text-muted-foreground">No matching accounts.</p>
        : (
          <ul className="divide-y rounded-xl border">
            {rows.map((u) => {
              const self = u.userId === users.data?.selfId;
              return (
                <li key={u.userId} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    {u.isAdmin && <Shield className="h-4 w-4 shrink-0 text-primary" aria-label="Admin" />}
                    <span className="truncate">{u.email ?? u.userId}</span>
                    {self && <span className="text-xs text-muted-foreground">(you)</span>}
                  </div>
                  <Button size="sm" variant={u.isAdmin ? "outline" : "default"} className="h-11 shrink-0"
                    disabled={m.isPending || (self && u.isAdmin)}
                    onClick={() => m.mutate({ targetUserId: u.userId, grant: !u.isAdmin })}>
                    {u.isAdmin ? "Remove admin" : "Make admin"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
    </Panel>
  );
}
