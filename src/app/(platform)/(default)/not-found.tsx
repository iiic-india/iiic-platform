import Link from 'next/link'

/**
 * The 404 inside the site's shell. The full page (D-29, docs/11 §5.1) is built in M2;
 * Next adds the noindex tag to every 404 response.
 */
export default function NotFound() {
  return (
    <section className="iiic-page" style={{ paddingTop: 48, paddingBottom: 80 }}>
      <h1 style={{ margin: '0 0 16px' }}>Page not found</h1>
      <p className="iiic-lede iiic-prose">
        <Link className="iiic-link" href="/">
          Go to the home page
        </Link>
      </p>
    </section>
  )
}
