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
    document.querySelectorAll('.nav-btn').forEach(btn => {
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

function getConversationStorageKey() {
    return currentUser ? `recent_conversations_${currentUser.id}` : null;
}

function loadRecentConversations() {
    const key = getConversationStorageKey();
    if (!key) return [];
    try {
        return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (_e) {
        return [];
    }
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
    const key = getConversationStorageKey();
    if (!key) return;
    const existing = loadRecentConversations().filter(c => c.id !== userId);
    const updated = [{ id: userId, username }, ...existing].slice(0, 20);
    localStorage.setItem(key, JSON.stringify(updated));
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
        title.textContent = 'Nuntia DM';
        subtitle.textContent = 'Select a user to start chatting';
    }
}

function setActiveConversation(userId = null, username = null) {
    activeChatUserId = userId;
    activeChatUsername = username;

    document.querySelectorAll('.conversation-btn[data-user-id]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.userId === userId);
    });

    updateChatHeader();
    loadMessages();
}

function renderConversationList() {
    const list = document.getElementById('conversationList');
    if (!list) return;

    const conversations = loadRecentConversations();
    if (!conversations.length) {
        list.innerHTML = '';
        return;
    }

    list.innerHTML = conversations.map(c => `
        <button class="conversation-btn ${activeChatUserId === c.id ? 'active' : ''}" data-user-id="${c.id}" data-username="${escapeHtml(c.username)}" type="button">
            @${escapeHtml(c.username)}
        </button>
    `).join('');

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
        .upsert({ id: userId, username: username, email: email, status: "online" });

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
    if (realtimeChannel) {
        sb.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
    currentUser = null;
    messages = [];
    showScreen("authScreen");
    showAlert("Logged out successfully", "success");
}

async function loadUserProfile() {
    const { data, error } = await sb
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single();
    
    if (data) {
        const profileUsername = document.getElementById("profileUsername");
        const profileStatus = document.getElementById("profileStatus");
        const userEmail = document.getElementById("userEmail");
        const memberSince = document.getElementById("memberSince");
        
        if (profileUsername) profileUsername.value = data.username || "";
        if (profileStatus) profileStatus.value = data.status || "online";
        if (userEmail) userEmail.textContent = `📧 ${currentUser.email}`;
        if (memberSince) memberSince.textContent = `📅 Joined ${new Date(currentUser.created_at).toLocaleDateString()}`;
    }
}

async function updateProfile() {
    const username = document.getElementById("profileUsername").value;
    const status = document.getElementById("profileStatus").value;
    
    const { error } = await sb
        .from("profiles")
        .update({ username, status })
        .eq("id", currentUser.id);
    
    if (error) {
        showAlert(error.message, "error");
    } else {
        showAlert("Profile updated!", "success");
    }
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
            () => loadMessages())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' },
            () => loadMessages())
        .subscribe();
}

// ===== THEME =====
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

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
    const logoutBtns = ["btn-logout", "btn-logout-profile", "logout-sidebar"];
    logoutBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = handleLogout;
    });
    
    // Profile update
    const updateProfileBtn = document.getElementById("updateProfileBtn");
    if (updateProfileBtn) updateProfileBtn.onclick = updateProfile;
    
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
    const themeBtns = ["theme-toggle-sidebar", "theme-toggle-chat", "theme-toggle-profile"];
    themeBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = toggleTheme;
    });
    
    // Modal close buttons
    document.querySelectorAll(".close-btn").forEach(btn => {
        btn.onclick = () => {
            closeModal("reactionModal");
            closeModal("editModal");
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
    document.querySelectorAll(".nav-btn[data-view]").forEach(btn => {
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
            await ensureProfile();
            await setupRealtime();
            renderConversationList();
            showScreen("chatScreen");
            selectInitialConversation();
            await loadMessages();
            await loadUserProfile();
        } else {
            if (realtimeChannel) {
                sb.removeChannel(realtimeChannel);
                realtimeChannel = null;
            }
            currentUser = null;
            showScreen("authScreen");
        }
    });
    
    try {
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            currentUser = session.user;
            await ensureProfile();
            await setupRealtime();
            renderConversationList();
            showScreen("chatScreen");
            selectInitialConversation();
            await loadMessages();
            await loadUserProfile();
        } else {
            showScreen("authScreen");
        }
    } catch (error) {
        console.error("Session restore failed:", error);
        showScreen("authScreen");
        showAlert("Session restore failed. Please login again.", "error");
    }
}

initTheme();
initApp();