import { IntroSection } from "@/components/IntroSection";
import { ReportSection } from "@/components/ReportSection";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <div className="dark matrix-scanlines">
      <IntroSection />
      <ReportSection />
      <Footer />
    </div>
  );
}
