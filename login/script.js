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

// 로그아웃 함수
function logout() {
  // 홈페이지 콘텐츠 숨기고 로그인 화면 다시 보이기
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'block';
}

function query() {
	let ret = confirm("네이버로 이동하시겠습니까?");
	return ret; 
}

function noAction(e) {
	e.preventDefault(); 
}

function query() {
	let ret = confirm("구글로 이동하시겠습니까?");
	return ret; 
}

function noAction(e) {
	e.preventDefault(); 
}