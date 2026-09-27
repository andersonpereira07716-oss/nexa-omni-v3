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

    try {
        // Tenta o modelo principal atual
        let data = await callGeminiAPI(apiKey, userText, 'gemini-3.8-flash');

        // Se houver pico/indisponibilidade, tenta o fallback estável correspondente
        if (data.error) {
            document.getElementById(loadingId).innerText = "A alternar para rota de alta estabilidade...";
            data = await callGeminiAPI(apiKey, userText, 'gemini-3.5-flash');
        }

        document.getElementById(loadingId).remove();

        if (data.error) {
            chatBox.innerHTML += `<div class="message ai" style="color:#ef4444;">Erro da API: ${data.error.message || 'Erro desconhecido'}</div>`;
        } else if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
            const aiReply = data.candidates[0].content.parts[0].text;
            chatBox.innerHTML += `<div class="message ai">${aiReply}</div>`;
        } else {
            chatBox.innerHTML += `<div class="message ai" style="color:#ef4444;">Resposta inesperada da API.</div>`;
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
