import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// main.css 가 이름 붙인 글자 크기·그림자를 알려 준다 — 기본 설정은 `text-body` 를 글자색으로 읽어
// `text-foreground` 옆에서 지워 버린다.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['display', 'title', 'heading', 'body', 'callout', 'caption', 'micro', 'overline'] }
      ],
      shadow: [{ shadow: ['raised', 'overlay', 'well'] }]
    }
  }
})

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
