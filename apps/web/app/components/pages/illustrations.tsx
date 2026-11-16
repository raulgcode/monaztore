import type { StoreIllustrationId } from "@monaztore/contracts";
import type * as React from "react";
import { cn } from "~/lib/utils";

/**
 * The drawings a store puts on its cover and its pages: flat shapes painted with the store's own
 * tokens (its brand color, the soft accent, cards and text), so they follow the theme and the
 * dark mode, and weigh nothing to download. The ids are `storeIllustrationIds` in contracts.
 */

const line = "stroke-foreground";
const card = cn("fill-card", line);
const brand = cn("fill-primary", line);

/** A four-point sparkle centered on (x, y). */
function Sparkle({ x, y, size = 8 }: { x: number; y: number; size?: number }) {
  const s = size;
  const k = s / 4;
  return (
    <path
      d={`M${x} ${y - s}C${x + k / 2} ${y - k} ${x + k} ${y - k / 2} ${x + s} ${y}C${x + k} ${y + k / 2} ${x + k / 2} ${y + k} ${x} ${y + s}C${x - k / 2} ${y + k} ${x - k} ${y + k / 2} ${x - s} ${y}C${x - k} ${y - k / 2} ${x - k / 2} ${y - k} ${x} ${y - s}Z`}
      className="fill-primary"
      strokeWidth={0}
    />
  );
}

/** A heart about `size` wide, centered on (x, y). */
function Heart({
  x,
  y,
  size = 16,
  className = "fill-primary",
}: {
  x: number;
  y: number;
  size?: number;
  className?: string;
}) {
  const s = size / 24;
  return (
    <path
      transform={`translate(${x - 12 * s} ${y - 13 * s}) scale(${s})`}
      d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z"
      className={className}
      strokeWidth={0}
    />
  );
}

/** One sock, about 62 × 90, its top-left corner at the origin. */
function Sock({ transform, fill = "fill-card" }: { transform: string; fill?: string }) {
  return (
    <g transform={transform}>
      <path
        d="M2 0H44V50L62 64A14 14 0 0 1 54 90H28A26 26 0 0 1 2 64Z"
        className={cn(fill, line)}
      />
      <path d="M2 0H44V12H2Z" className={brand} />
      <path d="M2 24H44M2 32H44" className="stroke-primary" strokeWidth={4} />
      <path
        d="M48 87A14 14 0 0 0 61 66L56 62C50 70 48 80 48 87Z"
        className="fill-primary"
        strokeWidth={0}
      />
      <Heart x={23} y={46} size={14} />
    </g>
  );
}

const drawings: Record<StoreIllustrationId, React.ReactNode> = {
  photo: (
    <>
      <rect x={70} y={22} width={60} height={106} rx={11} className={card} />
      <rect x={78} y={36} width={44} height={52} rx={4} className="fill-muted" strokeWidth={0} />
      <path d="M78 82l14-16 10 10 8-8 12 14v6H78Z" className="fill-primary" strokeWidth={0} />
      <circle cx={111} cy={50} r={5} className="fill-primary" strokeWidth={0} />
      <rect x={86} y={100} width={28} height={10} rx={5} className="fill-primary" strokeWidth={0} />
      <circle cx={140} cy={40} r={15} className={brand} />
      <path d="M140 47V33m-6 6 6-6 6 6" className="stroke-primary-foreground" />
      <Sparkle x={50} y={46} />
      <Sparkle x={154} y={100} size={6} />
    </>
  ),
  chat: (
    <>
      <path
        d="M54 30h52a14 14 0 0 1 14 14v18a14 14 0 0 1-14 14H68l-14 12V76a14 14 0 0 1-14-14V44a14 14 0 0 1 14-14Z"
        className={card}
      />
      <path d="M56 48h44M56 60h28" className="stroke-muted-foreground" />
      <path
        d="M100 70h46a14 14 0 0 1 14 14v12a14 14 0 0 1-14 14h-2v12l-14-12h-30a14 14 0 0 1-14-14V84a14 14 0 0 1 14-14Z"
        className={brand}
      />
      <circle cx={112} cy={90} r={4} className="fill-primary-foreground" strokeWidth={0} />
      <circle cx={124} cy={90} r={4} className="fill-primary-foreground" strokeWidth={0} />
      <circle cx={136} cy={90} r={4} className="fill-primary-foreground" strokeWidth={0} />
      <Heart x={146} y={36} size={18} />
      <Sparkle x={40} y={104} size={6} />
    </>
  ),
  design: (
    <>
      <rect x={44} y={22} width={100} height={102} rx={10} className={card} />
      <g transform="translate(70 34)">
        <path
          d="M2 0H44V50L62 64A14 14 0 0 1 54 90H28A26 26 0 0 1 2 64Z"
          className="fill-accent stroke-primary"
          strokeDasharray="6 5"
        />
        <Heart x={23} y={40} size={16} />
      </g>
      <g transform="rotate(-42 146 104)">
        <rect x={120} y={98} width={46} height={12} rx={3} className={brand} />
        <path d="M120 98l-12 6 12 6Z" className={card} />
        <path d="M166 98h-8v12h8" className="fill-muted stroke-foreground" />
      </g>
      <circle cx={34} cy={110} r={7} className={brand} />
      <circle cx={34} cy={88} r={7} className="fill-accent stroke-foreground" />
      <Sparkle x={160} y={34} />
    </>
  ),
  approve: (
    <>
      <rect x={70} y={22} width={60} height={106} rx={11} className={card} />
      <circle cx={100} cy={64} r={20} className={brand} />
      <path d="m90 64 7 7 13-14" className="stroke-primary-foreground" strokeWidth={4} />
      <rect x={82} y={96} width={36} height={6} rx={3} className="fill-muted" strokeWidth={0} />
      <rect x={88} y={108} width={24} height={6} rx={3} className="fill-muted" strokeWidth={0} />
      <Sparkle x={52} y={52} />
      <Sparkle x={150} y={44} size={6} />
      <Heart x={150} y={98} size={18} />
    </>
  ),
  make: (
    <>
      <rect x={56} y={44} width={88} height={34} rx={8} className={brand} />
      <rect x={40} y={74} width={120} height={38} rx={8} className={card} />
      <path d="M62 92h56" className="stroke-muted-foreground" />
      <circle cx={138} cy={92} r={5} className="fill-primary" strokeWidth={0} />
      <path
        d="M70 112h60v14c-10 4-20-4-30 0s-20 4-30 0Z"
        className="fill-accent stroke-foreground"
      />
      <Heart x={100} y={119} size={10} />
      <circle cx={100} cy={61} r={8} className="fill-primary-foreground" strokeWidth={0} />
      <Sparkle x={160} y={36} />
      <Sparkle x={38} y={46} size={6} />
    </>
  ),
  deliver: (
    <>
      <path d="M60 60l14-16h60l-14 16Z" className="fill-muted stroke-foreground" />
      <path d="M120 60l14-16v50l-14 16Z" className="fill-accent stroke-foreground" />
      <rect x={60} y={60} width={60} height={50} className={card} />
      <path d="M82 60h16v50H82Z" className="fill-primary" strokeWidth={0} />
      <path d="M90 44h16l-8 16H82Z" className="fill-primary" strokeWidth={0} />
      <rect x={60} y={60} width={60} height={50} className="stroke-foreground" fill="none" />
      <path d="M26 72h22M20 86h28M30 100h18" className="stroke-muted-foreground" />
      <path d="M154 66s-15-14-15-25a15 15 0 0 1 30 0c0 11-15 25-15 25Z" className={brand} />
      <circle cx={154} cy={41} r={5} className="fill-card" strokeWidth={0} />
      <Sparkle x={40} y={40} size={6} />
    </>
  ),
  gift: (
    <>
      <rect x={58} y={70} width={84} height={52} rx={4} className={brand} />
      <rect x={50} y={56} width={100} height={18} rx={4} className={brand} />
      <rect x={92} y={56} width={16} height={66} className={card} />
      <path d="M100 56c-10-18-32-20-30-6 2 9 20 9 30 6Z" className={card} />
      <path d="M100 56c10-18 32-20 30-6-2 9-20 9-30 6Z" className={card} />
      <Sparkle x={40} y={44} />
      <Sparkle x={160} y={40} size={6} />
      <Heart x={162} y={100} size={16} />
    </>
  ),
  socks: (
    <>
      <Sock transform="translate(96 26) rotate(10)" />
      <Sock transform="translate(52 32) rotate(-6)" />
      <Sparkle x={40} y={40} />
      <Sparkle x={168} y={110} size={6} />
    </>
  ),
  mug: (
    <>
      <path
        d="M78 42c-6-8 6-12 0-20M96 42c-6-8 6-12 0-20M114 42c-6-8 6-12 0-20"
        className="stroke-primary"
      />
      <path d="M128 58h8a17 17 0 0 1 0 34h-8M128 68h6a7 7 0 0 1 0 14h-6" className={line} />
      <path d="M58 50h70v52a20 20 0 0 1-20 20H78a20 20 0 0 1-20-20Z" className={card} />
      <path d="M58 60h70" className="stroke-primary" strokeWidth={5} />
      <Heart x={93} y={88} size={26} />
      <Sparkle x={42} y={74} size={6} />
      <Sparkle x={160} y={44} />
    </>
  ),
  heart: (
    <>
      <path
        transform="translate(52 22) scale(4)"
        d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z"
        className={brand}
        strokeWidth={0.75}
      />
      <path d="M86 58a10 10 0 0 1 10-8" className="stroke-primary-foreground" strokeWidth={4} />
      <Heart x={44} y={46} size={18} />
      <Heart x={158} y={104} size={14} />
      <Sparkle x={156} y={40} />
      <Sparkle x={42} y={106} size={6} />
    </>
  ),
};

/** One of the store's drawings, on its soft accent blob. Decorative: the text beside it says it. */
export function Illustration({ id, className }: { id: StoreIllustrationId; className?: string }) {
  return (
    <svg
      viewBox="0 0 200 150"
      aria-hidden
      focusable="false"
      fill="none"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-auto w-full", className)}
      data-illustration={id}
    >
      <path
        d="M28 80c0-38 34-64 76-64s70 24 70 58-30 62-74 62S28 118 28 80Z"
        className="fill-accent"
        strokeWidth={0}
      />
      {drawings[id]}
    </svg>
  );
}
