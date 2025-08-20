// Dashboard JavaScript
class Dashboard {
    constructor() {
        this.init();
        this.setupEventListeners();
        this.startPeriodicUpdates();
    }

    init() {
        this.loadTheme();
        this.checkServiceStatus();
        this.updateMetrics();
        this.addLog('info', 'Dashboard initialized successfully');
    }

    setupEventListeners() {
        // Theme toggle
        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Refresh status
        document.getElementById('refresh-status').addEventListener('click', () => {
            this.checkServiceStatus();
        });

        // Chat functionality
        document.getElementById('send-message').addEventListener('click', () => {
            this.sendChatMessage();
        });

        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });

        // Quick actions
        document.getElementById('test-auth').addEventListener('click', () => {
            this.testAuthentication();
        });

        document.getElementById('test-vector').addEventListener('click', () => {
            this.testVectorSearch();
        });

        // Clear logs
        document.getElementById('clear-logs').addEventListener('click', () => {
            this.clearLogs();
        });
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        document.getElementById('theme-toggle').textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        document.getElementById('theme-toggle').textContent = newTheme === 'dark' ? '☀️' : '🌙';
        
        this.addLog('info', `Theme switched to ${newTheme} mode`);
    }

    async checkServiceStatus() {
        const services = ['api', 'database', 'redis', 'qdrant', 'llm'];
        
        // Set all to loading
        services.forEach(service => {
            const indicator = document.getElementById(`${service}-status`);
            indicator.className = 'status-indicator loading';
        });

        try {
            // Check overall health
            const response = await fetch('/health/all');
            const data = await response.json();
            
            // Update API status
            document.getElementById('api-status').className = 
                response.ok ? 'status-indicator healthy' : 'status-indicator unhealthy';
            
            // Update individual services
            if (data.services) {
                Object.entries(data.services).forEach(([service, status]) => {
                    const indicator = document.getElementById(`${service}-status`);
                    if (indicator) {
                        indicator.className = status.status === 'healthy' ? 
                            'status-indicator healthy' : 'status-indicator unhealthy';
                    }
                });
            }
            
            this.addLog('info', `Service status updated - Overall: ${data.overall_status}`);
            
        } catch (error) {
            // Set all to unhealthy on error
            services.forEach(service => {
                const indicator = document.getElementById(`${service}-status`);
                indicator.className = 'status-indicator unhealthy';
            });
            
            this.addLog('error', `Failed to check service status: ${error.message}`);
        }
    }

    async updateMetrics() {
        try {
            // Simulate metrics (in real app, these would come from actual endpoints)
            document.getElementById('api-requests').textContent = Math.floor(Math.random() * 1000);
            document.getElementById('active-users').textContent = Math.floor(Math.random() * 50);
            
            // Get vector collections count
            try {
                const vectorResponse = await fetch('/vector/collections', {
                    headers: this.getAuthHeaders()
                });
                if (vectorResponse.ok) {
                    const vectorData = await vectorResponse.json();
                    document.getElementById('vector-collections').textContent = 
                        vectorData.collections ? vectorData.collections.length : 0;
                }
            } catch (e) {
                document.getElementById('vector-collections').textContent = '-';
            }
            
            // Update uptime
            const uptime = new Date().toLocaleTimeString();
            document.getElementById('uptime').textContent = uptime;
            
        } catch (error) {
            this.addLog('warning', `Failed to update metrics: ${error.message}`);
        }
    }

    async sendChatMessage() {
        const input = document.getElementById('chat-input');
        const messages = document.getElementById('chat-messages');
        const modelSelect = document.getElementById('model-select');
        
        const message = input.value.trim();
        if (!message) return;
        
        // Add user message to chat
        this.addChatMessage('user', message);
        input.value = '';
        
        try {
            const response = await fetch('/llm/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: message }],
                    model: modelSelect.value,
                    provider: 'local'
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                this.addChatMessage('assistant', data.message);
                this.addLog('info', `LLM response generated using ${data.model}`);
            } else {
                this.addChatMessage('assistant', 'Sorry, I encountered an error processing your request.');
                this.addLog('error', `LLM request failed: ${response.status}`);
            }
            
        } catch (error) {
            this.addChatMessage('assistant', 'Sorry, I\'m currently unavailable. Please try again later.');
            this.addLog('error', `LLM request error: ${error.message}`);
        }
    }

    addChatMessage(role, content) {
        const messages = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${role}`;
        messageDiv.textContent = content;
        messages.appendChild(messageDiv);
        messages.scrollTop = messages.scrollHeight;
    }

    async testAuthentication() {
        try {
            // Try to register a test user
            const response = await fetch('/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: 'testuser',
                    email: 'test@example.com',
                    password: 'testpassword123'
                })
            });
            
            if (response.ok) {
                this.addLog('info', 'Test user registration successful');
            } else {
                this.addLog('warning', 'Test user already exists or registration failed');
            }
            
            // Try to login
            const loginResponse = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'username=testuser&password=testpassword123'
            });
            
            if (loginResponse.ok) {
                const loginData = await loginResponse.json();
                localStorage.setItem('access_token', loginData.access_token);
                this.addLog('info', 'Authentication test successful - Token stored');
            } else {
                this.addLog('error', 'Authentication test failed');
            }
            
        } catch (error) {
            this.addLog('error', `Authentication test error: ${error.message}`);
        }
    }

    async testVectorSearch() {
        try {
            const headers = this.getAuthHeaders();
            
            // Create a test collection
            const createResponse = await fetch('/vector/collections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({
                    name: 'test_collection',
                    vector_size: 384
                })
            });
            
            if (createResponse.ok) {
                this.addLog('info', 'Test vector collection created');
                
                // Add some test vectors
                const addResponse = await fetch('/vector/embed', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...headers },
                    body: JSON.stringify({
                        collection_name: 'test_collection',
                        vectors: [Array(384).fill(0.1), Array(384).fill(0.2)],
                        payloads: [{ text: 'test1' }, { text: 'test2' }]
                    })
                });
                
                if (addResponse.ok) {
                    this.addLog('info', 'Test vectors added successfully');
                } else {
                    this.addLog('warning', 'Failed to add test vectors');
                }
            } else {
                this.addLog('warning', 'Test collection already exists or creation failed');
            }
            
        } catch (error) {
            this.addLog('error', `Vector search test error: ${error.message}`);
        }
    }

    getAuthHeaders() {
        const token = localStorage.getItem('access_token');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    addLog(level, message) {
        const logsContent = document.getElementById('logs-content');
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        const timestamp = new Date().toLocaleString();
        logEntry.innerHTML = `
            <span class="timestamp">[${timestamp}]</span>
            <span class="level ${level}">${level.toUpperCase()}</span>
            <span class="message">${message}</span>
        `;
        
        logsContent.appendChild(logEntry);
        logsContent.scrollTop = logsContent.scrollHeight;
        
        // Keep only last 100 log entries
        while (logsContent.children.length > 100) {
            logsContent.removeChild(logsContent.firstChild);
        }
    }

    clearLogs() {
        const logsContent = document.getElementById('logs-content');
        logsContent.innerHTML = '';
        this.addLog('info', 'Logs cleared');
    }

    startPeriodicUpdates() {
        // Update service status every 30 seconds
        setInterval(() => {
            this.checkServiceStatus();
        }, 30000);
        
        // Update metrics every 10 seconds
        setInterval(() => {
            this.updateMetrics();
        }, 10000);
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});