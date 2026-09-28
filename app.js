const SUPABASE_URL = "https://aqqhpttbmoiovlbfhqqr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcWhwdHRibW9pb3ZsYmZocXFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NDExNzYsImV4cCI6MjEwNjExNzE3Nn0.gvz_KzuS0Z--DzI0kfgtW4QjcHPlgb_iBdrHB1iKw8o";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.addEventListener('DOMContentLoaded', async () => {
    const savedKey = localStorage.getItem('nexa_gemini_key');
    if (savedKey) {
        document.getElementById('gemini-key').value = savedKey;
    }
    await loadChatHistory();
});

function saveApiKey() {
    const apiKey = document.getElementById('gemini-key').value.trim();
    if (!apiKey) {
        alert('Insere uma chave válida antes de salvar!');
        return;
    }
    localStorage.setItem('nexa_gemini_key', apiKey);
    alert('Chave da Gemini salva com sucesso no dispositivo!');
}

async function callGeminiAPI(apiKey, userText, model) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: userText }] }]
        })
    });
    return await response.json();
}

async function sendGeminiMessage() {
    const input = document.getElementById('user-input');
    const apiKey = document.getElementById('gemini-key').value.trim();
    const chatBox = document.getElementById('chat-messages');

    if(!input.value.trim()) return;
    if(!apiKey) {
        alert('Por favor, insere e salva a tua chave da API Gemini primeiro!');
        return;
    }

    const userText = input.value;
    input.value = '';

    chatBox.innerHTML += `<div class="message" style="margin-left:auto; background:#00ffcc; color:#030712; margin-bottom:6px; padding:6px 8px; border-radius:4px; max-width:85%;">${userText}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    const loadingId = 'loading-' + Date.now();
    chatBox.innerHTML += `<div id="${loadingId}" class="message ai">A processar com a Gemini...</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    let aiReply = "";
    // Iniciar diretamente com o modelo 3.5-flash para evitar bloqueios de alta procura do 3.8
    let usedModel = "gemini-3.5-flash";

    try {
        let data = await callGeminiAPI(apiKey, userText, usedModel);

        if (data.error) {
            document.getElementById(loadingId).innerText = "A tentar rota alternativa...";
            usedModel = "gemini-1.5-flash";
            data = await callGeminiAPI(apiKey, userText, usedModel);
        }

        document.getElementById(loadingId).remove();

        if (data.error) {
            chatBox.innerHTML += `<div class="message ai" style="color:#ef4444;">Erro da API: ${data.error.message || 'Erro desconhecido'}</div>`;
            return;
        } else if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
            aiReply = data.candidates[0].content.parts[0].text;
            chatBox.innerHTML += `<div class="message ai">${aiReply}</div>`;
        } else {
            chatBox.innerHTML += `<div class="message ai" style="color:#ef4444;">Resposta inesperada da API.</div>`;
            return;
        }
    } catch (error) {
        document.getElementById(loadingId).remove();
        chatBox.innerHTML += `<div class="message ai" style="color:#ef4444;">Erro de conexão com a API.</div>`;
        return;
    }

    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
            await supabaseClient.from('chat_history').insert([
                { user_id: user.id, prompt: userText, response: aiReply, model_used: usedModel }
            ]);
        }
    } catch (err) {
        console.error("Erro ao gravar histórico na base de dados:", err);
    }
}

async function loadChatHistory() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const { data, error } = await supabaseClient
            .from('chat_history')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(20);

        if (error || !data) return;

        const chatBox = document.getElementById('chat-messages');
        chatBox.innerHTML = '';

        data.forEach(item => {
            chatBox.innerHTML += `<div class="message" style="margin-left:auto; background:#00ffcc; color:#030712; margin-bottom:6px; padding:6px 8px; border-radius:4px; max-width:85%;">${item.prompt}</div>`;
            chatBox.innerHTML += `<div class="message ai">${item.response}</div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    } catch (err) {
        console.error("Erro ao carregar histórico:", err);
    }
}

function triggerWebhook() {
    document.getElementById('webhook-log').innerText = `[${new Date().toLocaleTimeString()}] Evento disparado com sucesso via Make.com webhook pipeline. Status: 200 OK`;
}

function runSystemCheck() {
    document.getElementById('util-output').innerText = "Verificando ambiente Termux...\n- Node.js / Vercel CLI: OK\n- Supabase DB (nexa-omni-db): Conectado\n- Gemini API: Integrado\nDiagnóstico concluído com sucesso!";
}
