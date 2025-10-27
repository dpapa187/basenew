const form = document.getElementById('generator-form');
const promptInput = document.getElementById('prompt');
const aspectRatioSelect = document.getElementById('aspectRatio');
const durationSelect = document.getElementById('duration');
const generateBtn = document.getElementById('generate-btn');
const statusEl = document.getElementById('status');
const resultContainer = document.getElementById('result');
const resultVideo = document.getElementById('result-video');
const resultPrompt = document.getElementById('result-prompt');
const resultInfo = document.getElementById('result-info');
const downloadLink = document.getElementById('download-link');
const historyContainer = document.getElementById('history');
const clearHistoryBtn = document.getElementById('clear-history');
const appleSection = document.getElementById('apple-auth');
const appleButton = document.getElementById('apple-signin-btn');
const appleStatus = document.getElementById('apple-signin-status');
const appleProfile = document.getElementById('apple-profile');
const appleProfileDetails = document.getElementById('apple-profile-details');
const appleTokenWrapper = document.getElementById('apple-token-wrapper');
const appleTokenDetails = document.getElementById('apple-token-details');

const HISTORY_KEY = 'visionary-studio-history-v1';

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const prompt = promptInput.value.trim();
  const aspectRatio = aspectRatioSelect.value;
  const duration = durationSelect.value;

  if (!prompt) {
    showStatus('Please describe your concept before generating a video.', 'error');
    promptInput.focus();
    return;
  }

  setLoading(true);
  showStatus('Submitting your request to fal.ai…', 'progress');

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, aspectRatio, duration }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || 'Unexpected server error.');
    }

    const { videoUrl, metadata, requestId } = payload;
    displayResult({ videoUrl, prompt, metadata, requestId });
    showStatus('Video successfully generated! Preview and download below.', 'success');
    persistHistory({
      prompt,
      aspectRatio,
      duration: Number(duration),
      videoUrl,
      requestId,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    showStatus(error.message || 'Something went wrong while generating the video.', 'error');
  } finally {
    setLoading(false);
  }
});

clearHistoryBtn.addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  showStatus('History cleared. Ready for a fresh round of ideas!', 'success');
});

function setLoading(isLoading) {
  if (isLoading) {
    generateBtn.setAttribute('disabled', 'true');
    generateBtn.classList.add('loading');
  } else {
    generateBtn.removeAttribute('disabled');
    generateBtn.classList.remove('loading');
  }
}

function showStatus(message, type = 'progress') {
  statusEl.textContent = message;
  statusEl.classList.remove('status--success', 'status--error');
  if (type === 'success') {
    statusEl.classList.add('status--success');
  } else if (type === 'error') {
    statusEl.classList.add('status--error');
  }
}

function displayResult({ videoUrl, prompt, metadata, requestId }) {
  if (!videoUrl) {
    showStatus('The fal.ai response did not include a video URL. Please try again.', 'error');
    return;
  }

  resultVideo.src = videoUrl;
  resultPrompt.textContent = prompt;

  const infoItems = [
    { label: 'Aspect ratio', value: metadata?.aspectRatio || '—' },
    { label: 'Duration', value: metadata?.duration ? `${metadata.duration}s` : '—' },
    { label: 'Request ID', value: requestId || '—' },
    { label: 'Completed at', value: metadata?.completedAt ? formatDate(metadata.completedAt) : 'Just now' },
  ];

  resultInfo.innerHTML = infoItems
    .map((item) => `<li><strong>${item.label}</strong>${escapeHtml(item.value)}</li>`)
    .join('');

  downloadLink.href = videoUrl;
  downloadLink.download = `visionary-studio-${Date.now()}.mp4`;

  resultContainer.classList.remove('hidden');
}

function escapeHtml(value) {
  if (typeof value !== 'string') {
    value = String(value ?? '');
  }
  return value.replace(/[&<>'"]/g, (char) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char] || char;
  });
}

function formatDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function persistHistory(entry) {
  const history = getHistory();
  history.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
  renderHistory();
}

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to parse history from storage', error);
    return [];
  }
}

function renderHistory() {
  const history = getHistory();
  if (!history.length) {
    historyContainer.innerHTML = '<p class="history__empty">Generate a clip to populate your creative trail.</p>';
    return;
  }

  historyContainer.innerHTML = history
    .map((item) => {
      const created = formatDate(item.createdAt);
      const details = [
        `Aspect ratio: ${escapeHtml(item.aspectRatio)}`,
        `Duration: ${escapeHtml(`${item.duration}s`)}`,
        item.requestId ? `Request ID: ${escapeHtml(item.requestId)}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      return `
        <article class="history-card">
          <h3 class="history-card__title">${escapeHtml(item.prompt)}</h3>
          <div class="history-card__meta">${escapeHtml(details)}</div>
          <div class="history-card__actions">
            <a class="button button--secondary" href="${encodeURI(item.videoUrl)}" target="_blank" rel="noopener">Open video</a>
          </div>
          <small class="history-card__timestamp">${escapeHtml(created)}</small>
        </article>
      `;
    })
    .join('');
}

renderHistory();
initAppleSignIn();

async function initAppleSignIn() {
  if (!appleSection || !appleButton) {
    return;
  }

  try {
    const config = await requestAppleConfig();
    if (!config.enabled) {
      appleSection.classList.add('is-hidden');
      return;
    }

    appleSection.classList.remove('is-hidden');
    appleButton.addEventListener('click', onAppleButtonClick, { once: false });
  } catch (error) {
    console.warn('Unable to initialise Apple sign in', error);
    appleSection.classList.add('is-hidden');
  }
}

async function onAppleButtonClick() {
  showAppleStatus('Opening Sign in with Apple…', 'progress');

  try {
    const config = await requestAppleConfig();
    if (!config.enabled) {
      showAppleStatus('Sign in with Apple is not currently available.', 'error');
      return;
    }

    const appleId = window.AppleID;
    if (!appleId || !appleId.auth) {
      showAppleStatus('Apple authentication script failed to load.', 'error');
      return;
    }

    appleId.auth.init({
      clientId: config.clientId,
      scope: config.scope,
      redirectURI: config.redirectUri,
      state: config.state,
      usePopup: true,
    });

    const response = await appleId.auth.signIn();
    showAppleStatus('Completing secure sign in…', 'progress');

    const payload = {
      code: response?.authorization?.code || null,
      idToken: response?.authorization?.id_token || null,
      state: response?.authorization?.state || null,
      user: response?.user || null,
    };

    const serverResponse = await fetch('/api/auth/apple/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await serverResponse.json().catch(() => ({}));

    if (!serverResponse.ok) {
      throw new Error(data.error || 'Unable to complete Apple sign in.');
    }

    renderAppleProfile(data.profile || {}, data.tokens || {});
    showAppleStatus('You are signed in with Apple.', 'success');
  } catch (error) {
    if (error?.error === 'popup_closed_by_user' || error?.error === 'user_cancelled_authorize') {
      showAppleStatus('Sign in was cancelled before completion.', 'error');
      return;
    }

    console.error('Apple sign in error', error);
    showAppleStatus(error.message || 'Sign in with Apple failed. Please try again.', 'error');
  }
}

async function requestAppleConfig() {
  const response = await fetch('/api/auth/apple/config');
  if (!response.ok) {
    throw new Error('Apple configuration request failed.');
  }
  return response.json();
}

function showAppleStatus(message, type = 'progress') {
  if (!appleStatus) return;

  appleStatus.textContent = message;
  appleStatus.classList.remove('status--success', 'status--error');
  if (type === 'success') {
    appleStatus.classList.add('status--success');
  } else if (type === 'error') {
    appleStatus.classList.add('status--error');
  }
}

function renderAppleProfile(profile, tokens) {
  if (!appleProfile || !appleProfileDetails) {
    return;
  }

  const items = [
    { label: 'Email', value: profile.email || '—' },
    {
      label: 'Email verified',
      value:
        profile.emailVerified === null || profile.emailVerified === undefined
          ? 'Unknown'
          : profile.emailVerified
          ? 'Yes'
          : 'No',
    },
    { label: 'Apple ID', value: profile.sub || '—' },
  ];

  const name = [profile?.name?.firstName, profile?.name?.lastName].filter(Boolean).join(' ');
  if (name) {
    items.push({ label: 'Name', value: name });
  }

  appleProfileDetails.innerHTML = items
    .map((item) => `<dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd>`)
    .join('');

  if (appleTokenWrapper && appleTokenDetails) {
    const tokenItems = [
      { label: 'Access token', value: tokens.accessToken ? truncateToken(tokens.accessToken) : '—' },
      { label: 'Expires in', value: tokens.expiresIn ? `${tokens.expiresIn}s` : '—' },
      { label: 'Token type', value: tokens.tokenType || '—' },
      { label: 'Refresh token', value: tokens.refreshToken ? truncateToken(tokens.refreshToken) : '—' },
    ];

    const hasToken = tokenItems.some((item) => item.value && item.value !== '—');

    if (hasToken) {
      appleTokenDetails.innerHTML = tokenItems
        .map((item) => `<dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd>`)
        .join('');
      appleTokenWrapper.classList.remove('is-hidden');
    } else {
      appleTokenDetails.innerHTML = '';
      appleTokenWrapper.classList.add('is-hidden');
    }
  }

  appleProfile.classList.remove('is-hidden');
}

function truncateToken(token) {
  if (!token || token.length <= 12) {
    return token;
  }
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}
