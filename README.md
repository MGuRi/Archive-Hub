<div align="center">
  <img src="icon.png" width="76" height="76" alt="Archive Hub" />
  <h1>Archive Hub</h1>
  <p>
    <strong>컴퓨터에서 할 일, 일정, 학교 생활, 자주 쓰는 것들을 한곳에서 편하게 관리하는 데스크톱 위젯</strong>
  </p>
  <p>
    <img src="https://img.shields.io/badge/Electron-33.0-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron 33" />
    <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows&logoColor=white" alt="Windows" />
    <img src="https://img.shields.io/badge/Theme-Dark%20Warm%20Minimal-C79B85?style=flat-square" alt="Theme" />
  </p>
</div>

---

## 📌 이 앱은 무엇을 위해 만들었나요?

**Archive Hub**는 컴퓨터로 작업하면서 **해야 할 일과 일정, 수업·시험 준비, 학교 공지·메일, 자주 여는 앱과 파일, 그리고 집중 타이머와 Spotify 음악 컨트롤**까지 — 제가 좋아하고 자주 쓰는 것들을 여러 창을 오가지 않고 **바탕화면 위 하나의 작은 위젯**에서 편하게 관리하기 위해 만든 개인용 데스크톱 허브입니다.

---

## ✨ 탭별 주요 기능

1. **메인 요약 (`home`)** — 오늘부터 +7일간의 주간 스트립과 핵심 할 일·일정·시험을 한눈에 요약해서 보여줍니다.
2. **할 일 & 일정 (`todo`)** — 시간·태그 자동 파싱 입력(`14:00 미팅 #학업`), 드래그 앤 드롭 파일 첨부, 주간 반복, 당일 `D-Day` 배지, 완료 시 폭죽 & 레인보우 테두리 효과를 제공합니다.
3. **달력 (`calendar`)** — 월간 달력에서 날짜별 일정과 마감일을 한눈에 확인하고 빠르게 일정을 추가합니다.
4. **공부 & 시험 (`study`)** — 시험 D-Day 카드와 과목별 주간 학습 루틴·진도를 관리합니다.
5. **일일 리포트 (`reports`)** — 지정한 리포트 폴더의 일일 리포트를 바로 열어보고 미확인 리포트를 점 배지로 알립니다.
6. **학교 공지 (`notices`)** — 학교 공지사항을 15분마다 자동 확인해 새 공지 개수를 탭 배지로 알려줍니다.
7. **학교 메일 (`mail`)** — Gmail(IMAP)과 1시간마다 동기화되어 새 메일 여부를 확인하고 내용을 바로 열람합니다.
8. **바로가기 (`links`)** — 웹 링크는 물론 설치된 데스크톱 앱(Gemini, Claude, ChatGPT 등)과 폴더를 등록해 한 번에 실행합니다.
9. **Gemini (`gemini`)** — 브라우저 전환 없이 위젯 안에서 바로 질문하고, `/` 빠른 명령어와 `+` 파일·이미지 첨부로 멀티모달 분석을 실행합니다.
10. **텍스트 메모 (`memo`)** — 짧은 생각이나 임시 텍스트를 여러 개의 노트로 나누어 적고 자동 저장합니다.
11. **파일 바로가기 (`files`)** — 자주 쓰는 파일·폴더·URL을 드래그 앤 드롭이나 폴더 선택으로 모아두고 즉시 엽니다.
12. **집중 타이머 (`pomodoro`)** — `5분 · 15분 · 25분 · 50분` 컬러 프리셋과 `직접` 분 입력을 지원하며, 종료 시 위젯을 다시 띄우고 알림음 켜짐 상태라면 최대 20초간 멜로디 알람이 울립니다.

---

## 🛠 공통 편의 기능

- **상단 D-Day 배지**: 여러 D-Day를 등록해 두고 상단에서 바로 전환하며 남은 일수를 확인합니다.
- **Spotify 미니 플레이어**: 현재 재생 중인 곡을 표시하고 이전 곡 / 재생·일시정지 / 다음 곡을 바로 조작합니다.
- **항상 위 고정 & 투명도 조절**: 핀 버튼으로 위젯을 화면 최상단에 고정하고, 설정에서 투명도와 카테고리를 커스터마이징합니다.
- **탭 순서 변경**: 상단 `6×2` 탭 아이콘을 드래그해 원하는 순서로 배치할 수 있습니다.

---

## ⌨️ 단축키

- `Alt + Shift + W` — 위젯 창 표시 / 숨김 토글 (글로벌 단축키)
- `Ctrl + 1 ~ 9` — 1번 ~ 9번 탭으로 바로 이동
- `Ctrl + 0` / `Ctrl + -` / `Ctrl + =` — 10번 / 11번 / 12번 탭으로 이동
- `Tab` / `Shift + Tab` — 다음 / 이전 탭 전환

---

## 📁 프로젝트 구조

```text
Archive-Hub/
├── main.js                   # Electron 메인 프로세스, 창/트레이/글로벌 단축키, IMAP·Gemini·파일 IPC
├── preload.js                # contextBridge API 노출
├── index.html                # 위젯 레이아웃 및 12개 탭 마크업
├── styles.css                # 다크 미니멀 테마 및 애니메이션 스타일
├── renderer.js               # 탭 상태, 할 일/달력/타이머/Gemini UI 로직
├── scripts/
│   └── spotify-status.ps1    # Windows Spotify 재생 상태 연동 스크립트
├── assets/icons/             # 앱 및 바로가기 아이콘 리소스
├── MyDeskHub.vbs             # 콘솔 창 없이 백그라운드 실행용 런처
└── package.json              # 프로젝트 메타데이터 및 실행 스크립트
```

---

## 🚀 실행 방법

```bash
# 의존성 설치
npm install

# 위젯 실행
npm start
```

> **참고:** Windows에서 콘솔 창 없이 실행하려면 `MyDeskHub.vbs`를 사용할 수 있으며, 위젯 설정에서 **Windows 시작 시 자동 실행**도 켤 수 있습니다.
