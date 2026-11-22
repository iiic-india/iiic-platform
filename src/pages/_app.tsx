import '@/brand/dist/iiic.min.css'

import type { AppProps } from 'next/app'

/**
 * The pages router's shell, which holds one page: the static 500 (src/pages/500.tsx). It brings
 * the kit's stylesheet, as the app's layouts do, and nothing else.
 */
export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
