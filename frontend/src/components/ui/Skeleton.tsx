import type { CSSProperties } from 'react';

type Props = {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
  className?: string;
};

export function Skeleton({ width = '100%', height = 14, style, className = '' }: Props) {
  return (
    <div
      className={`skeleton ${className}`.trim()}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}