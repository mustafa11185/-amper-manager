export default function AmperLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="#1B4FD8" />
      <text x="16" y="21" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">⚡</text>
    </svg>
  )
}
