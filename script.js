// ======== Configuration ========
const API_BASE = window.location.origin;

// ======== Toast Notification ========
function showToast(msg, type) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast-item' + (type ? ' ' + type : '');
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3000);
}

// ======== Visit Tracking ========
async function trackVisit() {
  try {
    await fetch(API_BASE + '/api/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referrer: document.referrer || '',
        page_url: window.location.pathname,
      }),
    });
  } catch (e) {
    // Silently fail — tracking should never block the page
  }
}

// ======== Enrollment Form ========
const enrollForm = document.querySelector('#enroll-form');
const formNote = document.querySelector('#form-note');

if (enrollForm && formNote) {
  enrollForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(enrollForm);
    const name = String(formData.get('name') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const level = String(formData.get('level') || '').trim();

    if (!name || !phone || !level) {
      formNote.textContent = '请先填写姓名、电话和报考层次。';
      formNote.classList.add('is-error');
      return;
    }

    try {
      const res = await fetch(API_BASE + '/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          level,
          major: String(formData.get('major') || '').trim(),
        }),
      });

      const data = await res.json();
      if (data.ok) {
        formNote.textContent = `${name}，你的咨询信息已提交！招生老师会尽快与你联系，请保持电话畅通。`;
        formNote.classList.remove('is-error');
        enrollForm.reset();

        // Auto-fill chat name and phone
        const chatName = document.getElementById('chatName');
        const chatPhone = document.getElementById('chatPhone');
        if (chatName && !chatName.value) chatName.value = name;
        if (chatPhone && !chatPhone.value) chatPhone.value = phone;
      } else {
        formNote.textContent = data.error || '提交失败，请稍后重试或直接拨打热线电话。';
        formNote.classList.add('is-error');
      }
    } catch (e) {
      formNote.textContent = '网络异常，请直接拨打热线电话完成报名。';
      formNote.classList.add('is-error');
    }
  });
}

// ======== Chat Widget ========
const chatToggle = document.getElementById('chatToggle');
const chatModal = document.getElementById('chatModal');
const chatClose = document.getElementById('chatCloseBtn');
const chatMsgs = document.getElementById('chatMsgs');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const chatName = document.getElementById('chatName');
const chatPhone = document.getElementById('chatPhone');
const chatTip = document.getElementById('chatTip');
const chatBody = document.getElementById('chatBody');

let chatOpen = false;
let pollTimer = null;

// Toggle chat
chatToggle.addEventListener('click', () => {
  chatOpen = !chatOpen;
  chatModal.classList.toggle('open', chatOpen);
  if (chatOpen) {
    chatBody.scrollTop = chatBody.scrollHeight;
    loadChatMessages();
    startPolling();
  } else {
    stopPolling();
  }
});

chatClose.addEventListener('click', () => {
  chatOpen = false;
  chatModal.classList.remove('open');
  stopPolling();
});

// Send message
async function sendChatMessage() {
  const name = chatName.value.trim() || '匿名';
  const phone = chatPhone.value.trim();
  const content = chatInput.value.trim();

  if (!phone) {
    chatTip.textContent = '请填写手机号，方便老师回复你';
    chatTip.style.color = '#e5493a';
    chatPhone.focus();
    return;
  }
  if (!content) {
    chatTip.textContent = '请输入留言内容';
    chatTip.style.color = '#e5493a';
    chatInput.focus();
    return;
  }

  chatTip.textContent = '';
  chatSendBtn.disabled = true;
  chatSendBtn.textContent = '发送中...';

  try {
    const res = await fetch(API_BASE + '/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, content }),
    });
    const data = await res.json();
    if (data.ok) {
      // Add message to chat immediately
      addChatMsg(content, 'visitor', name);
      chatInput.value = '';
      chatTip.textContent = '消息已发送，老师回复后会显示在这里';
      chatTip.style.color = '#16a34a';
    } else {
      chatTip.textContent = data.error || '发送失败，请重试';
      chatTip.style.color = '#e5493a';
    }
  } catch (e) {
    chatTip.textContent = '网络异常，请稍后重试';
    chatTip.style.color = '#e5493a';
  }

  chatSendBtn.disabled = false;
  chatSendBtn.textContent = '发送';
}

chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

function addChatMsg(content, type, name) {
  const el = document.createElement('div');
  el.className = 'chat-msg ' + type;
  const now = new Date();
  const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `<div>${escapeHtml(content)}</div><div class="chat-msg-meta">${escapeHtml(name || '')} · ${time}</div>`;
  chatMsgs.appendChild(el);
  chatBody.scrollTop = chatBody.scrollHeight;
}

// Load messages for visitor
async function loadChatMessages() {
  const phone = chatPhone.value.trim();
  if (!phone) return;

  try {
    const res = await fetch(API_BASE + '/api/messages?phone=' + encodeURIComponent(phone));
    const data = await res.json();
    if (data.messages) {
      chatMsgs.innerHTML = '';
      data.messages.forEach(m => {
        addChatMsg(m.content, m.is_admin ? 'admin' : 'visitor', m.is_admin ? '招生老师' : (chatName.value.trim() || '你'));
      });
    }
  } catch (e) {
    // Silent
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(loadChatMessages, 15000); // Poll every 15s
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// When phone changes, reload messages
chatPhone.addEventListener('change', () => {
  if (chatOpen) loadChatMessages();
});

// ======== Helper ========
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ======== Init ========
trackVisit();
