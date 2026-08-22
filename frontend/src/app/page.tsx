import {
  ArrowRight,
  Code2,
  LayoutPanelLeft,
  MessageSquareText,
  Sparkles,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent } from "../components/ui/card"

export default function LandingPage() {
  const navigate = useNavigate()
  return (
    <main className="relative min-h-screen overflow-hidden text-zinc-100">
      {/* Gradient backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(124,131,255,0.18),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(34,197,94,0.07),transparent_20%),radial-gradient(circle_at_bottom,rgba(15,23,42,0.5),transparent_35%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 font-sans">
        {/* ─── Navigation ─── */}
        <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-white/5 bg-surface/80 px-0 py-4 backdrop-blur-md">
          <span className="text-lg font-semibold tracking-tight text-zinc-50">
            SimExam
          </span>
          <div className="flex items-center gap-5">
            <a
              href="#how-it-works"
              className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
            >
              About
            </a>
            <a
              href="/login"
              onClick={(e) => {
                e.preventDefault()
                navigate("/login")
              }}
              className="text-sm font-medium text-zinc-200 transition-colors hover:text-white"
            >
              Sign in&nbsp;&rarr;
            </a>
          </div>
        </nav>

        {/* ─── Hero ─── */}
        <section className="flex flex-1 flex-col items-center justify-center py-24 text-center sm:py-32 lg:py-36">
          <Badge className="mb-6 animate-fade-in">
            <Sparkles size={13} className="mr-1.5" />
            AI-Powered Assessment Platform
          </Badge>

          <h1 className="mx-auto max-w-3xl animate-fade-up text-4xl font-semibold leading-[1.1] tracking-tight text-zinc-50 sm:text-5xl lg:text-6xl">
            Assessments that think&nbsp;with&nbsp;you.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-base leading-relaxed text-zinc-400 sm:text-lg" style={{ animationDelay: "0.1s", animationFillMode: "both" }}>
            SimExam uses autonomous AI agents to create fluid, multi-modal
            assessments — from live coding to system design to conceptual
            essays. No static tests. No multiple choice.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: "0.2s", animationFillMode: "both" }}>
            <Button
              className="h-12 rounded-xl px-6 py-3 text-sm"
              onClick={() => navigate("/login")}
            >
              Get Started <ArrowRight size={16} />
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-xl px-6 py-3 text-sm"
              onClick={() => {
                document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })
              }}
            >
              See how it works
            </Button>
          </div>
        </section>

        {/* ─── Features ─── */}
        <section className="py-20 sm:py-24">
          <h2 className="mb-12 text-center text-2xl font-semibold tracking-tight text-zinc-50">
            Built for real assessment
          </h2>

          <div className="grid gap-5 sm:grid-cols-3">
            {[
              {
                icon: Code2,
                title: "Live Coding",
                desc: "Debug real code with an AI mentor that guides through Socratic questioning.",
              },
              {
                icon: LayoutPanelLeft,
                title: "System Design",
                desc: "Draw architectures on a whiteboard while the AI probes scalability and trade-offs.",
              },
              {
                icon: MessageSquareText,
                title: "Conceptual Essays",
                desc: "Write structured responses evaluated by a multi-layer AI grading swarm.",
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <Card
                  key={item.title}
                  className="border-white/[0.08] bg-surface-raised p-6 transition-colors duration-200 hover:border-accent/30"
                >
                  <CardContent className="space-y-4 p-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-accent">
                      <Icon size={20} />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-base font-semibold text-zinc-100">
                        {item.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-zinc-400">
                        {item.desc}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>

        {/* ─── How It Works ─── */}
        <section id="how-it-works" className="py-20 sm:py-24">
          <h2 className="mb-14 text-center text-2xl font-semibold tracking-tight text-zinc-50">
            Three steps. Zero friction.
          </h2>

          <div className="grid gap-10 sm:grid-cols-3 sm:gap-8">
            {[
              {
                num: "1",
                title: "Configure",
                desc: "Admins set up the assessment type, upload knowledge bases, and define rubrics.",
              },
              {
                num: "2",
                title: "Assess",
                desc: "Students enter the fluid workspace. The AI adapts in real-time.",
              },
              {
                num: "3",
                title: "Evaluate",
                desc: "A multi-agent swarm scores technical accuracy, adaptability, and communication.",
              },
            ].map((step) => (
              <div key={step.num} className="flex flex-col items-center text-center sm:items-start sm:text-left">
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full border border-accent/20 text-sm font-semibold text-accent">
                  {step.num}
                </div>
                <h3 className="mb-2 text-base font-semibold text-zinc-100">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Footer ─── */}
        <footer className="border-t border-white/5 py-8 text-center text-sm text-zinc-500">
          SimExam AI — Reimagining assessments.
        </footer>
      </div>
    </main>
  )
}