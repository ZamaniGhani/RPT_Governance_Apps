import type { CSSProperties, ReactNode } from 'react';

/** The wireframe frame every card, figure and primary button wears (Industry design system). */
export function Blueprint({
  as: Tag = 'div',
  style,
  className,
  children,
  ...rest
}: {
  as?: 'div' | 'button';
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
}) {
  return (
    <Tag className={['blueprint', className].filter(Boolean).join(' ')} style={style} {...rest}>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      {children}
    </Tag>
  );
}
