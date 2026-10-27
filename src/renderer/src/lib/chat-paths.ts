// 채팅 답의 인라인 코드가 보관함 파일을 가리키는가.
// 보관함에 **있는** 파일만 잡는다 — 없는 경로를 링크로 만들면 눌러서 오류 화면을 본다.

/** 찾는 키(NFC 로 접은 경로) → 보관함의 실제 경로 */
export type VaultFileIndex = ReadonlyMap<string, string>

/**
 * 보관함 파일 경로의 찾기 표. 한글 파일명은 디스크에 풀어 쓴 꼴(NFD)로 남아 있을 수 있고 모델은 합친 꼴(NFC)로
 * 적는다 — 키는 NFC 로 접고, 여는 데 쓰는 값은 디스크의 경로 그대로 둔다
 */
export const vaultFileIndex = (rels: readonly string[]): VaultFileIndex =>
  new Map(rels.map((rel) => [rel.normalize('NFC'), rel]))

/**
 * 그 글자가 가리키는 보관함 상대경로, 아니면 null.
 * 상대경로는 파일 목록과 같을 때, 절대경로(`/…`·`~/…`·`C:\…`)는 꼬리가 목록의 경로와 맞을 때만 잡는다
 * (보관함이 어디 있는지 몰라도 된다). 폴더 없는 꼬리(`report.html`)는 절대경로에서 잡지 않는다 — 우연히 겹친다
 */
export const vaultPathIn = (code: string, files: VaultFileIndex): string | null => {
  const text = code.trim().normalize('NFC').replaceAll('\\', '/').replace(/^\.\//, '')
  if (text === '' || /\s/.test(text)) return null
  const segments = text.split('/')
  if (segments.includes('..')) return null
  const exact = files.get(text)
  if (exact !== undefined) return exact
  if (!/^(\/|~\/|[A-Za-z]:\/)/.test(text)) return null
  // 긴 꼬리부터 본다
  for (let at = 1; at < segments.length - 1; at++) {
    const found = files.get(segments.slice(at).join('/'))
    if (found !== undefined) return found
  }
  return null
}
