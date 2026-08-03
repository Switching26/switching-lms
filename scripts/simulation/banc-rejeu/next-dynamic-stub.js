// Remplace next/dynamic hors Next : même contrat (loader + fallback), sans le framework.
import React from 'react'
export default function dynamic(loader, opts) {
  const Lazy = React.lazy(() => loader().then((m) => ({ default: m.default ?? m })))
  return function Dyn(props) {
    return React.createElement(
      React.Suspense,
      { fallback: opts?.loading ? React.createElement(opts.loading) : null },
      React.createElement(Lazy, props),
    )
  }
}
