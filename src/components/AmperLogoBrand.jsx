/**
 * AmperLogo — React Component (v2 · Voltage Hex Mark · Gold)
 * تطبيق المشتركين — النسخة الذهبية
 *
 * Geometry matches /brand/src/*.svg
 *   hex:  60,14  100,37  100,83  60,106  20,83  20,37
 *   bolt: M66,24 L50,60 L62,60 L46,96 L76,56 L62,56 Z
 *
 * Usage:
 *   <AmperLogo />                      → full gold on dark (default)
 *   <AmperLogo variant="light" />      → gold on white
 *   <AmperLogo variant="icon" />       → icon only
 *   <AmperLogo variant="arabic" />     → Arabic wordmark
 *   <AmperLogo size="sm|md|lg|xl" />
 *   <AmperLogo showTagline={false} />
 */

import React from 'react';

const SIZES = {
  sm: { scale: 0.55, iconSize: 28 },
  md: { scale: 0.75, iconSize: 36 },
  lg: { scale: 1.00, iconSize: 48 },
  xl: { scale: 1.30, iconSize: 60 },
};

// Subscriber app is gold. "dark" = gold on dark bg.
const VARIANTS = {
  dark: {
    hexStroke: '#D97706',
    bolt:      '#F59E0B',
    text:      '#F59E0B',
    tagline:   '#B0651A',
    separator: 'rgba(217,119,6,0.3)',
  },
  light: {
    hexStroke: '#D97706',
    bolt:      '#D97706',
    text:      '#D97706',
    tagline:   '#7A5A1A',
    separator: 'rgba(217,119,6,0.25)',
  },
  gold: {
    hexStroke: '#D97706',
    bolt:      '#F59E0B',
    text:      '#F59E0B',
    tagline:   '#B0651A',
    separator: 'rgba(217,119,6,0.3)',
  },
  white: {
    hexStroke: '#FFFFFF',
    bolt:      '#FFFFFF',
    text:      '#FFFFFF',
    tagline:   '#FFFFFF',
    separator: 'rgba(255,255,255,0.25)',
  },
};

function HexMark({ stroke, bolt }) {
  return (
    <>
      <polygon
        points="60,14 100,37 100,83 60,106 20,83 20,37"
        fill="none"
        stroke={stroke}
        strokeWidth="5"
        strokeLinejoin="miter"
      />
      <path
        d="M66,24 L50,60 L62,60 L46,96 L76,56 L62,56 Z"
        fill={bolt}
      />
    </>
  );
}

function AmperIcon({ size = 48, colors }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <HexMark stroke={colors.hexStroke} bolt={colors.bolt} />
    </svg>
  );
}

function AmperLogoFull({ colors, width = 420, showTagline = true }) {
  const height = showTagline ? 76 : 58;
  return (
    <svg
      width={width}
      height={(width * height) / 420}
      viewBox={`0 0 420 ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="AMPER — Subscriber"
    >
      <title>AMPER</title>
      <g transform="translate(6,1) scale(0.467)">
        <HexMark stroke={colors.hexStroke} bolt={colors.bolt} />
      </g>
      <text
        x="78"
        y="40"
        fontFamily="'Rajdhani','Outfit',monospace"
        fontSize="36"
        fontWeight="700"
        fill={colors.text}
        letterSpacing="4"
      >
        AMPER
      </text>
      {showTagline && (
        <>
          <line
            x1="78"
            y1="50"
            x2="408"
            y2="50"
            stroke={colors.separator}
            strokeWidth="0.6"
          />
          <text
            x="80"
            y="63"
            fontFamily="'Rajdhani',monospace"
            fontSize="9"
            fill={colors.tagline}
            letterSpacing="3.5"
          >
            SUBSCRIBER APP
          </text>
        </>
      )}
    </svg>
  );
}

function AmperLogoArabic({ colors, width = 260 }) {
  return (
    <svg
      width={width}
      height={(width * 58) / 260}
      viewBox="0 0 260 58"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="أمبير — تطبيق المشتركين"
    >
      <title>أمبير</title>
      <g transform="translate(218,3) scale(0.433)">
        <HexMark stroke={colors.hexStroke} bolt={colors.bolt} />
      </g>
      <text
        x="210"
        y="28"
        fontFamily="'Tajawal', sans-serif"
        fontSize="28"
        fontWeight="900"
        fill={colors.text}
        textAnchor="end"
      >
        أمبير
      </text>
      <line
        x1="10"
        y1="36"
        x2="210"
        y2="36"
        stroke={colors.separator}
        strokeWidth="0.6"
      />
      <text
        x="210"
        y="49"
        fontFamily="'Tajawal', sans-serif"
        fontSize="10"
        fill={colors.tagline}
        textAnchor="end"
      >
        تطبيق المشتركين
      </text>
    </svg>
  );
}

export default function AmperLogo({
  variant = 'dark',
  size = 'lg',
  showTagline = true,
  width,
  className = '',
  style = {},
}) {
  const colors = VARIANTS[variant] || VARIANTS.dark;
  const sizeObj = SIZES[size] || SIZES.lg;

  if (variant === 'icon') {
    return (
      <span className={className} style={style}>
        <AmperIcon size={sizeObj.iconSize} colors={VARIANTS.dark} />
      </span>
    );
  }

  if (variant === 'arabic') {
    return (
      <span className={className} style={style}>
        <AmperLogoArabic
          colors={colors}
          width={Math.round(260 * sizeObj.scale)}
        />
      </span>
    );
  }

  const w = width ?? Math.round(420 * sizeObj.scale);
  return (
    <span className={className} style={style}>
      <AmperLogoFull colors={colors} width={w} showTagline={showTagline} />
    </span>
  );
}

export { AmperIcon, AmperLogoFull, AmperLogoArabic, VARIANTS, SIZES, HexMark };
