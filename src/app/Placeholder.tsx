/** Stands in for screens 2–8 until step 3 builds them. */
export function Placeholder({ title, step }: { title: string; step: number }) {
  return (
    <section>
      <h1 className="font-serif text-xl font-semibold">{title}</h1>
      <p className="rounded-card border-rule bg-card text-ink-soft mt-4 border p-4 text-sm">
        Built in step {step}.
      </p>
    </section>
  )
}
