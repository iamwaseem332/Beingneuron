import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Hero from "./Hero";
import SynapseSection from "./SynapseSection";
import NeuroSurgerySection from "./NeuroSurgerySection";
import ResearchLoopSection from "./ResearchLoopSection";
import PricingPreview from "./PricingPreview";
import { CTABand, HowItWorks, WhyBeingNeuron } from "./Sections";
import { usePrefersReducedMotion } from "./hooks";

export default function Landing() {
  const location = useLocation();
  const reduced = usePrefersReducedMotion();

  /* support cross-page section navigation via router state */
  useEffect(() => {
    const target = (location.state as { scrollTo?: string } | null)?.scrollTo;
    if (target) {
      const t = window.setTimeout(() => {
        document.getElementById(target)?.scrollIntoView({
          behavior: reduced ? "auto" : "smooth",
          block: "start",
        });
      }, 80);
      return () => window.clearTimeout(t);
    }
  }, [location.state, reduced]);

  return (
    <main>
      <Hero />
      <div id="products" className="scroll-mt-16">
        <SynapseSection />
        <NeuroSurgerySection />
      </div>
      <ResearchLoopSection />
      <HowItWorks />
      <WhyBeingNeuron />
      <PricingPreview />
      <CTABand />
    </main>
  );
}
