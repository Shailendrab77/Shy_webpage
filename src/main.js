import './style.css'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="page">
    <header class="hero">
      <p class="eyebrow">Welcome</p>
      <h1>Shy Webpage</h1>
      <p class="subtitle">A quiet corner of the web.</p>
    </header>

    <section class="card" aria-labelledby="guestbook-title">
      <h2 id="guestbook-title">Guestbook</h2>
      <p class="hint">Leave a note — it stays in your browser for this session.</p>
      <form id="guestbook-form" class="guestbook-form">
        <label for="guest-name">Name</label>
        <input id="guest-name" name="name" type="text" placeholder="Your name" required />

        <label for="guest-message">Message</label>
        <textarea id="guest-message" name="message" rows="3" placeholder="Say hello..." required></textarea>

        <button type="submit">Add note</button>
      </form>
      <ul id="guestbook-entries" class="guestbook-entries" aria-live="polite"></ul>
    </section>
  </main>
`

const form = document.querySelector('#guestbook-form')
const entriesList = document.querySelector('#guestbook-entries')
const entries = []

function renderEntries() {
  entriesList.innerHTML = entries
    .map(
      (entry) => `
        <li class="entry">
          <strong>${escapeHtml(entry.name)}</strong>
          <span>${escapeHtml(entry.message)}</span>
        </li>
      `
    )
    .join('')
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

form.addEventListener('submit', (event) => {
  event.preventDefault()

  const name = form.elements.name.value.trim()
  const message = form.elements.message.value.trim()

  if (!name || !message) {
    return
  }

  entries.unshift({ name, message })
  renderEntries()
  form.reset()
  form.elements.name.focus()
})
