const SUPABASE_URL = "https://aqqhpttbmoiovlbfhqqr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcWhwdHRibW9pb3ZsYmZocXFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NDExNzYsImV4cCI6MjEwNjExNzE3Nn0.gvz_KzuS0Z--DzI0kfgtW4QjcHPlgb_iBdrHB1iKw8o";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

function encryptKey(text) { return btoa(encodeURIComponent(text)); }
function decryptKey(encoded) { try { return decodeURIComponent(atob(encoded)); } catch(e) { return ""; } }

window.addEventListener('DOMContentLoaded', async () => {
    const savedEncKey = localStorage.getItem('nexa_secure_gemini');
    if (savedEncKey) document.getElementById('gemini-key').value = decryptKey(savedEncKey);

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        initApp();
    } else {
        document.getElementById('auth-card').style.display = 'block';
        document.getElementById('auth-status').innerText = 'Requer Autenticação';
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user;
            initApp();
        } else {
            currentUser = null;
            document.getElementById('auth-card').style.display = 'block';
            document.getElementById('app-container').style.display = 'none';
            document.getElementById('auth-status').innerText = 'Desconectado';
        }
    });
});

async function handleSignUp() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) alert('Erro: ' + error.message);
    else alert('Registo efetuado com sucesso!');
}

async function handleLogin() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert('Erro no login: ' + error.message);
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
}

function initApp() {
    document.getElementById('auth-card').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('auth-status').innerText = `Sessão Supreme: ${currentUser.email}`;
    loadChatHistory();
    loadTacticalTasks();
    setupRealtime();
    requestNotificationPermission();
}

function saveApiKeySecure() {
    const apiKey = document.getElementById('gemini-key').value.trim();
    if (!apiKey) return alert('Chave inválida!');
    localStorage.setItem('nexa_secure_gemini', encryptKey(apiKey));
    alert('Chave criptografada com sucesso!');
}

function getApiKey() {
    const apiKeyField = document.getElementById('gemini-key').value.trim();
    if (apiKeyField) return apiKeyField;
    const saved = localStorage.getItem('nexa_secure_gemini');
    return saved ? decryptKey(saved) : "";
}

async function sendGeminiMessage() {
    const input = document.getElementById('user-input');
    const apiKey = getApiKey();
    const chatBox = document.getElementById('chat-messages');

    if (!input.value.trim() || !apiKey) return alert('Insere a chave e o comando!');
    let userText = input.value.trim();
    input.value = '';

    if (userText.startsWith('/task ')) {
        const title = userText.replace('/task ', '');
        await supabaseClient.from('tactical_tasks').insert([{ title, status: 'todo', user_id: currentUser?.id }]);
        chatBox.innerHTML += `<div class="message user">${userText}</div>`;
        chatBox.innerHTML += `<div class="message ai">[SUPREME] Tarefa adicionada e notificação disparada!</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
        loadTacticalTasks();
        sendPushNotification("Nova Tarefa Criada", title);
        return;
    }

    if (userText.startsWith('/kdp ')) userText = "Gera a estrutura KDP para: " + userText.replace('/kdp ', '');
    if (userText.startsWith('/zap ')) userText = "Gera resposta WhatsApp IA para: " + userText.replace('/zap ', '');

    chatBox.innerHTML += `<div class="message user">${userText}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    const aiMsgId = 'ai-' + Date.now();
    chatBox.innerHTML += `<div id="${aiMsgId}" class="message ai">A processar com Gemini 3.8 Flash...</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    let aiReply = "";
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userText }] }]
            })
        });

        const data = await res.json();
        
        if (data.candidates && data.candidates[0].content) {
            aiReply = data.candidates[0].content.parts[0].text;
            const node = document.getElementById(aiMsgId);
            if (node) node.innerText = aiReply;
            chatBox.scrollTop = chatBox.scrollHeight;
        } else {
            throw new Error(data.error?.message || "Resposta inválida da API");
        }
    } catch (e) {
        const node = document.getElementById(aiMsgId);
        if (node) node.innerText = "[ERRO] " + e.message;
        return;
    }

    if (currentUser && aiReply) {
        await supabaseClient.from('chat_history').insert([{ user_id: currentUser.id, prompt: userText, response: aiReply, model_used: 'gemini-3.8-flash' }]);
        sendPushNotification("IA Respondeu", "Verifica o terminal NEXA Supreme.");
    }
}

async function loadChatHistory() {
    const { data } = await supabaseClient.from('chat_history').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: true }).limit(10);
    if (!data) return;
    const chatBox = document.getElementById('chat-messages');
    chatBox.innerHTML = '';
    data.forEach(item => {
        chatBox.innerHTML += `<div class="message user">${item.prompt}</div>`;
        chatBox.innerHTML += `<div class="message ai">${item.response}</div>`;
    });
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function loadTacticalTasks() {
    const { data } = await supabaseClient.from('tactical_tasks').select('*');
    if (!data) return;
    ['todo', 'in_progress', 'done'].forEach(s => document.getElementById(`list-${s}`).innerHTML = '');
    data.forEach(task => {
        const html = `
            <div style="background:rgba(255,255,255,0.03); padding:6px; margin-bottom:4px; border-radius:3px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px;">${task.title}</span>
                <div>
                    ${task.status !== 'todo' ? `<button onclick="updateStatus('${task.id}', 'todo')" style="padding:2px 4px; font-size:9px;">←</button>` : ''}
                    ${task.status !== 'in_progress' ? `<button onclick="updateStatus('${task.id}', 'in_progress')" style="padding:2px 4px; font-size:9px; background:#eab308;">Prog</button>` : ''}
                    ${task.status !== 'done' ? `<button onclick="updateStatus('${task.id}', 'done')" style="padding:2px 4px; font-size:9px; background:#10b981;">✓</button>` : ''}
                </div>
            </div>`;
        document.getElementById(`list-${task.status}`).innerHTML += html;
    });
}

async function createTask() {
    const title = document.getElementById('new-task-title').value.trim();
    if (!title) return;
    await supabaseClient.from('tactical_tasks').insert([{ title, status: 'todo', user_id: currentUser?.id }]);
    document.getElementById('new-task-title').value = '';
    loadTacticalTasks();
    sendPushNotification("Nova Tarefa", title);
}

async function updateStatus(id, status) {
    await supabaseClient.from('tactical_tasks').update({ status }).eq('id', id);
    loadTacticalTasks();
}

function setupRealtime() {
    supabaseClient.channel('realtime-nexa-v37')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tactical_tasks' }, () => loadTacticalTasks())
        .subscribe();
}

async function uploadToCloudStorage() {
    const fileInput = document.getElementById('cloud-file');
    if (!fileInput.files.length) return alert('Seleciona um ficheiro primeiro!');
    const file = fileInput.files[0];
    const filePath = `${currentUser.id}/${Date.now()}_${file.name}`;
    
    const { data, error } = await supabaseClient.storage.from('nexa-storage').upload(filePath, file);
    if (error) {
        document.getElementById('util-output').value = "[ERRO STORAGE] Cria o bucket 'nexa-storage' público no Supabase!";
    } else {
        document.getElementById('util-output').value = `[SUCESSO] Ficheiro enviado: ${filePath}`;
    }
}

function triggerTermuxWebhook() {
    document.getElementById('util-output').value = "[WEBHOOK] Sinal enviado para o Termux / PM2 com sucesso!";
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
}

function sendPushNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, icon: "https://cdn-icons-png.flaticon.com/512/2099/2099058.png" });
    }
}
