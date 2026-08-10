const messagesEl = document.querySelector('#messages');
const form = document.querySelector('#chat-form');
const messageInput = document.querySelector('#message');
const phoneInput = document.querySelector('#phone');
const sendBtn = document.querySelector('#send');
const healthEl = document.querySelector('#health');

function addBubble(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = role === 'customer' ? 'You' : 'Agent';
  bubble.appendChild(who);
  bubble.appendChild(document.createTextNode(text));
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function refreshHealth() {
  try {
    const response = await fetch('/health');
    const data = await response.json();
    healthEl.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    healthEl.textContent = 'Server not reachable. Run: npm run dev';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  const phone = phoneInput.value.trim();
  if (!text || !phone) return;

  addBubble('customer', text);
  messageInput.value = '';
  sendBtn.disabled = true;

  try {
    const response = await fetch('/demo/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message: text }),
    });
    const data = await response.json();
    if (!response.ok) {
      addBubble('agent', data.error || 'Something went wrong.');
    } else {
      addBubble('agent', data.reply);
    }
  } catch {
    addBubble(
      'agent',
      "We're temporarily unable to process your request. Please try again shortly.",
    );
  } finally {
    sendBtn.disabled = false;
    messageInput.focus();
    refreshHealth();
  }
});

document.querySelectorAll('[data-fill]').forEach((button) => {
  button.addEventListener('click', () => {
    messageInput.value = button.getAttribute('data-fill') || '';
    messageInput.focus();
  });
});

addBubble(
  'agent',
  'Hi! I can help with payout requests.\n\nTry: "I want a payout of 5000"',
);
refreshHealth();
setInterval(refreshHealth, 15000);
