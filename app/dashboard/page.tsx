import Dashboard from "@/components/Dashboard";

// See app/page.tsx — PrivyProvider can't initialize during build prerender.
export const dynamic = "force-dynamic";

export default function Page() {
  return <Dashboard />;
}
