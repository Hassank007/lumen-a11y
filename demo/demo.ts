const choice = document.getElementById('page-choice') as HTMLSelectElement;
const page = document.getElementById('demo-page') as HTMLIFrameElement;
choice.value = 'pages/demo.html';
choice.addEventListener('change', () => { page.src = choice.value; });
