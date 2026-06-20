interface StatusBadgeProps {
  status: string
}

const statusConfig: Record<string, { bg: string; text: string; label?: string }> = {
  Active: { bg: 'bg-green-100', text: 'text-green-800' },
  Inactive: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  Expired: { bg: 'bg-red-100', text: 'text-red-700' },
  Compromised: { bg: 'bg-red-200', text: 'text-red-900', label: 'font-bold' },
  Archived: { bg: 'bg-gray-100', text: 'text-gray-600' },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text} ${config.label ?? ''}`}
    >
      {status}
    </span>
  )
}
