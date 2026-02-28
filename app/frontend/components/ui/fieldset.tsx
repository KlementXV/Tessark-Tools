import * as React from 'react';
import { cn } from '@/lib/utils';

type FieldsetProps = React.HTMLAttributes<HTMLDivElement> & {
  title?: string;
  description?: string;
};

export function Fieldset({ className, title, description, children, ...props }: FieldsetProps) {
  return (
    <div className={cn('rounded-xl border bg-card/70 p-5 shadow-sm', className)} {...props}>
      {(title || description) && (
        <div className="mb-3 space-y-1">
          {title && <div className="text-sm font-semibold text-foreground">{title}</div>}
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
        </div>
      )}
      <div className="space-y-3">{children}</div>
    </div>
  );
}
