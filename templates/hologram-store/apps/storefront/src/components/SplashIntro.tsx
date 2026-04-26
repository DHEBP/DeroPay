import { useEffect, useState } from "react"

function SplashLogo({ main = false }: { main?: boolean }) {
  return (
    <svg
      className={`splash-logo-svg ${main ? "main-logo" : ""}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      {main ? (
        <defs>
          <filter
            id="splash-glow-main"
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
            filterUnits="objectBoundingBox"
          >
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      ) : null}
      <g className="hex-main" filter={main ? "url(#splash-glow-main)" : undefined}>
        <polygon points="50,2 95,26 95,74 50,98 5,74 5,26" fill="#67e8f9" />
        <polygon points="50,7 90,28.5 90,71.5 50,93 10,71.5 10,28.5" fill="#0c1218" />
        <polygon points="50,13 83,32 83,68 50,87 17,68 17,32" fill="#22d3ee" />
      </g>
      <polygon
        className="arrow-top"
        points="17,32 38,32 38,45 50,50 62,45 62,32 83,32 50,13"
        fill="#0d4a55"
      />
      <polygon
        className="arrow-bottom"
        points="62,68 62,55 50,50 38,55 38,68 17,68 50,87 83,68"
        fill="#0d4a55"
      />
    </svg>
  )
}

function SplashIntro() {
  const [visible, setVisible] = useState(true)
  const [leaving, setLeaving] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    setReducedMotion(reduced)

    if (!visible) {
      return
    }

    const holdTime = reduced ? 700 : 3500
    const fadeTimer = window.setTimeout(() => setLeaving(true), holdTime)
    const removeTimer = window.setTimeout(() => setVisible(false), holdTime + 300)

    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(removeTimer)
    }
  }, [visible])

  if (!visible) {
    return null
  }

  return (
    <div
      className={`splash-intro ${leaving ? "splash-intro--leaving" : ""} ${
        reducedMotion ? "splash-intro--reduced" : ""
      }`}
      aria-hidden="true"
    >
      <div className="splash-scene">
        <div className="splash-bg-gradient" />
        <div className="splash-vignette" />
        <div className="splash-center-glow" />
        <div className="splash-interference-band" />
        <div className="splash-interference-band" />
        <div className="splash-interference-band" />
        <div className="splash-logo-wrapper">
          <div className="splash-chroma-r">
            <SplashLogo />
          </div>
          <div className="splash-chroma-b">
            <SplashLogo />
          </div>
          <SplashLogo main />
        </div>
      </div>
    </div>
  )
}

export default SplashIntro
