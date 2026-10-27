import { cn } from '../lib/utils'

// 2nd-brain 심볼 — 사분원 네 조각 사이 빈자리가 반짝임이 된다. 세 조각은 글자색, 오른쪽 아래 하나만 primary.
// 원본·규칙은 로고 키트 `docs/brand/`(`build/icon.*` 와 같은 출처). 24px 이하는 틈을 넓힌 작은 크기 컷을 쓴다 — 기본 컷은 반짝임이 막힌다.
const CUTS = {
  regular: {
    viewBox: '36 36 184 184',
    rest: 'M62 36 L124 36 A88 88 0 0 1 36 124 L36 62 A26 26 0 0 1 62 36 Z M220 62 L220 124 A88 88 0 0 1 132 36 L194 36 A26 26 0 0 1 220 62 Z M36 194 L36 132 A88 88 0 0 1 124 220 L62 220 A26 26 0 0 1 36 194 Z',
    spark: 'M194 220 L132 220 A88 88 0 0 1 220 132 L220 194 A26 26 0 0 1 194 220 Z'
  },
  small: {
    viewBox: '33 33 190 190',
    rest: 'M51 33 L117 33 A84 84 0 0 1 33 117 L33 51 A18 18 0 0 1 51 33 Z M223 51 L223 117 A84 84 0 0 1 139 33 L205 33 A18 18 0 0 1 223 51 Z M33 205 L33 139 A84 84 0 0 1 117 223 L51 223 A18 18 0 0 1 33 205 Z',
    spark: 'M205 223 L139 223 A84 84 0 0 1 223 139 L223 205 A18 18 0 0 1 205 223 Z'
  }
} as const

export const BrandMark = ({
  size,
  className
}: {
  size: number
  className?: string
}): React.JSX.Element => {
  const cut = CUTS[size <= 24 ? 'small' : 'regular']
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox={cut.viewBox}
      className={cn('shrink-0 text-foreground', className)}
    >
      <path fill="currentColor" d={cut.rest} />
      <path className="fill-primary" d={cut.spark} />
    </svg>
  )
}
