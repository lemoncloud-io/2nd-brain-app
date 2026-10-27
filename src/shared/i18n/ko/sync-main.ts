import { josa } from '../../josa'

// main 팀 동기화·수정 보내기 오류(main ipc/sync-handlers · vault/sync)
export const syncMain = {
  pullFailed: '팀 변경을 받지 못했어요. 잠시 뒤 다시 받아 주세요',
  pullBeforeSend:
    '팀 변경을 받지 못해서 보내지 않았어요. 사이드바 맨 위 받기 안내대로 정리한 뒤 다시 보내 주세요',
  sending: '이미 보내는 중이에요',
  conflict: '나와 팀이 같은 문서를 따로 고쳤어요. 승인에서 남길 쪽을 먼저 골라 주세요',
  draftWaiting:
    '확인을 기다리는 위키 초안 만들기가 있어요. 승인을 마치면 수정도 그 요청에 함께 가요',
  ingestRunning: '위키 초안 만들기나 위키에 넣는 일이 진행 중이에요. 끝난 뒤 다시 보내 주세요',
  loginNeeded: 'GitHub 로그인이 필요해요. 설정의 팀 저장소에서 로그인한 뒤 다시 보내 주세요',
  notLinked: '팀 저장소에 연결돼 있지 않아요. 설정의 팀 저장소에서 연결해 주세요',
  nothingToSend: '팀에 보낼 수정이 없어요',
  unknownPick: '무엇을 고를지 알 수 없어요',
  conflictPending: (action: string): string =>
    `같은 문서를 둘이 고친 것을 아직 고르지 않았어요. 승인에서 고른 뒤 ${action}`,
  midMerge: (action: string): string =>
    `팀 변경을 합치다 멈춰 있어요. 사이드바 맨 위 줄이 안내하는 것부터 한 뒤 ${action}`,
  fetchLogin: 'GitHub 로그인이 필요해요. 설정의 팀 저장소에서 로그인한 뒤 다시 받아 주세요',
  loginExpired: 'GitHub 로그인이 풀렸어요. 설정의 팀 저장소에서 로그아웃한 뒤 다시 로그인해 주세요',
  fetchNotFound:
    '팀 저장소에 연결하지 못했어요. 주소를 확인하고, 그 저장소를 볼 수 있는 계정으로 로그인했는지 확인해 주세요',
  fetchOffline: '팀 저장소에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 받아 주세요',
  fetchTimeout: '팀 저장소에 연결하지 못했어요. 잠시 뒤 다시 받아 주세요',
  fetchFailed: '팀 변경을 받지 못했어요',
  pushConflict: '나와 팀이 같은 문서를 따로 고쳤어요. 승인에서 남길 쪽을 고른 뒤 올려 주세요',
  pushStuck:
    '팀 변경을 받지 못해서 올리지 않았어요. 사이드바 맨 위 받기 안내대로 정리한 뒤 다시 올려 주세요',
  mergeFailed: '팀 변경을 합치지 못했어요. 설정에서 보관함 상태를 되돌린 뒤 다시 받아 주세요',
  switchFailed: '팀 최신으로 옮기지 못했어요. 잠시 뒤 다시 받아 주세요',
  restoreDraft:
    '승인을 기다리는 위키 초안 만들기가 있어요. 승인에서 위키에 넣거나 모두 거절해 주세요',
  restorePick: '고르기를 기다리는 문서가 있어요. 팀 변경 받기에서 고른 뒤 다시 눌러 주세요',
  restoreForeign:
    '다른 도구가 보관함을 고치다 멈춰 있어요. 이 보관함을 다루는 동료에게 도움을 청해 주세요',
  restoreBusy: '위키 초안 만들기나 위키에 넣는 일이 보관함을 쓰고 있어요. 끝난 뒤 다시 눌러 주세요',
  restoreSwitch:
    '새로 만든 파일이 팀 문서와 이름이 같아서 되돌리지 않았어요. 그 파일을 옮기거나 이름을 바꾼 뒤 다시 눌러 주세요',
  restoreCarry:
    '앱에서 고친 문서가 팀이 확인 중인 문서에 걸려 있어서 가져올 수 없어요. 팀이 받아들이면 앱이 저절로 돌아와요',
  pickUnavailable: '그 문서는 지금 고를 수 없어요. 목록을 다시 불러와 주세요',
  bothUnreadable: '두 내용을 읽지 못했어요. 팀 변경을 다시 받은 뒤 골라 주세요',
  restoreLocal: (list: string): string =>
    `앱 밖에서 만든 작업이 이 컴퓨터에만 있어서 되돌리지 않았어요. 되돌리면 앱에서 안 보이게 돼요: ${list} · 그 작업을 만든 사람에게 먼저 팀에 보내 달라고 해 주세요`,
  publicRepo:
    '이 저장소는 로그인 없이도 누구나 볼 수 있어서 올리지 않았어요. GitHub에서 저장소를 비공개(Private)로 바꾸거나, 비공개 저장소를 새로 만들어 연결해 주세요',
  pushNotFound:
    'GitHub에서 저장소를 찾지 못했어요. 주소를 확인하거나, 로그인한 계정에 그 저장소가 있는지 확인해 주세요',
  pushLogin: 'GitHub 로그인이 필요해요. 설정의 팀 저장소에서 로그인한 뒤 다시 올려 주세요',
  pushBehind:
    'GitHub 저장소에 아직 받지 않은 팀 변경이 있어요. 사이드바 맨 위 줄을 눌러 팀 변경을 받은 뒤 다시 올려 주세요',
  pushOffline: 'GitHub에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 올려 주세요',
  githubNotLinked: 'GitHub 저장소가 연결돼 있지 않아요. 설정의 팀 저장소에서 연결해 주세요',
  pushFailed: 'GitHub에 올리지 못했어요',
  sendFailed: '팀에 보내지 못했어요',
  pushTimeout: (minutes: number): string =>
    `${minutes}분 동안 올리지 못해서 멈췄어요. 인터넷 연결을 확인하고 다시 올려 주세요`,
  cloneLogin: 'GitHub 로그인이 필요해요. 위의 GitHub 로그인을 마친 뒤 다시 받아 주세요',
  cloneNotFound:
    '저장소를 찾지 못했어요. 주소를 확인하고, 그 저장소를 볼 수 있는 계정으로 로그인했는지 확인해 주세요',
  cloneOffline: '저장소에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 가져와 주세요',
  cloneBadUrl: '저장소 주소가 아니에요. https://github.com/계정/저장소 모양으로 붙여 넣어 주세요',
  cloneTimeout: '오래 걸려서 멈췄어요. 인터넷 연결을 확인하고 다시 가져와 주세요',
  cloneEmpty: '저장소가 아직 비어 있어요. 잠시 뒤 다시 받아 주세요',
  cloneReadOnly: '읽기 중심 폴더라서 팀 보관함으로 받을 수 없어요',
  cloneFailed: '보관함을 가져오지 못했어요',
  cloneExists: (name: string): string =>
    `${name} 폴더가 이미 있어요. 다른 곳을 고르거나, 그 폴더를 '이미 쓰던 보관함·Obsidian 폴더 열기'로 열어 주세요`,
  cloneMissing: (missing: string): string => `보관함에 있어야 할 ${josa(missing, '이/가')} 없어요`,
  cloneNotVault: (detail: string): string => `받아 온 저장소는 자료 보관함이 아니에요. ${detail}`,
  createdNotLinked:
    'GitHub 저장소는 만들었지만 연결하지 못했어요. GitHub에 올리기로 다시 올려 주세요'
}
