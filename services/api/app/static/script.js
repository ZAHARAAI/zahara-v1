// Zahara.ai Dashboard JavaScript
class ZaharaDashboard {
    constructor() {
        this.agents = [];
        this.selectedAgent = null;
        this.init();
        this.setupEventListeners();
        this.startPeriodicUpdates();
    }

    init() {
        this.loadTheme();
        this.checkServiceStatus();
        this.loadAgents();
        this.updateMetrics();
        this.addLog('info', 'Zahara.ai Dashboard initialized successfully');
    }

    setupEventListeners() {
        // Theme toggle
        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Service status refresh
        document.getElementById('refresh-status').addEventListener('click', () => {
            this.checkServiceStatus();
        });

        // Agent functionality
        document.getElementById('refresh-agents').addEventListener('click', () => {
            this.loadAgents();
        });

        document.getElementById('agent-select').addEventListener('change', (e) => {
            this.selectAgent(e.target.value);
        });

        // Chat functionality
        document.getElementById('send-message').addEventListener('click', () => {
            this.sendAgentMessage();
        });

        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendAgentMessage();
            }
        });

        // Flowise testing
        document.getElementById('test-flowise').addEventListener('click', () => {
            this.testFlowise();
        });

        // Vector database testing
        document.getElementById('test-vector-sanity').addEventListener('click', () => {
            this.testVectorSanity();
        });

        document.getElementById('test-vector-search').addEventListener('click', () => {
            this.testVectorSearch();
        });

        document.getElementById('view-collections').addEventListener('click', () => {
            this.viewCollections();
        });

        // Quick actions
        document.getElementById('test-auth').addEventListener('click', () => {
            this.testAuthentication();
        });

        document.getElementById('create-api-key').addEventListener('click', () => {
            this.createApiKey();
        });

        document.getElementById('test-router').addEventListener('click', () => {
            this.testRouter();
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
            if (indicator) {
                indicator.className = 'status-indicator loading';
            }
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

            // Check Flowise status
            this.checkFlowiseStatus();
            
            this.addLog('info', `Service status updated - Overall: ${data.overall_status}`);
            
        } catch (error) {
            // Set all to unhealthy on error
            services.forEach(service => {
                const indicator = document.getElementById(`${service}-status`);
                if (indicator) {
                    indicator.className = 'status-indicator unhealthy';
                }
            });
            
            this.addLog('error', `Failed to check service status: ${error.message}`);
        }
    }

    async checkFlowiseStatus() {
        try {
            const response = await fetch('http://localhost:3000/api/v1/ping');
            const indicator = document.getElementById('flowise-status');
            if (indicator) {
                indicator.className = response.ok ? 'status-indicator healthy' : 'status-indicator unhealthy';
            }
        } catch (error) {
            const indicator = document.getElementById('flowise-status');
            if (indicator) {
                indicator.className = 'status-indicator unhealthy';
            }
        }
    }

    async loadAgents() {
        try {
            const response = await fetch('/agents/configured');
            const data = await response.json();
            
            this.agents = data.agents || [];
            this.populateAgentSelect();
            this.addLog('info', `Loaded ${this.agents.length} agents`);
            
        } catch (error) {
            this.addLog('error', `Failed to load agents: ${error.message}`);
        }
    }

    populateAgentSelect() {
        const select = document.getElementById('agent-select');
        select.innerHTML = '<option value="">Select an agent...</option>';
        
        this.agents.forEach(agent => {
            const option = document.createElement('option');
            option.value = agent.id;
            option.textContent = `${agent.name} (${agent.model})`;
            select.appendChild(option);
        });
    }

    selectAgent(agentId) {
        this.selectedAgent = this.agents.find(agent => agent.id === agentId);
        this.displayAgentDetails();
    }

    displayAgentDetails() {
        const detailsDiv = document.getElementById('agent-details');
        
        if (!this.selectedAgent) {
            detailsDiv.innerHTML = 'Select an agent to see details';
            return;
        }

        const agent = this.selectedAgent;
        detailsDiv.innerHTML = `
            <div class="agent-detail">
                <h5>${agent.name}</h5>
                <p><strong>Description:</strong> ${agent.description}</p>
                <p><strong>Model:</strong> ${agent.model}</p>
                <p><strong>Provider:</strong> ${agent.provider}</p>
                <p><strong>Capabilities:</strong> ${agent.capabilities.join(', ')}</p>
                <div class="agent-settings">
                    <strong>Settings:</strong>
                    <ul>
                        <li>Temperature: ${agent.settings.temperature}</li>
                        <li>Max Tokens: ${agent.settings.max_tokens}</li>
                    </ul>
                </div>
            </div>
        `;
    }

    async sendAgentMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (!message) return;
        if (!this.selectedAgent) {
            this.addLog('warning', 'Please select an agent first');
            return;
        }

        // Add user message to chat
        this.addChatMessage('user', message);
        input.value = '';

        try {
            // Note: This would be the actual chat endpoint when implemented
            const response = await fetch(`/agents/${this.selectedAgent.id}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify({
                    message: message,
                    context: {}
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.addChatMessage('assistant', data.response);
                this.addLog('info', `Agent ${this.selectedAgent.name} responded`);
            } else {
                // Simulate response for demo
                const demoResponse = `Hello! I'm ${this.selectedAgent.name}. You said: "${message}". This is a demo response since the full agent chat isn't implemented yet.`;
                this.addChatMessage('assistant', demoResponse);
                this.addLog('info', `Demo response from ${this.selectedAgent.name}`);
            }

        } catch (error) {
            this.addChatMessage('assistant', 'Sorry, I\'m currently unavailable. Please try again later.');
            this.addLog('error', `Agent chat error: ${error.message}`);
        }
    }

    addChatMessage(role, content) {
        const messages = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${role}`;
        messageDiv.innerHTML = `
            <div class="message-content">
                <strong>${role === 'user' ? 'You' : (this.selectedAgent ? this.selectedAgent.name : 'Assistant')}:</strong>
                <p>${content}</p>
            </div>
        `;
        messages.appendChild(messageDiv);
        messages.scrollTop = messages.scrollHeight;
    }

    async testFlowise() {
        try {
            const response = await fetch('http://localhost:3000/api/v1/ping');
            
            if (response.ok) {
                this.addLog('info', 'Flowise connection test successful');
                // Try to get chatflows
                try {
                    const chatflowsResponse = await fetch('http://localhost:3000/api/v1/chatflows');
                    if (chatflowsResponse.ok) {
                        const chatflows = await chatflowsResponse.json();
                        this.addLog('info', `Found ${chatflows.length} chatflows in Flowise`);
                    }
                } catch (e) {
                    this.addLog('info', 'Flowise is running but may need authentication for chatflows');
                }
            } else {
                this.addLog('error', 'Flowise connection test failed');
            }
        } catch (error) {
            this.addLog('error', `Flowise test error: ${error.message}`);
        }
    }

    async testVectorSanity() {
        try {
            const response = await fetch('/vector/sanity');
            const data = await response.json();
            
            document.getElementById('vector-output').textContent = JSON.stringify(data, null, 2);
            
            if (data.status === 'healthy') {
                this.addLog('info', 'Vector database sanity check passed');
            } else {
                this.addLog('warning', 'Vector database sanity check had issues');
            }
            
        } catch (error) {
            document.getElementById('vector-output').textContent = `Error: ${error.message}`;
            this.addLog('error', `Vector sanity check error: ${error.message}`);
        }
    }

    async testVectorSearch() {
        try {
            // This would be a real vector search test
            const testVector = Array(1536).fill(0.1); // Sample vector
            
            const response = await fetch('/vector/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify({
                    collection_name: 'zahara_default',
                    vector: testVector,
                    limit: 5
                })
            });

            if (response.ok) {
                const data = await response.json();
                document.getElementById('vector-output').textContent = JSON.stringify(data, null, 2);
                this.addLog('info', 'Vector search test completed');
            } else {
                document.getElementById('vector-output').textContent = 'Vector search test failed - endpoint may not be implemented';
                this.addLog('warning', 'Vector search endpoint not fully implemented');
            }

        } catch (error) {
            document.getElementById('vector-output').textContent = `Search Error: ${error.message}`;
            this.addLog('error', `Vector search test error: ${error.message}`);
        }
    }

    async viewCollections() {
        try {
            // Check Qdrant directly
            const response = await fetch('http://localhost:6333/collections');
            const data = await response.json();
            
            document.getElementById('vector-output').textContent = JSON.stringify(data, null, 2);
            this.addLog('info', 'Vector collections retrieved');
            
        } catch (error) {
            document.getElementById('vector-output').textContent = `Collections Error: ${error.message}`;
            this.addLog('error', `Failed to view collections: ${error.message}`);
        }
    }

    async testAuthentication() {
        try {
            // Try to register a test user
            const registerResponse = await fetch('/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'testuser@zahara.ai',
                    password: 'testpassword123',
                    full_name: 'Test User'
                })
            });

            if (registerResponse.ok) {
                this.addLog('info', 'Test user registration successful');
            } else {
                this.addLog('warning', 'Test user already exists or registration failed');
            }

            // Try to login
            const loginResponse = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'username=testuser@zahara.ai&password=testpassword123'
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

    async createApiKey() {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                this.addLog('warning', 'Please run authentication test first to get a token');
                return;
            }

            const response = await fetch('/api-keys/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: 'Test API Key',
                    description: 'Created from dashboard',
                    can_read: true,
                    can_write: true
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.addLog('info', `API key created: ${data.plain_key.substring(0, 20)}...`);
                // Store for testing
                localStorage.setItem('api_key', data.plain_key);
            } else {
                this.addLog('error', 'Failed to create API key');
            }

        } catch (error) {
            this.addLog('error', `API key creation error: ${error.message}`);
        }
    }

    async testRouter() {
        try {
            // Test router health
            const healthResponse = await fetch('http://localhost:7000/health');
            const healthData = await healthResponse.json();
            
            this.addLog('info', `Router health: ${JSON.stringify(healthData)}`);

            // Test models endpoint
            const modelsResponse = await fetch('http://localhost:7000/v1/models');
            const modelsData = await modelsResponse.json();
            
            this.addLog('info', `Available models: ${modelsData.data.length} models`);

            // Test chat completions (should return 501 if no provider keys)
            const chatResponse = await fetch('http://localhost:7000/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            });

            if (chatResponse.status === 501) {
                this.addLog('info', 'Router correctly returns 501 for unconfigured providers');
            } else {
                this.addLog('info', `Router chat response: ${chatResponse.status}`);
            }

        } catch (error) {
            this.addLog('error', `Router test error: ${error.message}`);
        }
    }

    async updateMetrics() {
        try {
            // Update metrics with real data where possible
            const healthResponse = await fetch('/health/all');
            if (healthResponse.ok) {
                const healthData = await healthResponse.json();
                
                // Vector collections count
                if (healthData.services.qdrant && healthData.services.qdrant.collections_count) {
                    document.getElementById('vector-collections').textContent = 
                        healthData.services.qdrant.collections_count;
                }
            }

            // Simulate other metrics
            document.getElementById('api-requests').textContent = Math.floor(Math.random() * 1000);
            document.getElementById('active-users').textContent = Math.floor(Math.random() * 50);
            
            // Update uptime
            const uptime = new Date().toLocaleTimeString();
            document.getElementById('uptime').textContent = uptime;

        } catch (error) {
            this.addLog('warning', `Failed to update metrics: ${error.message}`);
        }
    }

    getAuthHeaders() {
        const token = localStorage.getItem('access_token');
        const apiKey = localStorage.getItem('api_key');
        
        if (apiKey) {
            return { 'Authorization': `Bearer ${apiKey}` };
        } else if (token) {
            return { 'Authorization': `Bearer ${token}` };
        }
        
        return {};
    }

    addLog(level, message) {
        const logsContent = document.getElementById('logs-content');
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${level}`;
        
        const timestamp = new Date().toLocaleString();
        logEntry.innerHTML = `
            <span class="timestamp">[${timestamp}]</span>
            <span class="level">${level.toUpperCase()}</span>
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
    new ZaharaDashboard();
});