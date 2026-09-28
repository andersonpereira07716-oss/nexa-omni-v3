const SUPABASE_URL = "https://aqqhpttbmoiovlbfhqqr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcWhwdHRibW9pb3ZsYmZocXFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NDExNzYsImV4cCI6MjEwNjExNzE3Nn0.gvz_KzuS0Z--DzI0kfgtW4QjcHPlgb_iBdrHB1iKw8o";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.addEventListener('DOMContentLoaded', async () => {
    const savedKey = localStorage.getItem('nexa_gemini_key');
    if (savedKey) document.getElementById('gemini-key').value = savedKey;
    loadChatHistory();
    loadTacticalTasks();
    setupRealtime();
});

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

    if (!input.value.trim() || !apiKey) return alert('Verifica a chave e o texto!');
    const userText = input.value;
    input.value = '';

    // Adiciona imediatamente a mensagem do utilizador ao chat local
    chatBox.innerHTML += `<div class="message user">${userText}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    const aiMsgId = 'ai-' + Date.now();
    chatBox.innerHTML += `<div id="${aiMsgId}" class="message ai">A processar stream...</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;
    
    let aiReply = "";
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:streamGenerateContent?key=${apiKey}&alt=sse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: userText }] }] })
        });

        if (!res.ok) throw new Error('Erro na resposta da API');

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
        console.error(e);
        return;
    }

    // Grava de forma segura na base de dados sem recarregar o histórico inteiro bruscamente
    await supabaseClient.from('chat_history').insert([{ prompt: userText, response: aiReply, model_used: 'gemini-3.5-flash' }]);
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
    await supabaseClient.from('tactical_tasks').insert([{ title, status: 'todo' }]);
    document.getElementById('new-task-title').value = '';
    loadTacticalTasks();
}

async function updateStatus(id, status) {
    await supabaseClient.from('tactical_tasks').update({ status }).eq('id', id);
    loadTacticalTasks();
}

function setupRealtime() {
    supabaseClient.channel('realtime-nexa-v32')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tactical_tasks' }, () => loadTacticalTasks())
        .subscribe();
}

function generatePythonKdpScript() {
    document.getElementById('util-output').value = `import reportlab\nfrom reportlab.pdfgen import canvas\n\ndef criar_livro():\n    pdf = canvas.Canvas("livro_kdp.pdf")\n    pdf.drawString(100, 750, "NEXA Automated Publishing KDP")\n    pdf.save()\n\nif __name__ == "__main__":\n    criar_livro()`;
}

function generatePm2WhatsappScript() {
    document.getElementById('util-output').value = `// ecosystem.config.js para PM2 & WhatsApp Web\nmodule.exports = {\n  apps: [{\n    name: "AtendePro-AI",\n    script: "./bot.js",\n    env: { NODE_ENV: "production" }\n  }]\n};`;
}
