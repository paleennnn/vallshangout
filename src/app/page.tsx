import { FinalCta } from '@/components/landing/FinalCta';
import { Features } from '@/components/landing/Features';
import { Hero } from '@/components/landing/Hero';
import { LandingRoot } from '@/components/landing/LandingRoot';
import { Story } from '@/components/landing/Story';

export default function Home() {
  return (
    <LandingRoot>
      <main>
        <Hero />
        <Story />
        <Features />
      </main>
      <FinalCta />
    </LandingRoot>
  );
}
