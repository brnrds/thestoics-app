import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

const features = [
  {
    number: "01",
    title: "Modal Conversations",
    description:
      "Each interaction mode shapes how the Stoics respond — from Socratic questioning to practical counsel. Switch perspectives, discover new depths.",
  },
  {
    number: "02",
    title: "Living Citations",
    description:
      "Every response is grounded in primary sources. Trace ideas back to Seneca, Epictetus, Marcus Aurelius, and the broader tradition.",
  },
  {
    number: "03",
    title: "Shared Knowledge",
    description:
      "A curated RAG corpus of Stoic texts powers every conversation. The wisdom of centuries, distilled and searchable.",
  },
];

const quotes = [
  {
    text: "We suffer more often in imagination than in reality.",
    author: "Seneca",
  },
  {
    text: "The happiness of your life depends upon the quality of your thoughts.",
    author: "Marcus Aurelius",
  },
  {
    text: "It is not things that disturb us, but our judgements about things.",
    author: "Epictetus",
  },
];

export default function LandingPage() {
  return (
    <div className="landing-page relative min-h-dvh overflow-x-hidden">
      {/* Grain overlay */}
      <div className="landing-grain" />

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header className="landing-header">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 lg:px-12">
          <div className="flex items-center gap-3">
            <div className="landing-logo-mark" aria-hidden>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M9 18 L14 8 L19 18"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line
                  x1="10.5"
                  y1="15"
                  x2="17.5"
                  y2="15"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className="font-sans text-sm font-medium tracking-wide text-ink-secondary">
              Confer with the Stoics
            </span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link
              href="/chat"
              className="landing-cta-small"
            >
              Enter
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-[92dvh] flex-col items-center justify-center px-6 pt-24 pb-20 lg:px-12">
        {/* Decorative accent line */}
        <div className="landing-accent-line" aria-hidden />

        <div className="landing-hero-content">
          <p className="landing-overline">Philosophy as interface</p>

          <h1 className="landing-hero-title">
            <span className="landing-hero-line landing-hero-line--1">
              Confer with
            </span>
            <span className="landing-hero-line landing-hero-line--2">
              <em>the Stoics</em>
            </span>
          </h1>

          <p className="landing-hero-subtitle">
            An AI-powered space for genuine philosophical dialogue.
            <br className="hidden sm:block" />
            Multiple modes of inquiry. Primary source citations.
            <br className="hidden sm:block" />
            Ancient wisdom meeting modern conversation.
          </p>

          <div className="landing-hero-actions">
            <Link href="/chat" className="landing-cta-primary">
              Begin a Conversation
            </Link>
            <a href="#how-it-works" className="landing-cta-secondary">
              How it works
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="landing-scroll-indicator" aria-hidden>
          <div className="landing-scroll-line" />
        </div>
      </section>

      {/* ── Quote strip ──────────────────────────────────────────────────── */}
      <section className="landing-quote-strip">
        <div className="mx-auto max-w-[1400px] px-6 py-20 lg:px-12">
          <div className="grid gap-12 md:grid-cols-3 md:gap-8">
            {quotes.map((quote, i) => (
              <blockquote
                key={i}
                className="landing-quote"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <p className="landing-quote-text">&ldquo;{quote.text}&rdquo;</p>
                <footer className="landing-quote-author">
                  &mdash; {quote.author}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="scroll-mt-20 px-6 py-28 lg:px-12">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-16 max-w-2xl">
            <p className="landing-overline">How it works</p>
            <h2 className="landing-section-title">
              Three pillars of
              <br />
              <em>thoughtful discourse</em>
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {features.map((feature, i) => (
              <article
                key={feature.number}
                className="landing-feature-card"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <span className="landing-feature-number">
                  {feature.number}
                </span>
                <h3 className="landing-feature-title">{feature.title}</h3>
                <p className="landing-feature-desc">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Modes showcase ───────────────────────────────────────────────── */}
      <section className="landing-modes-section">
        <div className="mx-auto max-w-[1400px] px-6 py-28 lg:px-12">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div>
              <p className="landing-overline">Interaction Modes</p>
              <h2 className="landing-section-title">
                Many voices,
                <br />
                <em>one tradition</em>
              </h2>
              <p className="mt-6 max-w-md font-serif text-lg leading-relaxed text-ink-secondary">
                Configure distinct modes of engagement — from rigorous dialectic
                to compassionate mentorship. Each mode reshapes the AI&apos;s approach,
                drawing from the same corpus of Stoic texts with a different lens.
              </p>
              <Link href="/chat" className="landing-cta-primary mt-10 inline-flex">
                Try it now
              </Link>
            </div>

            <div className="landing-modes-grid">
              {[
                { name: "Socratic", icon: "?" , desc: "Question-driven inquiry" },
                { name: "Mentor", icon: "◉", desc: "Guided practical wisdom" },
                { name: "Scholar", icon: "§", desc: "Textual analysis" },
                { name: "Meditative", icon: "○", desc: "Contemplative reflection" },
              ].map((mode, i) => (
                <div
                  key={mode.name}
                  className="landing-mode-card"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <span className="landing-mode-icon">{mode.icon}</span>
                  <span className="landing-mode-name">{mode.name}</span>
                  <span className="landing-mode-desc">{mode.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="landing-final-cta">
        <div className="mx-auto max-w-[1400px] px-6 py-32 text-center lg:px-12">
          <h2 className="landing-final-title">
            The examined life
            <br />
            <em>begins here.</em>
          </h2>
          <p className="mx-auto mt-6 max-w-lg font-serif text-lg text-ink-secondary">
            No account required to start. Bring your questions —
            the Stoics have been waiting two thousand years to answer them.
          </p>
          <Link href="/chat" className="landing-cta-primary mt-10 inline-flex">
            Start Conversing
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-6 lg:px-12">
          <p className="font-sans text-xs text-ink-tertiary">
            Confer with the Stoics
          </p>
          <p className="font-sans text-xs text-ink-tertiary">
            Built with care for seekers of wisdom
          </p>
        </div>
      </footer>
    </div>
  );
}
