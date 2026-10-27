// 문서 변환기(PDF·HWPX·HWP·xlsx·docx·pptx)가 같이 쓰는 상한·거절 사유·GFM 표 조각.
import { Unzip, UnzipInflate } from 'fflate'
import { stringify as yamlStringify } from 'yaml'
import { mainT } from '../i18n'

/** 끌어다 놓은 파일 하나의 상한 — readFileSync 가 통째로 올리므로 그 전에 자른다. 그림 많은 한글 문서도 수십 MB 다 */
export const MAX_CLIP_FILE_BYTES = 200 * 1024 * 1024

/** 형식은 알아봤지만 읽지 않는 문서 — message 가 곧 사용자에게 보이는 사유다 */
export class UnsupportedDocument extends Error {}

/** frontmatter 값 하나 — 줄바꿈을 접고 YAML 규칙대로 따옴표를 붙인다(제목·파일명·URL 제목은 외부 입력이다) */
export const yamlScalar = (value: string): string =>
  // lineWidth 0 — 기본 80칸 접힘은 `title: ` 뒤에 들여쓰기 없는 둘째 줄을 만들어 frontmatter 를 깨뜨린다
  yamlStringify(value.replace(/[\r\n]+/g, ' ').trim(), { lineWidth: 0 }).trimEnd()

/**
 * 한 자료에서 뽑을 글자 상한 — 넘으면 자르고 그 사실을 문서에 적는다.
 * 200쪽짜리 문서를 통째로 이어 붙이면 위키화 에이전트가 한 번에 못 읽고, 사용자는
 * "위키화가 실패했다" 만 받는다. 자른 것은 원본 파일에 그대로 남아 있다.
 */
export const CLIP_TEXT_LIMIT = 120_000

// ui-hangul-ignore: 보관함에 남는 자료 본문 끝 표식(D8)
export const CLIP_CUT_NOTE =
  '(이 문서는 너무 길어 앞부분만 옮겼다 — 전체는 원본 파일에 그대로 있다)'

export const capText = (all: string): string =>
  all.length <= CLIP_TEXT_LIMIT
    ? all
    : `${all.slice(0, CLIP_TEXT_LIMIT)}\n\n---\n\n${CLIP_CUT_NOTE}`

/**
 * zip 계열 문서(HWPX·xlsx·docx·pptx)를 풀어 놓을 상한(압축 해제 뒤 합계). 사용자가 받아 온 임의 zip 이라
 * 작은 파일이 수 GB 로 부풀 수 있다 — 실물 검수확인서의 section0.xml 은 83KB 다.
 */
export const ZIP_INFLATE_LIMIT = 32 * 1024 * 1024

/**
 * zip 을 실제로 풀어 보며 누적 바이트가 상한을 넘는 순간 던진다.
 * 선언 크기(중앙 디렉터리)는 거짓일 수 있고, 데이터 디스크립터(플래그 0x08) 항목은 로컬 헤더에
 * 크기가 없다 — 실물 .xlsx 17건 중 3건이 이 플래그를 쓴다(2026-09-17 실측). 그래서 선언값 대신
 * 스트리밍 inflate 로 진짜 크기를 잰다. xlsx 의 소비자 read-excel-file(unzipper) 도 같은 로컬 헤더 순서로 풀므로
 * 여기서 잰 바이트가 곧 그쪽이 푸는 바이트다. 항목을 두 번 푸는 비용은 상한(32MB)으로 유계다.
 * docx 의 mammoth(jszip)는 중앙 디렉터리로 찾아 순서가 다르다 — 그래서 docx 는 잰 항목만 다시 묶어 넘긴다(docx-text).
 */
/** zip 을 스트리밍으로 풀며 고른 항목만 모은다 — 고르지 않은 항목(HWPX 의 그림 등)은 풀지도 세지도 않는다 */
export const unzipWithin = (
  data: Uint8Array,
  want: (name: string) => boolean,
  limit = ZIP_INFLATE_LIMIT
): Record<string, Uint8Array> => {
  let total = 0
  // 항목 이름은 외부 입력이다 — __proto__ 같은 이름이 프로토타입을 건드리지 않게 맨 객체에 모은다
  const chunks: Record<string, Uint8Array[]> = Object.create(null)
  const unzip = new Unzip()
  unzip.register(UnzipInflate)
  unzip.onfile = (file) => {
    if (!want(file.name)) return
    const parts: Uint8Array[] = (chunks[file.name] = [])
    file.ondata = (error, chunk) => {
      if (error) throw error
      total += chunk.length
      if (total > limit) throw new UnsupportedDocument(mainT().clipMain.zipTooLarge)
      parts.push(chunk)
    }
    file.start()
  }
  unzip.push(data, true)
  return Object.fromEntries(
    Object.entries(chunks).map(([name, parts]) => {
      const whole = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
      let at = 0
      for (const part of parts) {
        whole.set(part, at)
        at += part.length
      }
      return [name, whole]
    })
  )
}

/** 전 항목을 풀어 보며 상한만 잰다 — 풀어 놓은 것은 버린다(xlsx 는 read-excel-file 이 다시 푼다) */
export const assertZipWithin = (data: Uint8Array, limit = ZIP_INFLATE_LIMIT): void => {
  unzipWithin(data, () => true, limit)
}

/** 대체 텍스트를 이 글자 수에서 자른다 — 그림 설명은 한 줄이면 족하고, 외부 입력이라 상한 없이 싣지 않는다 */
const IMAGE_ALT_LIMIT = 200

/**
 * 그림 자리표 — 그림은 읽지 않고 자리만 남긴다. 문서가 적어 둔 대체 텍스트가 있으면 `[IMAGE: 설명]`.
 * 대체 텍스트는 외부 입력이다: 줄바꿈은 접고, 자리표를 일찍 닫는 `]` 와 표의 열을 미는 `|` 는 뺀다.
 */
export const imageMark = (alt?: string | null): string => {
  const clean = (alt ?? '').replace(/[\]|]/g, ' ').replace(/\s+/g, ' ').trim()
  // 글자(코드 포인트) 단위로 자른다 — UTF-16 단위로 자르면 이모지가 반쪽으로 남는다
  const cut = Array.from(clean).slice(0, IMAGE_ALT_LIMIT).join('').trim()
  return cut ? `[IMAGE: ${cut}]` : '[IMAGE]'
}

/** 그림 자리표를 뺀 글 — 자리표(와 대체 텍스트)만 남은 문서는 글자가 없는 문서다 */
export const stripImageMarks = (text: string): string =>
  text.replace(/\[IMAGE(?:: [^\]\n]*)?\]/g, '')

/** 병합 칸 폭 상한 — 속성값은 외부 입력이라 거대한 폭 하나가 배열 할당으로 main 을 죽이지 않게 자른다.
 * 실물 표는 한 자리 수다 */
export const MAX_COL_SPAN = 64

/** 외부 입력 속성값을 정수 범위로 — 비었거나 숫자가 아니면 min */
export const clampInt = (raw: string | null | undefined, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.trunc(Number(raw ?? min)) || min))

/** 표 한 칸 — 줄바꿈은 공백으로 접고 세로줄은 이스케이프한다(위키화 에이전트가 읽는 md 다) */
export const gfmCell = (text: string): string =>
  text
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()

export const gfmRow = (cells: string[], width: number): string =>
  `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`

/** 표 하나의 열 상한 — 행마다 가장 넓은 행의 폭까지 빈 칸을 채우므로, 열 수가 곧 행당 일이다 */
export const MAX_TABLE_COLUMNS = 256

/**
 * 첫 행이 헤더인 GFM 표 — budget(남은 글자 예산, 기본 CLIP_TEXT_LIMIT)에 닿으면 남은 행은 만들지 않는다.
 * 뒤에서 capText 가 잘린 표시를 붙인다
 */
export const gfmTable = (rows: string[][], budget = CLIP_TEXT_LIMIT): string => {
  // 펼침(Math.max(...))은 행이 수십만이면 인자 수 한도로 던진다
  const width = Math.min(
    MAX_TABLE_COLUMNS,
    rows.reduce((widest, row) => Math.max(widest, row.length), 0)
  )
  const [head, ...body] = rows
  const lines = [
    gfmRow(head, width),
    gfmRow(
      Array.from({ length: width }, () => '---'),
      width
    )
  ]
  let length = lines[0].length + lines[1].length
  for (const row of body) {
    if (length > budget) break
    const line = gfmRow(row, width)
    lines.push(line)
    length += line.length + 1
  }
  return lines.join('\n')
}
