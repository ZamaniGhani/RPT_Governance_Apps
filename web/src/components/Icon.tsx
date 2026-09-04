type Shape = { type: 'path'; d: string } | { type: 'circle'; cx: number; cy: number; r: number };

const ICONS: Record<string, Shape[]> = {
  alerts: [
    { type: 'path', d: 'M10.268 21a2 2 0 0 0 3.464 0M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326' },
  ],
  intake: [{ type: 'path', d: 'M5 12h14M12 5v14' }],
  register: [{ type: 'path', d: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' }],
  audit: [{ type: 'path', d: 'M12 8v4l3 2M3.05 11a9 9 0 1 1 .5 4M3 3v8h8' }],
  guidance: [{ type: 'path', d: 'M6 3v12a3 3 0 0 0 3 3h6M18 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z' }],
  users: [
    { type: 'path', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
    { type: 'circle', cx: 9, cy: 7, r: 4 },
    { type: 'path', d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
    { type: 'path', d: 'M16 3.13a4 4 0 0 1 0 7.75' },
  ],
};

export function Icon({ name, size = 15 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none', opacity: 0.8 }}
    >
      {ICONS[name].map((shape, i) =>
        shape.type === 'circle' ? <circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} /> : <path key={i} d={shape.d} />
      )}
    </svg>
  );
}
