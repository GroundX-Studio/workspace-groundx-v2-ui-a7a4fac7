import type { FC } from "react";

/**
 * Global SVG filter defs from the design bundle (`Onboarding Spec.html`
 * lines 137-148). Mounting `<WireframeFilters />` once near the root makes
 * `filter: url(#wf-rough-lite)` and `filter: url(#wf-rough)` available
 * everywhere — used on the F1 sample cards + BYO tiles to give them the
 * slightly-irregular, hand-sketched edge the wireframes show.
 */
export const WireframeFilters: FC = () => {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable={false}>
      <defs>
        <filter id="wf-rough" x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves={2} seed={3} />
          <feDisplacementMap in="SourceGraphic" scale={1.6} />
        </filter>
        <filter id="wf-rough-lite" x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves={2} seed={7} />
          <feDisplacementMap in="SourceGraphic" scale={0.9} />
        </filter>
      </defs>
    </svg>
  );
};
