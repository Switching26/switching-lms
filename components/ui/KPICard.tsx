export default function KPICard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4 sm:p-6">
      <p className="text-xs sm:text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-xl sm:text-2xl font-semibold text-primary">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}
