export function PriorityBadge({ priority }: { priority: string }) {
  const cls =
    priority === 'Critical' ? 'badge-danger'  :
    priority === 'High'     ? 'badge-warn'    :
    priority === 'Medium'   ? 'badge-blue'    :
    'badge-neutral'
  return <span className={cls}>{priority}</span>
}
