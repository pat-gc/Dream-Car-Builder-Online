import { type MutableRefObject, useEffect, useRef } from 'react'

interface MarqueeOverlayProps {
  marqueeDivRef: MutableRefObject<HTMLDivElement | null>
}

export default function MarqueeOverlay({ marqueeDivRef }: MarqueeOverlayProps) {
  const localRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    marqueeDivRef.current = localRef.current
    return () => {
      marqueeDivRef.current = null
    }
  }, [marqueeDivRef])

  return (
    <div
      ref={localRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        border: '1.5px solid rgba(120, 180, 255, 0.9)',
        backgroundColor: 'rgba(120, 180, 255, 0.12)',
        pointerEvents: 'none',
        display: 'none',
        zIndex: 5,
      }}
    />
  )
}
