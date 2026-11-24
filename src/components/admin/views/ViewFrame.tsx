import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import type { ReactNode } from 'react'

import { viewRefusal, type AdminView } from '@/access/views'

import styles from './Views.module.css'
import { VIEWS_COPY as COPY } from './viewsCopy'

/**
 * A custom view is public unless it checks for itself (CLAUDE.md #6): before anything is read, no
 * session goes to the sign-in and a session without the two-factor code to the admin's start,
 * which asks for it. Returns whether the role may open the view; each loader asks again.
 */
export function guardView(props: AdminViewServerProps, view: AdminView): boolean {
  const { req } = props.initPageResult
  const {
    routes: { admin },
    serverURL = '',
  } = req.payload.config
  const refusal = viewRefusal(req.user, view)
  if (refusal?.code === 'sign-in') redirect(`${serverURL}${admin}/login`)
  if (refusal?.code === 'enter-code') redirect(`${serverURL}${admin}`)
  return refusal === null
}

/** The admin's own template around a view, with its heading, or the refusal in words. */
export function ViewFrame({
  props,
  title,
  allowed,
  who,
  children,
}: {
  props: AdminViewServerProps
  title: string
  allowed: boolean
  /** Who may open it, for the refusal's words. */
  who: string
  children: ReactNode
}) {
  const { initPageResult, params, searchParams } = props
  const { req, locale, permissions, visibleEntities } = initPageResult
  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={visibleEntities}
    >
      <Gutter className={styles.view}>
        <h1>{title}</h1>
        {allowed ? children : <p>{COPY.notAllowed(who)}</p>}
      </Gutter>
    </DefaultTemplate>
  )
}

/** The first value of a query parameter, as Next.js hands a view its search params. */
export function firstParam(
  params: AdminViewServerProps['searchParams'],
  key: string,
): string | undefined {
  const value = (params as Record<string, string | string[] | undefined> | undefined)?.[key]
  return (Array.isArray(value) ? value[0] : value) || undefined
}

/** A panel that could not load, or waits on a later milestone, said in words. */
export function PanelNote({ state, on }: { state: 'failed' | 'waits-on'; on?: string }) {
  return (
    <p>{state === 'failed' ? COPY.couldNotLoad : COPY.waitsOn(COPY.today.notYetBuilt, on ?? '')}</p>
  )
}
