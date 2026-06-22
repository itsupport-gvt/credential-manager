export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'Active'      ? 'badge-active'  :
    status === 'Inactive'    ? 'badge-warn'    :
    status === 'Expired'     ? 'badge-danger'  :
    status === 'Compromised' ? 'badge-danger'  :
    'badge-neutral'
  return <span className={cls}>{status}</span>
}
