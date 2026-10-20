import type { WidgetOption } from '@orbit/widget-sdk'

export const CURRENCIES = ['USD', 'EUR', 'DKK', 'GBP'] as const

/** Every budget widget offers the same currency setting. The numbers are sample data, so it only changes the format. */
export const currencyOption: WidgetOption = {
  kind: 'select',
  key: 'currency',
  label: 'Currency',
  choices: CURRENCIES.map((value) => ({ value, label: value })),
  default: 'USD',
}

export interface MoneyPart {
  readonly type: Intl.NumberFormatPartTypes
  readonly value: string
  /** The cents. Drawn lighter so the whole amount reads first. */
  readonly minor: boolean
}

/** The widget's `locale` setting, or the browser's language when there is none. */
export function localeOf(config: Readonly<Record<string, unknown>>): string | undefined {
  return typeof config.locale === 'string' ? config.locale : undefined
}

/** A formatted amount split into parts, so the decimal separator and cents can be styled. */
export function moneyParts(
  amount: number,
  currency: string,
  locale?: string,
): readonly MoneyPart[] {
  return new Intl.NumberFormat(locale, { style: 'currency', currency })
    .formatToParts(amount)
    .map((part) => ({
      type: part.type,
      value: part.value,
      minor: part.type === 'decimal' || part.type === 'fraction',
    }))
}

export function formatMoney(amount: number, currency: string, locale?: string): string {
  return moneyParts(amount, currency, locale)
    .map((part) => part.value)
    .join('')
}

/** `2.46%`. Direction is drawn separately, so the sign is dropped. */
export function formatPercent(change: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(change) / 100)
}

/** Compact axis label: 500 becomes `0.5k`. */
export function formatThousands(value: number): string {
  return `${(value / 1000).toFixed(1)}k`
}
