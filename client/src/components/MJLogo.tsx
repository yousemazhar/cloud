export function MJLogo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="mj-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#85b8ff"/>
          <stop offset="100%" stopColor="#2684ff"/>
        </linearGradient>
      </defs>
      <path d="M16 2 L30 16 L16 30 L2 16 Z" fill="url(#mj-grad)"/>
      <path d="M9 12 L9 20 L12 20 L12 15 L14 18 L16 15 L16 20 L19 20 L19 12 L16 12 L14 14.5 L12 12 Z" fill="white"/>
    </svg>
  );
}
