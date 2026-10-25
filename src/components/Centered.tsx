import type { ReactNode } from 'react';

/** Centered panel for loading / empty / error states. */
export function Centered(props: { title?: string; children?: ReactNode }): JSX.Element {
  return (
    <div className="centered">
      {props.title ? <h2 className="centered-title">{props.title}</h2> : null}
      {props.children}
    </div>
  );
}
