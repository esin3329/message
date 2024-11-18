const express = require('express');
const app = express();

// 공지사항 데이터 예시
let announcements = [
    { title: "게임 업데이트 1.1", content: "버그 수정 및 성능 개선." },
    { title: "신규 이벤트 시작", content: "모든 플레이어에게 보상이 지급됩니다!" }
];

// 새 공지사항이 있는지 여부
let hasNewAnnouncement = false;

// 공지사항 목록 반환 라우트
app.get('/api/announcements', (req, res) => {
    res.status(200).json(announcements);
});

// 새 공지사항 여부 확인 라우트
app.get('/api/check-new-announcements', (req, res) => {
    res.status(200).json(hasNewAnnouncement);
    hasNewAnnouncement = false; // 확인 후 새 공지 알림 상태 초기화
});

// 새 공지사항 추가 함수 (예제)
function addAnnouncement(title, content) {
    announcements.push({ title, content });
    hasNewAnnouncement = true;
}

// 서버 실행
const PORT = 8080;
app.listen(PORT, () => {
    console.log(`서버가 http://127.0.0.1:${PORT}에서 실행 중입니다.`);

    // 예시로 공지사항 추가 (서버 시작 후 새 공지를 추가하는 시뮬레이션)
    setTimeout(() => addAnnouncement("긴급 점검 안내", "오전 2시에 서버 점검이 진행됩니다."), 60000); // 1분 후 새 공지 추가
});
