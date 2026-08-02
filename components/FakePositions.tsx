/**
 * Decorative "open positions" — visual only, zero functionality.
 * Gives the dashboard a lived-in perp feel; nothing here is real or
 * connected to the balance. Simulated data, hardcoded.
 */

const POSITIONS = [
  { symbol: "BTC-PERP", size: "0.0120", entry: "97,420.00", mark: "98,112.50", leverage: "10x", pnl: 120.4 },
  { symbol: "ETH-PERP", size: "0.8500", entry: "3,412.20", mark: "3,359.10", leverage: "5x", pnl: -45.1 },
  { symbol: "SOL-PERP", size: "12.4000", entry: "188.44", mark: "189.48", leverage: "3x", pnl: 12.88 },
];

export default function FakePositions() {
  return (
    <section className="rounded-2xl border border-edge bg-panel p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-mono text-[11px] tracking-[0.2em] text-muted">
          OPEN POSITIONS
        </h2>
        <span className="font-mono text-[10px] text-muted">
          simulated — display only
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-edge text-left font-mono text-[10px] tracking-wider text-muted">
            <th className="pb-2 font-normal">MARKET</th>
            <th className="pb-2 text-right font-normal">SIZE</th>
            <th className="pb-2 text-right font-normal">ENTRY</th>
            <th className="pb-2 text-right font-normal">MARK</th>
            <th className="pb-2 text-right font-normal">LVG</th>
            <th className="pb-2 text-right font-normal">UNREALIZED PNL</th>
          </tr>
        </thead>
        <tbody>
          {POSITIONS.map((p) => (
            <tr key={p.symbol} className="border-b border-edge/50 last:border-0">
              <td className="py-3 font-medium text-white">{p.symbol}</td>
              <td className="tnum py-3 text-right font-mono text-slate-300">{p.size}</td>
              <td className="tnum py-3 text-right font-mono text-slate-300">{p.entry}</td>
              <td className="tnum py-3 text-right font-mono text-slate-300">{p.mark}</td>
              <td className="py-3 text-right font-mono text-muted">{p.leverage}</td>
              <td
                className={`tnum py-3 text-right font-mono ${
                  p.pnl >= 0 ? "text-up" : "text-down"
                }`}
              >
                {p.pnl >= 0 ? "+" : "−"}${Math.abs(p.pnl).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
