import { Head, Html, Main, NextScript } from 'next/document'

/**
 * The document around the static 500 (src/pages/500.tsx), in the site's language as every page
 * is. NextScript adds nothing to a page that runs no script.
 */
export default function Document() {
  return (
    <Html lang="en-IN">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
