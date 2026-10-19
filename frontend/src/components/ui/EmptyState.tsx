import type { ReactNode } from 'react';

type Props = {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
};

export function EmptyState({ title, body, action, icon }: Props) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}