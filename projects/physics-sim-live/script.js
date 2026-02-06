
const canvas = document.getElementById('liveCanvas');
const ctx = canvas.getContext('2d');

const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const resetBtn = document.getElementById('resetBtn');

const particleCountEl = document.getElementById('particleCount');
const fpsEl = document.getElementById('fps');
const clientCountEl = document.getElementById('clientCount');
const dampingEl = document.getElementById('damping');
const statusEl = document.getElementById('status');

const massInput = document.getElementById('massInput');
const radiusInput = document.getElementById('radiusInput');
const velocityXInput = document.getElementById('velocityXInput');
const velocityYInput = document.getElementById('velocityYInput');

let ws = null;
let particles = [];
let worldSettings = null;
let clientCount = 0;
let worldWidth = 1920;
let worldHeight = 1080;
let scale = 1;
let particleId = 1;

const SERVER_URL = 'wss://physics-server.up.railway.app/ws/';

let frameCount = 0;
let fps = 0;
let lastFpsTime = Date.now();

function updateStatus(message, color = '#8b8b8b') {
    statusEl.textContent = message;
    statusEl.style.color = color;
}

function setConnectionState(connected) {
    disconnectBtn.disabled = !connected;
    resetBtn.disabled = !connected;
}

function updateStats() {
    particleCountEl.textContent = particles.length;
    fpsEl.textContent = fps;
    clientCountEl.textContent = clientCount;
    if (worldSettings && typeof worldSettings.damping === 'number') {
        dampingEl.textContent = worldSettings.damping.toFixed(3);
    }
}

function resizeCanvas() {
    const wrapper = canvas.parentElement;
    const maxWidth = wrapper.clientWidth;
    const maxHeight = wrapper.clientHeight;
    scale = Math.min(maxWidth / worldWidth, maxHeight / worldHeight, 1);

    canvas.width = Math.floor(worldWidth * scale);
    canvas.height = Math.floor(worldHeight * scale);
}

function applyWorldSettings(settings) {
    worldSettings = settings || worldSettings;
    if (!worldSettings) return;

    if (typeof worldSettings.width === 'number') {
        worldWidth = worldSettings.width;
    }

    if (typeof worldSettings.height === 'number') {
        worldHeight = worldSettings.height;
    }

    resizeCanvas();
    updateStats();
}

function connectToServer() {
    if (ws) {
        ws.close();
    }

    updateStatus('Connecting...', '#ffd166');
    ws = new WebSocket(SERVER_URL);

    ws.onopen = () => {
        updateStatus('Connected', '#4ade80');
        setConnectionState(true);
    };

    ws.onmessage = (event) => {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch (error) {
            return;
        }

        if (message.type === 'settings') {
            applyWorldSettings(message.data);
        }

        if (message.type === 'update') {
            particles = message.particles || [];
            if (message.settings) {
                applyWorldSettings(message.settings);
            }
            if (typeof message.clientCount === 'number') {
                clientCount = message.clientCount;
            }
            frameCount += 1;
        }
    };

    ws.onerror = () => {
        updateStatus('Connection error', '#ff6b6b');
        setConnectionState(false);
    };

    ws.onclose = () => {
        updateStatus('Disconnected', '#ff6b6b');
        setConnectionState(false);
        particles = [];
        updateStats();
        ws = null;
    };
}

function disconnectFromServer() {
    if (ws) {
        ws.close();
    }
}

function resetWorld() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'reset' }));
    particles = [];
    particleId = 1;
    updateStats();
}

function getSpawnPayload(worldX, worldY) {
    const mass = parseFloat(massInput.value) || 1;
    const radius = parseFloat(radiusInput.value) || 8;
    const vx = parseFloat(velocityXInput.value) || 0;
    const vy = parseFloat(velocityYInput.value) || 0;

    return {
        type: 'spawn',
        id: particleId++,
        x: worldX,
        y: worldY,
        vx,
        vy,
        mass,
        radius
    };
}

function screenToWorld(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (event.clientX - rect.left) * scaleX / scale;
    const y = (event.clientY - rect.top) * scaleY / scale;

    return { x, y };
}

function spawnParticleAt(event) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const { x, y } = screenToWorld(event);
    const payload = getSpawnPayload(x, y);
    ws.send(JSON.stringify(payload));
}

function render() {
    ctx.fillStyle = '#07070c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (ws && ws.readyState === WebSocket.CONNECTING) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '22px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Connecting...', canvas.width / 2, canvas.height / 2);
    } else if (!ws || ws.readyState !== WebSocket.OPEN) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '22px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Disconnected', canvas.width / 2, canvas.height / 2);
    }

    particles.forEach((particle) => {
        const hue = (particle.id * 73) % 360;
        ctx.fillStyle = `hsl(${hue}, 90%, 60%)`;
        ctx.beginPath();
        ctx.arc(particle.x * scale, particle.y * scale, particle.radius * scale, 0, Math.PI * 2);
        ctx.fill();

        if (particle.vx || particle.vy) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(particle.x * scale, particle.y * scale);
            ctx.lineTo((particle.x + particle.vx * 0.12) * scale, (particle.y + particle.vy * 0.12) * scale);
            ctx.stroke();
        }
    });

    const now = Date.now();
    if (now - lastFpsTime > 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFpsTime = now;
        updateStats();
    }

    requestAnimationFrame(render);
}

function wireInputButtons() {
    let holdInterval = null;
    let holdTimeout = null;

    document.querySelectorAll('.input-btn').forEach((button) => {
        button.addEventListener('click', (event) => {
            const targetId = event.currentTarget.dataset.target;
            const isIncrement = event.currentTarget.classList.contains('plus');
            const input = document.getElementById(targetId);
            if (!input) return;

            const step = parseFloat(input.step) || 1;
            const current = parseFloat(input.value) || 0;
            const next = isIncrement ? current + step : current - step;

            if (input.hasAttribute('min')) {
                const min = parseFloat(input.min);
                input.value = Math.max(next, min);
            } else {
                input.value = next;
            }
        });

        button.addEventListener('mousedown', (event) => {
            const targetId = event.currentTarget.dataset.target;
            const isIncrement = event.currentTarget.classList.contains('plus');
            const input = document.getElementById(targetId);
            if (!input) return;

            holdTimeout = setTimeout(() => {
                holdInterval = setInterval(() => {
                    const step = parseFloat(input.step) || 1;
                    const current = parseFloat(input.value) || 0;
                    const next = isIncrement ? current + step : current - step;

                    if (input.hasAttribute('min')) {
                        const min = parseFloat(input.min);
                        input.value = Math.max(next, min);
                    } else {
                        input.value = next;
                    }
                }, 50);
            }, 300);
        });

        button.addEventListener('touchstart', (event) => {
            const targetId = event.currentTarget.dataset.target;
            const isIncrement = event.currentTarget.classList.contains('plus');
            const input = document.getElementById(targetId);
            if (!input) return;

            holdTimeout = setTimeout(() => {
                holdInterval = setInterval(() => {
                    const step = parseFloat(input.step) || 1;
                    const current = parseFloat(input.value) || 0;
                    const next = isIncrement ? current + step : current - step;

                    if (input.hasAttribute('min')) {
                        const min = parseFloat(input.min);
                        input.value = Math.max(next, min);
                    } else {
                        input.value = next;
                    }
                }, 50);
            }, 300);
        });
    });

    document.addEventListener('mouseup', () => {
        clearTimeout(holdTimeout);
        clearInterval(holdInterval);
        holdTimeout = null;
        holdInterval = null;
    });

    document.addEventListener('touchend', () => {
        clearTimeout(holdTimeout);
        clearInterval(holdInterval);
        holdTimeout = null;
        holdInterval = null;
    });
}

function initialize() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    connectBtn.addEventListener('click', connectToServer);
    disconnectBtn.addEventListener('click', disconnectFromServer);
    resetBtn.addEventListener('click', resetWorld);

    canvas.addEventListener('click', spawnParticleAt);

    wireInputButtons();
    updateStats();
    render();

    setTimeout(connectToServer, 500);
}

window.addEventListener('DOMContentLoaded', initialize);
