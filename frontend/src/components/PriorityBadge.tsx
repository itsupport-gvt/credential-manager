interface PriorityBadgeProps {
  priority: string
}

const priorityConfig: Record<string, { bg: string; text: string }> = {
  Critical: { bg: 'bg-red-100', text: 'text-red-800' },
  High: { bg: 'bg-orange-100', text: 'text-orange-800' },
  Medium: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  Low: { bg: 'bg-green-100', text: 'text-green-800' },
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const config = priorityConfig[priority] ?? { bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
    >
      {priority}
    </span>
  )
}
