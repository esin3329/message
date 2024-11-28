function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (username === '' || password === '') {
        alert('아이디와 비밀번호를 모두 입력해주세요.');
        return;
    }

    // 예시: 사용자 정보 확인 (여기서는 간단히 로컬스토리지 활용)
    if (username === 'esin' && password === '1234') {
        alert('로그인 성공!');
        localStorage.setItem('loggedIn', 'true');
    } else {
        alert('아이디 또는 비밀번호가 잘못되었습니다.');
    }
}