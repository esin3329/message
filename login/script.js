// 미리 설정된 아이디와 비밀번호
const validUsername = "esin";  // 아이디 설정
const validPassword = "1234";  // 비밀번호 설정

// 로그인 함수
function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  // 입력값이 미리 설정된 값과 일치하는지 확인
  if (username === validUsername && password === validPassword) {
    // 로그인 성공 시, 로그인 화면 숨기고 홈페이지 콘텐츠 표시
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('home-screen').style.display = 'block';
  } else {
    alert("아이디 또는 비밀번호가 잘못되었습니다.");
  }
}

function togglePassword() {
  const passwordField = document.getElementById('password');
  if (passwordField.type === 'password') {
    passwordField.type = 'text';
    document.getElementById("toggle-password").innerText = '비밀번호 숨기기';
  } else {
    passwordField.type = 'password';
    document.getElementById("toggle-password").innerText = "비밀번호 보기";
  }
}

// 로그아웃 함수
function logout() {
  // 홈페이지 콘텐츠 숨기고 로그인 화면 다시 보이기
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'block';
}

function checkTheme() {
  // 로컬 스토리지에서 저장된 테마를 가져옵니다.
  const theme = localStorage.getItem('theme');
  if (theme) {
    document.body.classList.add(theme); // 기존 테마 추가
    if (theme === 'dark-mode') {
      document.getElementById('theme-toggle').innerText = '라이트 모드';
      // 다크 모드일 때 h2에도 dark-mode 클래스 추가
      document.querySelectorAll('h2').forEach(h2 => {
        h2.classList.add('dark-mode');
      });
    } else {
      document.getElementById('theme-toggle').innerText = '다크 모드';
    }
  } else {
    // 로컬 스토리지에 테마가 없으면 기본 라이트 모드 설정
    document.getElementById('theme-toggle').innerText = '다크 모드';
  }
}

function toggleTheme() {
  // 다크 모드와 라이트 모드 토글
  const body = document.body;
  const button = document.getElementById('theme-toggle');
  
  if (body.classList.contains('dark-mode')) {
    body.classList.remove('dark-mode');
    localStorage.setItem('theme', 'light-mode'); // 라이트 모드 저장
    button.innerText = '다크 모드';
    
    // h2에서 dark-mode 클래스 제거
    document.querySelectorAll('h2').forEach(h2 => {
      h2.classList.remove('dark-mode');
    });
  } else {
    body.classList.add('dark-mode');
    localStorage.setItem('theme', 'dark-mode'); // 다크 모드 저장
    button.innerText = '라이트 모드';
    
    // h2에 dark-mode 클래스 추가
    document.querySelectorAll('h2').forEach(h2 => {
      h2.classList.add('dark-mode');
    });
  }
}

function query1() {
	let ret = confirm("네이버로 이동하시겠습니까?");
	return ret; 
}

function noAction(e) {
	e.preventDefault(); 
}

function query2() {
	let ret = confirm("구글로 이동하시겠습니까?");
	return ret; 
}

function noAction(e) {
	e.preventDefault(); 
}