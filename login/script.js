// 과제용 시연 계정입니다. 클라이언트 비교는 실제 인증이나 접근 제어가 아닙니다.
const validUsername = "esin";
const validPassword = "1234";

// 로그인 함수
function login(event) {
  event.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  if (username === validUsername && password === validPassword) {
    document.getElementById('login-screen').hidden = true;
    document.getElementById('home-screen').hidden = false;
    document.querySelector('#home-screen h1').focus();
  } else {
    alert("아이디 또는 비밀번호가 잘못되었습니다.");
  }
}

function togglePassword() {
  const passwordField = document.getElementById('password');
  const button = document.getElementById('toggle-password');
  const visible = passwordField.type === 'password';
  passwordField.type = visible ? 'text' : 'password';
  button.textContent = visible ? '비밀번호 숨기기' : '비밀번호 보기';
  button.setAttribute('aria-pressed', String(visible));
}

// 로그아웃 함수
function logout() {
  const form = document.getElementById('login-screen');
  document.getElementById('home-screen').hidden = true;
  form.reset();
  document.getElementById('password').type = 'password';
  const button = document.getElementById('toggle-password');
  button.textContent = '비밀번호 보기';
  button.setAttribute('aria-pressed', 'false');
  form.hidden = false;
  document.getElementById('username').focus();
}

function applyTheme(dark) {
  document.body.classList.toggle('dark-mode', dark);
  const button = document.getElementById('theme-toggle');
  button.textContent = dark ? '라이트 모드' : '다크 모드';
  button.setAttribute('aria-pressed', String(dark));
}

function checkTheme() {
  applyTheme(localStorage.getItem('theme') === 'dark-mode');
}

function toggleTheme() {
  const dark = !document.body.classList.contains('dark-mode');
  applyTheme(dark);
  localStorage.setItem('theme', dark ? 'dark-mode' : 'light-mode');
}

function query1() {
  return confirm("네이버로 이동하시겠습니까?");
}

function query2() {
  return confirm("구글로 이동하시겠습니까?");
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-screen').addEventListener('submit', login);
  checkTheme();
});