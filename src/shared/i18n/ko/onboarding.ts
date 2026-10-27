// 첫 실행 시작하기 — 질문 → AI 연결 → GitHub → 보관함(renderer lib/onboarding-text.ts). 저장 구조 이름(vault·repo·push)은 내지 않는다
export const onboarding = {
  stepPosition: (position: number, total: number): string => `${total}단계 중 ${position}단계`,
  purposeQuestion: '2nd-brain으로 무엇을 정리하고 싶으세요?',
  purposePlaceholder: '예: 우리 팀 서버 운영 지식을 한곳에 모으고 싶어요',
  purposeNote: '보관함의 방향 문서에 적어 두고, AI가 위키를 쓸 때 참고해요. 나중에 바꿀 수 있어요.',
  githubPrivateNote: '내 GitHub 계정의 비공개 저장소에 올라가요 · 원본 자료도 같이',
  githubRequired:
    '위키와 자료를 내 GitHub에 올려 두려면 로그인이 한 번 필요해요. 비밀번호는 앱에 넣지 않아요.',
  githubLaterNote:
    '나중에 하면 이 컴퓨터에만 만들고, GitHub에는 시작하기 마지막 걸음이나 설정에서 올릴 수 있어요.',
  starterGithubNote:
    '내 GitHub에 보관함을 만들고 이 컴퓨터의 문서 폴더에 받아 와요. 폴더는 고르지 않아도 돼요.',
  starterLocalNote:
    '이 컴퓨터의 문서 폴더에 만들어요. GitHub에는 나중에 시작하기 마지막 걸음이나 설정에서 올릴 수 있어요.',
  starterProgressGithub: '내 GitHub에 보관함을 만들고 받아 오는 중…',
  starterProgressLocal: '보관함을 만드는 중…',
  starterLocalPublishFailed: '이 컴퓨터에 만들었어요 · GitHub에는 못 올렸어요',
  starterLocal: '이 컴퓨터에 만들었어요',
  starterSkeleton: '기본 보관함으로 만들어 ',
  starterPublished: (origin: string, repo: string): string =>
    `${origin}내 GitHub 비공개 저장소에 올렸어요${repo ? ` · ${repo}` : ''}`,
  starterPublishFailed:
    '보관함은 만들었지만 GitHub에 올리지 못했어요. 위 GitHub에 올리기에서 다시 올려 주세요.',
  publishLater: 'GitHub에 올리기는 나중에 해도 돼요'
}
