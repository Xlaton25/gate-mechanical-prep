import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";

// Simulate an unconfigured generated client: any property access throws.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy({}, { get() { throw new Error("Supabase env missing"); } }),
}));

function Probe() {
  const { status } = useAuth();
  return <p data-testid="status">{status}</p>;
}
const tree = () => (
  <QueryClientProvider client={new QueryClient()}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>
);

describe("AuthProvider without a configured client", () => {
  it("renders on the server without touching the client", () => {
    expect(renderToString(tree())).toContain("loading");
  });
  it("reports unavailable on the client", async () => {
    render(tree());
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unavailable"));
  });
});
