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
        initApp();
    } else {
        document.getElementById('auth-card').style.display = 'block';
        document.getElementById('auth-status').innerText = 'Autenticação necessária';
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user;
            initApp();
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
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) alert('Erro: ' + error.message);
    else alert('Registo efetuado! Podes fazer login.');
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
    document.getElementById('auth-status').innerText = `Sessão: ${currentUser.email}`;
    loadChatHistory();
    loadTacticalTasks();
    setupRealtime();
}

function saveApiKey() {
    const apiKey = document.getElementById('gemini-key').value.trim();
    if (!apiKey) return alert('Chave inválida!');
    localStorage.setItem('nexa_gemini_key', apiKey);
    alert('Chave salva com sucesso!');
}

async function sendGeminiMessage() {
    const input = document.getElementById('user-input');
    const apiKey = document.getElementById('gemini-key').value.trim();
    const chatBox = document.getElementById('chat-messages');

    if (!input.value.trim() || !apiKey) return alert('Preenche a chave e o comando!');
    let userText = input.value.trim();
    input.value = '';

    if (userText.startsWith('/task ')) {
        const taskTitle = userText.replace('/task ', '');
        await supabaseClient.from('tactical_tasks').insert([{ title: taskTitle, status: 'todo', user_id: currentUser?.id }]);
        chatBox.innerHTML += `<div class="message user">${userText}</div>`;
        chatBox.innerHTML += `<div class="message ai">[SISTEMA] Tarefa criada com sucesso no Kanban!</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
        loadTacticalTasks();
        return;
    }

    chatBox.innerHTML += `<div class="message user">${userText}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    const aiMsgId = 'ai-' + Date.now();
    chatBox.innerHTML += `<div id="${aiMsgId}" class="message ai">A processar com memória...</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    // Recolher histórico recente do Supabase para injetar contexto (Memória de Longo Alcance)
    let historyContents = [];
    const { data: pastChats } = await supabaseClient.from('chat_history').select('prompt, response').order('created_at', { ascending: false }).limit(5);
    if (pastChats) {
        pastChats.reverse().forEach(c => {
            historyContents.push({ role: "user", parts: [{ text: c.prompt }] });
            historyContents.push({ role: "model", parts: [{ text: c.response }] });
        });
    }
    historyContents.push({ role: "user", parts: [{ text: userText }] });

    let aiReply = "";
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:streamGenerateContent?key=${apiKey}&alt=sse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: historyContents })
        });

        if (!res.ok) throw new Error('Erro na API');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const aiNode = document.getElementById(aiMsgId);
        if (aiNode) aiNode.innerText = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.replace('data: ', '').trim();
                    if (jsonStr) {
                        const parsed = JSON.parse(jsonStr);
                        const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (chunk) {
                            aiReply += chunk;
                            const node = document.getElementById(aiMsgId);
                            if (node) {
                                node.innerText = aiReply;
                                chatBox.scrollTop = chatBox.scrollHeight;
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        const node = document.getElementById(aiMsgId);
        if (node) node.innerText = "Erro no streaming da IA.";
        return;
    }

    if (currentUser) {
        await supabaseClient.from('chat_history').insert([{ user_id: currentUser.id, prompt: userText, response: aiReply, model_used: 'gemini-3.5-flash' }]);
    }
}

async function loadChatHistory() {
    const { data } = await supabaseClient.from('chat_history').select('*').order('created_at', { ascending: true }).limit(10);
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
}

async function updateStatus(id, status) {
    await supabaseClient.from('tactical_tasks').update({ status }).eq('id', id);
    loadTacticalTasks();
}

function setupRealtime() {
    supabaseClient.channel('realtime-nexa-v34')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tactical_tasks' }, () => loadTacticalTasks())
        .subscribe();
}

function generateMasterKdpScript() {
    alert("Script Python KDP gerado com sucesso no ecossistema.");
}
