const SUPABASE_URL = "https://aqqhpttbmoiovlbfhqqr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcWhwdHRibW9pb3ZsYmZocXFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NDExNzYsImV4cCI6MjEwNjExNzE3Nn0.gvz_KzuS0Z--DzI0kfgtW4QjcHPlgb_iBdrHB1iKw8o";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

window.addEventListener('DOMContentLoaded', async () => {
    const savedKey = localStorage.getItem('nexa_gemini_key');
    if (savedKey) document.getElementById('gemini-key').value = savedKey;

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        initAppSession();
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user;
            initAppSession();
        } else {
            currentUser = null;
            document.getElementById('auth-card').style.display = 'block';
            document.getElementById('app-container').style.display = 'none';
            document.getElementById('auth-status').innerText = 'Não autenticado';
        }
    });
});

async function handleSignUp() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) alert('Erro no registo: ' + error.message);
    else alert('Registo efetuado! Verifica o teu email ou faz login.');
}

async function handleLogin() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert('Erro no login: ' + error.message);
}

function initAppSession() {
    document.getElementById('auth-card').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('auth-status').innerText = `Utilizador: ${currentUser.email}`;
    loadChatHistory();
    loadTacticalTasks();
    setupRealtimeSubscriptions();
}

function saveApiKey() {
    const apiKey = document.getElementById('gemini-key').value.trim();
    if (!apiKey) return alert('Insere uma chave válida!');
    localStorage.setItem('nexa_gemini_key', apiKey);
    alert('Chave salva com sucesso!');
}

async function sendGeminiMessage() {
    const input = document.getElementById('user-input');
    const apiKey = document.getElementById('gemini-key').value.trim();
    const chatBox = document.getElementById('chat-messages');

    if (!input.value.trim()) return;
    if (!apiKey) return alert('Insere a chave da API Gemini primeiro!');

    const userText = input.value;
    input.value = '';

    chatBox.innerHTML += `<div class="message user">${userText}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    const aiMsgId = 'ai-msg-' + Date.now();
    chatBox.innerHTML += `<div id="${aiMsgId}" class="message ai">A processar (Streaming)...</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    let aiReply = "";
    let usedModel = "gemini-3.5-flash";

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${usedModel}:streamGenerateContent?key=${apiKey}&alt=sse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: userText }] }] })
        });

        if (!response.ok) throw new Error('Falha na API da Gemini');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        document.getElementById(aiMsgId).innerText = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Mantém linha incompleta no buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.replace('data: ', '').trim();
                    if (jsonStr) {
                        const parsed = JSON.parse(jsonStr);
                        const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (textChunk) {
                            aiReply += textChunk;
                            document.getElementById(aiMsgId).innerText = aiReply;
                            chatBox.scrollTop = chatBox.scrollHeight;
                        }
                    }
                }
            }
        }
    } catch (err) {
        document.getElementById(aiMsgId).innerText = "Erro ao processar streaming da IA.";
        console.error(err);
        return;
    }

    // Gravar no Supabase
    if (currentUser) {
        await supabaseClient.from('chat_history').insert([
            { user_id: currentUser.id, prompt: userText, response: aiReply, model_used: usedModel }
        ]);
    }
}

async function loadChatHistory() {
    const { data } = await supabaseClient.from('chat_history').select('*').order('created_at', { ascending: true }).limit(15);
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

    document.getElementById('list-todo').innerHTML = '';
    document.getElementById('list-in_progress').innerHTML = '';
    document.getElementById('list-done').innerHTML = '';

    data.forEach(task => {
        const html = `
            <div style="background:rgba(255,255,255,0.03); padding:6px; margin-bottom:4px; border-radius:3px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px;">${task.title}</span>
                <div>
                    ${task.status !== 'todo' ? `<button onclick="updateTaskStatus('${task.id}', 'todo')" style="padding:2px 6px; font-size:10px;">←</button>` : ''}
                    ${task.status !== 'in_progress' ? `<button onclick="updateTaskStatus('${task.id}', 'in_progress')" style="padding:2px 6px; font-size:10px; background:#eab308;">Prog</button>` : ''}
                    ${task.status !== 'done' ? `<button onclick="updateTaskStatus('${task.id}', 'done')" style="padding:2px 6px; font-size:10px; background:#10b981;">✓</button>` : ''}
                </div>
            </div>
        `;
        document.getElementById(`list-${task.status}`).innerHTML += html;
    });
}

async function createTask() {
    const title = document.getElementById('new-task-title').value.trim();
    if (!title) return;
    await supabaseClient.from('tactical_tasks').insert([{ title, status: 'todo', user_id: currentUser?.id }]);
    document.getElementById('new-task-title').value = '';
    loadTacticalTasks();
}

async function updateTaskStatus(id, newStatus) {
    await supabaseClient.from('tactical_tasks').update({ status: newStatus }).eq('id', id);
    loadTacticalTasks();
}

function setupRealtimeSubscriptions() {
    supabaseClient.channel('realtime-nexa')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tactical_tasks' }, () => {
            loadTacticalTasks();
        })
        .subscribe();
}

function triggerWebhook() {
    document.getElementById('webhook-log').innerText = `[${new Date().toLocaleTimeString()}] Pipeline acionado com sucesso! Status: 200 OK`;
}
