/**
 * AmperLogo — Voltage Hex Mark (manager-app · blue)
 * Matches /brand/src/icon-blue.svg
 */
export default function AmperLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Amper"
    >
      <polygon
        points="60,14 100,37 100,83 60,106 20,83 20,37"
        fill="none"
        stroke="#1B4FD8"
        strokeWidth="5"
        strokeLinejoin="miter"
      />
      <path
        d="M66,24 L50,60 L62,60 L46,96 L76,56 L62,56 Z"
        fill="#2D8CFF"
      />
    </svg>
  );
}
