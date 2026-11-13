import { useId } from "react";

const legacyCandyMap: Record<string, string> = {
  six: "gummy_star",
  seven: "swirl_lollipop",
  eight: "jelly_drop",
  nine: "sugar_crystal",
  ten: "wrapped_candy",
  jack: "gummy_bear",
  queen: "gummy_star",
  king: "sugar_crystal",
  ace: "gummy_bear",
};

const symbolLabels: Record<string, string> = {
  fruit_cherry: "Вишня",
  fruit_lemon: "Лимон",
  fruit_grape: "Виноград",
  fruit_melon: "Дыня",
  fruit_plum: "Слива",
  candy_star: "Сахарная звезда",
  candy_swirl: "Карамельный вихрь",
  candy_wrap: "Конфета в фантике",
  candy_jelly: "Желейный кубик",
  gummy_star: "Жевательная звезда",
  jelly_drop: "Желейная капля",
  wrapped_candy: "Конфета в обёртке",
  swirl_lollipop: "Леденец с завитком",
  sugar_crystal: "Сахарный кристалл",
  gummy_bear: "Мармеладный медведь",
  scatter: "Золотой scatter",
  neutral: "Нейтральный символ",
};

type SlotSymbolArtworkProps = {
  symbol: string;
  className?: string;
};

export function SlotSymbolArtwork({ symbol, className }: SlotSymbolArtworkProps) {
  const generatedId = useId();
  const id = `ace-candy-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const normalized = legacyCandyMap[symbol] ?? symbol;
  const gradient = (name: string) => `${id}-${name}`;
  const svgProps = {
    viewBox: "0 0 100 100",
    role: "img" as const,
    "aria-label": normalized.startsWith("multiplier_")
      ? `Бомба-множитель ×${normalized.slice("multiplier_".length)}`
      : symbolLabels[normalized] ?? normalized.replaceAll("_", " "),
    className,
    focusable: false,
  };

  if (normalized.startsWith("multiplier_")) {
    const multiplier = Number.parseInt(normalized.slice("multiplier_".length), 10);
    const multiplierValues = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100];
    const multiplierIndex = multiplierValues.indexOf(multiplier);
    const multiplierScale = multiplier === 100
      ? 1.28
      : multiplier === 50
        ? 1.22
        : 1 + (Math.max(0, multiplierIndex) / 10) * .12;
    return (
      <svg {...svgProps} style={{ transform: `scale(${multiplierScale})` }}>
        <defs>
          <radialGradient id={gradient("bomb")} cx="30%" cy="22%" r="82%">
            <stop stopColor="#fff7b0" />
            <stop offset=".22" stopColor="#ffe34f" />
            <stop offset=".48" stopColor="#ff6ac8" />
            <stop offset=".77" stopColor="#8b4dff" />
            <stop offset="1" stopColor="#24cbed" />
          </radialGradient>
          <linearGradient id={gradient("rim")} x1=".12" y1=".05" x2=".9" y2=".95">
            <stop stopColor="#fff9c7" />
            <stop offset=".28" stopColor="#ffde52" />
            <stop offset=".62" stopColor="#ff64c7" />
            <stop offset="1" stopColor="#48ebff" />
          </linearGradient>
          <linearGradient id={gradient("type")} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#ffffff" />
            <stop offset="1" stopColor="#fff39a" />
          </linearGradient>
          <filter id={gradient("glow")} x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id={gradient("fuse")} x1="0" y1="1" x2="1" y2="0">
            <stop stopColor="#ff7b52" />
            <stop offset="1" stopColor="#fff7b0" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="53" r="43" fill="#ff4ec7" opacity=".18" filter={`url(#${gradient("glow")})`} />
        <path d="m48 11 7 7 11-4 3 11 12 4-4 11 10 8-9 9 2 12-12 2-6 11-10-7-11 5-6-10-12-2 2-12-9-8 8-9-3-12 12-3 4-11Z" fill={`url(#${gradient("rim")})`} stroke="#fff7c3" strokeWidth="2.4" strokeLinejoin="round" />
        <circle cx="49" cy="54" r="30" fill={`url(#${gradient("bomb")})`} stroke="#fff7cf" strokeWidth="3" />
        <circle cx="49" cy="54" r="25" fill="none" stroke="#7b39bc" strokeWidth="2" opacity=".65" />
        <path d="M24 60c5-18 20-28 38-22 7 2 11 7 13 12-9-7-17-8-24-5-9 4-15 13-17 23-5-1-8-4-10-8Z" fill="#fff6a2" opacity=".5" />
        <path d="M67 28c4-7 8-10 13-12" fill="none" stroke={`url(#${gradient("fuse")})`} strokeLinecap="round" strokeWidth="5" />
        <path d="m79 8 2 5 5-2-3 5 4 3-6 0-1 6-3-5-5 2 3-5-4-4 6 1Z" fill="#fff27e" stroke="#ff9c4b" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M31 30c5-6 11-9 17-9" fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="4" opacity=".85" />
        <text x="49" y="61" textAnchor="middle" fill={`url(#${gradient("type")})`} stroke="#572474" strokeWidth="2.6" paintOrder="stroke" fontSize={multiplier >= 100 ? "15" : multiplier >= 10 ? "19" : "23"} fontWeight="1000" fontFamily="system-ui, sans-serif">
          ×{Number.isFinite(multiplier) ? multiplier : 2}
        </text>
      </svg>
    );
  }

  switch (normalized) {
    case "fruit_cherry":
      return <svg {...svgProps}><defs><radialGradient id={gradient("cherry")} cx=".3" cy=".2"><stop stopColor="#ffb0a1" /><stop offset=".35" stopColor="#ef4267" /><stop offset="1" stopColor="#791a43" /></radialGradient></defs>
        <path d="M49 36c-1-15-8-20-15-26M50 34c4-16 14-20 23-21" fill="none" stroke="#8b6633" strokeWidth="5" strokeLinecap="round" />
        <path d="M32 17c4-9 15-9 19 0-7 6-14 6-19 0Z" fill="#73bd68" stroke="#c9ef9b" strokeWidth="2" />
        <circle cx="37" cy="61" r="22" fill={`url(#${gradient("cherry")})`} stroke="#ffc2ad" strokeWidth="2.5" /><circle cx="66" cy="61" r="22" fill={`url(#${gradient("cherry")})`} stroke="#ffc2ad" strokeWidth="2.5" />
        <path d="M24 52c3-7 8-10 13-11M53 52c3-7 8-10 13-11" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".78" /></svg>;
    case "fruit_lemon":
      return <svg {...svgProps}><defs><linearGradient id={gradient("lemon")} x1=".1" y1=".1" x2=".9" y2=".9"><stop stopColor="#fff6a4" /><stop offset=".45" stopColor="#f9d94d" /><stop offset="1" stopColor="#d88727" /></linearGradient></defs>
        <path d="M15 51c9-25 27-35 36-35s27 10 36 35c-9 25-27 35-36 35S24 76 15 51Z" fill={`url(#${gradient("lemon")})`} stroke="#fff3a2" strokeWidth="3" />
        <path d="M19 50c-8-4-10-11-5-15 6 0 10 4 12 10m50 11c8 4 10 11 5 15-6 0-10-4-12-10" fill="#8bc36a" stroke="#d5f394" strokeWidth="2" />
        <path d="M34 38c7-8 14-11 21-11" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".8" /></svg>;
    case "fruit_grape":
      return <svg {...svgProps}><defs><radialGradient id={gradient("grape")} cx=".28" cy=".2"><stop stopColor="#e6a4ff" /><stop offset=".35" stopColor="#9b54d4" /><stop offset="1" stopColor="#48276f" /></radialGradient></defs>
        <path d="M46 23c3-12 13-16 25-14-3 11-10 17-23 17" fill="#70b85d" stroke="#c8ee91" strokeWidth="2" /><path d="M49 22c0 7-4 12-8 17" fill="none" stroke="#b28a51" strokeWidth="4" strokeLinecap="round" />
        {[ [50,32],[37,45],[63,45],[25,59],[50,59],[75,59],[38,75],[62,75],[50,89] ].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="12" fill={`url(#${gradient("grape")})`} stroke="#e9c5ff" strokeWidth="1.6" />)}
        <path d="M37 39l5-4m14 10 5-4M24 55l5-4m20 0 5-4m20 8 5-4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity=".8" /></svg>;
    case "fruit_melon":
      return <svg {...svgProps}><defs><linearGradient id={gradient("melon")} x1=".1" y1=".1" x2=".9" y2=".9"><stop stopColor="#9ef28e" /><stop offset=".42" stopColor="#37c985" /><stop offset="1" stopColor="#127261" /></linearGradient></defs>
        <path d="M17 55a33 33 0 0 1 66 0c0 20-14 34-33 34S17 75 17 55Z" fill={`url(#${gradient("melon")})`} stroke="#d1ffc1" strokeWidth="3" />
        <path d="M22 57c4 16 15 25 28 26m4-55c8 3 16 10 20 20M37 61l3 3m12 7 3 3m12-18 3 3" stroke="#e7ffad" strokeWidth="2.5" strokeLinecap="round" opacity=".78" />
        <path d="M38 29c5-5 10-7 16-8" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".8" /></svg>;
    case "fruit_plum":
      return <svg {...svgProps}><defs><radialGradient id={gradient("plum")} cx=".28" cy=".16"><stop stopColor="#ffd0f4" /><stop offset=".32" stopColor="#c250bd" /><stop offset=".75" stopColor="#793b92" /><stop offset="1" stopColor="#442b67" /></radialGradient></defs>
        <path d="M53 19c7-10 18-12 27-7-4 9-12 14-24 13" fill="#77bb67" stroke="#d2ef9d" strokeWidth="2" /><path d="M53 25c-2 6-3 9-7 13" fill="none" stroke="#9b7445" strokeWidth="4" strokeLinecap="round" />
        <path d="M50 27c22-1 35 15 34 36-1 18-12 29-34 29S17 81 16 63c-1-21 12-36 34-36Z" fill={`url(#${gradient("plum")})`} stroke="#ffd0ef" strokeWidth="3" />
        <path d="M31 47c5-8 12-12 21-13" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".82" /><path d="M51 40c5 9 7 18 7 27" stroke="#f6a7df" strokeWidth="2" opacity=".5" /></svg>;
    case "candy_star":
      return <svg {...svgProps}><defs><linearGradient id={gradient("cstar")} x1=".1" y1=".1" x2=".9" y2=".9"><stop stopColor="#fff3a5" /><stop offset=".45" stopColor="#ffb94f" /><stop offset="1" stopColor="#df5e73" /></linearGradient></defs>
        <path d="m50 9 11 24 26 2-20 17 7 27-24-14-24 14 7-27-20-17 26-2Z" fill="#793e56" transform="translate(0 4)" />
        <path d="m50 7 11 24 26 2-20 17 7 27-24-14-24 14 7-27-20-17 26-2Z" fill={`url(#${gradient("cstar")})`} stroke="#fff2c5" strokeWidth="3" strokeLinejoin="round" /><path d="m34 34 9-4 7 1" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".82" /></svg>;
    case "candy_swirl":
      return <svg {...svgProps}><defs><radialGradient id={gradient("swirl")} cx=".3" cy=".2"><stop stopColor="#fff7eb" /><stop offset=".3" stopColor="#f9a4cb" /><stop offset=".76" stopColor="#c14892" /><stop offset="1" stopColor="#662b65" /></radialGradient></defs>
        <path d="m47 59 7 34c1 6-9 8-11 2l-8-33Z" fill="#e9c989" stroke="#fff1c9" strokeWidth="2" /><circle cx="49" cy="40" r="34" fill={`url(#${gradient("swirl")})`} stroke="#fff0dc" strokeWidth="3" />
        <path d="M49 40c0-9 13-9 13 0 0 14-27 14-27 0 0-21 41-21 41 0 0 28-55 28-55 0" fill="none" stroke="#fff0bc" strokeWidth="7" strokeLinecap="round" /><path d="M29 24c6-7 12-10 20-11" stroke="#fff" strokeWidth="4" strokeLinecap="round" /></svg>;
    case "candy_wrap":
      return <svg {...svgProps}><defs><linearGradient id={gradient("wrap")} x1=".1" y1=".1" x2=".9" y2=".9"><stop stopColor="#a7f1eb" /><stop offset=".5" stopColor="#48bccc" /><stop offset="1" stopColor="#3970a6" /></linearGradient><linearGradient id={gradient("center")} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff2a6" /><stop offset="1" stopColor="#ed9e55" /></linearGradient></defs>
        <path d="m24 35-19-10 7 23-8 20 22-7c10 13 43 13 53 0l22 7-8-20 7-23-19 10c-10-13-45-13-57 0Z" fill={`url(#${gradient("wrap")})`} stroke="#dffbff" strokeWidth="3" strokeLinejoin="round" />
        <path d="M24 38c10-13 43-13 52 0v25c-11 11-42 11-52 0Z" fill={`url(#${gradient("center")})`} stroke="#fff3c5" strokeWidth="2.5" /><path d="M31 39c8-6 27-7 38-1" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg>;
    case "candy_jelly":
      return <svg {...svgProps}><defs><linearGradient id={gradient("jelly")} x1=".1" y1=".08" x2=".9" y2=".94"><stop stopColor="#ffc2e8" /><stop offset=".42" stopColor="#ec62ae" /><stop offset="1" stopColor="#9b397b" /></linearGradient></defs>
        <path d="m23 31 27-15 27 15v39L50 87 23 70Z" fill={`url(#${gradient("jelly")})`} stroke="#ffe1f3" strokeWidth="3" strokeLinejoin="round" />
        <path d="m23 31 27 15 27-15M50 46v41" fill="none" stroke="#fff4fa" strokeWidth="2.5" opacity=".72" /><path d="m31 33 19 10 17-10" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".82" /></svg>;
    // Low tier: deliberately simple, bright silhouettes with restrained gloss.
    case "gummy_star":
      return (
        <svg {...svgProps}>
          <defs>
            <linearGradient id={gradient("star")} x1=".15" y1=".08" x2=".8" y2=".95">
              <stop stopColor="#ffe982" />
              <stop offset=".55" stopColor="#f8a64a" />
              <stop offset="1" stopColor="#dc667b" />
            </linearGradient>
          </defs>
          <path d="m50 9 10 23 25 2-19 17 6 25-22-13-22 13 6-25-19-17 25-2Z" fill="#74384c" opacity=".7" transform="translate(0 3)" />
          <path d="m50 7 10 23 25 2-19 17 6 25-22-13-22 13 6-25-19-17 25-2Z" fill={`url(#${gradient("star")})`} stroke="#ffeab0" strokeWidth="3" strokeLinejoin="round" />
          <path d="m50 17 7 16 17 2-13 11 4 18-15-9-15 9 4-18-13-11 17-2Z" fill="none" stroke="#fff4c9" strokeWidth="1.7" opacity=".65" />
          <path d="m34 30 7-4 7 1" fill="none" stroke="#fffbe7" strokeWidth="3.5" strokeLinecap="round" opacity=".72" />
        </svg>
      );
    case "jelly_drop":
      return (
        <svg {...svgProps}>
          <defs>
            <linearGradient id={gradient("drop")} x1=".14" y1=".07" x2=".86" y2=".96">
              <stop stopColor="#b9f5f2" />
              <stop offset=".4" stopColor="#50c9cf" />
              <stop offset="1" stopColor="#337ab0" />
            </linearGradient>
          </defs>
          <path d="M50 9C40 24 21 44 21 61a29 29 0 0 0 58 0C79 44 60 24 50 9Z" fill="#174f71" opacity=".62" transform="translate(0 3)" />
          <path d="M50 7C40 22 21 42 21 59a29 29 0 0 0 58 0C79 42 60 22 50 7Z" fill={`url(#${gradient("drop")})`} stroke="#d7fffa" strokeWidth="3" />
          <path d="M32 57c1 10 7 17 16 19" fill="none" stroke="#e6ffff" strokeWidth="4.5" strokeLinecap="round" opacity=".7" />
          <path d="M37 31c4-7 8-12 12-16" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity=".82" />
          <circle cx="67" cy="43" r="2.3" fill="#fff" opacity=".9" />
        </svg>
      );
    case "wrapped_candy":
      return (
        <svg {...svgProps}>
          <defs>
            <linearGradient id={gradient("sweet")} x1=".12" y1=".1" x2=".88" y2=".92">
              <stop stopColor="#ffdca2" />
              <stop offset=".48" stopColor="#f28a70" />
              <stop offset="1" stopColor="#c94e72" />
            </linearGradient>
            <linearGradient id={gradient("wrapper")} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#f8a7c6" />
              <stop offset="1" stopColor="#bf548c" />
            </linearGradient>
          </defs>
          <path d="m23 35-18-9 7 22-8 19 21-7c9 12 42 13 51 0l20 7-7-19 8-22-21 9c-10-13-43-13-53 0Z" fill={`url(#${gradient("wrapper")})`} stroke="#ffe2ea" strokeWidth="3" strokeLinejoin="round" />
          <path d="M23 37c10-13 45-13 55 0v27c-11 12-45 12-55 0Z" fill={`url(#${gradient("sweet")})`} stroke="#fff0d9" strokeWidth="2.5" />
          <path d="M31 39c8-6 29-7 39-1" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity=".75" />
          <path d="m13 34 7 14-7 13M87 34l-7 14 7 13" fill="none" stroke="#ffd4e4" strokeWidth="2" opacity=".7" />
        </svg>
      );

    // Premium tier: deeper forms, sculpted highlights and distinct silhouettes.
    case "swirl_lollipop":
      return (
        <svg {...svgProps}>
          <defs>
            <radialGradient id={gradient("pop")} cx=".32" cy=".24" r=".78">
              <stop stopColor="#fff4e8" />
              <stop offset=".25" stopColor="#f49bc4" />
              <stop offset=".72" stopColor="#cc4e9a" />
              <stop offset="1" stopColor="#752859" />
            </radialGradient>
            <linearGradient id={gradient("stick")} x1=".15" y1=".05" x2=".9" y2=".9">
              <stop stopColor="#fff4d6" />
              <stop offset=".45" stopColor="#efcf91" />
              <stop offset="1" stopColor="#a87840" />
            </linearGradient>
            <clipPath id={gradient("pop-clip")}><circle cx="48" cy="40" r="29" /></clipPath>
          </defs>
          <path d="m46 60 7 33c1 6-9 8-11 2l-8-32Z" fill="#59294f" opacity=".58" />
          <path d="m45 57 8 34c1 6-8 8-10 2l-8-33Z" fill={`url(#${gradient("stick")})`} stroke="#fff0ca" strokeWidth="2" />
          <path d="M48 6a34 34 0 1 1 0 68 34 34 0 0 1 0-68Z" fill="#702653" transform="translate(1 2)" />
          <circle cx="48" cy="40" r="32" fill={`url(#${gradient("pop")})`} stroke="#fff0df" strokeWidth="3.5" />
          <g clipPath={`url(#${gradient("pop-clip")})`} fill="none" strokeLinecap="round">
            <path d="M48 40c0-8 12-8 12 0 0 13-24 13-24 0 0-19 36-19 36 0 0 25-48 25-48 0 0-31 60-31 60 0" stroke="#fff0bd" strokeWidth="7" />
            <path d="M48 40c0-8 12-8 12 0 0 13-24 13-24 0 0-19 36-19 36 0" stroke="#e45eaa" strokeWidth="3.2" />
          </g>
          <path d="M27 25c5-7 12-11 20-11" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".88" />
          <circle cx="70" cy="61" r="2.3" fill="#fff6d9" />
        </svg>
      );
    case "sugar_crystal":
      return (
        <svg {...svgProps}>
          <defs>
            <linearGradient id={gradient("crystal")} x1=".12" y1=".07" x2=".86" y2=".96">
              <stop stopColor="#fff3fb" />
              <stop offset=".26" stopColor="#d4b7ff" />
              <stop offset=".63" stopColor="#9470e8" />
              <stop offset="1" stopColor="#473777" />
            </linearGradient>
            <linearGradient id={gradient("facet")} x1=".1" y1="0" x2=".9" y2="1">
              <stop stopColor="#fff" stopOpacity=".8" />
              <stop offset="1" stopColor="#b7a4ff" stopOpacity=".08" />
            </linearGradient>
          </defs>
          <path d="m25 20 24-12 27 11 14 23-10 33-29 17-29-16-8-32Z" fill="#312750" opacity=".7" transform="translate(0 3)" />
          <path d="m25 18 24-11 27 11 14 23-10 33-29 17-29-16-8-32Z" fill={`url(#${gradient("crystal")})`} stroke="#f6eaff" strokeWidth="3" strokeLinejoin="round" />
          <path d="m25 18 24 10 27-10M49 28l2 63M17 41l32-13 27 27 14-4M18 73l31-45 27 45M25 18l-8 23 32-13 27-9" fill="none" stroke="#fff" strokeWidth="1.8" opacity=".7" />
          <path d="m49 28 27 14-1 33-24 16Z" fill={`url(#${gradient("facet")})`} />
          <path d="m34 22 14-7" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".9" />
          <path d="m69 30 5 2" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity=".8" />
        </svg>
      );
    case "gummy_bear":
      return (
        <svg {...svgProps}>
          <defs>
            <radialGradient id={gradient("bear")} cx=".34" cy=".17" r=".84">
              <stop stopColor="#e5ffb2" />
              <stop offset=".28" stopColor="#a5e879" />
              <stop offset=".62" stopColor="#4ab887" />
              <stop offset="1" stopColor="#17645c" />
            </radialGradient>
            <radialGradient id={gradient("belly")} cx=".35" cy=".2">
              <stop stopColor="#f1ffd5" stopOpacity=".94" />
              <stop offset="1" stopColor="#7de0ad" stopOpacity=".45" />
            </radialGradient>
          </defs>
          <path d="M29 24a12 12 0 0 1 21-7 12 12 0 0 1 21 7c0 5-2 8-5 11 8 5 13 14 13 24v17c0 7-5 12-12 12-5 0-9-3-11-8H44c-2 5-6 8-11 8-7 0-12-5-12-12V59c0-10 5-19 13-24-3-3-5-6-5-11Z" fill="#104e4c" opacity=".74" transform="translate(1 3)" />
          <path d="M29 24a12 12 0 0 1 21-7 12 12 0 0 1 21 7c0 5-2 8-5 11 8 5 13 14 13 24v17c0 7-5 12-12 12-5 0-9-3-11-8H44c-2 5-6 8-11 8-7 0-12-5-12-12V59c0-10 5-19 13-24-3-3-5-6-5-11Z" fill={`url(#${gradient("bear")})`} stroke="#dfffdc" strokeWidth="2.8" />
          <ellipse cx="50" cy="60" rx="13" ry="17" fill={`url(#${gradient("belly")})`} opacity=".72" />
          <circle cx="37" cy="27" r="5" fill="#f2ffd0" opacity=".7" />
          <circle cx="63" cy="27" r="5" fill="#efffc9" opacity=".7" />
          <ellipse cx="43" cy="44" rx="2.5" ry="3" fill="#15474a" />
          <ellipse cx="57" cy="44" rx="2.5" ry="3" fill="#15474a" />
          <path d="M46 53c2 2 6 2 8 0" fill="none" stroke="#164e4e" strokeWidth="2" strokeLinecap="round" />
          <path d="M30 57c1-9 6-15 12-18" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity=".7" />
          <circle cx="34" cy="52" r="2" fill="#efffce" opacity=".72" />
        </svg>
      );
    case "scatter":
      return (
        <svg {...svgProps}>
          <defs>
            <linearGradient id={gradient("gold")} x1=".12" y1=".04" x2=".88" y2=".96">
              <stop stopColor="#fffbe0" />
              <stop offset=".19" stopColor="#ffe783" />
              <stop offset=".46" stopColor="#d99b32" />
              <stop offset=".7" stopColor="#fff0a1" />
              <stop offset="1" stopColor="#92501e" />
            </linearGradient>
            <radialGradient id={gradient("jewel")} cx=".3" cy=".2">
              <stop stopColor="#fff7d5" />
              <stop offset=".35" stopColor="#edcf74" />
              <stop offset="1" stopColor="#a65c24" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="51" r="43" fill="#5b341a" opacity=".55" />
          <circle cx="50" cy="48" r="41" fill={`url(#${gradient("gold")})`} stroke="#fff5c0" strokeWidth="3" />
          <circle cx="50" cy="48" r="34.5" fill="none" stroke="#9a5c20" strokeWidth="2" />
          <circle cx="50" cy="48" r="30" fill="none" stroke="#fff1a6" strokeWidth="1.4" strokeDasharray="1.5 4.5" opacity=".92" />
          <path d="m50 19 7 17 18 1-14 12 5 18-16-10-16 10 5-18-14-12 18-1Z" fill="#8e511d" opacity=".48" transform="translate(0 2)" />
          <path d="m50 17 7 17 18 1-14 12 5 18-16-10-16 10 5-18-14-12 18-1Z" fill={`url(#${gradient("jewel")})`} stroke="#fff5be" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="50" cy="18" r="3" fill="#fffbdc" />
          <circle cx="20" cy="48" r="2.4" fill="#fff5c2" />
          <circle cx="80" cy="48" r="2.4" fill="#fff5c2" />
          <path d="M28 25c5-7 12-11 20-12" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity=".86" />
        </svg>
      );
    case "neutral":
      return (
        <svg {...svgProps}>
          <defs>
            <radialGradient id={gradient("neutral")} cx=".32" cy=".22" r=".82">
              <stop stopColor="#fff" stopOpacity=".86" />
              <stop offset=".36" stopColor="#c9c9dc" stopOpacity=".82" />
              <stop offset=".76" stopColor="#7f839d" stopOpacity=".92" />
              <stop offset="1" stopColor="#393d53" />
            </radialGradient>
            <linearGradient id={gradient("neutral-rim")} x1=".12" y1=".04" x2=".88" y2=".96">
              <stop stopColor="#f5f2dc" stopOpacity=".76" />
              <stop offset=".5" stopColor="#a9a8bd" stopOpacity=".56" />
              <stop offset="1" stopColor="#55596e" stopOpacity=".82" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="52" r="35" fill="#151827" opacity=".56" />
          <circle cx="50" cy="48" r="33" fill={`url(#${gradient("neutral")})`} stroke={`url(#${gradient("neutral-rim")})`} strokeWidth="4" />
          <circle cx="50" cy="48" r="26.5" fill="none" stroke="#f4f1df" strokeWidth="1.4" strokeDasharray="2 5" opacity=".48" />
          <path d="M31 35c5-8 12-12 20-13" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".64" />
          <circle cx="68" cy="63" r="3" fill="#f5f0dc" opacity=".54" />
        </svg>
      );
    default:
      return (
        <svg {...svgProps}>
          <circle cx="50" cy="50" r="34" fill="#d8aa48" stroke="#fff0b2" strokeWidth="4" />
          <path d="m50 22 8 18 20 2-15 13 5 20-18-11-18 11 5-20-15-13 20-2Z" fill="#fff5d0" />
        </svg>
      );
  }
}
