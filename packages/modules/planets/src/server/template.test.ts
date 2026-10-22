import { describe, expect, it } from 'vitest'
import { MAX_RENDERED_BYTES, renderTemplate, TemplateError } from './template.ts'

const render = (source: string, context: Record<string, unknown> = {}, rawOutput = false) =>
  renderTemplate(source, context, { rawOutput })

describe('renderTemplate', () => {
  it('escapes output by default (template injection fixtures)', async () => {
    const hostile = {
      name: '<script>alert(1)</script>',
      attr: '" onmouseover="alert(1)',
      svg: '<svg onload=alert(1)>',
      url: 'javascript:alert(1)',
    }
    const html = await render(
      '<p title="{{ attr }}">{{ name }}{{ svg }}</p><a href="{{ url }}">x</a>',
      hostile,
    )
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<svg')
    expect(html).toContain('&lt;script&gt;')
    // The quote that would end the attribute is escaped.
    expect(html).toContain('title="&#34; onmouseover=&#34;alert(1)"')
  })

  it('escapes values that went through other filters', async () => {
    const html = await render('{{ x | upcase }}{{ x | append: "<b>" }}{{ x | json }}', {
      x: '<i>',
    })
    expect(html).not.toContain('<i>')
    expect(html).not.toContain('<b>')
  })

  it('does not let the raw filter skip escaping without the raw_output permission', async () => {
    expect(await render('{{ x | raw }}', { x: '<b>hi</b>' })).toBe('&lt;b&gt;hi&lt;/b&gt;')
  })

  it('lets the raw filter output markup when the Planet declared raw_output', async () => {
    expect(await render('{{ x | raw }}', { x: '<b>hi</b>' }, true)).toBe('<b>hi</b>')
    // Escaping stays the default even then.
    expect(await render('{{ x }}', { x: '<b>' }, true)).toBe('&lt;b&gt;')
  })

  it.each([
    '{% include "secret" %}',
    '{% render "secret" %}',
    '{% layout "secret" %}',
    '{% block x %}{% endblock %}',
  ])('refuses tags that load files: %s', async (source) => {
    await expect(render(source)).rejects.toBeInstanceOf(TemplateError)
  })

  it('reads only own properties, not the prototype chain', async () => {
    const html = await render(
      '[{{ list.constructor }}][{{ x.constructor.name }}][{{ x.toString }}]',
      {
        x: { a: 1 },
        list: [1],
      },
    )
    expect(html).toBe('[][][]')
  })

  it('stops a template that loops for too long', async () => {
    await expect(render('{% for i in (1..100000000) %}x{% endfor %}')).rejects.toBeInstanceOf(
      TemplateError,
    )
  })

  it('refuses oversized templates and oversized output', async () => {
    await expect(render('x'.repeat(40_000))).rejects.toBeInstanceOf(TemplateError)
    const big = 'y'.repeat(MAX_RENDERED_BYTES)
    await expect(render('{{ a }}{{ a }}', { a: big })).rejects.toThrow(/too large/)
  })

  it('turns syntax errors into a short message', async () => {
    const error = await render('{% if %}').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TemplateError)
    expect((error as Error).message.split('\n')).toHaveLength(1)
  })
})
