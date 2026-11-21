import type { Field } from 'payload'

/**
 * The `facts` array (docs/04, `page_facts`, on pages, posts and services): every claim a public
 * page makes, with where it comes from and when it was last checked, so that each one can be
 * traced (docs/content/README.md). One definition for every collection that carries it.
 */
export const factsField: Field = {
  name: 'facts',
  type: 'array',
  labels: { singular: 'Fact', plural: 'Facts' },
  admin: {
    description:
      'Every claim the page makes, with where it comes from (docs/content/README.md). A claim with no source does not go on the page.',
  },
  fields: [
    { name: 'statement', type: 'textarea', required: true },
    {
      type: 'row',
      fields: [
        {
          name: 'source',
          type: 'select',
          required: true,
          options: [
            { label: 'Brochure', value: 'brochure' },
            { label: 'Current site', value: 'site' },
            { label: 'Registration form', value: 'form' },
            { label: 'Founder', value: 'founder' },
            { label: "IIIC's description or philosophy", value: 'description' },
            { label: 'Page copy IIIC supplied', value: 'pageCopy' },
            { label: 'Counted', value: 'counted' },
          ],
        },
        { name: 'checkedAt', type: 'date', label: 'Checked on' },
      ],
    },
  ],
}
