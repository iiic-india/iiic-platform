import type { TextFieldSingleValidation, Validate } from 'payload'
import { text } from 'payload/shared'

import { GSTIN } from '@/globals/Settings'

import {
  FINAL_STAGES,
  REASON_STAGES,
  STAGES_BY_KIND,
  type LeadKind,
  type LeadStage,
} from './stages'

/**
 * Field checks for the pipeline's collections and its public forms (docs/17 §2, §6): shapes only,
 * never a business rule. Kept free of `server-only`, as the collections load them in the Payload
 * CLI too.
 */

export const MESSAGES = {
  website: 'Enter the website’s address, such as example.com.',
  gstin: 'Enter the 15-character GSTIN.',
  postalCode: 'Enter the six-digit PIN code.',
  stage: 'Choose one of this board’s stages.',
  reason: 'Say why the lead ended here.',
} as const

/**
 * A website as typed ("example.com", "https://www.example.com/about") in one form: https unless
 * http was typed, the host in small letters, no trailing slash. Null when it is not a public web
 * address (no dot in the host, a user name or password, a port, another scheme).
 */
export function toWebsite(input: string): string | null {
  const typed = input.trim()
  if (!typed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || url.port) return null
  if (!/^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,63}$/.test(url.hostname)) return null
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
  return `${url.protocol}//${url.hostname}${path}${url.search}`
}

/** The host a website is on, without "www.": what matching compares (docs/17 §4). */
export function domainOf(website: string): string | null {
  const normal = toWebsite(website)
  return normal ? new URL(normal).hostname.replace(/^www\./, '') : null
}

/** Payload's own text check, then the address. */
export const validateWebsite: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  if (base !== true) return base
  if (typeof value !== 'string' || value.trim() === '') return true
  return toWebsite(value) !== null || MESSAGES.website
}

/** Payload's own text check, then the GSTIN's form (the same as Settings'). */
export const validateGstin: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  if (base !== true) return base
  if (typeof value !== 'string' || value.trim() === '') return true
  return GSTIN.test(value.trim().toUpperCase()) || MESSAGES.gstin
}

/** An Indian PIN code: six digits, the first not zero. */
export const validatePostalCode: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  if (base !== true) return base
  if (typeof value !== 'string' || value.trim() === '') return true
  return /^[1-9]\d{5}$/.test(value.trim()) || MESSAGES.postalCode
}

/** Whether a stage belongs to a kind's board. */
export function stageOfKind(kind: unknown, stage: unknown): boolean {
  const stages = STAGES_BY_KIND[kind as LeadKind] as readonly string[] | undefined
  return Boolean(stages?.includes(String(stage)))
}

/** A lead's stage is one of its own board's (a partnership is never "Team Map done"). */
export const validateStage: Validate<unknown, unknown, { kind?: unknown }> = (
  value,
  { siblingData },
) => {
  if (value === undefined || value === null || !siblingData?.kind) return true
  return stageOfKind(siblingData.kind, value) || MESSAGES.stage
}

/** A lead that ends lost or closed says why (docs/03 F5: "Lost (reason)"). */
export const validateEndReason: Validate<unknown, unknown, { stage?: unknown }> = (
  value,
  { siblingData },
) => {
  const needsReason = (REASON_STAGES as readonly unknown[]).includes(siblingData?.stage)
  if (!needsReason) return true
  return (typeof value === 'string' && value.trim() !== '') || MESSAGES.reason
}

/** Whether a stage ends the lead. */
export function isFinalStage(stage: LeadStage): boolean {
  return (FINAL_STAGES as readonly LeadStage[]).includes(stage)
}
