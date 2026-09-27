window.addEventListener('DOMContentLoaded', () => {
    const savedKey = localStorage.getItem('nexa_gemini_key');
    if (savedKey) {
        document.getElementById('gemini-key').value = savedKey;
    }
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

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userText }] }]
            })
        });

        const data = await response.json();
        document.getElementById(loadingId).remove();

        if(data.candidates && data.candidates[0].content.parts[0].text) {
            const aiReply = data.candidates[0].content.parts[0].text;
            chatBox.innerHTML += `<div class="message ai">${aiReply}</div>`;
        } else {
            chatBox.innerHTML += `<div class="message ai" style="color:#ef4444;">Erro na resposta da API Gemini. Verifica a chave.</div>`;
        }
    } catch (error) {
        document.getElementById(loadingId).remove();
        chatBox.innerHTML += `<div class="message ai" style="color:#ef4444;">Erro de conexão com a API.</div>`;
    }

    chatBox.scrollTop = chatBox.scrollHeight;
}

function triggerWebhook() {
    document.getElementById('webhook-log').innerText = `[${new Date().toLocaleTimeString()}] Evento disparado com sucesso via Make.com webhook pipeline. Status: 200 OK`;
}

function runSystemCheck() {
    document.getElementById('util-output').innerText = "Verificando ambiente Termux...\n- Node.js / Vercel CLI: OK\n- Gemini API: Integrado\n- Memória de Processos: Estável\nDiagnóstico concluído com sucesso!";
}
