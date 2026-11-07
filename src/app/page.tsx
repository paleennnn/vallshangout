import { FinalCta } from '@/components/landing/FinalCta';
import { Features } from '@/components/landing/Features';
import { Hero } from '@/components/landing/Hero';
import { LandingRoot } from '@/components/landing/LandingRoot';
import { Nav } from '@/components/landing/Nav';
import { Story } from '@/components/landing/Story';

export default function Home() {
  return (
    <LandingRoot>
      <Nav />
      <main>
        <Hero />
        <Story />
        <Features />
      </main>
      <FinalCta />
    </LandingRoot>
  );
}
