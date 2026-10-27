// 다른 화면이 설정의 한 묶음으로 바로 데려올 때 — 설정은 맨 위에서 열리므로 그 묶음까지 내려가 제목에 초점을 둔다.

/** 설정의 GitHub 묶음 — 받기 줄의 "로그인" 이 데려오는 곳 */
export const GITHUB_SECTION = 'settings-github'

/**
 * 그 묶음으로 스크롤해 제목(`<id>-title`)에 초점을 둔다. 설정 화면은 처음 열 때 마운트되고 숨겨 둔 화면은
 * 크기가 없어서, 보일 때까지 기다린다 — 최대 60프레임(약 1초). 그래도 안 보이면 설정 맨 위에 둔다:
 * 설정은 이미 열렸고 GitHub 묶음은 스크롤하면 있다
 */
export const revealSettingsSection = (id: string, tries = 60): void => {
  requestAnimationFrame(() => {
    const section = document.getElementById(id)
    if (!section || section.offsetParent === null) {
      if (tries > 0) revealSettingsSection(id, tries - 1)
      return
    }
    section.scrollIntoView({ block: 'start' })
    document.getElementById(`${id}-title`)?.focus({ preventScroll: true })
  })
}
