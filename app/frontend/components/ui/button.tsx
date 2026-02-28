import * as React from 'react';
import { cn } from '@/lib/utils';

const variantClasses = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  link: 'text-primary underline-offset-4 hover:underline',
};

const sizeClasses = {
  sm: 'h-9 px-3 text-xs',
  md: 'h-10 px-4 py-2 text-sm',
  lg: 'h-11 px-8 text-sm',
  icon: 'h-10 w-10',
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
};

export const buttonVariants = (
  { variant = 'default', size = 'md', className }: { variant?: keyof typeof variantClasses; size?: keyof typeof sizeClasses; className?: string },
) => cn(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50 disabled:saturate-50 disabled:pointer-events-none disabled:cursor-not-allowed',
  variantClasses[variant],
  sizeClasses[size],
  className,
);

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => (
    <button ref={ref} className={buttonVariants({ variant, size, className })} {...props} />
  ),
);

Button.displayName = 'Button';
