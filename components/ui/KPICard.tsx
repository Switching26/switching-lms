export default function KPICard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-border p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow duration-300 group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] sm:text-[13px] font-medium text-warm-500 mb-2 uppercase tracking-wider">{label}</p>
          <p className="text-2xl sm:text-3xl font-display font-bold text-primary tracking-tight">{value}</p>
          {sub && <p className="text-xs text-warm-400 mt-1.5">{sub}</p>}
        </div>
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center text-warm-400 group-hover:bg-warm-100 transition-colors flex-shrink-0">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
