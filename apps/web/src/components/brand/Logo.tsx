import { BRAND, SPADE_PATH } from "./brand";

/**
 * 로고: 부채꼴로 펼친 카드 세 장(가운데가 마이티 ♠A) 위에 글자.
 * `animated`면 카드가 펼쳐지며 나타난다(스플래시용).
 */
export function Logo({
  size = 280,
  animated = false,
}: {
  size?: number;
  animated?: boolean;
}) {
  const cards = [
    { rotate: -18, x: -34, delay: 0.05 },
    { rotate: 18, x: 34, delay: 0.1 },
    { rotate: 0, x: 0, delay: 0 },
  ];
  return (
    <svg
      viewBox="0 0 320 250"
      width={size}
      height={(size * 250) / 320}
      role="img"
      aria-label={`${BRAND.name} ${BRAND.englishName}`}
      className="max-w-none overflow-visible"
      style={{ width: size, height: (size * 250) / 320 }}
    >
      <defs>
        <linearGradient id="logo-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="1" stopColor="#e0a526" />
        </linearGradient>
      </defs>
      <g transform="translate(160 92)">
        {cards.map((c, i) => (
          <g
            key={c.rotate}
            className={animated ? "logo-card" : undefined}
            style={
              {
                "--logo-rotate": `${c.rotate}deg`,
                "--logo-x": `${c.x}px`,
                animationDelay: `${c.delay}s`,
                transform: animated
                  ? undefined
                  : `translateX(${c.x}px) rotate(${c.rotate}deg)`,
                transformOrigin: "0 70px",
              } as React.CSSProperties
            }
          >
            <rect
              x={-38}
              y={-54}
              width={76}
              height={106}
              rx={9}
              fill="#fff"
              stroke="#d6d3d1"
              strokeWidth={1.5}
            />
            {i === 2 ? (
              <>
                <text
                  x={-28}
                  y={-34}
                  fontSize={18}
                  fontWeight={800}
                  fill={BRAND.ink}
                  fontFamily="system-ui, sans-serif"
                >
                  A
                </text>
                <path
                  d={SPADE_PATH}
                  fill={BRAND.ink}
                  transform="translate(-22 -18) scale(0.44)"
                />
              </>
            ) : (
              <rect
                x={-31}
                y={-47}
                width={62}
                height={92}
                rx={6}
                fill={BRAND.felt}
                opacity={0.9}
              />
            )}
          </g>
        ))}
      </g>
      <text
        x={160}
        y={205}
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight={900}
        fontSize={58}
        letterSpacing={2}
        fill="url(#logo-gold)"
        stroke="#3d2a00"
        strokeWidth={1.5}
        paintOrder="stroke"
      >
        마이티
      </text>
      <text
        x={160}
        y={238}
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight={700}
        fontSize={18}
        letterSpacing={10}
        fill="#ffffff"
        opacity={0.75}
      >
        MIGHTY
      </text>
    </svg>
  );
}
