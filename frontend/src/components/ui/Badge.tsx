import type { ReactNode } from 'react';

export type BadgeTone = 'ok' | 'warn' | 'bad' | 'muted' | 'info';

type Props = {
  tone?: BadgeTone;
  children: ReactNode;
};

export function Badge({ tone = 'muted', children }: Props) {
  return <span className={`badge ${tone}`}>{children}</span>;
}