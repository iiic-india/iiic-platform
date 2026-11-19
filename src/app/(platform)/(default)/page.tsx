import { Todo } from '@/components/Todo'

/**
 * Milestone 1 holds only the shell. The home page's sections and copy come in M2 from
 * docs/content/copy-architecture.md §4.1; until then every line is a placeholder.
 */
export default function HomePage() {
  return (
    <section className="iiic-page" style={{ paddingTop: 48, paddingBottom: 80 }}>
      <div className="iiic-kicker">Indian Institute of Image Catalysts</div>
      <h1 style={{ margin: '14px 0 16px', maxWidth: '18ch' }}>
        <Todo what="home page headline, approved from the copy architecture §4.1" id="I-41" />
      </h1>
      <p className="iiic-lede iiic-prose">
        <Todo what="home page lead and sections, built in M2" id="I-41" />
      </p>
    </section>
  )
}
