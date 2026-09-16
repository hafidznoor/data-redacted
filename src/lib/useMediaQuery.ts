import { useEffect, useState } from 'react'

/**
 * Subscribes to a CSS media query.
 *
 * Only for sizes that are a component *prop* rather than a class: FolderComponent
 * writes its dimensions as inline pixels, so a Tailwind breakpoint cannot reach
 * them. Anything expressible in CSS should stay in CSS.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
