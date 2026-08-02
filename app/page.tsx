import Landing from "@/components/Landing";

// PrivyProvider validates the app id at render time; prerendering at build
// (where no real app id exists) would fail. The page is fully interactive
// anyway — skip static optimization.
export const dynamic = "force-dynamic";

export default function Page() {
  return <Landing />;
}
