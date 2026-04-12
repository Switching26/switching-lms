const variants: Record<string, string> = {
  default: "bg-warm-100 text-warm-600 border-warm-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-100",
  warning: "bg-amber-50 text-amber-700 border-amber-100",
  error: "bg-rose-50 text-rose-700 border-rose-100",
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  purple: "bg-violet-50 text-violet-700 border-violet-100",
}

export default function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${variants[variant] || variants.default}`}>
      {children}
    </span>
  )
}
