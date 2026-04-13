const SUPABASE_URL = "https://fdqiejugyutfgmcfynzy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gLGATKGolx1e5qMg_KOTLg_tXruFwv0";

// ===== INITIALIZATION =====
let sb = null;
let currentUser = null;
let currentReplyTo = null;
let typingTimeout = null;
let currentView = 'chats';
let messages = [];
let realtimeChannel = null;
let activeChatUserId = null;
let activeChatUsername = null;
let conversationMetaMap = new Map();
let unreadConversations = {};
let hasConversationBootstrap = false;
let liveSyncIntervalId = null;
let lastIncomingSeenByPartner = {};
let activeProfileTab = 'account';
let profileCache = null;

const DEFAULT_PROFILE_PREFERENCES = {
    bio: '',
    mood: '🙂',
    theme: 'light',
    notifications: true,
    sidebarSort: 'recent',
    compactMode: false,
    bubbleStyle: 'rounded',
    readReceipts: true,
    pinnedConversations: [],
    mutedConversations: {},
    recentConversations: [],
    unreadConversations: {},
    incomingSeen: {}
};

const TERMS_CONTENT = `
<div class="terms-content">
<h3>TERMS OF SERVICE & PRIVACY POLICY</h3>

<h4>1. TERMS OF SERVICE</h4>

<h5>1.1 Use License</h5>
<p>Nuntia grants you a limited, non-exclusive, non-transferable license to use the application for personal use only.</p>

<h5>1.2 User Responsibilities</h5>
<ul>
<li>You agree not to post illegal, harmful, or offensive content</li>
<li>You will not harass, threaten, or abuse other users</li>
<li>You will respect the intellectual property rights of others</li>
<li>You understand your content may be moderated or removed</li>
</ul>

<h5>1.3 Messaging</h5>
<ul>
<li>Nuntia is built for private direct messages between users</li>
<li>You are responsible for messages sent from your account</li>
<li>We may limit abusive activity for platform safety</li>
</ul>

<h5>1.4 Limitation of Liability</h5>
<p>Nuntia is provided "as is" without warranties. We are not liable for any damages arising from use of the platform.</p>

<h5>1.5 Termination</h5>
<p>We reserve the right to suspend or terminate accounts that violate these terms.</p>

<hr>

<h4>2. PRIVACY POLICY</h4>

<h5>2.1 Data Collection</h5>
<p>We collect:</p>
<ul>
<li>Account data (email, username)</li>
<li>Direct messages and message metadata</li>
<li>Profile and preferences settings</li>
<li>Basic usage data for reliability and improvements</li>
</ul>

<h5>2.2 Data Storage</h5>
<p>Data is stored in Supabase infrastructure.</p>

<h5>2.3 Data Protection</h5>
<ul>
<li>Authentication is handled securely through Supabase Auth</li>
<li>Access is controlled by database permissions and RLS policies</li>
<li>Only participants of a DM thread should be able to read that thread</li>
</ul>

<h5>2.4 Data Sharing</h5>
<p>We do not sell your personal data to third parties.</p>

<h5>2.5 Your Rights</h5>
<ul>
<li>You can update your profile and settings</li>
<li>You can delete your own messages</li>
<li>You can request account removal through support/admin workflow</li>
</ul>

<h5>2.6 Changes to Policy</h5>
<p>We may update this policy. Continued use means acceptance of changes.</p>

<hr>
<p><strong>By using Nuntia, you agree to these terms and privacy policy.</strong></p>
</div>
`;

let splashRemoved = false;

function removeSplash() {
    if (splashRemoved) return;
    splashRemoved = true;

    const splash = document.getElementById('splashScreen');
    if (!splash) return;

    splash.classList.add('fade-out');
    setTimeout(() => {
        splash.style.display = 'none';
        splash.remove();
    }, 300);
}

function initSupabase() {
    if (typeof window.supabase === 'undefined') {
        console.error('Supabase library not loaded!');
        return null;
    }
    try {
        return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { autoRefreshToken: true, persistSession: true }
        });
    } catch (error) {
        console.error('Failed to initialize Supabase:', error);
        return null;
    }
}

sb = initSupabase();

// ===== HELPER FUNCTIONS =====
function showAlert(msg, type = "info") {
    const container = document.getElementById("alertContainer");
    if (!container) return;
    const alert = document.createElement("div");
    alert.className = `alert ${type}`;
    alert.textContent = msg;
    container.appendChild(alert);
    setTimeout(() => alert.remove(), 3000);
}

function showScreen(screenId) {
    const authScreen = document.getElementById("authScreen");
    const chatScreen = document.getElementById("chatScreen");
    const profileScreen = document.getElementById("profileScreen");
    const sidebar = document.getElementById("sidebar");
    const bottomNav = document.getElementById("bottomNav");
    
    if (authScreen) authScreen.classList.add("hidden");
    if (chatScreen) chatScreen.classList.add("hidden");
    if (profileScreen) profileScreen.classList.add("hidden");
    
    if (screenId === "authScreen") {
        if (authScreen) authScreen.classList.remove("hidden");
        if (sidebar) sidebar.classList.remove("visible");
        if (bottomNav) bottomNav.classList.remove("visible");
    } else if (screenId === "chatScreen") {
        if (chatScreen) chatScreen.classList.remove("hidden");
        if (sidebar) sidebar.classList.add("visible");
        if (bottomNav) bottomNav.classList.add("visible");
        currentView = "chats";
    } else if (screenId === "profileScreen") {
        if (profileScreen) profileScreen.classList.remove("hidden");
        if (sidebar) sidebar.classList.add("visible");
        if (bottomNav) bottomNav.classList.add("visible");
        currentView = "profile";
    }
    updateActiveNav();
}

function updateActiveNav() {
    document.querySelectorAll('[data-view]').forEach(btn => {
        const view = btn.getAttribute('data-view');
        if (view === currentView) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

function showModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("hidden");
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add("hidden");
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openTermsModal() {
    const termsContent = document.getElementById('termsContent');
    if (termsContent) termsContent.innerHTML = TERMS_CONTENT;
    showModal('termsModal');
}

let prefsPersistTimeout = null;

function normalizeProfilePreferences(rawPrefs) {
    if (!rawPrefs || typeof rawPrefs !== 'object') {
        return { ...DEFAULT_PROFILE_PREFERENCES };
    }
    return { ...DEFAULT_PROFILE_PREFERENCES, ...rawPrefs };
}

function getCurrentPreferences() {
    return normalizeProfilePreferences(profileCache?.preferences);
}

function applyPreferencePatch(patch) {
    const current = getCurrentPreferences();
    const next = { ...current, ...patch };
    profileCache = {
        ...(profileCache || {}),
        preferences: next
    };
    return next;
}

function queuePreferencesPersist(patch = {}) {
    if (!currentUser) return;
    applyPreferencePatch(patch);

    if (prefsPersistTimeout) {
        clearTimeout(prefsPersistTimeout);
    }

    prefsPersistTimeout = setTimeout(async () => {
        prefsPersistTimeout = null;
        if (!sb || !currentUser) return;

        const prefs = getCurrentPreferences();
        const { error } = await sb
            .from('profiles')
            .update({ preferences: prefs })
            .eq('id', currentUser.id);

        if (error && !String(error.message || '').toLowerCase().includes('preferences')) {
            console.error('Failed to persist preferences:', error);
        }
    }, 250);
}

function loadRecentConversations() {
    return getCurrentPreferences().recentConversations || [];
}

function saveRecentConversations(conversations) {
    queuePreferencesPersist({ recentConversations: conversations || [] });
}

function loadUnreadConversations() {
    return getCurrentPreferences().unreadConversations || {};
}

function saveUnreadConversations() {
    queuePreferencesPersist({ unreadConversations });
}

function loadIncomingSeenMap() {
    return getCurrentPreferences().incomingSeen || {};
}

function saveIncomingSeenMap() {
    queuePreferencesPersist({ incomingSeen: lastIncomingSeenByPartner });
}

function getPinnedConversations() {
    return getCurrentPreferences().pinnedConversations || [];
}

function getMutedConversations() {
    return getCurrentPreferences().mutedConversations || {};
}

function getSidebarSortMode() {
    return getCurrentPreferences().sidebarSort || 'recent';
}

function markConversationRead(userId) {
    if (!userId) return;
    if (unreadConversations[userId]) {
        delete unreadConversations[userId];
        saveUnreadConversations();
    }
}

function incrementUnreadConversation(userId) {
    if (!userId) return;
    unreadConversations[userId] = (unreadConversations[userId] || 0) + 1;
    saveUnreadConversations();
}

function truncateText(text, max = 26) {
    const value = String(text || '').trim();
    if (value.length <= max) return value;
    return `${value.slice(0, max)}…`;
}

function formatRelativeTime(ts) {
    if (!ts) return '';
    const now = Date.now();
    const then = new Date(ts).getTime();
    if (Number.isNaN(then)) return '';
    const diffSec = Math.max(0, Math.floor((now - then) / 1000));
    if (diffSec < 60) return 'now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
    return `${Math.floor(diffSec / 86400)}d`;
}

function showIncomingToast(partnerId, previewText) {
    const preferences = getCurrentPreferences();
    if (preferences.notifications === false) return;
    if (preferences.mutedConversations?.[partnerId]) return;

    const partnerName = loadRecentConversations().find(c => c.id === partnerId)?.username || 'Someone';
    showAlert(`@${partnerName}: ${truncateText(previewText, 42)}`, 'info');

    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`New message from @${partnerName}`, {
            body: truncateText(previewText, 80)
        });
    }
}

function trackIncomingMessage(partnerId, messageContent, createdAt, senderId) {
    if (!partnerId || !createdAt) return;

    const isIncoming = senderId && currentUser && senderId !== currentUser.id;
    if (!isIncoming) return;

    const seenStamp = lastIncomingSeenByPartner[partnerId];
    if (seenStamp && new Date(createdAt).getTime() <= new Date(seenStamp).getTime()) {
        return;
    }

    lastIncomingSeenByPartner[partnerId] = createdAt;
    saveIncomingSeenMap();

    if (partnerId !== activeChatUserId) {
        incrementUnreadConversation(partnerId);
        showIncomingToast(partnerId, messageContent || 'New message');
    }
}

function stopLiveSync() {
    if (liveSyncIntervalId) {
        clearInterval(liveSyncIntervalId);
        liveSyncIntervalId = null;
    }
}

function startLiveSync() {
    stopLiveSync();
    liveSyncIntervalId = setInterval(async () => {
        if (!currentUser) return;
        await syncConversationsFromMessages();
        if (activeChatUserId) {
            await loadMessages();
        }
    }, 5000);
}

function saveProfilePreferencesToDb(preferences) {
    queuePreferencesPersist(preferences || {});
}

function updateSidebarButtonLabel() {
    const btn = document.getElementById('theme-toggle-sidebar');
    if (!btn) return;
    btn.textContent = document.body.classList.contains('dark-theme') ? '☀️ Light Mode' : '🌙 Dark Mode';
}

function togglePinActiveConversation() {
    if (!activeChatUserId) {
        showAlert('Open a direct message first.', 'info');
        return;
    }

    const prefs = getCurrentPreferences();
    const pinned = new Set(prefs.pinnedConversations || []);
    if (pinned.has(activeChatUserId)) pinned.delete(activeChatUserId);
    else pinned.add(activeChatUserId);

    queuePreferencesPersist({ pinnedConversations: [...pinned] });
    renderConversationList();
    renderProfileContent();
}

function toggleMuteActiveConversation() {
    if (!activeChatUserId) {
        showAlert('Open a direct message first.', 'info');
        return;
    }

    const prefs = getCurrentPreferences();
    const muted = { ...(prefs.mutedConversations || {}) };
    muted[activeChatUserId] = !muted[activeChatUserId];
    if (!muted[activeChatUserId]) delete muted[activeChatUserId];

    queuePreferencesPersist({ mutedConversations: muted });
    renderConversationList();
    renderProfileContent();
}

async function changePasswordFromSettings() {
    const newPasswordInput = document.getElementById('settingsNewPassword');
    const confirmPasswordInput = document.getElementById('settingsConfirmPassword');
    const newPassword = newPasswordInput?.value || '';
    const confirmPassword = confirmPasswordInput?.value || '';

    if (!newPassword || !confirmPassword) {
        showAlert('Enter and confirm your new password.', 'error');
        return;
    }
    if (newPassword.length < 6) {
        showAlert('Password must be at least 6 characters.', 'error');
        return;
    }
    if (newPassword !== confirmPassword) {
        showAlert('Passwords do not match.', 'error');
        return;
    }

    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) {
        showAlert(error.message, 'error');
        return;
    }

    if (newPasswordInput) newPasswordInput.value = '';
    if (confirmPasswordInput) confirmPasswordInput.value = '';
    showAlert('Password updated successfully.', 'success');
}

function exportMyData() {
    const payload = {
        exportedAt: new Date().toISOString(),
        userId: currentUser?.id || null,
        email: currentUser?.email || null,
        preferences: getCurrentPreferences(),
        conversations: loadRecentConversations()
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nuntia-export-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showAlert('Data export downloaded.', 'success');
}

function saveAdvancedSettings() {
    const themeValue = document.querySelector('input[name="pref-theme-chat"]:checked')?.value || 'light';
    const notificationsValue = document.getElementById('prefNotificationsToggle')?.checked ?? true;
    const sortValue = document.getElementById('sidebarSortSelect')?.value || 'recent';

    queuePreferencesPersist({
        theme: themeValue,
        notifications: notificationsValue,
        sidebarSort: sortValue
    });

    applyProfilePreferencesToChat();
    renderConversationList();
    updateSidebarButtonLabel();
    showAlert('Settings saved.', 'success');
}

async function syncConversationsFromMessages() {
    if (!sb || !currentUser) return;

    const previousMetaMap = new Map(conversationMetaMap);

    const { data, error } = await sb
        .from('messages')
        .select('sender_id, recipient_id, content, created_at')
        .or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false })
        .limit(250);

    if (error) {
        console.error('Conversation sync failed:', error);
        return;
    }

    const partnerMap = new Map();
    (data || []).forEach(msg => {
        const partnerId = msg.sender_id === currentUser.id ? msg.recipient_id : msg.sender_id;
        if (!partnerId || partnerId === currentUser.id || partnerMap.has(partnerId)) return;
        partnerMap.set(partnerId, {
            lastMessage: msg.content || '',
            createdAt: msg.created_at || null,
            senderId: msg.sender_id
        });
    });

    const partnerIds = [...partnerMap.keys()];
    if (!partnerIds.length) {
        conversationMetaMap = new Map();
        renderConversationList();
        return;
    }

    const { data: profiles } = await sb
        .from('profiles')
        .select('id, username')
        .in('id', partnerIds);

    const nameMap = new Map((profiles || []).map(p => [p.id, p.username || 'user']));
    const synced = partnerIds.map(id => ({ id, username: nameMap.get(id) || 'user' }));

    const existing = loadRecentConversations();
    const existingOnly = existing.filter(c => !partnerMap.has(c.id));
    const merged = [...synced, ...existingOnly].slice(0, 20);

    saveRecentConversations(merged);

    if (hasConversationBootstrap) {
        partnerIds.forEach(id => {
            const prevMeta = previousMetaMap.get(id);
            const nextMeta = partnerMap.get(id);
            if (!nextMeta?.createdAt) return;

            const prevTs = prevMeta?.createdAt ? new Date(prevMeta.createdAt).getTime() : 0;
            const nextTs = new Date(nextMeta.createdAt).getTime();
            if (nextTs > prevTs) {
                trackIncomingMessage(id, nextMeta.lastMessage, nextMeta.createdAt, nextMeta.senderId);
            }
        });
    }

    conversationMetaMap = new Map(partnerIds.map(id => [id, partnerMap.get(id)]));
    hasConversationBootstrap = true;
    renderConversationList();
}

function selectInitialConversation() {
    const recent = loadRecentConversations();
    if (recent.length > 0) {
        setActiveConversation(recent[0].id, recent[0].username);
        return;
    }
    setActiveConversation(null, null);
}

function saveRecentConversation(userId, username) {
    if (!currentUser || !userId || !username) return;
    const existing = loadRecentConversations().filter(c => c.id !== userId);
    const updated = [{ id: userId, username }, ...existing].slice(0, 20);
    saveRecentConversations(updated);
    renderConversationList();
}

function updateChatHeader() {
    const title = document.getElementById('chatTitle');
    const subtitle = document.getElementById('chatSubtitle');

    if (!title || !subtitle) return;

    if (activeChatUserId && activeChatUsername) {
        title.textContent = `Chat with @${activeChatUsername}`;
        subtitle.textContent = 'Direct message between 2 users';
    } else {
        title.textContent = 'Nuntia Direct Messages';
        subtitle.textContent = 'Select a user to start chatting';
    }
}

function setActiveConversation(userId = null, username = null) {
    activeChatUserId = userId;
    activeChatUsername = username;

    if (activeChatUserId) {
        markConversationRead(activeChatUserId);
    }

    document.querySelectorAll('.conversation-btn[data-user-id]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.userId === userId);
    });

    renderConversationList();
    updateChatHeader();
    loadMessages();
}

function renderConversationList() {
    const list = document.getElementById('conversationList');
    if (!list) return;

    const preferences = getCurrentPreferences();
    const pinnedSet = new Set(preferences.pinnedConversations || []);
    const mutedMap = preferences.mutedConversations || {};
    const sortMode = preferences.sidebarSort || 'recent';

    let conversations = [...loadRecentConversations()];
    if (!conversations.length) {
        list.innerHTML = '';
        return;
    }

    conversations.sort((left, right) => {
        const leftPinned = pinnedSet.has(left.id) ? 1 : 0;
        const rightPinned = pinnedSet.has(right.id) ? 1 : 0;
        if (leftPinned !== rightPinned) return rightPinned - leftPinned;

        if (sortMode === 'name') {
            return String(left.username || '').localeCompare(String(right.username || ''));
        }

        const leftTime = conversationMetaMap.get(left.id)?.createdAt ? new Date(conversationMetaMap.get(left.id).createdAt).getTime() : 0;
        const rightTime = conversationMetaMap.get(right.id)?.createdAt ? new Date(conversationMetaMap.get(right.id).createdAt).getTime() : 0;
        if (sortMode === 'oldest') return leftTime - rightTime;
        return rightTime - leftTime;
    });

    list.innerHTML = conversations.map(c => {
        const meta = conversationMetaMap.get(c.id);
        const previewPrefix = meta?.senderId === currentUser?.id ? 'You: ' : '';
        const preview = meta?.lastMessage
            ? `${previewPrefix}${truncateText(meta.lastMessage, 30)}`
            : 'No messages yet';
        const lastSeen = formatRelativeTime(meta?.createdAt);
        const unreadCount = activeChatUserId === c.id ? 0 : (unreadConversations[c.id] || 0);
        const isPinned = pinnedSet.has(c.id);
        const isMuted = Boolean(mutedMap[c.id]);

        return `
        <button class="conversation-btn ${activeChatUserId === c.id ? 'active' : ''}" data-user-id="${c.id}" data-username="${escapeHtml(c.username)}" type="button">
            <span class="conversation-title">${isPinned ? '📌 ' : ''}@${escapeHtml(c.username)}${isMuted ? ' 🔕' : ''}</span>
            <span class="conversation-meta">
                <span class="conversation-preview">${escapeHtml(preview)}</span>
                <span class="conversation-meta-right">
                    ${lastSeen ? `<span class="conversation-time">${lastSeen}</span>` : ''}
                    ${unreadCount > 0 ? `<span class="conversation-unread">${unreadCount}</span>` : ''}
                </span>
            </span>
        </button>
    `;
    }).join('');

    list.querySelectorAll('.conversation-btn[data-user-id]').forEach(btn => {
        btn.onclick = () => {
            showScreen('chatScreen');
            setActiveConversation(btn.dataset.userId, btn.dataset.username);
        };
    });
}

async function searchUsersByUsername(term) {
    if (!sb || !currentUser) return [];

    const query = (term || '').trim();
    if (!query) return [];

    const { data, error } = await sb
        .from('profiles')
        .select('id, username')
        .neq('id', currentUser.id)
        .ilike('username', `%${query}%`)
        .limit(10);

    if (error) {
        console.error('User search failed:', error);
        return [];
    }

    return data || [];
}

function renderUserSearchResults(users) {
    const container = document.getElementById('userSearchResults');
    if (!container) return;

    if (!users || !users.length) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = users.map(user => `
        <button class="search-result-btn" type="button" data-user-id="${user.id}" data-username="${escapeHtml(user.username || 'user')}">
            @${escapeHtml(user.username || 'user')}
        </button>
    `).join('');

    container.querySelectorAll('.search-result-btn').forEach(btn => {
        btn.onclick = () => {
            const userId = btn.dataset.userId;
            const username = btn.dataset.username || 'user';
            saveRecentConversation(userId, username);
            showScreen('chatScreen');
            setActiveConversation(userId, username);
            container.innerHTML = '';
            const input = document.getElementById('userSearchInput');
            if (input) input.value = '';
        };
    });
}

async function hydrateMessageMetadata(messageList) {
    if (!sb || !messageList?.length) return;

    const senderIds = new Set(messageList.map(m => m.sender_id).filter(Boolean));
    const replyIds = new Set(messageList.map(m => m.reply_to_id).filter(Boolean));
    const messageMap = new Map(messageList.map(m => [m.id, m]));
    const missingReplyIds = [...replyIds].filter(id => !messageMap.has(id));

    if (missingReplyIds.length) {
        const { data: missingReplies } = await sb
            .from('messages')
            .select('id, content, sender_id')
            .in('id', missingReplyIds);
        (missingReplies || []).forEach(m => messageMap.set(m.id, m));
    }

    [...replyIds].forEach(id => {
        const replied = messageMap.get(id);
        if (replied?.sender_id) senderIds.add(replied.sender_id);
    });

    const { data: profiles } = await sb
        .from('profiles')
        .select('id, username')
        .in('id', [...senderIds]);

    const userMap = new Map((profiles || []).map(p => [p.id, p.username || 'Unknown']));

    messageList.forEach(msg => {
        const senderName = userMap.get(msg.sender_id) || msg.sender?.username || 'Unknown';
        msg.sender = { username: senderName };

        if (msg.reply_to_id) {
            const replied = messageMap.get(msg.reply_to_id);
            if (replied) {
                msg.reply_to = {
                    content: replied.content,
                    sender: { username: userMap.get(replied.sender_id) || 'Unknown' },
                    sender_id: replied.sender_id
                };
            }
        }
    });
}

async function resolveLoginEmail(identifier) {
    const value = (identifier || '').trim();
    if (!value) return null;
    if (value.includes('@')) return value;

    const { data, error } = await sb
        .from("profiles")
        .select("email")
        .ilike("username", value)
        .maybeSingle();

    if (error) {
        console.error("Username lookup failed:", error);
        return null;
    }

    return data?.email || null;
}

async function ensureProfilesEmailColumn() {
    try {
        await sb.rpc("exec_sql", {
            sql: `
                ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
            `
        });
    } catch (error) {
        // Ignore when RPC is unavailable or not allowed for anon clients.
        console.log("profiles.email migration skipped");
    }
}

async function ensureProfilesPreferencesColumn() {
    try {
        await sb.rpc("exec_sql", {
            sql: `
                ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
            `
        });
    } catch (_error) {
        console.log("profiles.preferences migration skipped");
    }
}

// ===== AUTHENTICATION =====
async function handleLogin() {
    if (!sb) {
        showAlert("Chat service is unavailable right now. Please refresh.", "error");
        return;
    }

    const identifier = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    
    if (!identifier || !password) {
        showAlert("Please fill in all fields", "error");
        return;
    }

    let emailToUse = null;
    try {
        emailToUse = await resolveLoginEmail(identifier);
    } catch (e) {
        console.error("Identifier resolution failed:", e);
    }

    if (!emailToUse) {
        showAlert("Account not found. Use email or registered username.", "error");
        return;
    }

    const { data, error } = await sb.auth.signInWithPassword({ email: emailToUse, password });
    
    if (error) {
        showAlert(error.message, "error");
        return;
    }
    
    try {
        currentUser = data.user;
        await ensureProfile();
        showScreen("chatScreen");
        await loadMessages();
        await loadUserProfile();
        showAlert("Welcome back!", "success");
    } catch (e) {
        console.error("Post-login setup failed:", e);
        showAlert("Logged in, but failed to load profile/messages.", "error");
    }
}

async function handleRegister() {
    if (!sb) {
        showAlert("Chat service is unavailable right now. Please refresh.", "error");
        return;
    }

    const username = document.getElementById("regUsername").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    
    if (!username || !email || !password) {
        showAlert("Please fill in all fields", "error");
        return;
    }
    
    if (password.length < 6) {
        showAlert("Password must be at least 6 characters", "error");
        return;
    }
    
    // Check username availability (case-insensitive) before creating auth user.
    const { data: existingUserByName } = await sb
        .from("profiles")
        .select("id")
        .ilike("username", username)
        .maybeSingle();

    if (existingUserByName) {
        showAlert("Username is already taken", "error");
        return;
    }

    const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { username } }
    });
    
    if (error) {
        showAlert(error.message, "error");
        return;
    }
    
    if (data.user) {
        await createProfile(data.user.id, username, email);
        if (!data.session) {
            showAlert("Account created. Confirm your email, then login.", "info");
        } else {
            showAlert("Account created! Please login.", "success");
        }
        document.getElementById("loginEmail").value = email;
        document.getElementById("loginPassword").value = "";
        document.getElementById("loginForm").classList.remove("hidden");
        document.getElementById("registerForm").classList.add("hidden");
    }
}

async function createProfile(userId, username, email) {
    let { error } = await sb
        .from("profiles")
        .upsert({
            id: userId,
            username: username,
            email: email,
            status: "online",
            preferences: { ...DEFAULT_PROFILE_PREFERENCES }
        });

    // Compatibility with older schemas that don't yet include profiles.email.
    if (error) {
        const fallback = await sb
            .from("profiles")
            .upsert({ id: userId, username: username, status: "online" });
        error = fallback.error;
    }

    if (error) console.error("Profile creation error:", error);
}

async function ensureProfile() {
    const { data, error } = await sb
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();
    
    if (error || !data) {
        const username = currentUser.email.split('@')[0];
        await createProfile(currentUser.id, username, currentUser.email);
    }
}

async function handleLogout() {
    if (!sb) {
        currentUser = null;
        messages = [];
        showScreen("authScreen");
        return;
    }

    await sb.auth.signOut();
    stopLiveSync();
    if (realtimeChannel) {
        sb.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
    currentUser = null;
    messages = [];
    unreadConversations = {};
    conversationMetaMap = new Map();
    hasConversationBootstrap = false;
    lastIncomingSeenByPartner = {};
    profileCache = null;
    showScreen("authScreen");
    showAlert("Logged out successfully", "success");
}

async function loadActivityStats() {
    if (!sb || !currentUser) {
        return { sent: 0, received: 0, contacts: 0 };
    }

    const [{ count: sentCount }, { count: receivedCount }, { data: contactRows }] = await Promise.all([
        sb
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("sender_id", currentUser.id),
        sb
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("recipient_id", currentUser.id),
        sb
            .from("messages")
            .select("sender_id, recipient_id")
            .or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
            .limit(1000)
    ]);

    const contactSet = new Set();
    (contactRows || []).forEach(row => {
        const contactId = row.sender_id === currentUser.id ? row.recipient_id : row.sender_id;
        if (contactId && contactId !== currentUser.id) contactSet.add(contactId);
    });

    return {
        sent: sentCount || 0,
        received: receivedCount || 0,
        contacts: contactSet.size
    };
}

function renderProfileContent() {
    const container = document.getElementById('profileContent');
    if (!container) return;

    const profile = profileCache || {};
    const preferences = normalizeProfilePreferences(profile.preferences);
    const emailText = currentUser?.email || 'Not available';
    const joinedText = currentUser?.created_at
        ? new Date(currentUser.created_at).toLocaleDateString()
        : '-';

    if (activeProfileTab === 'account') {
        container.innerHTML = `
            <div class="form-card profile-container">
                <div class="form-group">
                    <label for="profileUsernameInput">Username</label>
                    <input type="text" id="profileUsernameInput" class="form-input" placeholder="Your username" title="Username" value="${escapeHtml(profile.username || '')}">
                </div>
                <div class="form-group">
                    <label for="profileStatusInput">Status</label>
                    <select id="profileStatusInput" class="form-input" title="Status">
                        <option value="online" ${profile.status === 'online' ? 'selected' : ''}>🟢 Online</option>
                        <option value="away" ${profile.status === 'away' ? 'selected' : ''}>🌙 Away</option>
                        <option value="busy" ${profile.status === 'busy' ? 'selected' : ''}>🔴 Busy</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="profileBioInput">Bio</label>
                    <textarea id="profileBioInput" class="form-textarea profile-bio" rows="3" placeholder="Tell people about yourself" title="Bio">${escapeHtml(preferences.bio || '')}</textarea>
                </div>
                <div class="form-group">
                    <label for="profileMoodInput">Mood Emoji</label>
                    <input type="text" id="profileMoodInput" class="form-input" maxlength="2" placeholder="🙂" title="Mood" value="${escapeHtml(preferences.mood || '🙂')}">
                </div>
                <button id="updateProfileBtn" class="btn btn-primary">Save Account</button>
            </div>
        `;
        return;
    }

    if (activeProfileTab === 'preferences') {
        container.innerHTML = `
            <div class="form-card profile-container">
                <div class="form-group">
                    <label for="bubbleStyleInput">Message Bubble Style</label>
                    <select id="bubbleStyleInput" class="form-input" title="Bubble style">
                        <option value="rounded" ${preferences.bubbleStyle === 'rounded' ? 'selected' : ''}>Rounded</option>
                        <option value="square" ${preferences.bubbleStyle === 'square' ? 'selected' : ''}>Square</option>
                    </select>
                </div>
                <div class="form-group checkbox-row">
                    <input type="checkbox" id="compactModeInput" ${preferences.compactMode ? 'checked' : ''}>
                    <label for="compactModeInput">Compact message spacing</label>
                </div>
                <div class="form-group checkbox-row">
                    <input type="checkbox" id="readReceiptsInput" ${preferences.readReceipts ? 'checked' : ''}>
                    <label for="readReceiptsInput">Enable read receipts (local setting)</label>
                </div>
                <button id="saveProfilePreferencesBtn" class="btn btn-primary">Save Preferences</button>
            </div>
        `;
        return;
    }

    if (activeProfileTab === 'settings') {
        const isActivePinned = activeChatUserId ? getPinnedConversations().includes(activeChatUserId) : false;
        const isActiveMuted = activeChatUserId ? Boolean(getMutedConversations()[activeChatUserId]) : false;

        container.innerHTML = `
            <div class="form-card profile-container">
                <div class="settings-section">
                    <h3>Account Management</h3>
                    <div class="settings-grid">
                        <button id="btn-settings-account" class="btn btn-secondary" type="button">👤 Account Info</button>
                        <button id="btn-settings-preferences" class="btn btn-secondary" type="button">⚙️ Preferences</button>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>Privacy & Safety</h3>
                    <div class="settings-grid">
                        <button id="openTermsFromSettings" class="btn btn-secondary" type="button">🔒 Terms & Privacy</button>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>App Preferences</h3>
                    <div class="form-group">
                        <label><input type="radio" name="pref-theme-chat" value="light" ${preferences.theme !== 'dark' ? 'checked' : ''}> ☀️ Light Theme</label>
                    </div>
                    <div class="form-group">
                        <label><input type="radio" name="pref-theme-chat" value="dark" ${preferences.theme === 'dark' ? 'checked' : ''}> 🌙 Dark Theme</label>
                    </div>
                    <div class="form-group checkbox-row">
                        <input type="checkbox" id="prefNotificationsToggle" ${preferences.notifications !== false ? 'checked' : ''}>
                        <label for="prefNotificationsToggle">Enable notifications</label>
                    </div>
                    <div class="form-group">
                        <label for="sidebarSortSelect">Direct Message Sort</label>
                        <select id="sidebarSortSelect" class="form-input" title="Direct message sort mode">
                            <option value="recent" ${preferences.sidebarSort === 'recent' ? 'selected' : ''}>Recent first</option>
                            <option value="oldest" ${preferences.sidebarSort === 'oldest' ? 'selected' : ''}>Oldest first</option>
                            <option value="name" ${preferences.sidebarSort === 'name' ? 'selected' : ''}>Name (A-Z)</option>
                        </select>
                    </div>
                    <div class="settings-grid">
                        <button id="btn-save-advanced-settings" class="btn btn-primary" type="button">💾 Save App Settings</button>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>Conversation Tools</h3>
                    <div class="settings-grid">
                        <button id="btn-pin-active-chat" class="btn btn-secondary" type="button">${isActivePinned ? '📌 Unpin Active Chat' : '📌 Pin Active Chat'}</button>
                        <button id="btn-mute-active-chat" class="btn btn-secondary" type="button">${isActiveMuted ? '🔔 Unmute Active Chat' : '🔕 Mute Active Chat'}</button>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>Security</h3>
                    <div class="form-group">
                        <label for="settingsNewPassword">New Password</label>
                        <input type="password" id="settingsNewPassword" class="form-input" placeholder="Enter new password">
                    </div>
                    <div class="form-group">
                        <label for="settingsConfirmPassword">Confirm Password</label>
                        <input type="password" id="settingsConfirmPassword" class="form-input" placeholder="Confirm new password">
                    </div>
                    <div class="settings-grid">
                        <button id="btn-change-password-settings" class="btn btn-warning" type="button">🔐 Update Password</button>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>Session</h3>
                    <div class="settings-grid">
                        <button id="btn-profile-toggle-theme" class="btn btn-secondary" type="button">🌙 Toggle Theme</button>
                        <button id="btn-profile-logout" class="btn btn-danger" type="button">🚪 Logout</button>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>Data</h3>
                    <div class="settings-grid">
                        <button id="btn-reset-chat-preferences" class="btn btn-warning" type="button">♻️ Reset Cloud Sync Cache</button>
                        <button id="btn-export-my-data" class="btn btn-secondary" type="button">📤 Export My Data</button>
                    </div>
                    <p class="settings-note">Resets conversation sync metadata in your profile preferences and can export settings JSON.</p>
                </div>

                <div class="settings-section">
                    <h3>About</h3>
                    <p class="settings-note"><strong>Nuntia v0.1.0</strong><br>connect · share · belong</p>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="form-card profile-container profile-stats-card">
            <h3 class="profile-stats-title">Account Stats</h3>
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-value" id="statSent">-</div><div class="stat-label">Messages Sent</div></div>
                <div class="stat-card"><div class="stat-value" id="statReceived">-</div><div class="stat-label">Messages Received</div></div>
                <div class="stat-card"><div class="stat-value" id="statContacts">-</div><div class="stat-label">Unique Contacts</div></div>
            </div>
            <p id="userEmail" class="profile-stats-row">📧 ${escapeHtml(emailText)}</p>
            <p id="memberSince" class="profile-stats-row">📅 Joined ${escapeHtml(joinedText)}</p>
        </div>
    `;

    loadActivityStats().then(stats => {
        const sent = document.getElementById('statSent');
        const received = document.getElementById('statReceived');
        const contacts = document.getElementById('statContacts');
        if (sent) sent.textContent = String(stats.sent);
        if (received) received.textContent = String(stats.received);
        if (contacts) contacts.textContent = String(stats.contacts);
    }).catch(() => {});
}

async function loadUserProfile() {
    const { data, error } = await sb
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single();
    
    if (error) {
        console.error('Profile load failed:', error);
        return;
    }

    if (data) {
        profileCache = {
            ...data,
            preferences: normalizeProfilePreferences(data.preferences)
        };

        unreadConversations = profileCache.preferences.unreadConversations || {};
        lastIncomingSeenByPartner = profileCache.preferences.incomingSeen || {};

        const profileHeaderName = document.getElementById("profileHeaderName");
        if (profileHeaderName) profileHeaderName.textContent = data.username ? `@${data.username}` : 'Profile';
        applyProfilePreferencesToChat();
        renderConversationList();
        renderProfileContent();
    }
}

async function updateProfile() {
    const usernameInput = document.getElementById("profileUsernameInput");
    const statusInput = document.getElementById("profileStatusInput");
    const bioInput = document.getElementById("profileBioInput");
    const moodInput = document.getElementById("profileMoodInput");

    if (!usernameInput || !statusInput) return;

    const username = usernameInput.value.trim();
    const status = statusInput.value;
    const preferences = {
        ...normalizeProfilePreferences(profileCache?.preferences),
        bio: bioInput ? bioInput.value.trim() : '',
        mood: moodInput ? (moodInput.value.trim() || '🙂') : '🙂'
    };
    
    let { error } = await sb
        .from("profiles")
        .update({ username, status, preferences })
        .eq("id", currentUser.id);

    if (error && String(error.message || '').toLowerCase().includes('preferences')) {
        const retry = await sb
            .from("profiles")
            .update({ username, status })
            .eq("id", currentUser.id);
        error = retry.error;
    }
    
    if (error) {
        showAlert(error.message, "error");
    } else {
        const profileHeaderName = document.getElementById("profileHeaderName");
        if (profileHeaderName) profileHeaderName.textContent = username ? `@${username}` : 'Profile';
        profileCache = {
            ...(profileCache || {}),
            username,
            status,
            preferences
        };
        saveProfilePreferencesToDb(preferences);
        showAlert("Profile updated!", "success");
        await syncConversationsFromMessages();
        renderProfileContent();
    }
}

async function saveProfilePreferences() {
    const bubbleStyleInput = document.getElementById('bubbleStyleInput');
    const compactModeInput = document.getElementById('compactModeInput');
    const readReceiptsInput = document.getElementById('readReceiptsInput');

    const preferences = {
        ...normalizeProfilePreferences(profileCache?.preferences),
        bubbleStyle: bubbleStyleInput?.value === 'square' ? 'square' : 'rounded',
        compactMode: Boolean(compactModeInput?.checked),
        readReceipts: Boolean(readReceiptsInput?.checked)
    };

    let { error } = await sb
        .from('profiles')
        .update({ preferences })
        .eq('id', currentUser.id);

    if (error && String(error.message || '').toLowerCase().includes('preferences')) {
        error = null;
    }

    if (error) {
        showAlert(error.message, 'error');
        return;
    }

    profileCache = {
        ...(profileCache || {}),
        preferences
    };
    saveProfilePreferencesToDb(preferences);
    applyProfilePreferencesToChat();
    showAlert('Preferences saved!', 'success');
}

function applyProfilePreferencesToChat() {
    const preferences = normalizeProfilePreferences(profileCache?.preferences);
    document.body.classList.toggle('dark-theme', preferences.theme === 'dark');
    document.body.classList.toggle('chat-compact-mode', Boolean(preferences.compactMode));
    document.body.classList.toggle('chat-square-bubbles', preferences.bubbleStyle === 'square');
}

// ===== MESSAGES =====
async function loadMessages() {
    if (!sb || !currentUser) return;

    if (!activeChatUserId) {
        messages = [];
        renderMessages();
        return;
    }

    let baseQuery = sb
        .from("messages")
        .select(`*, sender:profiles!sender_id(username, status), reply_to:messages!reply_to_id(id, content, sender_id)`)
        .or(
            `and(sender_id.eq.${currentUser.id},recipient_id.eq.${activeChatUserId}),and(sender_id.eq.${activeChatUserId},recipient_id.eq.${currentUser.id})`
        )
        .order("created_at", { ascending: true });

    let queryResult = await baseQuery;

    // Fallback for databases without the messages->profiles relation metadata.
    if (queryResult.error) {
        queryResult = await sb
            .from("messages")
            .select("*")
            .order("created_at", { ascending: true });
    }

    const { data, error } = queryResult;
    
    if (error) {
        console.error("Error loading messages:", error);
        return;
    }
    
    let loaded = data || [];

    const hasRecipientField = loaded.some(m => Object.prototype.hasOwnProperty.call(m, 'recipient_id'));
    if (!hasRecipientField) {
        showAlert('Direct messages require a recipient_id column in messages.', 'error');
        loaded = [];
    } else {
        loaded = loaded.filter(m =>
            (m.sender_id === currentUser.id && m.recipient_id === activeChatUserId) ||
            (m.sender_id === activeChatUserId && m.recipient_id === currentUser.id)
        );
    }

    await hydrateMessageMetadata(loaded);
    messages = loaded;
    renderMessages();
}

async function sendMessage() {
    if (!sb || !currentUser) {
        showAlert("Please login first", "error");
        return;
    }

    const messageInput = document.getElementById("messageInput");
    const content = messageInput ? messageInput.value.trim() : "";
    if (!content) return;

    if (!activeChatUserId) {
        showAlert("Select a user to send a direct message", "error");
        return;
    }
    
    const messageData = {
        sender_id: currentUser.id,
        content: content,
        reply_to_id: currentReplyTo,
        recipient_id: activeChatUserId
    };
    
    let { error } = await sb.from("messages").insert(messageData);

    // Compatibility fallback for schemas without reply_to_id.
    if (error && String(error.message || '').toLowerCase().includes('reply_to_id')) {
        const retry = await sb.from("messages").insert({
            sender_id: currentUser.id,
            content,
            recipient_id: activeChatUserId
        });
        error = retry.error;
    }
    
    if (error) {
        showAlert(error.message, "error");
    } else {
        if (messageInput) messageInput.value = "";
        currentReplyTo = null;
        const replyPreview = document.getElementById("replyPreview");
        if (replyPreview) replyPreview.style.display = "none";
        await updateTypingStatus(false);
        await syncConversationsFromMessages();
        await loadMessages();
    }
}

async function editMessage(messageId, newContent) {
    if (!sb || !currentUser) {
        showAlert("Please login first", "error");
        return;
    }

    let { data, error } = await sb
        .from("messages")
        .update({ content: newContent, edited: true, updated_at: new Date() })
        .eq("id", messageId)
        .eq("sender_id", currentUser.id)
        .select("id");

    // Compatibility fallback where sender_id constraint is not usable.
    if (!error && Array.isArray(data) && data.length === 0) {
        const retry = await sb
            .from("messages")
            .update({ content: newContent, edited: true, updated_at: new Date() })
            .eq("id", messageId);
        error = retry.error;
    }
    
    if (error) {
        showAlert(error.message, "error");
    } else {
        await loadMessages();
        showAlert("Message edited!", "success");
        closeModal("editModal");
    }
}

async function deleteMessage(messageId) {
    if (!confirm("Delete this message?")) return;

    if (!sb || !currentUser) {
        showAlert("Please login first", "error");
        return;
    }

    let { data, error } = await sb
        .from("messages")
        .delete()
        .eq("id", messageId)
        .eq("sender_id", currentUser.id)
        .select("id");

    // Compatibility fallback where sender_id constraint is not usable.
    if (!error && Array.isArray(data) && data.length === 0) {
        const retry = await sb
            .from("messages")
            .delete()
            .eq("id", messageId);
        error = retry.error;
    }
    
    if (error) {
        showAlert(error.message, "error");
    } else {
        await loadMessages();
        showAlert("Message deleted", "info");
    }
}

async function addReaction(messageId, reaction) {
    if (!sb || !currentUser) {
        showAlert("Please login first", "error");
        return;
    }

    const { error } = await sb
        .from("message_reactions")
        .upsert({
            message_id: messageId,
            user_id: currentUser.id,
            reaction: reaction
        }, {
            onConflict: "message_id,user_id"
        });
    
    if (error) {
        showAlert(error.message, "error");
    } else {
        await loadMessages();
    }
}

async function removeReaction(messageId) {
    if (!sb || !currentUser) {
        showAlert("Please login first", "error");
        return;
    }

    const { error } = await sb
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", currentUser.id);
    
    if (error) {
        showAlert(error.message, "error");
    } else {
        await loadMessages();
    }
}

async function updateTypingStatus(isTyping) {
    if (!currentUser) return;
    
    await sb
        .from("typing_status")
        .upsert({
            user_id: currentUser.id,
            is_typing: isTyping,
            updated_at: new Date()
        });
}

// ===== RENDERING =====
async function renderMessages() {
    const container = document.getElementById("messagesContainer");
    if (!container) return;
    
    if (!messages || messages.length === 0) {
        const title = activeChatUserId ? '💬 No messages yet' : '🔒 Direct messages only';
        const text = activeChatUserId
            ? 'Start your conversation now'
            : 'Use Find Username and pick one user to start a private chat';
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">${title}</div>
                <div class="empty-state-text">${text}</div>
            </div>
        `;
        return;
    }
    
    const { data: allReactions } = await sb
        .from("message_reactions")
        .select("message_id, reaction, user_id");
    
    const reactionMap = new Map();
    const userReactionMap = new Map();
    
    allReactions?.forEach(r => {
        if (!reactionMap.has(r.message_id)) {
            reactionMap.set(r.message_id, new Map());
        }
        const count = reactionMap.get(r.message_id).get(r.reaction) || 0;
        reactionMap.get(r.message_id).set(r.reaction, count + 1);
        
        if (r.user_id === currentUser?.id) {
            userReactionMap.set(r.message_id, r.reaction);
        }
    });
    
    container.innerHTML = messages.map(msg => {
        const isOwn = msg.sender_id === currentUser?.id;
        const msgReactions = reactionMap.get(msg.id) || new Map();
        const reactionsList = Array.from(msgReactions.entries()).map(([reaction, count]) => ({ reaction, count }));

        const replyContent = msg.reply_to?.content || '';
        const replySender = msg.reply_to?.sender?.username || 'Unknown';
        const replyHtml = msg.reply_to_id ? `
            <div class="reply-indicator">
                Reply to @${escapeHtml(replySender)}: "${escapeHtml(replyContent.substring(0, 70))}${replyContent.length > 70 ? '...' : ''}"
            </div>
        ` : '';
        
        const reactionsHtml = reactionsList.length ? `
            <div class="reactions">
                ${reactionsList.map(r => `
                    <span class="reaction ${userReactionMap.get(msg.id) === r.reaction ? 'reacted' : ''}" 
                          data-message="${msg.id}" data-reaction="${r.reaction}">
                        ${r.reaction} ${r.count}
                    </span>
                `).join('')}
            </div>
        ` : '';
        
        return `
            <div class="message ${isOwn ? 'own' : 'other'}">
                ${replyHtml}
                <div class="message-bubble">
                    <div class="message-sender">${isOwn ? 'You' : (msg.sender?.username || 'Unknown')}</div>
                    <div class="message-text">${escapeHtml(msg.content)}</div>
                    <div class="message-meta">
                        <span>${new Date(msg.created_at).toLocaleTimeString()}</span>
                        ${msg.edited ? '<span class="message-edited">(edited)</span>' : ''}
                    </div>
                    ${reactionsHtml}
                    <div class="message-actions">
                        <button class="message-action-btn reply-btn" data-id="${msg.id}" data-content="${escapeHtml(msg.content.substring(0, 50))}">↩️ Reply</button>
                        <button class="message-action-btn react-btn" data-id="${msg.id}">😊 React</button>
                        ${isOwn ? `
                            <button class="message-action-btn edit-btn" data-id="${msg.id}" data-content="${escapeHtml(msg.content)}">✏️ Edit</button>
                            <button class="message-action-btn delete-btn" data-id="${msg.id}">🗑️ Delete</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join("");
    
    // Attach event listeners
    document.querySelectorAll('.reply-btn').forEach(btn => {
        btn.onclick = () => {
            currentReplyTo = btn.dataset.id;
            const replyPreviewText = document.getElementById("replyPreviewText");
            if (replyPreviewText) replyPreviewText.textContent = btn.dataset.content;
            const replyPreview = document.getElementById("replyPreview");
            if (replyPreview) replyPreview.style.display = "block";
            const messageInput = document.getElementById("messageInput");
            if (messageInput) messageInput.focus();
        };
    });
    
    document.querySelectorAll('.react-btn').forEach(btn => {
        btn.onclick = () => {
            const modal = document.getElementById("reactionModal");
            if (modal) {
                modal.dataset.messageId = btn.dataset.id;
                modal.classList.remove("hidden");
            }
        };
    });
    
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.onclick = () => {
            const modal = document.getElementById("editModal");
            if (modal) {
                modal.dataset.messageId = btn.dataset.id;
                const editMessageText = document.getElementById("editMessageText");
                if (editMessageText) editMessageText.value = btn.dataset.content;
                modal.classList.remove("hidden");
            }
        };
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = () => deleteMessage(btn.dataset.id);
    });
    
    document.querySelectorAll('.reaction').forEach(el => {
        el.onclick = () => {
            const messageId = el.dataset.message;
            const reaction = el.dataset.reaction;
            const isReacted = el.classList.contains('reacted');
            if (isReacted) removeReaction(messageId);
            else addReaction(messageId, reaction);
        };
    });
    
    container.scrollTop = container.scrollHeight;
}

// ===== REALTIME =====
async function setupRealtime() {
    if (realtimeChannel) {
        sb.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }

    realtimeChannel = sb
        .channel('messages-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, 
            async (payload) => {
                const row = payload?.new || payload?.old;
                const partnerId = row
                    ? (row.sender_id === currentUser?.id ? row.recipient_id : row.sender_id)
                    : null;

                if (
                    payload?.eventType === 'INSERT' &&
                    row?.recipient_id === currentUser?.id &&
                    row?.sender_id !== currentUser?.id &&
                    partnerId &&
                    partnerId !== activeChatUserId
                ) {
                    trackIncomingMessage(partnerId, row?.content, row?.created_at, row?.sender_id);
                }

                await syncConversationsFromMessages();

                if (!partnerId || !activeChatUserId || partnerId === activeChatUserId) {
                    await loadMessages();
                }
            })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' },
            () => loadMessages())
        .subscribe();
}

function setProfileTab(tabName) {
    activeProfileTab = tabName;
    document.querySelectorAll('[data-profile-tab]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.profileTab === tabName);
    });
    renderProfileContent();
}

// ===== THEME =====
function initTheme() {
    if (getCurrentPreferences().theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    queuePreferencesPersist({ theme: isDark ? 'dark' : 'light' });
}

function resetDatabaseSyncCache() {
    if (!currentUser) return;

    unreadConversations = {};
    lastIncomingSeenByPartner = {};
    conversationMetaMap = new Map();
    hasConversationBootstrap = false;
    profileCache = {
        ...(profileCache || {}),
        preferences: {
            ...normalizeProfilePreferences(profileCache?.preferences),
            recentConversations: [],
            unreadConversations: {},
            incomingSeen: {}
        }
    };

    saveProfilePreferencesToDb(profileCache.preferences);

    renderConversationList();
    renderProfileContent();
    showAlert('Cloud sync cache reset complete.', 'success');
}

window.addEventListener('DOMContentLoaded', () => {
    setTimeout(removeSplash, 2000);

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }

    updateSidebarButtonLabel();
});

window.addEventListener('load', () => {
    setTimeout(removeSplash, 2500);
});

// ===== EVENT LISTENERS =====
document.addEventListener("DOMContentLoaded", () => {
    // Auth buttons
    const loginBtn = document.getElementById("btn-login");
    const registerBtn = document.getElementById("btn-register");
    const toRegisterBtn = document.getElementById("btn-to-register");
    const toLoginBtn = document.getElementById("btn-to-login");
    
    if (loginBtn) loginBtn.onclick = handleLogin;
    if (registerBtn) registerBtn.onclick = handleRegister;
    if (toRegisterBtn) toRegisterBtn.onclick = () => {
        document.getElementById("loginForm").classList.add("hidden");
        document.getElementById("registerForm").classList.remove("hidden");
    };
    if (toLoginBtn) toLoginBtn.onclick = () => {
        document.getElementById("registerForm").classList.add("hidden");
        document.getElementById("loginForm").classList.remove("hidden");
    };
    
    // Logout buttons
    const logoutBtns = ["btn-logout", "logout-sidebar"];
    logoutBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = handleLogout;
    });

    const profileSettingsBtn = document.getElementById('btn-profile-settings');
    if (profileSettingsBtn) {
        profileSettingsBtn.onclick = () => {
            setProfileTab('settings');
        };
    }

    document.querySelectorAll('[data-profile-tab]').forEach(btn => {
        btn.onclick = () => setProfileTab(btn.dataset.profileTab);
    });
    
    // Profile update
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.id === 'updateProfileBtn') {
            updateProfile();
        }
        if (target.id === 'saveProfilePreferencesBtn') {
            saveProfilePreferences();
        }
        if (target.id === 'btn-settings-account') {
            setProfileTab('account');
        }
        if (target.id === 'btn-settings-preferences') {
            setProfileTab('preferences');
        }
        if (target.id === 'openTermsFromSettings' || target.id === 'terms-link-login' || target.id === 'terms-link-register') {
            openTermsModal();
        }
        if (target.id === 'btn-agree-terms' || target.id === 'btn-close-terms') {
            closeModal('termsModal');
        }
        if (target.id === 'btn-profile-toggle-theme') {
            toggleTheme();
            updateSidebarButtonLabel();
        }
        if (target.id === 'btn-profile-logout') {
            handleLogout();
        }
        if (target.id === 'btn-reset-chat-preferences') {
            resetDatabaseSyncCache();
        }
        if (target.id === 'btn-save-advanced-settings') {
            saveAdvancedSettings();
        }
        if (target.id === 'btn-pin-active-chat') {
            togglePinActiveConversation();
        }
        if (target.id === 'btn-mute-active-chat') {
            toggleMuteActiveConversation();
        }
        if (target.id === 'btn-change-password-settings') {
            changePasswordFromSettings();
        }
        if (target.id === 'btn-export-my-data') {
            exportMyData();
        }
    });
    
    // Send message
    const sendBtn = document.getElementById("sendBtn");
    if (sendBtn) sendBtn.onclick = sendMessage;
    
    // Cancel reply
    const cancelReply = document.getElementById("cancelReply");
    if (cancelReply) cancelReply.onclick = () => {
        currentReplyTo = null;
        const replyPreview = document.getElementById("replyPreview");
        if (replyPreview) replyPreview.style.display = "none";
    };
    
    // Message input enter key
    const messageInput = document.getElementById("messageInput");
    if (messageInput) {
        messageInput.onkeypress = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                sendMessage();
            }
        };
        messageInput.oninput = () => {
            updateTypingStatus(true);
            if (typingTimeout) clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => updateTypingStatus(false), 1500);
        };
    }
    
    // Theme toggles
    const themeBtns = ["theme-toggle-sidebar", "theme-toggle-chat"];
    themeBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => {
            toggleTheme();
            updateSidebarButtonLabel();
        };
    });
    
    // Modal close buttons
    document.querySelectorAll(".close-btn").forEach(btn => {
        btn.onclick = () => {
            const modal = btn.closest('.modal');
            if (modal?.id) closeModal(modal.id);
        };
    });
    
    // Save edit
    const saveEditBtn = document.getElementById("saveEditBtn");
    if (saveEditBtn) {
        saveEditBtn.onclick = () => {
            const modal = document.getElementById("editModal");
            const messageId = modal ? modal.dataset.messageId : null;
            const editMessageText = document.getElementById("editMessageText");
            const newContent = editMessageText ? editMessageText.value : "";
            if (newContent.trim() && messageId) editMessage(messageId, newContent);
        };
    }
    
    // Cancel edit
    const cancelEditBtn = document.getElementById("cancelEditBtn");
    if (cancelEditBtn) cancelEditBtn.onclick = () => closeModal("editModal");
    
    // Reaction options
    document.querySelectorAll(".reaction-option").forEach(btn => {
        btn.onclick = () => {
            const modal = document.getElementById("reactionModal");
            const messageId = modal ? modal.dataset.messageId : null;
            const reaction = btn.dataset.reaction;
            if (messageId && reaction) addReaction(messageId, reaction);
            closeModal("reactionModal");
        };
    });
    
    // Navigation
    document.querySelectorAll("[data-view]").forEach(btn => {
        btn.onclick = () => {
            const view = btn.dataset.view;
            if (view === "chats") {
                showScreen("chatScreen");
            } else if (view === "profile") {
                showScreen("profileScreen");
                loadUserProfile();
            }
        };
    });

    const userSearchInput = document.getElementById('userSearchInput');
    if (userSearchInput) {
        userSearchInput.oninput = async () => {
            const users = await searchUsersByUsername(userSearchInput.value);
            renderUserSearchResults(users);
        };
    }

    document.addEventListener('keydown', (event) => {
        const userSearch = document.getElementById('userSearchInput');
        if (!userSearch) return;

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            showScreen('chatScreen');
            userSearch.focus();
            userSearch.select();
        }
    });
    
    // Password toggles
    document.querySelectorAll(".toggle-password").forEach(btn => {
        btn.onclick = () => {
            const target = document.getElementById(btn.dataset.target);
            if (target) {
                target.type = target.type === "password" ? "text" : "password";
            }
        };
    });
});

// ===== INIT =====
async function initApp() {
    if (!sb) {
        console.error("Supabase client not initialized");
        showScreen("authScreen");
        showAlert("Cannot connect to chat service. Check internet and refresh.", "error");
        return;
    }
    
    await ensureProfilesEmailColumn();

    sb.auth.onAuthStateChange(async (event, session) => {
        if (session) {
            currentUser = session.user;
            unreadConversations = loadUnreadConversations();
            lastIncomingSeenByPartner = loadIncomingSeenMap();
            await ensureProfile();
            await setupRealtime();
            await syncConversationsFromMessages();
            startLiveSync();
            showScreen("chatScreen");
            selectInitialConversation();
            await loadMessages();
            await loadUserProfile();
            applyProfilePreferencesToChat();
        } else {
            stopLiveSync();
            if (realtimeChannel) {
                sb.removeChannel(realtimeChannel);
                realtimeChannel = null;
            }
            currentUser = null;
            unreadConversations = {};
            conversationMetaMap = new Map();
            hasConversationBootstrap = false;
            lastIncomingSeenByPartner = {};
            showScreen("authScreen");
        }
    });
    
    try {
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            currentUser = session.user;
            unreadConversations = loadUnreadConversations();
            lastIncomingSeenByPartner = loadIncomingSeenMap();
            await ensureProfile();
            await setupRealtime();
            await syncConversationsFromMessages();
            startLiveSync();
            showScreen("chatScreen");
            selectInitialConversation();
            await loadMessages();
            await loadUserProfile();
            applyProfilePreferencesToChat();
        } else {
            showScreen("authScreen");
        }
        await ensureProfilesPreferencesColumn();
        removeSplash();
    } catch (error) {
        console.error("Session restore failed:", error);
        showScreen("authScreen");
        showAlert("Session restore failed. Please login again.", "error");
        removeSplash();
    }
}

initTheme();
initApp();