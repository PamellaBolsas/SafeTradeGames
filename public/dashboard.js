const API_URL = 'http://localhost:3000/api';
let currentUser = null;

document.addEventListener('DOMContentLoaded', function() {
    // Verificar autenticação
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (!token || !user) {
        window.location.href = 'index.html';
        return;
    }
    
    try {
        currentUser = JSON.parse(user);
        loadDashboard();
        setupEvents();
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        showNotification('Erro ao carregar: ' + error.message, 'error');
    }
});

function setupEvents() {
    // Menu de navegação
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remover classe active de todos
            navItems.forEach(i => i.classList.remove('active'));
            
            // Adicionar classe active no item clicado
            this.classList.add('active');
            
            const page = this.dataset.page;
            loadPage(page);
        });
    });
    
    // Botão de logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            localStorage.clear();
            window.location.href = 'index.html';
        });
    }
}

async function loadDashboard() {
    // Atualizar avatar e nome do usuário
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    
    if (userAvatar && currentUser && currentUser.username) {
        userAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
    }
    
    if (userName && currentUser) {
        userName.textContent = currentUser.username;
    }
    
    // Carregar página inicial
    loadPage('home');
}

async function loadPage(page) {
    const content = document.getElementById('dashboardContent');
    if (!content) return;
    
    content.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i> Carregando...
        </div>
    `;
    
    try {
        switch(page) {
            case 'home':
                await loadHomePage();
                break;
            case 'create-escrow':
                loadCreateEscrowPage();
                break;
            case 'my-escrows':
                await loadMyEscrowsPage();
                break;
            case 'join-escrow':
                loadJoinEscrowPage();
                break;
            case 'chats':
                await loadChatsPage();
                break;
            case 'withdraw':
                window.location.href = 'balance.html';
                break;
            default:
                await loadHomePage();
        }
    } catch (error) {
        console.error('Erro ao carregar página:', error);
        content.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #ef4444;">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Erro ao carregar página</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Função segura para formatar números
function safeFormat(value) {
    if (value === undefined || value === null || isNaN(parseFloat(value))) {
        return '0.00';
    }
    return parseFloat(value).toFixed(2);
}

async function loadHomePage() {
    const content = document.getElementById('dashboardContent');
    if (!content) return;
    
    try {
        const token = localStorage.getItem('token');
        
        // Carregar saldo
        let pendingBalance = 0;
        let availableBalance = 0;
        
        try {
            const response = await fetch(`${API_URL}/balance`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.balance) {
                    pendingBalance = parseFloat(data.balance.pending) || 0;
                    availableBalance = parseFloat(data.balance.available) || 0;
                    
                    // DEBUG: Verificar saldo carregado
                    console.log('💰 Saldo carregado do servidor:', {
                        pending: pendingBalance,
                        available: availableBalance,
                        user: currentUser.username
                    });
                }
            }
        } catch (e) {
            console.warn('Erro ao carregar saldo:', e);
        }
        
        // Carregar intermédios recentes
        let recentEscrows = [];
        try {
            const response = await fetch(`${API_URL}/escrow`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.escrows) {
                    // Pegar apenas os 5 mais recentes
                    recentEscrows = data.escrows.slice(0, 5);
                }
            }
        } catch (e) {
            console.warn('Erro ao carregar intermédios:', e);
        }
        
        content.innerHTML = `
            <div style="max-width: 1200px; margin: 0 auto; padding: 0 15px;">
                <!-- Título com espaçamento -->
                <h2 style="color: #334155; margin-bottom: 30px; font-size: 1.8rem; font-weight: 600; text-align: center;">
                    <i class="fas fa-home" style="margin-right: 10px;"></i>Dashboard
                </h2>
                
                <!-- Cartões de Saldo com ESPAÇAMENTO -->
                <div style="margin-bottom: 50px;">
                    <h3 style="color: #475569; margin-bottom: 25px; font-size: 1.2rem; font-weight: 600; text-align: center;">
                        <i class="fas fa-wallet" style="margin-right: 10px;"></i>Meus Saldos
                    </h3>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 25px; justify-content: center;">
                        <!-- Saldo em Andamento -->
                        <div class="balance-card" style="border-left: 4px solid #3b82f6; background: white; border-radius: 12px; padding: 25px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); width: 100%;">
                            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                                <div style="background: #dbeafe; width: 50px; height: 50px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fas fa-clock" style="font-size: 1.5rem; color: #1d4ed8;"></i>
                                </div>
                                <div style="flex: 1;">
                                    <h3 style="color: #475569; font-size: 1rem; margin-bottom: 5px;">Saldo em Andamento</h3>
                                    <p style="color: #64748b; font-size: 0.85rem;">Aguardando confirmação</p>
                                </div>
                            </div>
                            <div style="font-size: 2rem; font-weight: bold; color: #334155; margin-top: 10px; text-align: center;">
                                R$ ${safeFormat(pendingBalance)}
                            </div>
                        </div>
                        
                        <!-- Saldo Disponível -->
                        <div class="balance-card" style="border-left: 4px solid #10b981; background: white; border-radius: 12px; padding: 25px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); width: 100%;">
                            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                                <div style="background: #d1fae5; width: 50px; height: 50px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fas fa-check-circle" style="font-size: 1.5rem; color: #065f46;"></i>
                                </div>
                                <div style="flex: 1;">
                                    <h3 style="color: #475569; font-size: 1rem; margin-bottom: 5px;">Saldo Disponível</h3>
                                    <p style="color: #64748b; font-size: 0.85rem;">Pronto para saque</p>
                                </div>
                            </div>
                            <div style="font-size: 2rem; font-weight: bold; color: #334155; margin-top: 10px; text-align: center;">
                                R$ ${safeFormat(availableBalance)}
                            </div>
                            ${availableBalance > 0 ? `
                                <div style="margin-top: 20px;">
                                    <button onclick="window.location.href='balance.html'" 
                                            style="background: #10b981; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; transition: all 0.3s;"
                                            onmouseover="this.style.background='#059669'; this.style.transform='translateY(-2px)';"
                                            onmouseout="this.style.background='#10b981'; this.style.transform='translateY(0)';">
                                        <i class="fas fa-money-bill-wave"></i> Sacar Agora
                                    </button>
                                    <p style="color: #64748b; font-size: 0.8rem; text-align: center; margin-top: 8px;">
                                        Taxa de 0.5% por saque
                                    </p>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                
                <!-- Ações Rápidas com ESPAÇAMENTO -->
                <div style="margin-bottom: 50px;">
                    <h3 style="color: #475569; margin-bottom: 25px; font-size: 1.2rem; font-weight: 600; text-align: center;">
                        <i class="fas fa-bolt" style="margin-right: 10px;"></i>Ações Rápidas
                    </h3>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 25px; justify-content: center;">
                        <div class="action-card" onclick="loadPage('create-escrow')" style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); cursor: pointer; transition: all 0.3s; border: 2px solid transparent; width: 100%;"
                             onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 12px 30px rgba(0,0,0,0.15)'; this.style.borderColor='#7c3aed';"
                             onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 20px rgba(0,0,0,0.08)'; this.style.borderColor='transparent';">
                            <div style="text-align: center;">
                                <div style="font-size: 3rem; color: #7c3aed; margin-bottom: 20px;">
                                    <i class="fas fa-plus-circle"></i>
                                </div>
                                <h3 style="color: #334155; margin-bottom: 15px; font-size: 1.3rem; font-weight: 600;">Criar Intermédio</h3>
                                <p style="color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                                    Crie um novo intermédio seguro para vender seus itens de forma protegida
                                </p>
                                <div style="color: #7c3aed; font-size: 0.9rem; font-weight: bold;">
                                    Clique para começar →
                                </div>
                            </div>
                        </div>
                        
                        <div class="action-card" onclick="loadPage('join-escrow')" style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); cursor: pointer; transition: all 0.3s; border: 2px solid transparent; width: 100%;"
                             onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 12px 30px rgba(0,0,0,0.15)'; this.style.borderColor='#10b981';"
                             onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 20px rgba(0,0,0,0.08)'; this.style.borderColor='transparent';">
                            <div style="text-align: center;">
                                <div style="font-size: 3rem; color: #10b981; margin-bottom: 20px;">
                                    <i class="fas fa-sign-in-alt"></i>
                                </div>
                                <h3 style="color: #334155; margin-bottom: 15px; font-size: 1.3rem; font-weight: 600;">Entrar no Intermédio</h3>
                                <p style="color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                                    Entre em um intermédio existente usando o código fornecido pelo vendedor
                                </p>
                                <div style="color: #10b981; font-size: 0.9rem; font-weight: bold;">
                                    Clique para entrar →
                                </div>
                            </div>
                        </div>
                        
                        <div class="action-card" onclick="loadPage('my-escrows')" style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); cursor: pointer; transition: all 0.3s; border: 2px solid transparent; width: 100%;"
                             onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 12px 30px rgba(0,0,0,0.15)'; this.style.borderColor='#f59e0b';"
                             onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 20px rgba(0,0,0,0.08)'; this.style.borderColor='transparent';">
                            <div style="text-align: center;">
                                <div style="font-size: 3rem; color: #f59e0b; margin-bottom: 20px;">
                                    <i class="fas fa-list"></i>
                                </div>
                                <h3 style="color: #334155; margin-bottom: 15px; font-size: 1.3rem; font-weight: 600;">Meus Intermédios</h3>
                                <p style="color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                                    Veja e gerencie todos os seus intermédios ativos e concluídos
                                </p>
                                <div style="color: #f59e0b; font-size: 0.9rem; font-weight: bold;">
                                    Clique para visualizar →
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Intermédios Recentes com ESPAÇAMENTO -->
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; flex-wrap: wrap; gap: 15px;">
                        <h3 style="color: #475569; font-size: 1.2rem; font-weight: 600;">
                            <i class="fas fa-history" style="margin-right: 10px;"></i>Intermédios Recentes
                        </h3>
                        ${recentEscrows.length > 0 ? `
                            <button onclick="loadPage('my-escrows')" 
                                    style="background: transparent; color: #7c3aed; border: 2px solid #7c3aed; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: bold; transition: all 0.3s;"
                                    onmouseover="this.style.background='#7c3aed'; this.style.color='white';"
                                    onmouseout="this.style.background='transparent'; this.style.color='#7c3aed';">
                                Ver Todos
                            </button>
                        ` : ''}
                    </div>
                    
                    ${recentEscrows.length > 0 ? `
                        <div style="padding: 20px 0;">
                            ${recentEscrows.map(escrow => `
                                <div style="background: white; border-radius: 12px; padding: 25px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); width: 100%;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 15px; margin-bottom: 15px;">
                                        <div style="flex: 1; min-width: 200px;">
                                            <strong style="font-size: 1.1rem; color: #334155; display: block; margin-bottom: 8px;">
                                                ${escrow.itemName || 'Sem nome'}
                                            </strong>
                                            <div style="color: #64748b; font-size: 0.9rem;">
                                                <i class="fas fa-hashtag" style="margin-right: 5px;"></i> ${escrow.code || 'N/A'}
                                            </div>
                                        </div>
                                        <div class="escrow-status status-${escrow.status || 'awaiting'}" 
                                             style="padding: 8px 15px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; background: ${getStatusColor(escrow.status)}; color: white; white-space: nowrap;">
                                            ${getStatusText(escrow.status)}
                                        </div>
                                    </div>
                                    
                                    <div style="margin: 20px 0; padding: 15px; background: #f8fafc; border-radius: 8px;">
                                        <div style="color: #475569; font-size: 0.95rem; line-height: 1.5;">
                                            ${escrow.description || 'Sem descrição'}
                                        </div>
                                    </div>
                                    
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; flex-wrap: wrap; gap: 15px;">
                                        <div style="font-size: 1.4rem; font-weight: bold; color: #7c3aed;">
                                            R$ ${safeFormat(escrow.value)}
                                        </div>
                                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                            <button onclick="openChat('${escrow.id}')" 
                                                    style="background: #7c3aed; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 0.9rem; transition: all 0.3s; white-space: nowrap;"
                                                    onmouseover="this.style.background='#6d28d9'; this.style.transform='translateY(-2px)';"
                                                    onmouseout="this.style.background='#7c3aed'; this.style.transform='translateY(0)';">
                                                <i class="fas fa-comment" style="margin-right: 8px;"></i>Abrir Chat
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div style="padding: 60px 20px; text-align: center; background: white; border-radius: 12px; margin: 0 auto; max-width: 500px;">
                            <div style="font-size: 4rem; color: #cbd5e1; margin-bottom: 25px;">
                                <i class="fas fa-inbox"></i>
                            </div>
                            <h3 style="color: #64748b; margin-bottom: 15px; font-size: 1.4rem; font-weight: 600;">
                                Nenhum intermédio encontrado
                            </h3>
                            <p style="color: #94a3b8; margin-bottom: 30px; line-height: 1.6;">
                                Comece criando seu primeiro intermédio para realizar transações seguras com proteção total
                            </p>
                            <button onclick="loadPage('create-escrow')" 
                                    style="background: linear-gradient(135deg, #7c3aed, #5b21b6); color: white; border: none; padding: 16px 32px; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 1rem; transition: all 0.3s; width: 100%; max-width: 300px; margin: 0 auto;"
                                    onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 20px rgba(124, 58, 237, 0.3)';"
                                    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                                <i class="fas fa-plus-circle" style="margin-right: 10px;"></i>Criar Primeiro Intermédio
                            </button>
                        </div>
                    `}
                </div>
            </div>
        `;
        
    } catch (error) {
        content.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #ef4444;">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Erro ao carregar dashboard</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function getStatusColor(status) {
    const colorMap = {
        'awaiting_buyer': '#f59e0b',
        'waiting_payment': '#3b82f6',
        'paid': '#10b981',
        'completed': '#8b5cf6'
    };
    return colorMap[status] || '#64748b';
}

function loadCreateEscrowPage() {
    const content = document.getElementById('dashboardContent');
    if (!content) return;
    
    content.innerHTML = `
        <div style="max-width: 800px; margin: 0 auto; padding: 0 15px;">
            <h2 style="color: #333; margin-bottom: 30px; font-size: 1.8rem; text-align: center;">
                <i class="fas fa-plus-circle" style="margin-right: 10px;"></i>Criar Novo Intermédio
            </h2>
            
            <div style="background: white; border-radius: 12px; padding: 25px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); width: 100%;">
                <form id="createEscrowForm">
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #334155;">Nome do Item *</label>
                        <input type="text" id="itemName" required placeholder="Ex: Fortnite V-Bucks R$100" 
                               style="width: 100%; padding: 15px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 16px; box-sizing: border-box;">
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #334155;">Valor (R$) *</label>
                        <input type="number" id="itemValue" required min="1" step="0.01" placeholder="100.00" 
                               style="width: 100%; padding: 15px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 16px; box-sizing: border-box;">
                    </div>
                    
                    <div style="margin-bottom: 25px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #334155;">Descrição (opcional)</label>
                        <textarea id="itemDescription" rows="4" placeholder="Descreva o item ou condições da venda..." 
                                  style="width: 100%; padding: 15px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 16px; resize: vertical; box-sizing: border-box;"></textarea>
                    </div>
                    
                    <button type="submit" 
                            style="background: linear-gradient(135deg, #7c3aed, #5b21b6); color: white; border: none; padding: 16px 30px; border-radius: 8px; font-weight: bold; cursor: pointer; width: 100%; font-size: 16px; box-sizing: border-box;">
                        <i class="fas fa-shield-alt"></i> Criar Intermédio Seguro
                    </button>
                </form>
            </div>
        </div>
    `;
    
    const form = document.getElementById('createEscrowForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const itemName = document.getElementById('itemName').value;
            const itemValue = document.getElementById('itemValue').value;
            const description = document.getElementById('itemDescription').value;
            
            if (!itemName || !itemValue) {
                showNotification('Preencha nome e valor do item', 'error');
                return;
            }
            
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...';
            submitBtn.disabled = true;
            
            try {
                const token = localStorage.getItem('token');
                
                const response = await fetch(`${API_URL}/escrow/create`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        itemName,
                        value: itemValue,
                        description: description || ''
                    })
                });
                
                const data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.error || 'Erro ao criar intermédio');
                }
                
                // MOSTRAR CÓDIGO NA TELA COM BOTÃO COPIAR
                content.innerHTML = `
                    <div style="max-width: 800px; margin: 0 auto; text-align: center; padding: 0 15px;">
                        <div style="background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); width: 100%;">
                            <div style="font-size: 3rem; color: #10b981; margin-bottom: 20px;">
                                <i class="fas fa-check-circle"></i>
                            </div>
                            
                            <h2 style="color: #334155; margin-bottom: 20px; font-size: 1.8rem;">✅ Intermédio Criado!</h2>
                            
                            <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                                <div style="color: #64748b; font-size: 0.9rem; margin-bottom: 10px;">Código do Intermédio</div>
                                <div style="display: flex; flex-direction: column; align-items: center; gap: 15px;">
                                    <div id="escrowCodeDisplay" style="font-size: 2rem; font-weight: bold; color: #7c3aed; letter-spacing: 2px; word-break: break-all;">
                                        ${data.escrow.code}
                                    </div>
                                    <button onclick="copyEscrowCode('${data.escrow.code}')" 
                                            style="background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px; width: 100%; max-width: 200px;">
                                        <i class="fas fa-copy"></i> Copiar Código
                                    </button>
                                </div>
                            </div>
                            
                            <div style="text-align: left; background: #fef3c7; border-radius: 8px; padding: 20px; margin-bottom: 30px; border-left: 4px solid #f59e0b;">
                                <h3 style="color: #92400e; margin-bottom: 10px; font-size: 1.1rem;">
                                    <i class="fas fa-info-circle"></i> Como prosseguir?
                                </h3>
                                <ol style="color: #92400e; margin-left: 20px; line-height: 1.6;">
                                    <li>Compartilhe o código acima com o comprador</li>
                                    <li>O comprador deve entrar no intermédio usando o código</li>
                                    <li>Após o pagamento, o valor será creditado automaticamente</li>
                                    <li>Quando o comprador confirmar o recebimento, você poderá sacar</li>
                                </ol>
                            </div>
                            
                            <div style="display: flex; flex-direction: column; gap: 15px; justify-content: center;">
                                <button onclick="loadPage('home')" 
                                        style="background: #7c3aed; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%;">
                                    <i class="fas fa-home"></i> Voltar ao Dashboard
                                </button>
                                <button onclick="openChat('${data.escrow.id}')" 
                                        style="background: #10b981; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%;">
                                    <i class="fas fa-comment"></i> Ir para o Chat
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                
            } catch (error) {
                showNotification('Erro: ' + error.message, 'error');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }
}

// Função para copiar código do intermédio
function copyEscrowCode(code) {
    navigator.clipboard.writeText(code).then(() => {
        showNotification('Código copiado para a área de transferência!', 'success');
    }).catch(err => {
        // Fallback para navegadores antigos
        const textArea = document.createElement('textarea');
        textArea.value = code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Código copiado!', 'success');
    });
}

function loadJoinEscrowPage() {
    const content = document.getElementById('dashboardContent');
    if (!content) return;
    
    content.innerHTML = `
        <div style="max-width: 600px; margin: 0 auto; padding: 0 15px;">
            <h2 style="color: #333; margin-bottom: 30px; font-size: 1.8rem; text-align: center;">
                <i class="fas fa-sign-in-alt" style="margin-right: 10px;"></i>Entrar no Intermédio
            </h2>
            
            <div style="background: white; border-radius: 12px; padding: 25px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); width: 100%;">
                <form id="joinEscrowForm">
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #334155;">Código do Intermédio *</label>
                        <div style="position: relative;">
                            <input type="text" id="escrowCode" required placeholder="ABC-123-DEF" 
                                   style="width: 100%; padding: 15px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 18px; letter-spacing: 2px; text-transform: uppercase; text-align: center; box-sizing: border-box;"
                                   oninput="this.value = this.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')">
                            <div style="position: absolute; right: 15px; top: 50%; transform: translateY(-50%); color: #94a3b8;">
                                <i class="fas fa-key"></i>
                            </div>
                        </div>
                        <div style="color: #64748b; font-size: 0.85rem; margin-top: 5px; text-align: center;">
                            Digite o código fornecido pelo vendedor (formato: XXX-XXX-XXX)
                        </div>
                    </div>
                    
                    <button type="submit" 
                            style="background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; padding: 16px 30px; border-radius: 8px; font-weight: bold; cursor: pointer; width: 100%; font-size: 16px; box-sizing: border-box;">
                        <i class="fas fa-sign-in-alt"></i> Entrar no Intermédio
                    </button>
                </form>
            </div>
        </div>
    `;
    
    const form = document.getElementById('joinEscrowForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const code = document.getElementById('escrowCode').value.trim().toUpperCase();
            
            if (!code) {
                showNotification('Digite o código do intermédio', 'error');
                return;
            }
            
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
            submitBtn.disabled = true;
            
            try {
                const token = localStorage.getItem('token');
                
                const response = await fetch(`${API_URL}/escrow/join`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ code })
                });
                
                const data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.error || 'Erro ao entrar no intermédio');
                }
                
                showNotification('✅ Você entrou no intermédio!', 'success');
                
                // Abrir chat automaticamente
                setTimeout(() => {
                    openChat(data.escrow.id);
                }, 1000);
                
                // Voltar para home
                setTimeout(() => {
                    loadPage('home');
                }, 1500);
                
            } catch (error) {
                showNotification('Erro: ' + error.message, 'error');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }
}

async function loadMyEscrowsPage() {
    const content = document.getElementById('dashboardContent');
    if (!content) return;
    
    try {
        const token = localStorage.getItem('token');
        let escrows = [];
        
        const response = await fetch(`${API_URL}/escrow`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                escrows = data.escrows || [];
            }
        }
        
        content.innerHTML = `
            <div style="padding: 0 15px;">
                <h2 style="color: #333; margin-bottom: 30px; font-size: 1.8rem; text-align: center;">
                    <i class="fas fa-list" style="margin-right: 10px;"></i>Meus Intermédios (${escrows.length})
                </h2>
                
                ${escrows.length === 0 ? `
                    <div style="text-align: center; padding: 60px 20px; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); width: 100%;">
                        <i class="fas fa-inbox" style="font-size: 4rem; color: #cbd5e1; margin-bottom: 20px;"></i>
                        <h3 style="color: #64748b; margin-bottom: 10px; font-size: 1.4rem;">Nenhum intermédio encontrado</h3>
                        <p style="color: #94a3b8;">Crie seu primeiro intermédio para começar!</p>
                        <button onclick="loadPage('create-escrow')" 
                                style="background: #7c3aed; color: white; border: none; padding: 12px 24px; border-radius: 6px; margin-top: 20px; cursor: pointer; font-weight: bold; width: 100%; max-width: 300px;">
                            <i class="fas fa-plus-circle"></i> Criar Intermédio
                        </button>
                    </div>
                ` : `
                    <div style="display: grid; gap: 20px;">
                        ${escrows.map(escrow => `
                            <div style="background: white; border-radius: 12px; padding: 25px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); width: 100%;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 15px; margin-bottom: 20px;">
                                    <div style="flex: 1; min-width: 200px;">
                                        <strong style="font-size: 1.2rem; color: #334155; display: block; margin-bottom: 8px;">
                                            ${escrow.itemName || 'Sem nome'}
                                        </strong>
                                        <div style="color: #64748b; font-size: 0.9rem;">
                                            Código: ${escrow.code || 'N/A'} • Criado em ${formatDate(escrow.createdAt)}
                                        </div>
                                    </div>
                                    <div class="escrow-status status-${escrow.status}"
                                         style="padding: 8px 15px; border-radius: 20px; font-size: 0.9rem; font-weight: bold; background: ${getStatusColor(escrow.status)}; color: white; white-space: nowrap;">
                                        ${getStatusText(escrow.status)}
                                    </div>
                                </div>
                                
                                <div style="color: #475569; margin: 15px 0; line-height: 1.6;">
                                    ${escrow.description || 'Sem descrição'}
                                </div>
                                
                                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                                    <div style="font-size: 1.5rem; font-weight: bold; color: #7c3aed;">
                                        R$ ${safeFormat(escrow.value)}
                                    </div>
                                    
                                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                        <button onclick="openChat('${escrow.id}')" 
                                                style="background: #7c3aed; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; white-space: nowrap;">
                                            <i class="fas fa-comment"></i> Chat
                                        </button>
                                        
                                        ${escrow.status === 'paid' && currentUser.id === escrow.buyerId ? `
                                            <button onclick="completeEscrow('${escrow.id}')" 
                                                    style="background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; white-space: nowrap;">
                                                <i class="fas fa-check"></i> Confirmar
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
        
    } catch (error) {
        content.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #ef4444;">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Erro ao carregar intermédios</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

async function loadChatsPage() {
    const content = document.getElementById('dashboardContent');
    if (!content) return;
    
    content.innerHTML = `
        <div style="max-width: 800px; margin: 0 auto; padding: 0 15px;">
            <h2 style="color: #333; margin-bottom: 30px; font-size: 1.8rem; text-align: center;">
                <i class="fas fa-comments" style="margin-right: 10px;"></i>Meus Chats
            </h2>
            
            <div style="text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); width: 100%;">
                <i class="fas fa-comments" style="font-size: 4rem; color: #7c3aed; margin-bottom: 20px;"></i>
                <h3 style="color: #334155; margin-bottom: 10px; font-size: 1.4rem;">Seus Chats</h3>
                <p style="color: #64748b; margin-bottom: 30px; line-height: 1.6;">
                    Acesse seus chats através de "Meus Intermédios"<br>
                    ou crie um novo intermédio para começar uma conversa
                </p>
                
                <div style="display: flex; flex-direction: column; gap: 15px; justify-content: center; max-width: 300px; margin: 0 auto;">
                    <button onclick="loadPage('my-escrows')" 
                            style="background: #7c3aed; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%;">
                        <i class="fas fa-list"></i> Ver Meus Intermédios
                    </button>
                    <button onclick="loadPage('create-escrow')" 
                            style="background: #10b981; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%;">
                        <i class="fas fa-plus-circle"></i> Criar Intermédio
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Funções auxiliares
function getStatusText(status) {
    const statusMap = {
        'awaiting_buyer': '🕐 Aguardando Comprador',
        'waiting_payment': '💰 Aguardando Pagamento',
        'paid': '✅ Pago',
        'completed': '🎉 Concluído'
    };
    return statusMap[status] || status || 'Desconhecido';
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        return '--/--/----';
    }
}

function openChat(escrowId) {
    window.open(`chat.html?escrowId=${escrowId}`, '_blank');
}

async function completeEscrow(escrowId) {
    if (!confirm('Tem certeza que deseja confirmar o recebimento e finalizar o intermédio?')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        
        const response = await fetch(`${API_URL}/escrow/${escrowId}/complete`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Erro ao finalizar');
        }
        
        showNotification('✅ Intermédio finalizado com sucesso!', 'success');
        
        // Recarregar a página
        setTimeout(() => loadPage('my-escrows'), 1500);
        
    } catch (error) {
        showNotification('Erro: ' + error.message, 'error');
    }
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = `notification show ${type}`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Funções globais
window.loadPage = loadPage;
window.openChat = openChat;
window.copyEscrowCode = copyEscrowCode;
window.completeEscrow = completeEscrow;
